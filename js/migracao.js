/*
 * Importação do backup do sistema anterior (arquivo "ourosaf_backup_*.json",
 * app_version 1.x: clients, orders, stock_base, stock_entries, stock_adjustments,
 * occurrences). Os identificadores gerados são fixos (derivados do id antigo),
 * então importar o mesmo arquivo de novo atualiza em vez de duplicar.
 */
(function () {
  'use strict';

  const M = {};

  const hex = (n, len) => Number(n).toString(16).padStart(len, '0').slice(-len);
  /** UUID determinístico: tabela + id antigo. */
  M.oid = (code, n) => `0a5f0000-0000-4000-8${code}-${hex(n, 12)}`;

  const CORES = { '#e8dcff': 'roxo', '#ffe0b2': 'laranja', '#fff3cd': 'amarelo', '#d4edda': 'verde', '#d1e7dd': 'verde', '#cfe2ff': 'azul', '#f8d7da': 'vermelho' };

  M.isOld = (d) => d && Array.isArray(d.clients) && Array.isArray(d.orders);

  function cidadeUf(city, state) {
    const s = String(city || '').trim();
    const m = s.match(/^(.*?)\s*[-/]\s*([A-Za-z]{2})$/);
    if (m) return { cidade: m[1].trim(), uf: m[2].toUpperCase() };
    return { cidade: s === '#N/A' ? '' : s, uf: String(state || '').toUpperCase() };
  }

  function prazo(t) {
    let s = String(t || '').trim().replace(/\s+/g, ' ');
    if (!s) return { prazo: '', bonif: false };
    if (/BONIFICA/i.test(s)) return { prazo: '', bonif: true };
    s = s.replace(/(DIAS\s*)+$/i, '').trim();
    if (/^[\d\s/|ou]+$/i.test(s)) return { prazo: s.replace(/\s*\|\s*/g, '/') + ' dias', bonif: false };
    return { prazo: String(t).trim(), bonif: false };
  }

  const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
  const dt = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

  /**
   * Converte o backup antigo.
   * ctx: { empresaId, produtoId(nomeAntigo) -> id }
   */
  M.converter = (old, ctx) => {
    const avisos = [];
    const prodId = (nome) => ctx.produtoId(U.norm(nome).includes('brig') ? 'brig' : 'pudim');

    // ---------- Clientes ----------
    const clientes = old.clients.filter((c) => c.legal_name || c.cnpj).map((c) => {
      const cu = cidadeUf(c.city, c.state);
      return {
        id: M.oid('c01', c.id), created_at: c.created_at, cnpj: U.fmtDoc(c.cnpj || c.cnpj_key), razao_social: (c.legal_name || '').trim() || '(sem nome)',
        ie: c.state_registration || '', vendedor: c.seller || '', produto: c.product || '', cidade: cu.cidade, uf: cu.uf,
        endereco: c.address || '', bairro: c.neighborhood === '0' ? '' : c.neighborhood || '', email: (c.email || '').trim(), telefone: c.phone || '',
      };
    });
    const cliPorOld = new Map(old.clients.map((c) => [c.id, M.oid('c01', c.id)]));
    const cliPorCnpj = new Map();
    for (const c of clientes) { const k = U.digits(c.cnpj); if (!cliPorCnpj.has(k)) cliPorCnpj.set(k, c.id); }

    // ---------- Pedidos ----------
    const pud = prodId('pudim'), brig = prodId('brig');
    let ignorados = 0;
    const pedidos = [];
    for (const o of old.orders) {
      const vazio = !o.order_date && !o.note_number && !(+o.order_total) && !(+o.pudim_boxes) && !(+o.brig_boxes);
      if (vazio) { ignorados++; continue; }
      const cu = cidadeUf(o.city);
      const pz = prazo(o.payment_terms);
      const sep = D.separarObs(o.observation);
      const notaOk = /^\d+$/.test(String(o.note_number || '').trim());
      const extraObs = [!notaOk && o.note_number ? `Nota: ${o.note_number}` : '', sep.resto].filter(Boolean).join(' · ');
      const itens = [];
      if (+o.pudim_boxes) itens.push({ produto_id: pud, caixas: +o.pudim_boxes, valor_unitario: +o.pudim_unit_value || 0 });
      if (+o.brig_boxes) itens.push({ produto_id: brig, caixas: +o.brig_boxes, valor_unitario: +o.brig_unit_value || 0 });
      // Sem data na origem: só usa a data de criação se o pedido foi digitado no sistema (não veio de planilha)
      const dataPed = dt(o.order_date) || dt(o.billing_date) || (o.source_row == null ? dt(o.created_at) : '');
      const status = /CANCEL/i.test(o.status) ? 'cancelado' : /DEVOLU/i.test(o.status) ? 'devolvido' : 'ativo';
      pedidos.push({
        id: M.oid('d01', o.id), created_at: o.created_at, numero: o.id, empresa_id: ctx.empresaId,
        cliente_id: cliPorOld.get(o.client_id) || cliPorCnpj.get(U.digits(o.cnpj)) || null,
        cnpj: U.fmtDoc(o.cnpj || o.cnpj_key), cliente_nome: o.client_name === '#N/A' ? '' : o.client_name || '', cliente_email: o.client_email === '#N/A' ? '' : o.client_email || '',
        cidade: cu.cidade, uf: cu.uf, bairro: o.neighborhood === '0' ? '' : o.neighborhood || '',
        vendedor: sep.vendedor, pedido_cliente: sep.pedido_cliente, observacao: extraObs,
        data_pedido: dataPed, data_faturamento: notaOk ? dt(o.billing_date) || dataPed : '',
        prazo: pz.prazo, tipo: pz.bonif || /BONIFICA/i.test(o.observation || '') ? 'bonificacao' : 'venda',
        transporte: o.transport || '', anotacao_canhoto: o.receipt_note || '', canhoto: !!+o.receipt_signed,
        itens, total: r2(o.order_total), nota: notaOk ? String(o.note_number).trim() : '', status,
        destaque: o.highlight_color ? CORES[String(o.highlight_color).toLowerCase()] || 'amarelo' : '',
      });
    }
    const pedPorOld = new Map(old.orders.map((o) => [o.id, M.oid('d01', o.id)]));

    // ---------- Estoque ----------
    const entradas = (old.stock_entries || []).map((e) => ({
      id: M.oid('e01', e.id), created_at: e.created_at, empresa_id: ctx.empresaId, produto_id: prodId(e.product), data: dt(e.entry_date),
      caixas: +e.boxes || (+e.units ? +e.units / 24 : 0), nota_fornecedor: e.invoice || '', fornecedor: e.supplier || '', lote: e.lot || '',
      validade: dt(e.expiry_date) || null, custo_unitario: +e.unit_cost || null, observacao: e.observation || '',
    }));
    const acertos = (old.stock_adjustments || []).map((a, i) => ({
      id: M.oid('a01', a.id || i + 1), empresa_id: ctx.empresaId, produto_id: prodId(a.product), data: dt(a.adjustment_date || a.count_date || a.date || a.created_at),
      sistema: +(a.system_boxes ?? a.system ?? 0), contado: +(a.counted_boxes ?? a.counted ?? 0),
      diferenca: +(a.difference ?? a.diff ?? ((a.counted_boxes ?? 0) - (a.system_boxes ?? 0))), motivo: a.reason || a.observation || '',
    }));
    const base = (old.stock_base || []).find((b) => b.base_date);
    const inicial = {};
    for (const b of old.stock_base || []) inicial[prodId(b.product)] = +b.initial_boxes || 0;
    const config = { data_base: base ? dt(base.base_date) : '', inicial };

    // ---------- Ocorrências ----------
    const cfgUn = {};
    for (const st of old.settings || []) cfgUn[st.key] = +st.value;
    const upc = (nome) => (U.norm(nome).includes('brig') ? cfgUn.brig_units_per_box || 36 : cfgUn.pudim_units_per_box || 24);
    const TIPO = (t) => (/CANCEL/i.test(t) ? 'cancelamento' : /TROCA/i.test(t) ? 'troca' : 'devolucao');
    const ocorrencias = (old.occurrences || []).map((o) => {
      const tipo = TIPO(o.type);
      const pid = prodId(o.product);
      return {
        id: M.oid('f01', o.id), created_at: o.created_at, numero: o.id, empresa_id: ctx.empresaId, tipo, data: dt(o.occurrence_date) || dt(o.created_at),
        pedido_id: o.order_id ? pedPorOld.get(o.order_id) || null : null, cliente_id: cliPorCnpj.get(U.digits(o.cnpj)) || null,
        cnpj: U.fmtDoc(o.cnpj), cliente_nome: o.client_name || '', nota: o.note_number || '', motivo: o.reason || '',
        itens: +o.boxes > 0 ? [{ produto_id: pid, caixas: +o.units > 0 ? +o.units / upc(o.product) : +o.boxes, volta_estoque: !!+o.returns_to_stock }] : [],
        reposicao: [], nota_devolucao: o.document_number || '', observacao: [o.observation, +o.note_value ? `Valor: ${U.money(o.note_value)}` : ''].filter(Boolean).join(' · '),
      };
    });

    const settings = {};
    for (const s of old.settings || []) settings[s.key] = s.value;
    const unidades = { pudim: +settings.pudim_units_per_box || null, brig: +settings.brig_units_per_box || null };
    if (acertos.length) avisos.push(`${acertos.length} acerto(s) de inventário importados — confira na aba Acertos.`);

    return { clientes, pedidos, entradas, acertos, ocorrencias, config, unidades, ignorados, avisos };
  };

  window.Migracao = M;
})();
