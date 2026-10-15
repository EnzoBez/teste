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
        <div><div class="eyebrow">Página 1</div><h1>Clientes</h1></div>
        <div class="head-actions"><button class="btn" id="cli-export">Exportar Excel</button><button class="btn btn-primary" id="cli-novo">+ Novo cliente</button></div>
      </div>
      <div class="grid-cl">
        <div class="card" id="cli-form-card">
          <div class="card-head"><div><h2 id="cli-form-title">Novo cliente</h2><div class="sub">Campos com * são obrigatórios</div></div></div>
          <form id="cli-form" autocomplete="off">${formHtml()}
            <div class="actions mt">
              <button type="button" class="btn" id="cli-limpar">Limpar</button>
              <span class="grow"></span>
              <button type="button" class="btn" id="cli-salvar-pedido">Salvar e fazer pedido</button>
              <button type="submit" class="btn btn-primary">Salvar cliente</button>
            </div>
          </form>
        </div>
        <div class="card">
          <div class="card-head"><div><h2>Clientes cadastrados</h2><div class="sub" id="cli-count"></div></div></div>
          <div class="filters">
            <div class="f wide"><label>Buscar</label><input type="search" id="cli-q" placeholder="Nome, CNPJ, cidade, bairro, e-mail…"></div>
            <div class="f"><label>Vendedor</label><select id="cli-vend"><option value="">Todos</option></select></div>
            <div class="f"><label>Cidade</label><select id="cli-cid"><option value="">Todas</option></select></div>
            <div class="f"><label>Situação</label><select id="cli-sit"><option value="">Todos</option><option value="ativos">Compraram nos últimos 90 dias</option><option value="inativos">Sem compra há 90+ dias</option><option value="nunca">Nunca compraram</option><option value="dup">CNPJ duplicado</option></select></div>
          </div>
          <div class="table-wrap" style="max-height:70vh"><table class="t cards" id="cli-table"></table></div>
          <div class="list-foot"><span id="cli-foot"></span><button class="btn btn-sm" id="cli-mais" hidden>Mostrar mais</button></div>
        </div>
      </div>`;

    form = U.$('#cli-form', root);
    listEl = U.$('#cli-table', root);
    datalists();
    const binder = bindForm(form, () => editingId);

    form.onsubmit = (e) => {
      e.preventDefault();
      const c = saveFrom(form, editingId);
      if (c) { U.toast(editingId ? 'Cliente atualizado' : 'Cliente cadastrado'); novo(); }
    };
    U.$('#cli-salvar-pedido', root).onclick = () => {
      const c = saveFrom(form, editingId);
      if (c) { novo(); Pages.pedidos.novoPara(c.id); }
    };
    U.$('#cli-limpar', root).onclick = novo;
    U.$('#cli-novo', root).onclick = () => { novo(); form.querySelector('[name=cnpj]').focus(); };
    U.$('#cli-export', root).onclick = () => Excel.clientes(filtered());

    const reList = () => { limit = PAGE; renderList(); };
    U.$('#cli-q', root).addEventListener('input', U.debounce(reList, 150));
    ['#cli-vend', '#cli-cid', '#cli-sit'].forEach((s) => { U.$(s, root).onchange = reList; });
    U.$('#cli-mais', root).onclick = () => { limit += PAGE * 3; renderList(); };

    listEl.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-k]');
      if (th) { sort = { k: th.dataset.k, dir: sort.k === th.dataset.k ? -sort.dir : 1 }; renderList(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const id = b.closest('tr').dataset.id;
      if (b.dataset.act === 'edit') editar(id);
      if (b.dataset.act === 'pedido') Pages.pedidos.novoPara(id);
      if (b.dataset.act === 'hist') historico(id);
      if (b.dataset.act === 'del') excluir(id);
    });
    binder.checkDup();
    fillFilters();
    renderList();
  }

  function novo() {
    editingId = null;
    form.reset();
    U.$('#cli-form-title', root).textContent = 'Novo cliente';
    form.querySelector('[data-dup]').hidden = true;
  }

  function editar(id) {
    const c = Store.get('clientes', id);
    if (!c) return;
    editingId = id;
    U.fillForm(form, c);
    U.$('#cli-form-title', root).textContent = 'Editando: ' + c.razao_social;
    form.querySelector('[data-dup]').hidden = true;
    U.$('#cli-form-card', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.querySelector('[name=razao_social]').focus();
  }

  async function excluir(id) {
    const c = Store.get('clientes', id);
    const n = Store.list('pedidos').filter((p) => p.cliente_id === id).length;
    const ok = await U.confirm(`Excluir o cliente "${c.razao_social}"?` + (n ? ` Ele tem ${n} pedido(s); os pedidos continuam no histórico.` : ''), { ok: 'Excluir', danger: true, title: 'Excluir cliente' });
    if (!ok) return;
    Store.remove('clientes', id);
    if (editingId === id) novo();
    U.toast('Cliente excluído');
  }

  function historico(id) {
    const c = Store.get('clientes', id);
    const d = U.digits(c.cnpj);
    const peds = Store.list('pedidos').filter((p) => U.digits(p.cnpj) === d).sort((a, b) => (b.data_pedido || '').localeCompare(a.data_pedido || ''));
    const prods = Store.list('produtos');
    const total = peds.filter((p) => p.status !== 'cancelado' && p.tipo === 'venda').reduce((s, p) => s + (+p.total || 0), 0);
    const rows = peds.slice(0, 60).map((p) => `<tr><td>${U.date(p.data_pedido)}</td><td>${U.esc(p.nota || '—')}</td><td>${U.TIPOS_PEDIDO[p.tipo] || ''}</td>
      <td>${(p.itens || []).filter((i) => +i.caixas).map((i) => { const pr = prods.find((x) => x.id === i.produto_id); return `${U.num(i.caixas)} cx ${U.esc(pr ? pr.nome : '')} (${U.money(i.valor_unitario)}/un)`; }).join('<br>')}</td>
      <td class="num">${U.money(p.total)}</td><td>${p.status === 'cancelado' ? '<span class="badge b-danger">Cancelado</span>' : ''}</td></tr>`).join('');
    U.modal({
      title: c.razao_social, wide: true,
      body: `<p class="muted">${U.esc(U.fmtDoc(c.cnpj))} · ${U.esc(c.cidade || '')}/${U.esc(c.uf || '')} · ${U.esc(c.vendedor || 'sem vendedor')}</p>
        <div class="summary"><span>Pedidos: <b>${peds.length}</b></span><span>Total vendido: <b>${U.money(total)}</b></span>
        <span>Último pedido: <b>${peds[0] ? U.date(peds[0].data_pedido) : '—'}</b></span></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Data</th><th>Nota</th><th>Tipo</th><th>Itens</th><th class="num">Total</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">Nenhum pedido.</td></tr>'}</tbody></table></div>`,
      buttons: [{ label: 'Fechar', value: null }, { label: 'Novo pedido', cls: 'btn-primary', value: 'pedido' }],
    }).then((v) => { if (v === 'pedido') Pages.pedidos.novoPara(id); });
  }

  function fillFilters() {
    const cl = Store.list('clientes');
    const uniq = (k) => Array.from(new Set(cl.map((c) => (c[k] || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const keep = (sel, opts, first) => {
      const el = U.$(sel, root);
      const v = el.value;
      el.innerHTML = `<option value="">${first}</option>` + opts.map((o) => `<option ${o === v ? 'selected' : ''}>${U.esc(o)}</option>`).join('');
    };
    keep('#cli-vend', uniq('vendedor'), 'Todos');
    keep('#cli-cid', uniq('cidade'), 'Todas');
  }

  function pedidoStats() {
    const m = new Map();
    for (const p of Store.list('pedidos')) {
      if (p.status === 'cancelado') continue;
      const k = U.digits(p.cnpj);
      const s = m.get(k) || { n: 0, ultimo: '' };
      s.n++;
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
    const sit = U.$('#cli-sit', root).value;
    statsCache = pedidoStats();
    const limite = U.addDays(U.today(), -90);
    const dupCount = new Map();
    if (sit === 'dup') for (const c of Store.list('clientes')) { const k = U.digits(c.cnpj); dupCount.set(k, (dupCount.get(k) || 0) + 1); }
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
      else { va = U.norm(a[k]); vb = U.norm(b[k]); }
      return va < vb ? -sort.dir : va > vb ? sort.dir : 0;
    });
    return rows;
  }

  function renderList() {
    const rows = filtered();
    const total = Store.list('clientes').length;
    U.$('#cli-count', root).textContent = `${U.int(total)} clientes no cadastro`;
    const arrow = (k) => (sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');
    const head = `<thead><tr>
      <th class="sortable" data-k="cnpj">CNPJ${arrow('cnpj')}</th><th class="sortable" data-k="razao_social">Razão social${arrow('razao_social')}</th>
      <th class="sortable" data-k="cidade">Cidade/UF${arrow('cidade')}</th><th class="sortable" data-k="vendedor">Vendedor${arrow('vendedor')}</th>
      <th>Contato</th><th class="sortable" data-k="ultimo">Último pedido${arrow('ultimo')}</th><th></th></tr></thead>`;
    const body = rows.slice(0, limit).map((c) => {
      const s = statsCache.get(U.digits(c.cnpj));
      return `<tr data-id="${c.id}">
        <td data-l="CNPJ" class="num" style="text-align:left">${U.esc(U.fmtDoc(c.cnpj))}</td>
        <td data-l="Cliente"><b>${U.esc(c.razao_social)}</b><span class="sub">${U.esc(c.nome_fantasia && c.nome_fantasia !== c.razao_social ? c.nome_fantasia : (c.produto || ''))}</span></td>
        <td data-l="Cidade">${U.esc(c.cidade || '')}${c.uf ? '/' + U.esc(c.uf) : ''}<span class="sub">${U.esc(c.bairro || '')}</span></td>
        <td data-l="Vendedor">${U.esc(c.vendedor || '—')}</td>
        <td data-l="Contato">${U.esc(c.email || '')}<span class="sub">${U.esc(c.telefone || '')}</span></td>
        <td data-l="Último">${s ? U.date(s.ultimo) + `<span class="sub">${s.n} pedido(s)</span>` : '<span class="muted">—</span>'}</td>
        <td class="row-actions"><button class="btn btn-xs" data-act="pedido">Pedido</button> <button class="btn btn-xs" data-act="hist">Histórico</button>
          <button class="btn btn-xs" data-act="edit">Editar</button> <button class="btn btn-xs btn-ghost-danger" data-act="del">Excluir</button></td>
      </tr>`;
    }).join('');
    listEl.innerHTML = head + `<tbody>${body || '<tr><td colspan="7" class="empty">Nenhum cliente encontrado.</td></tr>'}</tbody>`;
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
    formHtml, bindForm, saveFrom, datalists,
  };
})();
