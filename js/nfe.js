/*
 * Leitura de DANFEs em PDF (dentro de um .zip ou soltos) e vinculação
 * automática com os pedidos.
 *
 * Critérios de vinculação (cada nota x cada pedido sem nota):
 *  - CNPJ do destinatário igual ao do pedido (obrigatório; mesma raiz do CNPJ só com confirmação)
 *  - Tipo: nota de bonificação (CFOP x910 / natureza "BONIF") só casa com pedido de bonificação
 *  - Quantidade de caixas de cada produto
 *  - Valor da caixa de cada produto e valor total
 *  - Prazo de pagamento (ex.: "28 DDL" x prazo "28 dias")
 *  - Nº do pedido do cliente, quando informado nos dois
 * A atribuição final é feita pelos maiores escores, sem repetir pedido nem nota.
 */
(function () {
  'use strict';

  const NFe = {};
  const VENDOR = 'js/vendor/';

  NFe.loadLibs = async () => {
    await U.loadScript(VENDOR + 'jszip.min.js');
    await U.loadScript(VENDOR + 'pdf.min.js');
    const lib = window.pdfjsLib;
    if (location.protocol === 'file:') {
      // Navegadores bloqueiam Web Workers em file://; roda o leitor na página.
      await U.loadScript(VENDOR + 'pdf.worker.min.js');
    }
    lib.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.js';
    return lib;
  };

  /** Extrai as linhas de texto de um PDF, reconstruindo o layout por coordenadas. */
  NFe.pdfLines = async (data) => {
    const lib = window.pdfjsLib;
    const doc = await lib.getDocument({ data, isEvalSupported: false }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const items = tc.items.filter((i) => i.str && i.str.trim())
        .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      const rows = [];
      for (const it of items) {
        let r = rows.find((r) => Math.abs(r.y - it.y) < 2.5);
        if (!r) { r = { y: it.y, it: [] }; rows.push(r); }
        r.it.push(it);
      }
      rows.sort((a, b) => b.y - a.y);
      for (const r of rows) {
        r.it.sort((a, b) => a.x - b.x);
        let s = '', end = null;
        for (const i of r.it) {
          if (end !== null) s += i.x - end > 3 ? '   ' : i.x - end > 0.5 ? ' ' : '';
          s += i.s;
          end = i.x + i.w;
        }
        out.push(s);
      }
    }
    await doc.destroy();
    return out;
  };

  const DOC_RE = /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/;

  /** Interpreta as linhas de uma DANFE. Função pura (testável sem navegador). */
  NFe.parse = (rawLines) => {
    const lines = rawLines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const all = lines.join('\n');
    const after = (re, from = 0) => {
      for (let i = from; i < lines.length - 1; i++) if (re.test(lines[i])) return { line: lines[i + 1], i: i + 1 };
      return null;
    };
    const n = {};

    let m = all.match(/(?:^|\n)N\.\s*(\d{1,3}(?:\.\d{3})+|\d{4,})(?:\s|$)/);
    n.numero = m ? m[1].replace(/\D/g, '') : '';

    const nat = after(/^NATUREZA DA OPERA/);
    n.natureza = nat ? nat.line.replace(/\s+\d{12,}.*$/, '').trim() : '';

    const destIdx = lines.findIndex((l) => /^DESTINAT[ÁA]RIO/.test(l));
    const dest = destIdx >= 0 ? after(/NOME\/RAZ[ÃA]O SOCIAL/, destIdx) : null;
    if (dest) {
      m = dest.line.match(new RegExp('^(.*?)\\s+(?:(\\d+)\\s+)?' + DOC_RE.source + '\\s+(\\d{2})[-/](\\d{2})[-/](\\d{4})'));
      if (m) {
        n.destinatario = m[1].trim();
        n.cnpj = m[3];
        n.emissao = `${m[6]}-${m[5]}-${m[4]}`;
      } else {
        const d = dest.line.match(DOC_RE);
        n.cnpj = d ? d[1] : '';
        n.destinatario = d ? dest.line.slice(0, d.index).replace(/\s+\d+\s*$/, '').trim() : dest.line;
      }
      const mun = after(/^MUNIC[ÍI]PIO/, dest.i);
      if (mun) {
        const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
        const mm = mun.line.match(new RegExp('^(.+?)\\s+(?:(?:\\+55\\s+)?\\(?\\d{2}\\)?\\s*[\\d-]{8,}\\s+)?(' + UFS + ')(?:\\s|$)'));
        n.cidade = mm ? mm[1].trim() : '';
        n.uf = mm ? mm[2] : '';
      }
    }
    if (!n.emissao) {
      m = all.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
      n.emissao = m ? `${m[3]}-${m[2]}-${m[1]}` : '';
    }

    const fat = after(/^FATURA\/DUPLICATA/);
    n.fatura = fat && !/^C[ÁA]LCULO DO IMPOSTO/.test(fat.line) ? fat.line : '';
    m = n.fatura.match(/(\d+)\s*DDL/i);
    n.prazo = m ? +m[1] : null;
    m = n.fatura.match(/\b(BOLETO|TED|PIX|DEP[ÓO]SITO|CHEQUE|DINHEIRO|CART[ÃA]O)\b/i);
    n.forma = m ? m[1].toUpperCase() : (/SEM FINANCEIRO/i.test(n.fatura) ? 'SEM FINANCEIRO' : '');

    const tot = after(/VALOR TOTAL DA NOTA/);
    if (tot) {
      const nums = tot.line.match(/[\d.]+,\d{2}/g);
      n.total = nums ? U.parseNum(nums[nums.length - 1]) : 0;
    }

    n.itens = [];
    const itemRe = /^(\S+)\s+(.+?)\s+(\d{8})\s+(\d{3,4})\s+(\d{4})\s+([A-Za-z]{1,6})\s+([\d.]+(?:,\d+)?)\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)\s+([\d.]+,\d+)/;
    for (const l of lines) {
      const it = l.match(itemRe);
      if (!it) continue;
      n.itens.push({ codigo: it[1], descricao: it[2].trim(), cfop: it[5], un: it[6].toUpperCase(),
        quantidade: U.parseNum(it[7]), valor_unitario: U.parseNum(it[8]), desconto: U.parseNum(it[9]), valor_total: U.parseNum(it[11]) });
    }
    if (!n.total) n.total = U.round2(n.itens.reduce((s, i) => s + i.valor_total, 0));

    m = all.match(/Pedido Cliente:\s*([\w-]+)/i) || all.match(/N\.\s*DO PEDIDO\s*:\s*([\w-]+)/i);
    n.pedido_cliente = m ? m[1] : '';
    m = all.match(/Vendedor:\s*([^|\n]+)/i);
    n.vendedor = m ? m[1].trim() : '';

    n.bonificacao = /BONIF|BRINDE|DOA[CÇ][AÃ]O/i.test(n.natureza) || n.itens.some((i) => /^\d910$/.test(i.cfop));
    return n;
  };

  /** Mapeia os itens da nota para os produtos cadastrados (por código ou palavra-chave). */
  NFe.mapItens = (nota, produtos) => {
    const out = {};
    const naoIdentificados = [];
    for (const it of nota.itens) {
      const p = produtos.find((p) => p.codigo_nf && String(p.codigo_nf) === String(it.codigo)) ||
        produtos.find((p) => p.palavra_chave && U.norm(it.descricao).includes(U.norm(p.palavra_chave)));
      if (!p) { naoIdentificados.push(it.descricao); continue; }
      // Nota em unidades (UN) é convertida para caixas
      const upc = Number(p.unidades_caixa) || 1;
      const emUnidades = /^(UN|UND|UNID|PC)$/.test(it.un) && upc > 1;
      const caixas = emUnidades ? it.quantidade / upc : it.quantidade;
      const valorCaixa = emUnidades ? it.valor_unitario * upc : it.valor_unitario;
      if (!out[p.id]) out[p.id] = { caixas: 0, valor_caixa: valorCaixa };
      out[p.id].caixas += caixas;
    }
    return { porProduto: out, naoIdentificados };
  };

  /** Lê um arquivo .zip ou .pdf e devolve as notas interpretadas. */
  NFe.readFiles = async (files, onProgress) => {
    await NFe.loadLibs();
    const pdfs = [];
    for (const f of files) {
      if (/\.zip$/i.test(f.name)) {
        const zip = await window.JSZip.loadAsync(f);
        for (const entry of Object.values(zip.files)) {
          if (!entry.dir && /\.pdf$/i.test(entry.name)) pdfs.push({ nome: entry.name.split('/').pop(), get: () => entry.async('uint8array') });
        }
      } else if (/\.pdf$/i.test(f.name)) {
        pdfs.push({ nome: f.name, get: async () => new Uint8Array(await f.arrayBuffer()) });
      }
    }
    const notas = [];
    for (let i = 0; i < pdfs.length; i++) {
      if (onProgress) onProgress(i, pdfs.length);
      try {
        const lines = await NFe.pdfLines(await pdfs[i].get());
        const n = NFe.parse(lines);
        n.arquivo = pdfs[i].nome;
        if (!n.numero || !n.cnpj) n.erro = 'Não foi possível ler número ou CNPJ desta nota';
        notas.push(n);
      } catch (e) {
        notas.push({ arquivo: pdfs[i].nome, erro: 'Falha ao ler o PDF: ' + e.message, itens: [] });
      }
    }
    return notas;
  };

  /** Pontua o quanto uma nota combina com um pedido. Retorna {score, motivos[], bloqueio}. */
  NFe.score = (nota, mapped, ped) => {
    const motivos = [];
    let score = 0;
    const cn = U.digits(nota.cnpj), cp = U.digits(ped.cnpj);
    if (cn === cp) { score += 50; motivos.push('CNPJ igual'); }
    else if (cn.slice(0, 8) === cp.slice(0, 8)) { score += 5; motivos.push('mesma rede (raiz do CNPJ), filial diferente'); }
    else return { score: -1 };

    const pedBonif = ped.tipo === 'bonificacao';
    if (nota.bonificacao !== pedBonif) {
      return { score: -1 };
    }
    motivos.push(nota.bonificacao ? 'ambos bonificação' : 'ambos venda');
    score += 15;

    // Quantidades por produto
    const prods = new Set([...Object.keys(mapped.porProduto), ...(ped.itens || []).filter((i) => +i.caixas).map((i) => i.produto_id)]);
    let qtdOk = true, precoOk = true;
    for (const pid of prods) {
      const n = mapped.porProduto[pid] || { caixas: 0, valor_caixa: 0 };
      const itens = (ped.itens || []).filter((i) => i.produto_id === pid);
      const cx = itens.reduce((s, i) => s + (+i.caixas || 0), 0);
      if (Math.abs(cx - n.caixas) > 0.001) qtdOk = false;
      if (itens.length && n.caixas) {
        const prod = D.produto(pid);
        const vCaixa = (+itens[0].valor_unitario || 0) * ((prod && +prod.unidades_caixa) || 1);
        if (Math.abs(vCaixa - n.valor_caixa) > 0.02) precoOk = false;
      }
    }
    if (qtdOk) { score += 30; motivos.push('mesmas quantidades'); } else { score -= 25; motivos.push('quantidades diferentes'); }
    if (precoOk) { score += 10; motivos.push('mesmo preço por caixa'); } else { score -= 10; motivos.push('preço diferente'); }

    if (Math.abs((+ped.total || 0) - (+nota.total || 0)) <= 0.05) { score += 25; motivos.push('mesmo valor total'); }
    else { score -= 15; motivos.push(`valor diferente (${U.money(ped.total)} × ${U.money(nota.total)})`); }

    const pz = U.prazoDias(ped.prazo);
    if (pz != null && nota.prazo != null) {
      if (pz === nota.prazo) { score += 10; motivos.push('mesmo prazo'); }
      else { score -= 10; motivos.push(`prazo diferente (${ped.prazo} × ${nota.prazo} dias)`); }
    }

    if (ped.pedido_cliente && nota.pedido_cliente) {
      if (U.digits(ped.pedido_cliente) === U.digits(nota.pedido_cliente)) { score += 60; motivos.push('nº do pedido do cliente igual'); }
      else { score -= 20; motivos.push('nº do pedido do cliente diferente'); }
    }

    // Pedido digitado depois da emissão é improvável
    if (ped.data_pedido && nota.emissao && ped.data_pedido > nota.emissao) { score -= 15; motivos.push('pedido posterior à nota'); }
    return { score, motivos };
  };

  /**
   * Gera as sugestões de vínculo.
   * Retorna [{nota, mapped, jaLancada, pedidoId, score, motivos, candidatos[]}].
   */
  NFe.match = (notas, empresaId) => {
    const produtos = D.produtos(empresaId, true);
    const pedidos = D.pedidos(empresaId);
    const porNota = new Map();
    for (const p of pedidos) if (p.nota) porNota.set(U.digits(p.nota), p);
    const abertos = pedidos.filter((p) => !p.nota && p.status !== 'cancelado');

    const res = notas.map((nota) => {
      const r = { nota, candidatos: [], pedidoId: null, score: 0, motivos: [] };
      if (nota.erro) return r;
      r.mapped = NFe.mapItens(nota, produtos);
      const ja = porNota.get(U.digits(nota.numero));
      if (ja) { r.jaLancada = ja; return r; }
      for (const p of abertos) {
        const s = NFe.score(nota, r.mapped, p);
        if (s.score >= 0) r.candidatos.push({ pedido: p, score: s.score, motivos: s.motivos });
      }
      r.candidatos.sort((a, b) => b.score - a.score);
      return r;
    });

    // Atribuição gulosa global pelos maiores escores
    const pares = [];
    res.forEach((r, i) => r.candidatos.forEach((c) => pares.push({ i, c })));
    pares.sort((a, b) => b.c.score - a.c.score);
    const usados = new Set();
    for (const { i, c } of pares) {
      const r = res[i];
      if (r.pedidoId || usados.has(c.pedido.id) || c.score < 60) continue;
      r.pedidoId = c.pedido.id;
      r.score = c.score;
      r.motivos = c.motivos;
      usados.add(c.pedido.id);
    }
    // Empate: outro candidato com o mesmo escore que ficou livre => pede conferência
    for (const r of res) {
      if (!r.pedidoId) continue;
      r.empate = r.candidatos.some((c) => c.pedido.id !== r.pedidoId && c.score === r.score && !usados.has(c.pedido.id));
    }
    return res;
  };

  window.NFe = NFe;
  if (typeof module !== 'undefined') module.exports = NFe;
})();
