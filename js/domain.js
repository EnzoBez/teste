/* Regras de negócio compartilhadas entre as páginas. */
(function () {
  'use strict';

  const D = {};

  // ---------- Empresa atual ----------
  D.empresas = () => Store.list('empresas').filter((e) => e.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome));
  D.empresaId = () => {
    const list = D.empresas();
    let id = localStorage.getItem('ourosaf-empresa');
    if (!list.some((e) => e.id === id)) id = list[0] ? list[0].id : null;
    return id;
  };
  D.setEmpresa = (id) => localStorage.setItem('ourosaf-empresa', id);
  D.empresa = () => Store.get('empresas', D.empresaId());

  D.produtos = (empresaId = D.empresaId(), todos = false) =>
    Store.list('produtos')
      .filter((p) => p.empresa_id === empresaId && (todos || p.ativo !== false))
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
  D.produto = (id) => Store.get('produtos', id);

  /** Cria Rebeka + Pudim + Brigadeirão na primeira vez que o sistema abre. */
  D.seed = () => {
    if (Store.list('empresas').length) return;
    const [rebeka] = Store.saveMany('empresas', [{ nome: 'Rebeka', cnpj: '34.352.376/0001-87', ativo: true }]);
    Store.saveMany('produtos', [
      { empresa_id: rebeka.id, nome: 'Pudim', descricao: 'Pudim Doceria Rebeka 120g', codigo_nf: '181',
        palavra_chave: 'PUDIM', unidades_caixa: 24, ordem: 1, ativo: true },
      { empresa_id: rebeka.id, nome: 'Brigadeirão', descricao: 'Brigadeirão Rebeka 80g', codigo_nf: '',
        palavra_chave: 'BRIGADEIR', unidades_caixa: 36, ordem: 2, ativo: true },
    ]);
    D.setEmpresa(rebeka.id);
  };

  // ---------- Pedidos ----------
  D.pedidos = (empresaId = D.empresaId()) => Store.list('pedidos').filter((p) => p.empresa_id === empresaId);

  /** Valor de um item: caixas × unidades/caixa × valor unitário. */
  D.itemTotal = (it) => {
    const p = D.produto(it.produto_id);
    const upc = p ? Number(p.unidades_caixa) || 1 : 1;
    return U.round2((Number(it.caixas) || 0) * upc * (Number(it.valor_unitario) || 0));
  };
  D.pedidoTotal = (itens) => U.round2((itens || []).reduce((s, it) => s + D.itemTotal(it), 0));
  D.caixasDe = (ped, produtoId) =>
    (ped.itens || []).filter((i) => i.produto_id === produtoId).reduce((s, i) => s + (Number(i.caixas) || 0), 0);

  D.proximoNumero = (table) => {
    let max = 0;
    for (const r of Store.list(table)) if ((r.numero || 0) > max) max = r.numero;
    return max + 1;
  };

  // ---------- Clientes ----------
  let idxCnpj = null;
  Store.on((e) => { if (e.type === 'change' && e.table === 'clientes') idxCnpj = null; });
  D.clientesPorCnpj = (cnpj) => {
    if (!idxCnpj) {
      idxCnpj = new Map();
      for (const c of Store.list('clientes')) {
        const k = U.digits(c.cnpj);
        if (!idxCnpj.has(k)) idxCnpj.set(k, []);
        idxCnpj.get(k).push(c);
      }
    }
    return idxCnpj.get(U.digits(cnpj)) || [];
  };

  /** Último preço unitário usado para o cliente (por CNPJ) e produto. */
  D.ultimoPreco = (cnpj, produtoId) => {
    const d = U.digits(cnpj);
    let best = null;
    for (const p of Store.list('pedidos')) {
      if (U.digits(p.cnpj) !== d || p.status === 'cancelado' || p.tipo === 'troca') continue;
      const it = (p.itens || []).find((i) => i.produto_id === produtoId && Number(i.valor_unitario) > 0);
      if (!it) continue;
      if (!best || (p.data_pedido || '') > (best.data || '') || ((p.data_pedido || '') === (best.data || '') && (p.numero || 0) > best.n))
        best = { data: p.data_pedido, n: p.numero || 0, valor: Number(it.valor_unitario) };
    }
    return best ? best.valor : null;
  };

  // ---------- Estoque ----------
  D.estoqueConfig = (empresaId = D.empresaId()) =>
    Store.getConfig('estoque:' + empresaId, { data_base: '', inicial: {} });

  /**
   * Saldo por produto em caixas.
   * saldo = inicial + entradas − saídas por NF + retornos − reposições de troca ± acertos
   * Saídas: pedidos com número de nota (inclusive cancelados depois de faturados;
   * nesse caso a volta da mercadoria é lançada como retorno pela ocorrência).
   * Perdas: itens de ocorrências que não voltam ao estoque (apenas informativo).
   */
  D.estoque = (empresaId = D.empresaId()) => {
    const cfg = D.estoqueConfig(empresaId);
    const base = cfg.data_base || '0000-00-00';
    const res = {};
    for (const p of D.produtos(empresaId, true)) {
      res[p.id] = { produto: p, inicial: Number((cfg.inicial || {})[p.id]) || 0, entradas: 0, saidas: 0,
        retornos: 0, reposicoes: 0, acertos: 0, perdas: 0, saldo: 0 };
    }
    const add = (pid, k, v) => { if (res[pid]) res[pid][k] += Number(v) || 0; };

    for (const e of Store.list('entradas')) if (e.empresa_id === empresaId && e.data >= base) add(e.produto_id, 'entradas', e.caixas);
    for (const p of D.pedidos(empresaId)) {
      if (!p.nota) continue;
      const dt = p.data_faturamento || p.data_pedido || '';
      if (dt < base) continue;
      for (const it of p.itens || []) add(it.produto_id, 'saidas', it.caixas);
    }
    for (const o of Store.list('ocorrencias')) {
      if (o.empresa_id !== empresaId || o.data < base) continue;
      for (const it of o.itens || []) add(it.produto_id, it.volta_estoque ? 'retornos' : 'perdas', it.caixas);
      for (const it of o.reposicao || []) add(it.produto_id, 'reposicoes', it.caixas);
    }
    for (const a of Store.list('acertos')) if (a.empresa_id === empresaId && a.data >= base) add(a.produto_id, 'acertos', a.diferenca);

    for (const r of Object.values(res)) {
      r.saldo = U.round2(r.inicial + r.entradas - r.saidas + r.retornos - r.reposicoes + r.acertos);
    }
    return res;
  };

  /** Lista de movimentações (extrato) do estoque, mais recentes primeiro. */
  D.movimentos = (empresaId = D.empresaId()) => {
    const cfg = D.estoqueConfig(empresaId);
    const base = cfg.data_base || '0000-00-00';
    const mv = [];
    for (const e of Store.list('entradas')) {
      if (e.empresa_id === empresaId && e.data >= base)
        mv.push({ data: e.data, tipo: 'Entrada', produto_id: e.produto_id, qtd: +e.caixas, ref: [e.nota_fornecedor && 'NF ' + e.nota_fornecedor, e.fornecedor].filter(Boolean).join(' · ') });
    }
    for (const p of D.pedidos(empresaId)) {
      if (!p.nota) continue;
      const dt = p.data_faturamento || p.data_pedido || '';
      if (dt < base) continue;
      for (const it of p.itens || []) {
        if (+it.caixas) mv.push({ data: dt, tipo: 'Saída NF', produto_id: it.produto_id, qtd: -it.caixas, ref: `NF ${p.nota} · ${p.cliente_nome || ''}` });
      }
    }
    for (const o of Store.list('ocorrencias')) {
      if (o.empresa_id !== empresaId || o.data < base) continue;
      const nome = U.TIPOS_OCORRENCIA[o.tipo] || o.tipo;
      for (const it of o.itens || []) {
        if (!+it.caixas) continue;
        if (it.volta_estoque) mv.push({ data: o.data, tipo: 'Retorno', produto_id: it.produto_id, qtd: +it.caixas, ref: `${nome} · ${o.cliente_nome || ''}` });
        else mv.push({ data: o.data, tipo: 'Perda', produto_id: it.produto_id, qtd: 0, info: +it.caixas, ref: `${nome} · ${o.cliente_nome || ''} (não volta ao estoque)` });
      }
      for (const it of o.reposicao || []) {
        if (+it.caixas) mv.push({ data: o.data, tipo: 'Reposição', produto_id: it.produto_id, qtd: -it.caixas, ref: `Troca · ${o.cliente_nome || ''}` });
      }
    }
    for (const a of Store.list('acertos')) {
      if (a.empresa_id === empresaId && a.data >= base)
        mv.push({ data: a.data, tipo: 'Acerto', produto_id: a.produto_id, qtd: +a.diferenca, ref: a.motivo || 'Inventário' });
    }
    return mv.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  };

  window.D = D;
})();

