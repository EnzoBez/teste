/* Página 4 — Ocorrências: cancelamentos, devoluções e trocas */
(function () {
  'use strict';

  const MOTIVOS = ['Produto avariado', 'Produto vencido / validade curta', 'Recusado na entrega', 'Cliente desistiu', 'Erro de digitação do pedido',
    'Pedido duplicado', 'Preço divergente', 'Atraso na entrega', 'Falta de estoque', 'Outro'];
  let root, form, pedido = null, editingId = null, limit = 100;

  function build(r) {
    root = r;
    const prods = D.produtos();
    root.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Página 4</div><h1>Ocorrências</h1></div>
        <div class="head-actions"><button class="btn" id="oc-export">Exportar Excel</button></div>
      </div>
      <div class="card" id="oc-form-card">
        <div class="card-head"><div><h2 id="oc-title">Nova ocorrência</h2><div class="sub">Cancelamentos, devoluções e trocas ficam registrados e ajustam o estoque automaticamente</div></div>
          <button class="btn btn-sm" id="oc-limpar">Limpar</button></div>
        <form id="oc-form" autocomplete="off">
          <div class="fields">
            <div class="f s5"><span class="lbl">Tipo</span><div class="seg">${Object.entries(U.TIPOS_OCORRENCIA).map(([k, v]) => `<label><input type="radio" name="tipo" value="${k}" ${k === 'cancelamento' ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
            <div class="f s3"><label>Data</label><input type="date" name="data"></div>
            <div class="f s4"><label>Nota de devolução</label><input type="text" name="nota_devolucao" placeholder="Se houver"></div>
            <div class="f s12"><label>Pedido <span class="req">*</span></label>
              <div class="ac"><input type="text" id="oc-ped-q" placeholder="Busque por nota, nº do pedido, cliente ou CNPJ…"><div class="ac-list" id="oc-ped-list" hidden></div></div>
              <div class="client-pill" id="oc-ped-pill" hidden></div>
            </div>
          </div>
          <div id="oc-aviso" class="mt"></div>
          <div class="prod-grid" id="oc-itens">
            ${prods.map((p) => `<div class="prod" data-pid="${p.id}">
              <div class="prod-head"><h3>${U.esc(p.nome)}</h3><span class="badge b-info" data-pedido-qtd></span></div>
              <div class="fields">
                <div class="f"><label data-lbl-cx>Caixas devolvidas</label><input type="number" step="any" min="0" data-k="caixas" inputmode="decimal" placeholder="0"></div>
                <div class="f"><label>Volta ao estoque?</label><select data-k="volta"><option value="1">Sim — produto em bom estado</option><option value="0">Não — avariado, vencido ou descartado</option></select></div>
                <div class="f" data-repo hidden style="grid-column:1/-1"><label>Caixas enviadas em reposição (troca)</label><input type="number" step="any" min="0" data-k="repo" inputmode="decimal" placeholder="0"></div>
              </div></div>`).join('')}
          </div>
          <div class="fields">
            <div class="f s4"><label>Motivo</label><select name="motivo"><option value="">Selecione…</option>${MOTIVOS.map((m) => `<option>${m}</option>`).join('')}</select></div>
            <div class="f s8"><label>Detalhes / observação</label><input type="text" name="observacao"></div>
          </div>
          <div class="alert alert-info mt" id="oc-efeito"></div>
          <div class="actions mt"><button class="btn btn-sm" type="button" id="oc-cancel-edit" hidden>Cancelar edição</button><span class="grow"></span><button class="btn btn-primary" type="submit" id="oc-salvar">Registrar ocorrência</button></div>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><div><h2>Ocorrências registradas</h2></div></div>
        <div class="filters">
          <div class="f wide"><label>Buscar</label><input type="search" data-f="q" placeholder="Cliente, CNPJ, nota, motivo…"></div>
          <div class="f"><label>Tipo</label><select data-f="tipo"><option value="">Todos</option>${Object.entries(U.TIPOS_OCORRENCIA).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="f"><label>De</label><input type="date" data-f="de"></div>
          <div class="f"><label>Até</label><input type="date" data-f="ate"></div>
          <div class="f"><label>Estoque</label><select data-f="volta"><option value="">Todos</option><option value="1">Voltou ao estoque</option><option value="0">Perda</option></select></div>
        </div>
        <div class="summary" id="oc-summary"></div>
        <div class="table-wrap" style="max-height:70vh"><table class="t cards" id="oc-table"></table></div>
        <div class="list-foot"><span id="oc-foot"></span><button class="btn btn-sm" id="oc-mais" hidden>Mostrar mais</button></div>
      </div>`;

    form = U.$('#oc-form', root);
    bindPedidoSearch();
    form.addEventListener('input', efeito);
    form.addEventListener('change', (e) => {
      if (e.target.name === 'tipo') ajustaTipo(true);
      efeito();
    });
    U.$$('[data-k=caixas]', root).forEach((i) => i.addEventListener('input', () => {
      const card = i.closest('.prod');
      const repo = card.querySelector('[data-k=repo]');
      if (form.querySelector('[name=tipo]:checked').value === 'troca' && !repo.dataset.touched) repo.value = i.value;
    }));
    U.$$('[data-k=repo]', root).forEach((i) => i.addEventListener('input', () => { i.dataset.touched = '1'; }));
    form.onsubmit = (e) => { e.preventDefault(); salvar(); };
    U.$('#oc-limpar', root).onclick = reset;
    U.$('#oc-cancel-edit', root).onclick = reset;
    U.$$('[data-f]', root).forEach((el) => el.addEventListener('input', U.debounce(() => { limit = 100; renderList(); }, 150)));
    U.$('#oc-mais', root).onclick = () => { limit += 300; renderList(); };
    U.$('#oc-table', root).addEventListener('click', onListClick);
    U.$('#oc-export', root).onclick = exportar;
    reset();
    renderList();
  }

  // ---------- Busca do pedido ----------
  function bindPedidoSearch() {
    const q = U.$('#oc-ped-q', root);
    const list = U.$('#oc-ped-list', root);
    let items = [], idx = 0;
    const render = () => {
      const t = q.value.trim(), n = U.norm(t), d = U.digits(t);
      if (!t) { list.hidden = true; return; }
      items = D.pedidos().filter((p) => {
        if (d.length >= 2 && (U.digits(p.nota) === d || String(p.numero) === d)) return true;
        if (d.length >= 4 && U.digits(p.cnpj).includes(d)) return true;
        return n.length >= 2 && !/^\d+$/.test(n) && U.norm(p.cliente_nome).includes(n);
      }).sort((a, b) => {
        const exact = (p) => (U.digits(p.nota) === d || String(p.numero) === d ? 1 : 0);
        return exact(b) - exact(a) || (b.data_pedido || '').localeCompare(a.data_pedido || '');
      }).slice(0, 25);
      idx = 0;
      list.innerHTML = items.map((p, i) => `<div class="ac-item ${i === 0 ? 'on' : ''}" data-i="${i}"><b>${U.esc(p.cliente_nome)} — ${U.money(p.total)}</b>
        <small>Pedido nº ${p.numero} · ${U.date(p.data_pedido)} · ${p.nota ? 'NF ' + U.esc(p.nota) : 'sem nota'} · ${resumoItens(p)}${p.status === 'cancelado' ? ' · CANCELADO' : ''}</small></div>`).join('') ||
        '<div class="ac-item muted">Nenhum pedido encontrado</div>';
      list.hidden = false;
    };
    q.addEventListener('input', U.debounce(render, 100));
    q.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 180));
    q.addEventListener('keydown', (e) => {
      const els = U.$$('.ac-item[data-i]', list);
      if (list.hidden || !els.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
        els.forEach((el, i) => el.classList.toggle('on', i === idx));
      } else if (e.key === 'Enter') { e.preventDefault(); setPedido(items[idx]); list.hidden = true; }
    });
    list.addEventListener('mousedown', (e) => {
      const it = e.target.closest('.ac-item[data-i]');
      if (!it) return;
      e.preventDefault();
      list.hidden = true;
      setPedido(items[+it.dataset.i]);
    });
  }

  const resumoItens = (p) => (p.itens || []).filter((i) => +i.caixas).map((i) => `${U.num(i.caixas)} cx ${U.esc((D.produto(i.produto_id) || {}).nome || '')}`).join(' + ');

  function setPedido(p, keepItens) {
    pedido = p;
    const q = U.$('#oc-ped-q', root);
    const pill = U.$('#oc-ped-pill', root);
    if (!p) {
      q.hidden = false; pill.hidden = true; q.value = '';
      U.$$('[data-pedido-qtd]', root).forEach((b) => { b.textContent = ''; });
      efeito();
      return;
    }
    q.hidden = true;
    pill.hidden = false;
    pill.innerHTML = `<div><b>${U.esc(p.cliente_nome)}</b><small>Pedido nº ${p.numero} · ${U.date(p.data_pedido)} · ${p.nota ? 'NF ' + U.esc(p.nota) : 'sem nota'} · ${resumoItens(p)} · ${U.money(p.total)}</small></div>
      <div class="actions"><button type="button" class="btn btn-sm" data-ver>Ver pedido</button><button type="button" class="btn btn-sm" data-trocar>Trocar</button></div>`;
    pill.querySelector('[data-trocar]').onclick = () => { setPedido(null); U.$('#oc-ped-q', root).focus(); };
    pill.querySelector('[data-ver]').onclick = () => Pages.pedidos.editar(p.id);
    U.$$('.prod', U.$('#oc-itens', root)).forEach((card) => {
      const cx = D.caixasDe(p, card.dataset.pid);
      card.querySelector('[data-pedido-qtd]').textContent = cx ? `${U.num(cx)} cx no pedido` : 'não está no pedido';
    });
    if (!keepItens) {
      const tipoEl = form.querySelector('[name=tipo]:checked');
      if (tipoEl.value === 'cancelamento') preencheCancelamento();
    }
    efeito();
  }

  function preencheCancelamento() {
    if (!pedido) return;
    U.$$('#oc-itens .prod', root).forEach((card) => {
      const cx = D.caixasDe(pedido, card.dataset.pid);
      card.querySelector('[data-k=caixas]').value = cx || '';
    });
  }

  function ajustaTipo(fromUser) {
    const tipo = form.querySelector('[name=tipo]:checked').value;
    U.$$('[data-repo]', root).forEach((el) => { el.hidden = tipo !== 'troca'; });
    U.$$('[data-lbl-cx]', root).forEach((el) => { el.textContent = tipo === 'cancelamento' ? 'Caixas canceladas' : tipo === 'troca' ? 'Caixas recolhidas' : 'Caixas devolvidas'; });
    if (fromUser && tipo === 'cancelamento') preencheCancelamento();
    if (fromUser && tipo !== 'cancelamento') U.$$('#oc-itens [data-k=caixas]', root).forEach((i) => { i.value = ''; });
  }

  function lerItens() {
    const itens = [], repo = [];
    U.$$('#oc-itens .prod', root).forEach((card) => {
      const cx = U.parseNum(card.querySelector('[data-k=caixas]').value);
      if (cx > 0) itens.push({ produto_id: card.dataset.pid, caixas: cx, volta_estoque: card.querySelector('[data-k=volta]').value === '1' });
      const r = U.parseNum(card.querySelector('[data-k=repo]').value);
      if (r > 0) repo.push({ produto_id: card.dataset.pid, caixas: r });
    });
    return { itens, repo };
  }

  function efeito() {
    const tipo = form.querySelector('[name=tipo]:checked').value;
    const { itens, repo } = lerItens();
    const nome = (id) => (D.produto(id) || {}).nome || '';
    const box = U.$('#oc-efeito', root);
    const aviso = U.$('#oc-aviso', root);
    aviso.innerHTML = '';
    const semNota = pedido && !pedido.nota;
    if (tipo === 'cancelamento' && semNota) {
      aviso.innerHTML = '<div class="alert alert-info">Este pedido ainda não foi faturado: o cancelamento só marca o pedido como cancelado, o estoque não muda.</div>';
    } else if (tipo !== 'cancelamento' && semNota) {
      aviso.innerHTML = '<div class="alert alert-warn">Este pedido ainda não tem nota — a mercadoria não saiu do estoque. Confira se a ocorrência está correta.</div>';
    }
    if (pedido && pedido.status === 'cancelado' && tipo === 'cancelamento' && pedido.id !== (editingId && (Store.get('ocorrencias', editingId) || {}).pedido_id)) {
      aviso.innerHTML += '<div class="alert alert-warn mt">Este pedido já está cancelado.</div>';
    }
    const parts = [];
    if (!(tipo === 'cancelamento' && semNota)) {
      for (const i of itens) parts.push(i.volta_estoque ? `<b>+${U.num(i.caixas)} cx ${U.esc(nome(i.produto_id))}</b> voltam ao estoque` : `${U.num(i.caixas)} cx ${U.esc(nome(i.produto_id))} registradas como <b>perda</b>`);
      if (tipo === 'troca') for (const r of repo) parts.push(`<b>−${U.num(r.caixas)} cx ${U.esc(nome(r.produto_id))}</b> saem em reposição`);
    }
    if (tipo === 'cancelamento' && pedido) parts.push(`pedido nº ${pedido.numero} passa para <b>cancelado</b>`);
    box.innerHTML = parts.length ? 'Ao registrar: ' + parts.join(' · ') : 'Selecione o pedido e informe as quantidades.';
  }

  function reset() {
    editingId = null;
    form.reset();
    form.querySelector('[name=data]').value = U.today();
    U.$$('[data-k=repo]', root).forEach((i) => { delete i.dataset.touched; });
    setPedido(null);
    ajustaTipo(false);
    U.$('#oc-title', root).textContent = 'Nova ocorrência';
    U.$('#oc-salvar', root).textContent = 'Registrar ocorrência';
    U.$('#oc-cancel-edit', root).hidden = true;
    efeito();
  }

  function salvar() {
    const f = U.formData(form);
    if (!pedido) { U.toast('Selecione o pedido', 'warn'); U.$('#oc-ped-q', root).focus(); return; }
    let { itens, repo } = lerItens();
    if (f.tipo === 'cancelamento' && !pedido.nota) itens = itens.map((i) => ({ ...i, caixas: 0 })).filter(() => false);
    if (f.tipo !== 'troca') repo = [];
    if (f.tipo !== 'cancelamento' && !itens.length && !repo.length) { U.toast('Informe as caixas', 'warn'); return; }
    const old = editingId ? Store.get('ocorrencias', editingId) : null;
    const o = {
      id: editingId || undefined,
      numero: old ? old.numero : D.proximoNumero('ocorrencias'),
      empresa_id: pedido.empresa_id || D.empresaId(), tipo: f.tipo, data: f.data || U.today(),
      pedido_id: pedido.id, cliente_id: pedido.cliente_id, cnpj: pedido.cnpj, cliente_nome: pedido.cliente_nome, nota: pedido.nota || '',
      motivo: f.motivo, observacao: f.observacao, nota_devolucao: f.nota_devolucao, itens, reposicao: repo,
    };
    Store.save('ocorrencias', o);
    // Cancelamento: marca o pedido. Se a ocorrência editada deixou de ser cancelamento, reativa.
    if (f.tipo === 'cancelamento' && pedido.status !== 'cancelado') Store.save('pedidos', { id: pedido.id, status: 'cancelado' });
    if (old && old.tipo === 'cancelamento' && (f.tipo !== 'cancelamento' || old.pedido_id !== pedido.id)) reativarSeSemCancelamento(old.pedido_id, o.id);
    U.toast(`${U.TIPOS_OCORRENCIA[f.tipo]} registrado(a)`);
    reset();
  }

  function reativarSeSemCancelamento(pedidoId, exceptId) {
    const outro = Store.list('ocorrencias').some((x) => x.id !== exceptId && x.pedido_id === pedidoId && x.tipo === 'cancelamento');
    const p = Store.get('pedidos', pedidoId);
    if (p && !outro && p.status === 'cancelado') Store.save('pedidos', { id: pedidoId, status: 'ativo' });
  }

  function editar(id) {
    const o = Store.get('ocorrencias', id);
    reset();
    editingId = id;
    U.fillForm(form, o);
    const p = Store.get('pedidos', o.pedido_id);
    if (p) setPedido(p, true);
    ajustaTipo(false);
    U.$$('#oc-itens .prod', root).forEach((card) => {
      const it = (o.itens || []).find((i) => i.produto_id === card.dataset.pid);
      const r = (o.reposicao || []).find((i) => i.produto_id === card.dataset.pid);
      card.querySelector('[data-k=caixas]').value = it ? it.caixas : '';
      card.querySelector('[data-k=volta]').value = it && !it.volta_estoque ? '0' : '1';
      card.querySelector('[data-k=repo]').value = r ? r.caixas : '';
      if (r) card.querySelector('[data-k=repo]').dataset.touched = '1';
    });
    U.$('#oc-title', root).textContent = `Editando ocorrência nº ${o.numero}`;
    U.$('#oc-salvar', root).textContent = 'Salvar alterações';
    U.$('#oc-cancel-edit', root).hidden = false;
    efeito();
    U.$('#oc-form-card', root).scrollIntoView({ behavior: 'smooth' });
  }

  async function excluir(id) {
    const o = Store.get('ocorrencias', id);
    const ok = await U.confirm(`Excluir a ocorrência nº ${o.numero} (${U.TIPOS_OCORRENCIA[o.tipo]} — ${o.cliente_nome})? O estoque será recalculado` +
      (o.tipo === 'cancelamento' ? ' e o pedido volta a ficar ativo.' : '.'), { ok: 'Excluir', danger: true });
    if (!ok) return;
    Store.remove('ocorrencias', id);
    if (o.tipo === 'cancelamento') reativarSeSemCancelamento(o.pedido_id, id);
    U.toast('Ocorrência excluída');
  }

  function onListClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('tr').dataset.id;
    if (b.dataset.act === 'edit') editar(id);
    if (b.dataset.act === 'del') excluir(id);
    if (b.dataset.act === 'ped') { const o = Store.get('ocorrencias', id); if (o.pedido_id) Pages.pedidos.editar(o.pedido_id); }
  }

  function filtered() {
    const f = {};
    U.$$('[data-f]', root).forEach((el) => { f[el.dataset.f] = el.value.trim(); });
    const q = U.norm(f.q), qd = U.digits(f.q);
    return Store.list('ocorrencias').filter((o) => {
      if (o.empresa_id !== D.empresaId()) return false;
      if (f.tipo && o.tipo !== f.tipo) return false;
      if (f.de && o.data < f.de) return false;
      if (f.ate && o.data > f.ate) return false;
      if (f.volta !== '' && f.volta != null && !(o.itens || []).some((i) => String(+!!i.volta_estoque) === f.volta)) return false;
      if (q) {
        if (qd.length >= 3 && (U.digits(o.cnpj).includes(qd) || U.digits(o.nota) === qd)) return true;
        if (!U.norm([o.cliente_nome, o.motivo, o.observacao, o.nota, o.nota_devolucao].join(' ')).includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (b.data || '').localeCompare(a.data || '') || (b.numero || 0) - (a.numero || 0));
  }

  function renderList() {
    const rows = filtered();
    const nome = (id) => U.esc((D.produto(id) || {}).nome || '');
    const cnt = (t) => rows.filter((o) => o.tipo === t).length;
    U.$('#oc-summary', root).innerHTML = `<span>Total: <b>${rows.length}</b></span>` + Object.entries(U.TIPOS_OCORRENCIA).map(([k, v]) => `<span>${v}: <b>${cnt(k)}</b></span>`).join('');
    const badge = { cancelamento: 'b-danger', devolucao: 'b-warn', troca: 'b-info' };
    U.$('#oc-table', root).innerHTML = `<thead><tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Cliente</th><th>Pedido / nota</th><th>Itens</th><th>Reposição</th><th>Motivo</th><th></th></tr></thead><tbody>` +
      (rows.slice(0, limit).map((o) => {
        const p = Store.get('pedidos', o.pedido_id);
        return `<tr data-id="${o.id}">
          <td data-l="Nº">${o.numero || ''}</td><td data-l="Data">${U.date(o.data)}</td>
          <td data-l="Tipo"><span class="badge ${badge[o.tipo] || ''}">${U.TIPOS_OCORRENCIA[o.tipo] || o.tipo}</span></td>
          <td data-l="Cliente"><b>${U.esc(o.cliente_nome || '')}</b><span class="sub">${U.esc(U.fmtDoc(o.cnpj))}</span></td>
          <td data-l="Pedido">${p ? 'nº ' + p.numero : '—'}<span class="sub">${o.nota ? 'NF ' + U.esc(o.nota) : 'sem nota'}${o.nota_devolucao ? ' · NF dev. ' + U.esc(o.nota_devolucao) : ''}</span></td>
          <td data-l="Itens">${(o.itens || []).map((i) => `${U.num(i.caixas)} cx ${nome(i.produto_id)} <span class="badge ${i.volta_estoque ? 'b-ok' : 'b-danger'}">${i.volta_estoque ? 'voltou' : 'perda'}</span>`).join('<br>') || '<span class="muted">—</span>'}</td>
          <td data-l="Reposição">${(o.reposicao || []).map((i) => `${U.num(i.caixas)} cx ${nome(i.produto_id)}`).join('<br>') || '<span class="muted">—</span>'}</td>
          <td data-l="Motivo">${U.esc(o.motivo || '')}<span class="sub">${U.esc(o.observacao || '')}</span></td>
          <td class="row-actions">${p ? '<button class="btn btn-xs" data-act="ped">Pedido</button> ' : ''}<button class="btn btn-xs" data-act="edit">Editar</button> <button class="btn btn-xs btn-ghost-danger" data-act="del">Excluir</button></td>
        </tr>`;
      }).join('') || '<tr><td colspan="9" class="empty">Nenhuma ocorrência registrada.</td></tr>') + '</tbody>';
    U.$('#oc-foot', root).textContent = `Mostrando ${Math.min(limit, rows.length)} de ${rows.length}`;
    U.$('#oc-mais', root).hidden = rows.length <= limit;
  }

  function exportar() {
    const nome = (id) => (D.produto(id) || {}).nome || '';
    Excel.generico('ocorrencias', {
      Ocorrências: filtered().map((o) => ({
        'Nº': o.numero, Data: U.date(o.data), Tipo: U.TIPOS_OCORRENCIA[o.tipo], Cliente: o.cliente_nome, 'CNPJ/CPF': U.fmtDoc(o.cnpj), Nota: o.nota || '',
        'Nota devolução': o.nota_devolucao || '',
        Itens: (o.itens || []).map((i) => `${i.caixas} cx ${nome(i.produto_id)} (${i.volta_estoque ? 'voltou' : 'perda'})`).join('; '),
        Reposição: (o.reposicao || []).map((i) => `${i.caixas} cx ${nome(i.produto_id)}`).join('; '), Motivo: o.motivo || '', Observação: o.observacao || '',
      })),
    });
  }

  Pages.ocorrencias = {
    build,
    show: renderList,
    onData(tables, visible) { if (visible && (tables.has('ocorrencias') || tables.has('pedidos'))) renderList(); },
    novaPara(pedidoId) {
      App.go('ocorrencias');
      setTimeout(() => {
        reset();
        const p = Store.get('pedidos', pedidoId);
        if (!p) return;
        const tipo = p.nota ? 'devolucao' : 'cancelamento';
        form.querySelector(`[name=tipo][value=${tipo}]`).checked = true;
        ajustaTipo(false);
        setPedido(p);
        U.$('#oc-form-card', root).scrollIntoView({ behavior: 'smooth' });
      }, 30);
    },
  };
})();
