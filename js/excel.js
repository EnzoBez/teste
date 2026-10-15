/* Exportação para Excel (.xlsx) com SheetJS, carregado sob demanda. */
(function () {
  'use strict';

  const Excel = {};
  const load = () => U.loadScript('js/vendor/xlsx-style.min.js');

  function sheet(rows, widths) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const keys = rows.length ? Object.keys(rows[0]) : [];
    ws['!cols'] = keys.map((k) => ({ wch: (widths && widths[k]) || Math.min(40, Math.max(10, k.length + 2)) }));
    if (keys.length) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: keys.length - 1 } }) };
    return ws;
  }

  const xlDate = (iso) => (iso ? new Date(iso + 'T12:00:00') : '');

  // Cores de destaque (mesmas da tela, em tom adequado para impressão)
  const CORES = { amarelo: 'FFF1A8', laranja: 'FFD6A5', verde: 'C9EBCB', azul: 'CDE1F7', vermelho: 'F7C6C0', roxo: 'E0D2F4' };
  const borda = { style: 'thin', color: { rgb: 'E2DFD0' } };

  /** Cabeçalho em negrito com fundo e, opcionalmente, cor de fundo por linha. */
  function estilizar(ws, nCols, nRows, corDaLinha) {
    for (let c = 0; c < nCols; c++) {
      const h = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (h) h.s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: '1F5A4D' } }, alignment: { vertical: 'center' } };
    }
    if (!corDaLinha) return;
    for (let r = 1; r <= nRows; r++) {
      const cor = corDaLinha(r - 1);
      if (!cor) continue;
      for (let c = 0; c < nCols; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };
        ws[ref].s = { ...(ws[ref].s || {}), fill: { patternType: 'solid', fgColor: { rgb: cor } }, border: { top: borda, bottom: borda } };
      }
    }
  }

  /** Observação como era no sistema anterior: vendedor | nº do pedido | observação. */
  Excel.observacao = (p) => [p.vendedor, p.pedido_cliente && 'N° DO PEDIDO : ' + p.pedido_cliente, p.observacao].filter(Boolean).join(' | ');

  function clienteRow(c) {
    return {
      'CNPJ/CPF': U.fmtDoc(c.cnpj), 'Razão social': c.razao_social || '', 'Nome fantasia': c.nome_fantasia || '',
      'Inscrição estadual': c.ie || '', Vendedor: c.vendedor || '', Produto: c.produto || '', CEP: c.cep || '',
      Endereço: c.endereco || '', Número: c.numero || '', Complemento: c.complemento || '', Bairro: c.bairro || '',
      Cidade: c.cidade || '', UF: c.uf || '', Telefone: c.telefone || '', 'E-mail': c.email || '', Contato: c.contato || '',
      Observação: c.observacao || '',
    };
  }

  /** Planilha com 2 abas: Pedidos (todas as informações) e Clientes (dos pedidos exportados). */
  Excel.pedidos = async (pedidos) => {
    await load();
    const prods = D.produtos(D.empresaId(), true);
    const list = pedidos.slice().sort((a, b) => (a.data_pedido || '').localeCompare(b.data_pedido || '') || (a.numero || 0) - (b.numero || 0));
    const rows = list.map((p) => {
      const r = {
        Nota: p.nota ? (+U.digits(p.nota) || p.nota) : '', 'Nº pedido': p.numero || '', 'Data do pedido': xlDate(p.data_pedido),
        'Data do faturamento': xlDate(p.data_faturamento), Tipo: U.TIPOS_PEDIDO[p.tipo] || p.tipo || '',
        'CNPJ/CPF': U.fmtDoc(p.cnpj), Cliente: p.cliente_nome || '', Cidade: p.cidade || '', Bairro: p.bairro || '', UF: p.uf || '',
        'E-mail': p.cliente_email || '', Vendedor: p.vendedor || '', Prazo: p.prazo || '', 'Pedido do cliente': p.pedido_cliente || '',
        Transporte: p.transporte || '',
      };
      for (const pr of prods) {
        const it = (p.itens || []).find((i) => i.produto_id === pr.id) || {};
        const cx = +it.caixas || 0;
        const vu = +it.valor_unitario || 0;
        r[`${pr.nome} - caixas`] = cx;
        r[`${pr.nome} - unidades`] = cx * pr.unidades_caixa;
        r[`${pr.nome} - valor unitário`] = vu;
        r[`${pr.nome} - valor caixa`] = U.round2(vu * pr.unidades_caixa);
        r[`${pr.nome} - total`] = U.round2(cx * pr.unidades_caixa * vu);
      }
      r['Valor total'] = +p.total || 0;
      r.Observação = Excel.observacao(p);
      r['Anotação do canhoto'] = p.anotacao_canhoto || '';
      r.Canhoto = p.canhoto ? 'Assinado' : 'Pendente';
      r['Data do canhoto'] = p.canhoto ? xlDate(p.canhoto_data) : '';
      r.Destaque = (U.DESTAQUES.find((d) => d.v === (p.destaque || '')) || {}).v ? U.DESTAQUES.find((d) => d.v === p.destaque).label : '';
      r.Status = p.status === 'cancelado' ? 'Cancelado' : p.status === 'devolvido' ? 'Devolvido' : p.nota ? 'Faturado' : 'Aguardando faturamento';
      return r;
    });
    const wb = XLSX.utils.book_new();
    const ws = sheet(rows, { Cliente: 38, Observação: 44, 'CNPJ/CPF': 20, Vendedor: 24 });
    // Formatos de data e moeda
    const range = XLSX.utils.decode_range(ws['!ref']);
    const keys = Object.keys(rows[0] || {});
    for (let c = 0; c < keys.length; c++) {
      const k = keys[c];
      const fmt = /^Data/.test(k) ? 'dd/mm/yyyy' : /valor|total/i.test(k) ? '"R$" #,##0.00' : null;
      if (!fmt) continue;
      for (let r = 1; r <= range.e.r; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v !== '') cell.z = fmt;
      }
    }
    estilizar(ws, keys.length, list.length, (i) => CORES[list[i].destaque] || null);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');

    // Aba de clientes: um por CNPJ (cadastro completo quando existir)
    const vistos = new Map();
    for (const p of list) {
      const k = U.digits(p.cnpj);
      if (vistos.has(k)) continue;
      const c = Store.get('clientes', p.cliente_id) || D.clientesPorCnpj(p.cnpj)[0] ||
        { cnpj: p.cnpj, razao_social: p.cliente_nome, cidade: p.cidade, bairro: p.bairro, uf: p.uf, email: p.cliente_email, vendedor: p.vendedor };
      vistos.set(k, clienteRow(c));
    }
    const cliRows = Array.from(vistos.values());
    const wsCli = sheet(cliRows, { 'Razão social': 38, Endereço: 32, 'E-mail': 28 });
    estilizar(wsCli, Object.keys(cliRows[0] || {}).length, cliRows.length);
    XLSX.utils.book_append_sheet(wb, wsCli, 'Clientes');
    XLSX.writeFile(wb, `pedidos_${U.today()}.xlsx`, { cellDates: true });
  };

  Excel.clientes = async (clientes) => {
    await load();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet(clientes.map(clienteRow), { 'Razão social': 38, Endereço: 32, 'E-mail': 28 }), 'Clientes');
    XLSX.writeFile(wb, `clientes_${U.today()}.xlsx`);
  };

  Excel.generico = async (nome, abas) => {
    await load();
    const wb = XLSX.utils.book_new();
    for (const [titulo, rows] of Object.entries(abas)) XLSX.utils.book_append_sheet(wb, sheet(rows.length ? rows : [{ '': 'Sem dados' }]), titulo.slice(0, 31));
    XLSX.writeFile(wb, `${nome}_${U.today()}.xlsx`);
  };

  window.Excel = Excel;
})();
