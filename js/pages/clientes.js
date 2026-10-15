/* Página 1 — Clientes */
(function () {
  'use strict';

  const PAGE = 100;
  let root, form, listEl, limit = PAGE, sort = { k: 'razao_social', dir: 1 };
  let editingId = null;

  /** HTML do formulário de cliente (reaproveitado no cadastro rápido dentro de Pedidos). */
  function formHtml() {
    return `
      <div class="fields">
        <div class="f s5"><label>CNPJ / CPF <span class="req">*</span></label>
          <div class="input-btn"><input type="text" name="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" autocomplete="off">
          <button type="button" class="btn btn-soft" data-buscar title="Preencher com dados da Receita">Buscar</button></div>
          <span class="hint" data-cnpj-hint>Digite o CNPJ: os dados são preenchidos automaticamente.</span></div>
        <div class="f s3"><label>Inscrição estadual</label><input type="text" name="ie"></div>
        <div class="f s4"><label>Vendedor</label><input type="text" name="vendedor" list="dl-vendedores" placeholder="Nome ou canal"></div>
        <div class="f s12"><label>Razão social <span class="req">*</span></label><input type="text" name="razao_social"></div>
        <div class="f s8"><label>Nome fantasia</label><input type="text" name="nome_fantasia"></div>
        <div class="f s4"><label>Produto</label><input type="text" name="produto" list="dl-produtos-cli" placeholder="Produto principal"></div>
        <div class="f s3"><label>CEP</label><input type="text" name="cep" inputmode="numeric"></div>
        <div class="f s9"><label>Endereço</label><input type="text" name="endereco"></div>
        <div class="f s3"><label>Número</label><input type="text" name="numero"></div>
        <div class="f s4"><label>Complemento</label><input type="text" name="complemento"></div>
        <div class="f s5"><label>Bairro</label><input type="text" name="bairro"></div>
        <div class="f s9"><label>Cidade</label><input type="text" name="cidade" list="dl-cidades"></div>
        <div class="f s3"><label>UF</label><input type="text" name="uf" maxlength="2" style="text-transform:uppercase"></div>
        <div class="f s4"><label>Telefone</label><input type="tel" name="telefone" placeholder="(00) 00000-0000"></div>
        <div class="f s8"><label>E-mail</label><input type="email" name="email"></div>
        <div class="f s12"><label>Contato / comprador</label><input type="text" name="contato"></div>
        <div class="f s12"><label>Observação</label><textarea name="observacao" rows="2"></textarea></div>
      </div>
      <div data-dup class="alert alert-warn mt" hidden></div>`;
  }

  function datalists() {
    let el = U.$('#dl-cli-wrap');
    if (!el) { el = document.createElement('div'); el.id = 'dl-cli-wrap'; document.body.appendChild(el); }
    const uniq = (k) => Array.from(new Set(Store.list('clientes').map((c) => (c[k] || '').trim()).filter(Boolean))).sort();
    el.innerHTML = `
      <datalist id="dl-vendedores">${uniq('vendedor').map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>
      <datalist id="dl-produtos-cli">${uniq('produto').map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>
      <datalist id="dl-cidades">${uniq('cidade').map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>`;
  }

  /** Liga máscaras, busca automática e aviso de duplicidade a um formulário de cliente. */
  function bindForm(f, getEditingId) {
    const cnpj = f.querySelector('[name=cnpj]');
    const hint = f.querySelector('[data-cnpj-hint]');
    const dup = f.querySelector('[data-dup]');
    let lastAuto = '';

    const checkDup = () => {
      const others = D.clientesPorCnpj(cnpj.value).filter((c) => c.id !== getEditingId());
      dup.hidden = !others.length || U.digits(cnpj.value).length < 11;
      if (!dup.hidden) dup.innerHTML = `Este CNPJ já está cadastrado ${others.length > 1 ? others.length + ' vezes' : ''}: <b>${U.esc(others[0].razao_social)}</b> (${U.esc(others[0].cidade || '')}). Você pode salvar mesmo assim, se for intencional.`;
    };

    const buscar = async (auto) => {
      const d = U.digits(cnpj.value);
      if (d.length !== 14) { if (!auto) U.toast('Digite os 14 números do CNPJ', 'warn'); return; }
      if (!U.validCnpj(d)) { hint.textContent = 'CNPJ inválido — confira os números.'; cnpj.classList.add('invalid'); return; }
      if (auto && lastAuto === d) return;
      lastAuto = d;
      hint.textContent = 'Consultando Receita…';
      try {
        const r = await D.buscarCnpj(d);
        const set = (k, v) => {
          const el = f.querySelector(`[name=${k}]`);
          if (el && v && (!auto || !el.value)) el.value = v;
        };
        ['razao_social', 'nome_fantasia', 'ie', 'cep', 'endereco', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'telefone', 'email'].forEach((k) => set(k, r[k]));
        hint.textContent = 'Dados preenchidos pela Receita' + (r.situacao && !/ATIVA/i.test(r.situacao) ? ` — atenção: situação ${r.situacao}` : '.');
      } catch (e) {
        hint.textContent = 'Não foi possível consultar: ' + e.message + '. Preencha manualmente.';
      }
    };

    cnpj.addEventListener('input', () => {
      cnpj.value = U.maskDoc(cnpj.value);
      cnpj.classList.remove('invalid');
      hint.textContent = 'Digite o CNPJ: os dados são preenchidos automaticamente.';
      checkDup();
      const d = U.digits(cnpj.value);
      if (d.length === 14 && !f.querySelector('[name=razao_social]').value) buscar(true);
    });
    f.querySelector('[data-buscar]').onclick = () => { lastAuto = ''; buscar(false); };
    f.querySelector('[name=telefone]').addEventListener('input', (e) => { e.target.value = U.maskPhone(e.target.value); });
    f.querySelector('[name=uf]').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
    return { checkDup };
  }

  /** Valida e grava um cliente a partir do formulário. Retorna o registro salvo ou null. */
  function saveFrom(f, id) {
    const o = U.formData(f);
    o.cnpj = U.fmtDoc(o.cnpj);
    o.uf = (o.uf || '').toUpperCase();
    o.email = (o.email || '').toLowerCase();
    if (!U.digits(o.cnpj) || !o.razao_social) {
      U.toast('Preencha CNPJ e razão social', 'warn');
      (U.digits(o.cnpj) ? f.querySelector('[name=razao_social]') : f.querySelector('[name=cnpj]')).focus();
      return null;
    }
    if (id) o.id = id;
    return Store.save('clientes', o);
  }

  // ---------------------------------------------------------------
  function build(r) {
    root = r;
    root.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Carteira</div><h1>Clientes</h1><div class="page-sub" id="cli-count"></div></div>
        <div class="head-actions">
          <button class="btn" id="cli-export">${U.icon('download', 16)} Excel</button>
          <button class="btn btn-primary" id="cli-novo">${U.icon('plus', 16)} Novo cliente</button>
        </div>
      </div>
      <div class="kpis" id="cli-kpis"></div>
      <div class="toolbar">
        <div class="search">${U.icon('search', 16)}<input type="search" id="cli-q" placeholder="Nome, CNPJ, cidade, bairro, e-mail…  ( / )"></div>
        <div class="chips" id="cli-chips">
          ${[['', 'Todos'], ['ativos', 'Compraram (90 dias)'], ['inativos', 'Inativos'], ['nunca', 'Nunca compraram'], ['dup', 'CNPJ duplicado']]
            .map(([k, v]) => `<button class="chip ${k === '' ? 'on' : ''}" data-sit="${k}">${v}</button>`).join('')}
        </div>
        <span class="grow"></span>
        <select id="cli-vend" class="btn" style="width:auto;min-height:36px;max-width:220px" aria-label="Vendedor"><option value="">Todos os vendedores</option></select>
        <select id="cli-cid" class="btn" style="width:auto;min-height:36px;max-width:200px" aria-label="Cidade"><option value="">Todas as cidades</option></select>
      </div>
      <div class="table-wrap"><table class="t cards" id="cli-table"></table></div>
      <div class="list-foot"><span id="cli-foot"></span><button class="btn btn-sm" id="cli-mais" hidden>Mostrar mais</button></div>
      ${U.drawerHtml('cli-drawer', {
        title: 'Novo cliente', sub: 'Digite o CNPJ: os dados da Receita são preenchidos sozinhos', wide: true,
        body: `<form id="cli-form" autocomplete="off">${formHtml()}</form>`,
        foot: `<span style="flex:1"></span><button type="button" class="btn btn-ghost" id="cli-salvar-pedido">Salvar e fazer pedido</button>
          <button type="submit" form="cli-form" class="btn btn-primary btn-lg">Salvar cliente</button>`,
      })}
      ${U.drawerHtml('cli-detail', { title: '', body: '<div id="cli-detail-body"></div>', wide: true,
        foot: `<button type="button" class="btn btn-ghost btn-ghost-danger" id="cli-d-del">${U.icon('trash', 16)} Excluir</button><span style="flex:1"></span>
          <button type="button" class="btn" id="cli-d-edit">${U.icon('edit', 16)} Editar cadastro</button>
          <button type="button" class="btn btn-primary" id="cli-d-ped">${U.icon('plus', 16)} Novo pedido</button>` })}`;

    form = U.$('#cli-form', root);
    listEl = U.$('#cli-table', root);
    datalists();
    const binder = bindForm(form, () => editingId);

    form.onsubmit = (e) => {
      e.preventDefault();
      const c = saveFrom(form, editingId);
      if (c) { U.toast(editingId ? 'Cliente atualizado' : 'Cliente cadastrado'); novo(); U.closeDrawer(U.$('#cli-drawer', root)); }
    };
    U.$('#cli-salvar-pedido', root).onclick = () => {
      const c = saveFrom(form, editingId);
      if (c) { novo(); U.closeDrawer(U.$('#cli-drawer', root)); Pages.pedidos.novoPara(c.id); }
    };
    U.$('#cli-novo', root).onclick = abrirNovo;
    U.$('#cli-export', root).onclick = () => Excel.clientes(filtered());

    const reList = () => { limit = PAGE; renderList(); };
    U.$('#cli-q', root).addEventListener('input', U.debounce(reList, 150));
    ['#cli-vend', '#cli-cid'].forEach((s) => { U.$(s, root).onchange = reList; });
    U.$('#cli-chips', root).onclick = (e) => {
      const b = e.target.closest('[data-sit]');
      if (!b) return;
      sit = b.dataset.sit;
      U.$$('#cli-chips .chip', root).forEach((c) => c.classList.toggle('on', c === b));
      reList();
    };
    U.$('#cli-kpis', root).onclick = (e) => { const b = e.target.closest('[data-sit]'); if (b) U.$(`#cli-chips [data-sit="${b.dataset.sit}"]`, root).click(); };
    U.$('#cli-mais', root).onclick = () => { limit += PAGE * 3; renderList(); };

    listEl.addEventListener('click', async (e) => {
      const th = e.target.closest('th[data-k]');
      if (th) { sort = { k: th.dataset.k, dir: sort.k === th.dataset.k ? -sort.dir : (th.dataset.k === 'ultimo' ? -1 : 1) }; renderList(); return; }
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      const b = e.target.closest('[data-act]');
      if (!b) { abrir(id); return; }
      if (b.dataset.act === 'pedido') Pages.pedidos.novoPara(id);
      if (b.dataset.act === 'more') {
        const v = await U.menu(b, [
          { label: 'Ver ficha e histórico', value: 'hist', icon: 'history' },
          { label: 'Novo pedido', value: 'pedido', icon: 'plus' },
          { label: 'Editar cadastro', value: 'edit', icon: 'edit' },
          '-',
          { label: 'Excluir cliente', value: 'del', icon: 'trash', danger: true },
        ]);
        if (v === 'hist') abrir(id);
        if (v === 'pedido') Pages.pedidos.novoPara(id);
        if (v === 'edit') editar(id);
        if (v === 'del') excluir(id);
      }
    });
    U.$('#cli-d-ped', root).onclick = () => { const id = detailId; U.closeDrawer(U.$('#cli-detail', root)); Pages.pedidos.novoPara(id); };
    U.$('#cli-d-edit', root).onclick = () => { const id = detailId; U.closeDrawer(U.$('#cli-detail', root)); editar(id); };
    U.$('#cli-d-del', root).onclick = () => excluir(detailId);
    binder.checkDup();
    fillFilters();
    renderList();
  }

  let sit = '';
  let detailId = null;

  function abrirNovo() {
    novo();
    U.openDrawer(U.$('#cli-drawer', root), '[name=cnpj]');
  }

  function novo() {
    editingId = null;
    form.reset();
    U.$('#cli-drawer-title', root).textContent = 'Novo cliente';
    U.$('#cli-drawer-sub', root).textContent = 'Digite o CNPJ: os dados da Receita são preenchidos sozinhos';
    form.querySelector('[data-dup]').hidden = true;
  }

  function editar(id) {
    const c = Store.get('clientes', id);
    if (!c) return;
    editingId = id;
    U.fillForm(form, c);
    U.$('#cli-drawer-title', root).textContent = c.razao_social;
    U.$('#cli-drawer-sub', root).textContent = 'Editando cadastro · ' + U.fmtDoc(c.cnpj);
    form.querySelector('[data-dup]').hidden = true;
    U.openDrawer(U.$('#cli-drawer', root), '[name=razao_social]');
  }

  async function excluir(id) {
    const c = Store.get('clientes', id);
    const n = Store.list('pedidos').filter((p) => p.cliente_id === id).length;
    const ok = await U.confirm(`Excluir o cliente "${c.razao_social}"?` + (n ? ` Ele tem ${n} pedido(s); os pedidos continuam no histórico.` : ''), { ok: 'Excluir', danger: true, title: 'Excluir cliente' });
    if (!ok) return;
    Store.remove('clientes', id);
    if (editingId === id) novo();
    if (detailId === id) U.closeDrawer(U.$('#cli-detail', root));
    U.toast('Cliente excluído');
  }

  /** Ficha do cliente: dados, indicadores e histórico de pedidos. */
  function abrir(id) {
    const c = Store.get('clientes', id);
    if (!c) return;
    detailId = id;
    const d = U.digits(c.cnpj);
    const peds = Store.list('pedidos').filter((p) => U.digits(p.cnpj) === d).sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
    const prods = Store.list('produtos');
    const vendas = peds.filter((p) => p.status !== 'cancelado' && p.tipo === 'venda');
    const total = vendas.reduce((s, p) => s + (+p.total || 0), 0);
    const ticket = vendas.length ? total / vendas.length : 0;
    // Intervalo médio entre pedidos
    const datas = vendas.map((p) => p.data_pedido).filter(Boolean).sort();
    let intervalo = null;
    if (datas.length > 1) intervalo = Math.round(U.daysBetween(datas[0], datas[datas.length - 1]) / (datas.length - 1));
    const ultimo = peds[0];
    const dias = ultimo && ultimo.data_pedido ? U.daysBetween(ultimo.data_pedido, U.today()) : null;
    const precos = D.produtos().map((p) => { const v = D.ultimoPreco(c.cnpj, p.id); return v != null ? `${U.esc(p.nome)} <b>${U.money(v)}</b>/un` : ''; }).filter(Boolean).join(' · ');
    U.$('#cli-detail-title', root).innerHTML = `<span style="display:flex;align-items:center;gap:12px"><span class="avatar" style="--h:${U.hue(c.razao_social)};width:44px;height:44px;font-size:15px">${U.esc(U.initials(c.razao_social))}</span><span>${U.esc(c.razao_social)}</span></span>`;
    U.$('#cli-detail-sub', root).textContent = [U.fmtDoc(c.cnpj), c.ie && 'IE ' + c.ie].filter(Boolean).join(' · ');
    const rows = peds.slice(0, 80).map((p) => `<tr><td>${U.date(p.data_pedido)}</td><td>${p.nota ? '<b>' + U.esc(U.digits(p.nota) || p.nota) + '</b>' : '<span class="badge b-warn">Sem nota</span>'}</td>
      <td>${(p.itens || []).filter((i) => +i.caixas).map((i) => { const pr = prods.find((x) => x.id === i.produto_id); return `${U.num(i.caixas)} cx ${U.esc(pr ? pr.nome : '')} <span class="muted">· ${U.money(i.valor_unitario)}/un</span>`; }).join('<br>')}</td>
      <td>${U.esc(p.vendedor || '')}</td><td class="num"><b>${U.money(p.total)}</b></td>
      <td>${p.status === 'cancelado' ? '<span class="badge b-danger">Cancelado</span>' : p.status === 'devolvido' ? '<span class="badge b-warn">Devolvido</span>' : p.tipo === 'bonificacao' ? '<span class="badge b-warn">Bonif.</span>' : ''}</td></tr>`).join('');
    U.$('#cli-detail-body', root).innerHTML = `
      <div class="kpis">
        <div class="kpi"><small>Total comprado</small><b>${U.money(total)}</b><span>${vendas.length} pedido(s) de venda</span></div>
        <div class="kpi"><small>Ticket médio</small><b>${U.money(ticket)}</b><span>por pedido</span></div>
        <div class="kpi ${dias != null && intervalo && dias > intervalo * 1.5 ? 'warn' : ''}"><small>Último pedido</small><b>${dias == null ? '—' : dias === 0 ? 'Hoje' : dias + ' dias'}</b><span>${intervalo ? 'compra a cada ~' + intervalo + ' dias' : 'sem frequência ainda'}</span></div>
      </div>
      <div class="fields" style="margin-bottom:6px">
        <div class="f s4"><span class="lbl">Vendedor</span><span>${U.esc(c.vendedor || '—')}</span></div>
        <div class="f s4"><span class="lbl">Cidade</span><span>${U.esc([c.cidade, c.uf].filter(Boolean).join('/') || '—')}</span></div>
        <div class="f s4"><span class="lbl">Bairro</span><span>${U.esc(c.bairro || '—')}</span></div>
        <div class="f s8"><span class="lbl">Endereço</span><span>${U.esc([c.endereco, c.numero, c.complemento].filter(Boolean).join(', ') || '—')}</span></div>
        <div class="f s4"><span class="lbl">Telefone</span><span>${U.esc(c.telefone || '—')}</span></div>
        <div class="f s8"><span class="lbl">E-mail</span><span>${U.esc(c.email || '—')}</span></div>
        <div class="f s4"><span class="lbl">Último preço</span><span>${precos || '—'}</span></div>
      </div>
      <div class="section-title">Histórico de pedidos (${peds.length})</div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Data</th><th>Nota</th><th>Itens</th><th>Vendedor</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">Nenhum pedido ainda.</td></tr>'}</tbody></table></div>`;
    U.openDrawer(U.$('#cli-detail', root));
  }

  function fillFilters() {
    const cl = Store.list('clientes');
    const uniq = (k) => Array.from(new Set(cl.map((c) => (c[k] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const keep = (sel, opts, first) => {
      const el = U.$(sel, root);
      const v = el.value;
      el.innerHTML = `<option value="">${first}</option>` + opts.map((o) => `<option ${o === v ? 'selected' : ''}>${U.esc(o)}</option>`).join('');
    };
    keep('#cli-vend', uniq('vendedor'), 'Todos os vendedores');
    keep('#cli-cid', uniq('cidade'), 'Todas as cidades');
  }

  function pedidoStats() {
    const m = new Map();
    for (const p of Store.list('pedidos')) {
      if (p.status === 'cancelado') continue;
      const k = U.digits(p.cnpj);
      const s = m.get(k) || { n: 0, ultimo: '', total: 0 };
      s.n++;
      s.total += p.tipo === 'venda' ? +p.total || 0 : 0;
      if ((p.data_pedido || '') > s.ultimo) s.ultimo = p.data_pedido;
      m.set(k, s);
    }
    return m;
  }

  let statsCache = null;
  function filtered() {
    const q = U.norm(U.$('#cli-q', root).value);
    const qd = U.digits(q);
    const vend = U.$('#cli-vend', root).value;
    const cid = U.$('#cli-cid', root).value;
    statsCache = pedidoStats();
    const limite = U.addDays(U.today(), -90);
    const dupCount = new Map();
    for (const c of Store.list('clientes')) { const k = U.digits(c.cnpj); dupCount.set(k, (dupCount.get(k) || 0) + 1); }
    let rows = Store.list('clientes').filter((c) => {
      if (vend && (c.vendedor || '').trim() !== vend) return false;
      if (cid && (c.cidade || '').trim() !== cid) return false;
      if (sit) {
        const s = statsCache.get(U.digits(c.cnpj));
        if (sit === 'ativos' && !(s && s.ultimo >= limite)) return false;
        if (sit === 'inativos' && !(s && s.ultimo < limite)) return false;
        if (sit === 'nunca' && s) return false;
        if (sit === 'dup' && dupCount.get(U.digits(c.cnpj)) < 2) return false;
      }
      if (!q) return true;
      if (qd.length >= 3 && U.digits(c.cnpj).includes(qd)) return true;
      return U.norm([c.razao_social, c.nome_fantasia, c.cidade, c.bairro, c.vendedor, c.email, c.contato].join(' ')).includes(q);
    });
    const k = sort.k;
    rows = rows.slice().sort((a, b) => {
      let va, vb;
      if (k === 'ultimo') { va = (statsCache.get(U.digits(a.cnpj)) || {}).ultimo || ''; vb = (statsCache.get(U.digits(b.cnpj)) || {}).ultimo || ''; }
      else if (k === 'total') { va = (statsCache.get(U.digits(a.cnpj)) || {}).total || 0; vb = (statsCache.get(U.digits(b.cnpj)) || {}).total || 0; }
      else { va = U.norm(a[k]); vb = U.norm(b[k]); }
      return va < vb ? -sort.dir : va > vb ? sort.dir : 0;
    });
    // contadores para KPIs
    const all = Store.list('clientes');
    let ativos = 0, inativos = 0, nunca = 0;
    for (const c of all) {
      const s = statsCache.get(U.digits(c.cnpj));
      if (!s) nunca++; else if (s.ultimo >= limite) ativos++; else inativos++;
    }
    kpiData = { total: all.length, ativos, inativos, nunca, dup: Array.from(dupCount.values()).filter((n) => n > 1).length };
    return rows;
  }
  let kpiData = null;

  function renderList() {
    const rows = filtered();
    const k = kpiData;
    U.$('#cli-count', root).textContent = `${U.int(k.total)} clientes cadastrados`;
    U.$('#cli-kpis', root).innerHTML = `
      <button class="kpi hero" data-sit="ativos"><small>Ativos</small><b>${U.int(k.ativos)}</b><span>compraram nos últimos 90 dias</span></button>
      <button class="kpi ${k.inativos ? 'warn' : ''}" data-sit="inativos"><small>Inativos</small><b>${U.int(k.inativos)}</b><span>sem compra há 90+ dias — oportunidade</span></button>
      <button class="kpi" data-sit="nunca"><small>Nunca compraram</small><b>${U.int(k.nunca)}</b><span>cadastrados sem pedido</span></button>
      <button class="kpi" data-sit="dup"><small>CNPJ duplicado</small><b>${U.int(k.dup)}</b><span>CNPJs com mais de um cadastro</span></button>`;
    const arrow = (key) => (sort.k === key ? (sort.dir > 0 ? ' ↑' : ' ↓') : '');
    const head = `<thead><tr>
      <th class="sortable" data-k="razao_social">Cliente${arrow('razao_social')}</th>
      <th class="sortable" data-k="cidade">Cidade${arrow('cidade')}</th><th class="sortable" data-k="vendedor">Vendedor${arrow('vendedor')}</th>
      <th>Contato</th><th class="sortable num" data-k="total">Comprado${arrow('total')}</th><th class="sortable" data-k="ultimo">Último pedido${arrow('ultimo')}</th><th></th></tr></thead>`;
    const hoje = U.today();
    const body = rows.slice(0, limit).map((c) => {
      const s = statsCache.get(U.digits(c.cnpj));
      const dias = s && s.ultimo ? U.daysBetween(s.ultimo, hoje) : null;
      return `<tr data-id="${c.id}" class="clickable">
        <td data-l="Cliente"><div class="cell-client"><span class="avatar" style="--h:${U.hue(c.razao_social)}">${U.esc(U.initials(c.razao_social))}</span>
          <div style="min-width:0"><b>${U.esc(c.razao_social)}</b><span class="sub">${U.esc(U.fmtDoc(c.cnpj))}${c.nome_fantasia && c.nome_fantasia !== c.razao_social ? ' · ' + U.esc(c.nome_fantasia) : ''}</span></div></div></td>
        <td data-l="Cidade">${U.esc(c.cidade || '')}${c.uf ? '/' + U.esc(c.uf) : ''}<span class="sub">${U.esc(c.bairro || '')}</span></td>
        <td data-l="Vendedor">${U.esc(c.vendedor || '—')}</td>
        <td data-l="Contato">${U.esc(c.email || '')}<span class="sub">${U.esc(c.telefone || '')}</span></td>
        <td data-l="Comprado" class="num">${s && s.total ? U.money(s.total) : '<span class="muted">—</span>'}<span class="sub">${s ? s.n + ' pedido(s)' : ''}</span></td>
        <td data-l="Último">${s ? `${U.date(s.ultimo)}<span class="sub">${dias === 0 ? 'hoje' : dias + ' dias atrás'}</span>` : '<span class="badge b-mute">Nunca</span>'}</td>
        <td class="row-actions"><button class="btn btn-sm" data-act="pedido">${U.icon('plus', 14)} Pedido</button> <button class="icon-btn" data-act="more" aria-label="Mais ações">${U.icon('more', 18)}</button></td>
      </tr>`;
    }).join('');
    listEl.innerHTML = head + `<tbody>${body || `<tr><td colspan="7"><div class="empty">${U.icon('users', 28)}Nenhum cliente encontrado.</div></td></tr>`}</tbody>`;
    U.$('#cli-foot', root).textContent = `Mostrando ${U.int(Math.min(limit, rows.length))} de ${U.int(rows.length)}`;
    U.$('#cli-mais', root).hidden = rows.length <= limit;
  }

  Pages.clientes = {
    build,
    show() { renderList(); },
    onData(tables, visible) {
      if (tables.has('clientes')) { datalists(); fillFilters(); }
      if (visible && (tables.has('clientes') || tables.has('pedidos'))) renderList();
    },
    novo() { App.ensure('clientes'); abrirNovo(); },
    abrir(id) { App.ensure('clientes'); abrir(id); },
    formHtml, bindForm, saveFrom, datalists,
  };
})();