/* Consulta de CNPJ em APIs públicas gratuitas (BrasilAPI e CNPJ.ws). */
(function () {
  'use strict';
  const title = (s) => String(s || '').trim();

  async function brasilApi(c) {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + c);
    if (r.status === 404) throw new Error('CNPJ não encontrado na Receita');
    if (!r.ok) throw new Error('BrasilAPI ' + r.status);
    const j = await r.json();
    const tel = j.ddd_telefone_1 ? U.maskPhone(j.ddd_telefone_1) : '';
    return {
      razao_social: title(j.razao_social), nome_fantasia: title(j.nome_fantasia), cep: j.cep ? String(j.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '',
      endereco: title([j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ')), numero: title(j.numero),
      complemento: title(j.complemento), bairro: title(j.bairro), cidade: title(j.municipio), uf: title(j.uf),
      telefone: tel, email: (j.email || '').toLowerCase(), situacao: j.descricao_situacao_cadastral || '',
    };
  }

  async function cnpjWs(c) {
    const r = await fetch('https://publica.cnpj.ws/cnpj/' + c);
    if (!r.ok) throw new Error('CNPJ.ws ' + r.status);
    const j = await r.json();
    const e = j.estabelecimento || {};
    const uf = e.estado ? e.estado.sigla : '';
    const ies = (e.inscricoes_estaduais || []).filter((i) => i.ativo !== false);
    const ie = (ies.find((i) => i.estado && i.estado.sigla === uf) || ies[0] || {}).inscricao_estadual || '';
    return {
      razao_social: title(j.razao_social), nome_fantasia: title(e.nome_fantasia), cep: e.cep ? String(e.cep).replace(/^(\d{5})(\d{3})$/, '$1-$2') : '',
      endereco: title([e.tipo_logradouro, e.logradouro].filter(Boolean).join(' ')), numero: title(e.numero), complemento: title(e.complemento),
      bairro: title(e.bairro), cidade: e.cidade ? title(e.cidade.nome) : '', uf, ie,
      telefone: e.ddd1 && e.telefone1 ? U.maskPhone(e.ddd1 + e.telefone1) : '', email: (e.email || '').toLowerCase(),
      situacao: e.situacao_cadastral || '',
    };
  }

  /** Retorna os dados do CNPJ. Usa BrasilAPI e complementa a inscrição estadual pelo CNPJ.ws. */
  D.buscarCnpj = async (cnpj) => {
    const c = U.digits(cnpj);
    if (c.length !== 14) throw new Error('Digite os 14 números do CNPJ');
    let base = null, err = null;
    try { base = await brasilApi(c); } catch (e) { err = e; }
    let ws = null;
    try { ws = await cnpjWs(c); } catch (e) { if (!base) err = err || e; }
    if (!base && !ws) throw err || new Error('Consulta indisponível');
    const out = { ...(ws || {}), ...(base || {}) };
    for (const k of Object.keys(out)) if (!out[k] && ws && ws[k]) out[k] = ws[k];
    if (ws && ws.ie) out.ie = ws.ie;
    return out;
  };
})();
