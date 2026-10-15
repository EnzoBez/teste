/* Página 3 — Estoque */
(function () {
  'use strict';

  let root, tab = 'entradas', editEntrada = null, mvLimit = 200;

  function build(r) {
    root = r;
    const prods = D.produtos();
    const optProds = prods.map((p) => `<option value="${p.id}">${U.esc(p.nome)}</option>`).join('');
    root.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Página 3</div><h1>Controle do estoque</h1></div>
        <div class="head-actions"><button class="btn" id="est-export">Exportar extrato (Excel)</button></div>
      </div>
      <p class="muted small" style="margin-top:-8px">O saldo baixa quando o pedido recebe número de nota. Devoluções e cancelamentos que voltam ao estoque entram como retorno.</p>
      <div class="stock-cards" id="est-cards"></div>
      <div id="est-validade"></div>

      <div class="grid-2">
        <div class="card">
          <div class="card-head"><div><div class="eyebrow">Recebimentos</div><h2 id="ent-title">Dar entrada em mercadoria</h2></div></div>
          <form id="ent-form" autocomplete="off">
            <div class="fields">
              <div class="f s4"><label>Data de entrada</label><input type="date" name="data"></div>
              <div class="f s4"><label>Produto</label><select name="produto_id">${optProds}</select></div>
              <div class="f s4"><label>Fornecedor</label><input type="text" name="fornecedor" list="dl-fornecedores"></div>
              <div class="f s4"><label>Caixas <span class="req">*</span></label><input type="number" step="any" min="0" name="caixas" inputmode="decimal"></div>
              <div class="f s4"><label>Unidades</label><input type="number" step="any" min="0" id="ent-un" inputmode="decimal"></div>
              <div class="f s4"><label>Nota do fornecedor</label><input type="text" name="nota_fornecedor" inputmode="numeric"></div>
              <div class="f s4"><label>Lote</label><input type="text" name="lote"></div>
              <div class="f s4"><label>Validade</label><input type="date" name="validade"></div>
              <div class="f s4"><label>Custo unitário (R$)</label><input type="text" name="custo_unitario" inputmode="decimal"></div>
              <div class="f s12"><label>Observação</label><input type="text" name="observacao" placeholder="Ex.: 28 pallets"></div>
            </div>
            <div class="actions mt"><button type="button" class="btn" id="ent-limpar">Limpar</button><span class="grow"></span><button class="btn btn-primary" type="submit" id="ent-salvar">Registrar entrada</button></div>
          </form>
        </div>

        <div class="card">
          <div class="card-head"><div><div class="eyebrow">Contagem física</div><h2>Acertar estoque por inventário</h2><div class="sub">Conte as caixas no depósito e digite o total. O sistema calcula a diferença e registra o acerto.</div></div></div>
          <form id="ac-form" autocomplete="off">
            <div class="fields">
              <div class="f s6"><label>Data da contagem</label><input type="date" name="data"></div>
              <div class="f s6"><label>Produto</label><select name="produto_id">${optProds}</select></div>
              <div class="f s6"><label>Saldo do sistema (cx)</label><input type="text" id="ac-sistema" readonly></div>
              <div class="f s6"><label>Contagem física (cx) <span class="req">*</span></label><input type="number" step="any" min="0" name="contado" inputmode="decimal" placeholder="Quantas caixas você contou"></div>
              <div class="f s12"><label>Motivo da diferença</label><input type="text" name="motivo" placeholder="Ex.: quebra, vencimento, erro de lançamento"></div>
            </div>
            <div class="alert alert-info mt" id="ac-diff" hidden></div>
            <div class="actions mt"><button class="btn btn-primary" type="submit">Registrar acerto</button></div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="tabs" id="est-tabs">
          <button data-tab="entradas">Entradas registradas</button>
          <button data-tab="extrato">Extrato de movimentações</button>
          <button data-tab="acertos">Acertos de inventário</button>
          <button data-tab="config">Ponto de partida</button>
        </div>
        <div id="est-tab"></div>
      </div>
      <datalist id="dl-fornecedores"></datalist>`;

    const ef = U.$('#ent-form', root);
    const caixas = ef.querySelector('[name=caixas]');
    const un = U.$('#ent-un', root);
    const upc = () => +(D.produto(ef.querySelector('[name=produto_id]').value) || {}).unidades_caixa || 1;
    caixas.addEventListener('input', () => { un.value = caixas.value ? U.round2(+caixas.value * upc()) : ''; });
    un.addEventListener('input', () => { caixas.value = un.value ? U.round2(+un.value / upc()) : ''; });
    ef.querySelector('[name=produto_id]').addEventListener('change', () => caixas.dispatchEvent(new Event('input')));
    ef.onsubmit = (e) => { e.preventDefault(); salvarEntrada(); };
    U.$('#ent-limpar', root).onclick = resetEntrada;

    const af = U.$('#ac-form', root);
    const upd = () => atualizaAcerto();
    af.addEventListener('input', upd);
    af.addEventListener('change', upd);
    af.onsubmit = (e) => { e.preventDefault(); salvarAcerto(); };

    U.$('#est-tabs', root).onclick = (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) { tab = b.dataset.tab; renderTab(); }
    };
    U.$('#est-tab', root).addEventListener('click', onTabClick);
    U.$('#est-export', root).onclick = exportar;

    resetEntrada();
    af.querySelector('[name=data]').value = U.today();
    render();
  }

  // ---------- Cartões de saldo ----------
  function renderCards() {
    const est = D.estoque();
    const cfg = D.estoqueConfig();
    const pend = {};
    for (const p of D.pedidos()) {
      if (p.nota || p.status === 'cancelado') continue;
      for (const it of p.itens || []) pend[it.produto_id] = (pend[it.produto_id] || 0) + (+it.caixas || 0);
    }
    U.$('#est-cards', root).innerHTML = D.produtos().map((p) => {
      const e = est[p.id];
      const proj = e.saldo - (pend[p.id] || 0);
      return `<div class="stock">
        <div class="stock-top"><h3>${U.esc(p.nome)}</h3><small>${cfg.data_base ? 'Desde ' + U.date(cfg.data_base) : 'Sem data-base'}</small></div>
        <div class="stock-big ${e.saldo < 0 ? 'neg' : ''}">${U.num(e.saldo)}<span>caixas</span></div>
        <div class="stock-units">${U.int(e.saldo * p.unidades_caixa)} unidades · após faturar pedidos pendentes: <b style="color:${proj < 0 ? '#FFB4A9' : '#fff'}">${U.num(proj)} cx</b></div>
        <div class="stock-grid">
          <div><small>Inicial</small><b>${U.num(e.inicial)}</b></div>
          <div><small>Entradas</small><b>+ ${U.num(e.entradas)}</b></div>
          <div><small>Saídas NF</small><b>− ${U.num(e.saidas)}</b></div>
          <div><small>Retornos</small><b>+ ${U.num(e.retornos)}</b></div>
          <div><small>Reposições</small><b>− ${U.num(e.reposicoes)}</b></div>
          <div><small>Acertos</small><b>${e.acertos >= 0 ? '+' : '−'} ${U.num(Math.abs(e.acertos))}</b></div>
        </div>
        <div class="stock-units" style="margin:10px 0 0">Perdas registradas (não voltaram): ${U.num(e.perdas)} cx${pend[p.id] ? ` · Pendente de faturar: ${U.num(pend[p.id])} cx` : ''}</div>
      </div>`;
    }).join('') || '<div class="alert alert-warn">Nenhum produto cadastrado.</div>';
  }

  function renderValidade() {
    const hoje = U.today();
    const list = Store.list('entradas').filter((e) => e.empresa_id === D.empresaId() && e.validade && e.validade >= U.addDays(hoje, -30))
      .sort((a, b) => a.validade.localeCompare(b.validade)).slice(0, 8);
    const el = U.$('#est-validade', root);
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="card"><div class="card-head"><div><h2>Validades das últimas cargas</h2><div class="sub">Cargas com validade informada, da mais próxima para a mais distante</div></div></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Produto</th><th>Lote</th><th>Entrada</th><th class="num">Caixas</th><th>Validade</th><th>Situação</th></tr></thead><tbody>
      ${list.map((e) => {
        const d = U.daysBetween(hoje, e.validade);
        const b = d < 0 ? `<span class="badge b-danger">Vencido há ${-d} dia(s)</span>` : d <= 15 ? `<span class="badge b-danger">Vence em ${d} dia(s)</span>` : d <= 45 ? `<span class="badge b-warn">Vence em ${d} dias</span>` : `<span class="badge b-ok">${d} dias</span>`;
        return `<tr><td>${U.esc((D.produto(e.produto_id) || {}).nome || '')}</td><td>${U.esc(e.lote || '—')}</td><td>${U.date(e.data)}</td><td class="num">${U.num(e.caixas)}</td><td>${U.date(e.validade)}</td><td>${b}</td></tr>`;
      }).join('')}</tbody></table></div></div>`;
  }

  // ---------- Entradas ----------
  function resetEntrada() {
    editEntrada = null;
    const f = U.$('#ent-form', root);
    f.reset();
    U.$('#ent-un', root).value = '';
    f.querySelector('[name=data]').value = U.today();
    const last = Store.list('entradas').filter((e) => e.empresa_id === D.empresaId()).sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
    f.querySelector('[name=fornecedor]').value = last ? last.fornecedor || '' : (D.empresa() || {}).nome || '';
    U.$('#ent-title', root).textContent = 'Dar entrada em mercadoria';
    U.$('#ent-salvar', root).textContent = 'Registrar entrada';
  }

  function salvarEntrada() {
    const f = U.$('#ent-form', root);
    const o = U.formData(f);
    o.caixas = U.parseNum(o.caixas);
    o.custo_unitario = o.custo_unitario ? U.parseNum(o.custo_unitario) : null;
    if (!o.caixas || !o.produto_id || !o.data) { U.toast('Informe data, produto e quantidade', 'warn'); return; }
    o.empresa_id = D.empresaId();
    if (editEntrada) o.id = editEntrada;
    Store.save('entradas', o);
    U.toast(editEntrada ? 'Entrada atualizada' : `Entrada de ${U.num(o.caixas)} cx registrada`);
    resetEntrada();
  }

  function editarEntrada(id) {
    const e = Store.get('entradas', id);
    editEntrada = id;
    const f = U.$('#ent-form', root);
    U.fillForm(f, { ...e, custo_unitario: e.custo_unitario != null ? String(e.custo_unitario).replace('.', ',') : '' });
    U.$('#ent-un', root).value = U.round2(e.caixas * ((D.produto(e.produto_id) || {}).unidades_caixa || 1));
    U.$('#ent-title', root).textContent = 'Editando entrada de ' + U.date(e.data);
    U.$('#ent-salvar', root).textContent = 'Salvar alterações';
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // ---------- Acertos ----------
  function atualizaAcerto() {
    const f = U.$('#ac-form', root);
    const pid = f.querySelector('[name=produto_id]').value;
    const est = D.estoque()[pid];
    const sis = est ? est.saldo : 0;
    U.$('#ac-sistema', root).value = U.num(sis);
    const c = f.querySelector('[name=contado]').value;
    const box = U.$('#ac-diff', root);
    if (c === '') { box.hidden = true; return; }
    const diff = U.round2(U.parseNum(c) - sis);
    box.hidden = false;
    box.className = 'alert mt ' + (diff === 0 ? 'alert-info' : 'alert-warn');
    box.textContent = diff === 0 ? 'Contagem bate com o sistema.' : `Diferença: ${diff > 0 ? '+' : ''}${U.num(diff)} caixas (será lançado como acerto).`;
  }

  async function salvarAcerto() {
    const f = U.$('#ac-form', root);
    const o = U.formData(f);
    if (o.contado === '') { U.toast('Digite a contagem física', 'warn'); return; }
    const sis = D.estoque()[o.produto_id].saldo;
    const contado = U.parseNum(o.contado);
    const diferenca = U.round2(contado - sis);
    if (diferenca === 0) { U.toast('Sem diferença — nada a acertar'); f.querySelector('[name=contado]').value = ''; atualizaAcerto(); return; }
    if (!o.motivo && !(await U.confirm('Registrar o acerto sem informar o motivo?'))) return;
    Store.save('acertos', { empresa_id: D.empresaId(), produto_id: o.produto_id, data: o.data || U.today(), sistema: sis, contado, diferenca, motivo: o.motivo });
    U.toast(`Acerto de ${diferenca > 0 ? '+' : ''}${U.num(diferenca)} cx registrado`);
    f.querySelector('[name=contado]').value = '';
    f.querySelector('[name=motivo]').value = '';
    atualizaAcerto();
  }

  // ---------- Abas ----------
  function renderTab() {
    U.$$('#est-tabs button', root).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const el = U.$('#est-tab', root);
    const nome = (id) => U.esc((D.produto(id) || {}).nome || '?');
    if (tab === 'entradas') {
      const list = Store.list('entradas').filter((e) => e.empresa_id === D.empresaId()).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      el.innerHTML = `<div class="table-wrap" style="max-height:60vh"><table class="t cards"><thead><tr><th>Data</th><th>Produto</th><th class="num">Caixas</th><th class="num">Unidades</th><th>Nota / fornecedor</th><th>Lote / validade</th><th class="num">Custo un.</th><th>Observação</th><th></th></tr></thead><tbody>
        ${list.map((e) => `<tr data-id="${e.id}"><td data-l="Data">${U.date(e.data)}</td><td data-l="Produto"><b>${nome(e.produto_id)}</b></td>
          <td data-l="Caixas" class="num">${U.num(e.caixas)}</td><td data-l="Unidades" class="num">${U.int(e.caixas * ((D.produto(e.produto_id) || {}).unidades_caixa || 1))}</td>
          <td data-l="Nota">${U.esc(e.nota_fornecedor || '—')}<span class="sub">${U.esc(e.fornecedor || '')}</span></td>
          <td data-l="Lote">${U.esc(e.lote || '—')}<span class="sub">${e.validade ? 'Val. ' + U.date(e.validade) : ''}</span></td>
          <td data-l="Custo" class="num">${e.custo_unitario != null ? U.money(e.custo_unitario) : '—'}</td><td data-l="Obs.">${U.esc(e.observacao || '')}</td>
          <td class="row-actions"><button class="btn btn-xs" data-act="edit-ent">Editar</button> <button class="btn btn-xs btn-ghost-danger" data-act="del-ent">Excluir</button></td></tr>`).join('') ||
          '<tr><td colspan="9" class="empty">Nenhuma entrada registrada.</td></tr>'}</tbody></table></div>`;
    } else if (tab === 'extrato') {
      const mv = D.movimentos();
      const filtro = el.dataset.prod || '';
      const rows = mv.filter((m) => !filtro || m.produto_id === filtro);
      el.innerHTML = `<div class="filters"><div class="f"><label>Produto</label><select id="mv-prod"><option value="">Todos</option>${D.produtos().map((p) => `<option value="${p.id}" ${p.id === filtro ? 'selected' : ''}>${U.esc(p.nome)}</option>`).join('')}</select></div></div>
        <div class="table-wrap" style="max-height:60vh"><table class="t cards"><thead><tr><th>Data</th><th>Movimento</th><th>Produto</th><th class="num">Caixas</th><th>Referência</th></tr></thead><tbody>
        ${rows.slice(0, mvLimit).map((m) => `<tr><td data-l="Data">${U.date(m.data)}</td><td data-l="Tipo"><span class="badge ${m.qtd > 0 ? 'b-ok' : m.qtd < 0 ? 'b-mute' : 'b-danger'}">${m.tipo}</span></td><td data-l="Produto">${nome(m.produto_id)}</td>
          <td data-l="Caixas" class="num ${m.qtd > 0 ? 'pos' : m.qtd < 0 ? '' : 'negv'}">${m.tipo === 'Perda' ? `(${U.num(m.info)})` : (m.qtd > 0 ? '+' : '') + U.num(m.qtd)}</td><td data-l="Ref.">${U.esc(m.ref || '')}</td></tr>`).join('') ||
          '<tr><td colspan="5" class="empty">Sem movimentações.</td></tr>'}</tbody></table></div>
        ${rows.length > mvLimit ? `<div class="list-foot"><span>Mostrando ${mvLimit} de ${rows.length}</span><button class="btn btn-sm" data-act="mv-mais">Mostrar mais</button></div>` : ''}`;
      U.$('#mv-prod', el).onchange = (e) => { el.dataset.prod = e.target.value; renderTab(); };
    } else if (tab === 'acertos') {
      const list = Store.list('acertos').filter((a) => a.empresa_id === D.empresaId()).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
      el.innerHTML = `<div class="table-wrap"><table class="t cards"><thead><tr><th>Data</th><th>Produto</th><th class="num">Sistema</th><th class="num">Contado</th><th class="num">Diferença</th><th>Motivo</th><th></th></tr></thead><tbody>
        ${list.map((a) => `<tr data-id="${a.id}"><td data-l="Data">${U.date(a.data)}</td><td data-l="Produto">${nome(a.produto_id)}</td><td data-l="Sistema" class="num">${U.num(a.sistema)}</td><td data-l="Contado" class="num">${U.num(a.contado)}</td>
          <td data-l="Diferença" class="num ${a.diferenca >= 0 ? 'pos' : 'negv'}">${a.diferenca > 0 ? '+' : ''}${U.num(a.diferenca)}</td><td data-l="Motivo">${U.esc(a.motivo || '')}</td>
          <td class="row-actions"><button class="btn btn-xs btn-ghost-danger" data-act="del-ac">Excluir</button></td></tr>`).join('') ||
          '<tr><td colspan="7" class="empty">Nenhum acerto registrado.</td></tr>'}</tbody></table></div>`;
    } else if (tab === 'config') {
      const cfg = D.estoqueConfig();
      el.innerHTML = `<form id="cfg-form" style="max-width:720px">
        <p class="muted small">Defina a data a partir da qual o estoque é calculado e quantas caixas havia nesse dia. Pedidos faturados, entradas e ocorrências anteriores à data-base são ignorados no saldo.</p>
        <div class="fields">
          <div class="f s4"><label>Data-base do estoque</label><input type="date" name="data_base" value="${cfg.data_base || ''}"></div>
          ${D.produtos().map((p) => `<div class="f s4"><label>Estoque inicial — ${U.esc(p.nome)} (cx)</label><input type="number" step="any" data-ini="${p.id}" value="${(cfg.inicial || {})[p.id] || 0}"></div>`).join('')}
        </div>
        <div class="alert alert-warn mt">Alterar a data-base ou a contagem inicial recalcula todo o saldo. Faça um backup antes de mudanças importantes (Ajustes e backup).</div>
        <div class="actions mt"><button class="btn btn-primary" type="submit">Salvar ponto de partida</button></div></form>`;
      U.$('#cfg-form', el).onsubmit = (e) => {
        e.preventDefault();
        const inicial = {};
        U.$$('[data-ini]', el).forEach((i) => { inicial[i.dataset.ini] = U.parseNum(i.value); });
        Store.setConfig('estoque:' + D.empresaId(), { data_base: U.$('[name=data_base]', el).value, inicial });
        U.toast('Ponto de partida salvo — saldos recalculados');
      };
    }
  }

  async function onTabClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const tr = b.closest('tr');
    const id = tr && tr.dataset.id;
    if (b.dataset.act === 'edit-ent') editarEntrada(id);
    if (b.dataset.act === 'del-ent' && await U.confirm('Excluir esta entrada? O saldo será recalculado.', { ok: 'Excluir', danger: true })) Store.remove('entradas', id);
    if (b.dataset.act === 'del-ac' && await U.confirm('Excluir este acerto? O saldo será recalculado.', { ok: 'Excluir', danger: true })) Store.remove('acertos', id);
    if (b.dataset.act === 'mv-mais') { mvLimit += 500; renderTab(); }
  }

  function exportar() {
    const nome = (id) => (D.produto(id) || {}).nome || '';
    const est = D.estoque();
    Excel.generico('estoque', {
      Saldos: Object.values(est).map((e) => ({ Produto: e.produto.nome, Inicial: e.inicial, Entradas: e.entradas, 'Saídas NF': e.saidas, Retornos: e.retornos,
        Reposições: e.reposicoes, Acertos: e.acertos, 'Saldo (cx)': e.saldo, 'Saldo (un)': e.saldo * e.produto.unidades_caixa, 'Perdas registradas': e.perdas })),
      Extrato: D.movimentos().map((m) => ({ Data: U.date(m.data), Movimento: m.tipo, Produto: nome(m.produto_id), Caixas: m.tipo === 'Perda' ? -m.info : m.qtd, Referência: m.ref })),
      Entradas: Store.list('entradas').filter((e) => e.empresa_id === D.empresaId()).map((e) => ({ Data: U.date(e.data), Produto: nome(e.produto_id), Caixas: e.caixas,
        'Nota fornecedor': e.nota_fornecedor || '', Fornecedor: e.fornecedor || '', Lote: e.lote || '', Validade: U.date(e.validade), 'Custo unitário': e.custo_unitario, Observação: e.observacao || '' })),
    });
  }

  function render() {
    renderCards();
    renderValidade();
    atualizaAcerto();
    renderTab();
    const forn = Array.from(new Set(Store.list('entradas').map((e) => e.fornecedor).filter(Boolean)));
    U.$('#dl-fornecedores', root).innerHTML = forn.map((v) => `<option value="${U.esc(v)}">`).join('');
  }

  Pages.estoque = {
    build,
    show: render,
    onData(tables, visible) { if (visible) render(); },
  };
})();
