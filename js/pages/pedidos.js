/* Página 2 — Pedidos e faturamento */
(function () {
  'use strict';

  const DRAFT_KEY = 'ourosaf-draft-pedido';
  const PAGE = 150;
  let root, form_, listEl, drawer;
  let form; // alias
  let editingId = null;
  let cliente = null;           // cliente selecionado no formulário
  let selected = new Set();
  let limit = PAGE;
  let sort = { k: 'data', dir: -1 };
  let chip = 'recentes';

  const produtos = () => D.produtos();

  // =============================================================
  // Construção da página
  // =============================================================
  function build(r) {
    root = r;
    const prods = produtos();
    const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const formTpl = `
        <form id="ped-form" autocomplete="off">
          <div class="fields">
            <div class="f s12"><div class="seg">${Object.entries(U.TIPOS_PEDIDO).map(([k, v]) => `<label><input type="radio" name="tipo" value="${k}" ${k === 'venda' ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
            <div class="f s12"><label>Cliente <span class="req">*</span></label>
              <div class="ac" id="ped-cli-ac">
                <input type="text" id="ped-cli-q" placeholder="Digite CNPJ ou nome do cliente…" autocomplete="off">
                <div class="ac-list" id="ped-cli-list" hidden></div>
              </div>
              <div class="client-pill" id="ped-cli-pill" hidden></div>
            </div>
            <div class="f s4"><label>Data do pedido</label><input type="date" name="data_pedido"></div>
            <div class="f s4"><label>Prazo</label><input type="text" name="prazo" list="dl-prazos" placeholder="Ex.: 28 dias"></div>
            <div class="f s4"><label>Pedido do cliente</label><input type="text" name="pedido_cliente" placeholder="Opcional"></div>
          </div>

          <div class="section-title">Produtos</div>
          <div class="prod-grid">
            ${prods.map((p) => `
              <div class="prod" data-pid="${p.id}">
                <div class="prod-head"><h3>${U.esc(p.nome)}</h3><span class="badge b-mute">${U.int(p.unidades_caixa)} un/cx</span></div>
                <div class="fields">
                  <div class="f"><label>Caixas</label>
                    <div class="stepper"><button type="button" tabindex="-1" data-step="-1" aria-label="Menos uma caixa">${U.icon('minus', 16)}</button>
                    <input type="number" min="0" step="any" inputmode="decimal" data-k="caixas" placeholder="0">
                    <button type="button" tabindex="-1" data-step="1" aria-label="Mais uma caixa">${U.icon('plus', 16)}</button></div></div>
                  <div class="f"><label>Valor unitário (R$)</label><input type="text" inputmode="decimal" data-k="valor_unitario" placeholder="0,00"></div>
                  <input type="text" data-k="unidades" readonly tabindex="-1"><input type="text" data-k="valor_caixa" readonly tabindex="-1">
                  <div class="calc"><span data-k="info">0 un · R$ 0,00/cx</span><span class="last-price" data-last hidden></span></div>
                  <div class="total-line"><span class="muted">Total</span><b data-k="total">R$ 0,00</b></div>
                </div>
              </div>`).join('') || '<div class="alert alert-warn">Nenhum produto cadastrado para esta empresa. Cadastre em Ajustes.</div>'}
          </div>

          <div class="section-title">Entrega e cobrança</div>
          <div class="fields">
            <div class="f s4"><label>Vendedor</label><input type="text" name="vendedor" list="dl-vend-ped" placeholder="Ex.: OUROSAF - ELI"></div>
            <div class="f s4"><label>Transporte</label><input type="text" name="transporte" list="dl-transportes"></div>
            <div class="f s4"><label>Anotação do canhoto</label><input type="text" name="anotacao_canhoto"></div>
            <div class="f s4"><label>E-mail do cliente</label><input type="email" name="cliente_email"></div>
            <div class="f s4"><label>Cidade</label><input type="text" name="cidade"></div>
            <div class="f s4"><label>Bairro</label><input type="text" name="bairro"></div>
            <div class="f s12"><label>Observação</label><input type="text" name="observacao" list="dl-obs" placeholder="Ex.: entregar pela manhã"></div>
          </div>

          <div class="section-title">Faturamento</div>
          <div class="fields">
            <div class="f s3"><label>Nota fiscal</label><input type="text" name="nota" inputmode="numeric" placeholder="Depois do faturamento"></div>
            <div class="f s3"><label>Data do faturamento</label><input type="date" name="data_faturamento"></div>
            <div class="f s3"><label>Destaque</label><select name="destaque">${U.DESTAQUES.map((d) => `<option value="${d.v}">${d.label}</option>`).join('')}</select></div>
            <div class="f s3"><label class="check" style="min-height:22px"><input type="checkbox" name="canhoto"> Canhoto assinado em</label><input type="date" name="canhoto_data"></div>
          </div>
        </form>`;
    root.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Pedidos e faturamento</div><h1>Pedidos</h1><div class="page-sub">${hoje.charAt(0).toUpperCase() + hoje.slice(1)}</div></div>
        <div class="head-actions">
          <button class="btn" id="ped-importar">${U.icon('upload', 16)} Importar notas</button>
          <button class="btn" id="ped-excel">${U.icon('download', 16)} Excel</button>
          <button class="btn btn-primary" id="ped-novo">${U.icon('plus', 16)} Novo pedido <kbd style="background:rgba(255,255,255,.15);border-color:transparent;color:inherit">N</kbd></button>
        </div>
      </div>
      ${Store.mode === 'local' ? '<div class="local-banner"><b>Modo local:</b> os dados estão sendo salvos apenas neste navegador.</div>' : ''}
      <div class="kpis" id="ped-kpis"></div>

      <div class="toolbar">
        <div class="search">${U.icon('search', 16)}<input type="search" data-f="q" placeholder="Buscar cliente, CNPJ, nota, cidade…  ( / )"></div>
        <div class="chips" id="ped-chips">
          ${[['recentes', 'Últimos 60 dias'], ['hoje', 'Hoje'], ['semnota', 'Sem nota'], ['semana', 'Semana'], ['mes', 'Mês'], ['mespassado', 'Mês passado'], ['canhoto', 'Canhoto pendente'], ['tudo', 'Tudo']]
            .map(([k, v]) => `<button class="chip ${k === chip ? 'on' : ''}" data-chip="${k}">${v}</button>`).join('')}
        </div>
        <span class="grow"></span>
        <select id="ped-sort" class="btn" style="width:auto;min-height:36px" aria-label="Ordenar">
          <option value="data:-1">Mais recentes</option><option value="data:1">Mais antigos</option><option value="total:-1">Maior valor</option>
          <option value="cliente:1">Cliente A–Z</option><option value="nota:-1">Nº da nota</option><option value="fat:-1">Data de faturamento</option>
        </select>
        <button class="btn" id="ped-filtros-btn">${U.icon('filter', 16)} Filtros <span class="badge b-info" id="ped-filtros-n" hidden></span></button>
      </div>
      <div class="filters-panel" id="ped-filtros" hidden>
        <div class="filters">
          <div class="f"><label>Vendedor / observação</label><input type="search" data-f="obs" list="dl-vend-ped"></div>
          <div class="f"><label>Nota exata</label><input type="search" data-f="nota" inputmode="numeric"></div>
          <div class="f"><label>Período por</label><select data-f="campoData"><option value="data_pedido">Data do pedido</option><option value="data_faturamento">Data do faturamento</option></select></div>
          <div class="f"><label>De</label><input type="date" data-f="de"></div>
          <div class="f"><label>Até</label><input type="date" data-f="ate"></div>
          <div class="f"><label>Status</label><select data-f="status"><option value="ativo">Ativos</option><option value="cancelado">Cancelados</option><option value="devolvido">Devolvidos</option><option value="">Todos</option></select></div>
          <div class="f"><label>Faturamento</label><select data-f="fat"><option value="">Todos</option><option value="sem">Sem nota</option><option value="com">Com nota</option></select></div>
          <div class="f"><label>Canhoto</label><select data-f="canhoto"><option value="">Todos</option><option value="ok">Assinado</option><option value="pend">Pendente</option></select></div>
          <div class="f"><label>Tipo</label><select data-f="tipo"><option value="">Todos</option>${Object.entries(U.TIPOS_PEDIDO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="f"><label>Produto</label><select data-f="produto"><option value="">Todos</option>${prods.map((p) => `<option value="${p.id}">Com ${U.esc(p.nome)}</option>`).join('')}</select></div>
          <div class="f"><label>Cidade</label><select data-f="cidade"><option value="">Todas</option></select></div>
          <div class="f"><label>Destaque</label><select data-f="destaque"><option value="*">Todos</option>${U.DESTAQUES.map((d) => `<option value="${d.v}">${d.label}</option>`).join('')}</select></div>
          <div class="f"><button class="btn" id="ped-limpar-filtros">Limpar filtros</button></div>
        </div>
      </div>
      <div class="bulkbar" id="ped-bulk" hidden><span id="ped-bulk-n"></span><span class="grow" style="flex:1"></span>
        <button class="btn btn-sm" id="ped-sel-vis">Selecionar visíveis</button><button class="btn btn-sm" id="ped-bulk-excel">${U.icon('download', 14)} Excel dos selecionados</button><button class="btn btn-sm" id="ped-sel-limpar">Limpar</button></div>
      <div class="summary" id="ped-summary"></div>
      <div class="plist" id="ped-list"></div>
      <div class="list-foot"><span id="ped-foot"></span><button class="btn btn-sm" id="ped-mais" hidden>Mostrar mais</button></div>
      <div id="ped-dls"></div>
      ${U.drawerHtml('ped-drawer', {
        title: 'Novo pedido', sub: 'Rascunho salvo automaticamente · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva', body: formTpl, wide: true,
        foot: `<div class="total-box"><small>Total do pedido</small><div id="ped-total">R$ 0,00</div></div><span style="flex:1"></span>
          <button type="button" class="btn btn-ghost" id="ped-limpar">Limpar</button>
          <button type="submit" form="ped-form" class="btn btn-primary btn-lg" id="ped-salvar">Salvar pedido</button>`,
      })}`;

    form = form_ = U.$('#ped-form', root);
    listEl = U.$('#ped-list', root);
    drawer = U.$('#ped-drawer', root);
    datalists();
    bindForm();
    bindList();
    applyChip(chip, false);
    restoreDraft();
    renderList();
  }

  function datalists() {
    const peds = Store.list('pedidos');
    const freq = (k) => {
      const m = new Map();
      for (const p of peds) { const v = (p[k] || '').trim(); if (v) m.set(v, (m.get(v) || 0) + 1); }
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40).map((e) => e[0]);
    };
    const prazos = Array.from(new Set(['7 dias', '14 dias', '21 dias', '28 dias', '35 dias', '28/35 dias', 'À vista', ...freq('prazo')]));
    U.$('#ped-dls', root).innerHTML = `
      <datalist id="dl-vend-ped">${freq('vendedor').map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>
      <datalist id="dl-obs">${freq('observacao').map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>
      <datalist id="dl-transportes">${freq('transporte').map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>
      <datalist id="dl-prazos">${prazos.map((v) => `<option value="${U.esc(v)}">`).join('')}</datalist>`;
    if (!U.$('#dl-vendedores')) Pages.clientes.datalists();
    const cid = U.$('[data-f=cidade]', root);
    if (cid) {
      const v = cid.value;
      const cidades = Array.from(new Set(D.pedidos().map((p) => (p.cidade || '').trim().toUpperCase()).filter(Boolean))).sort();
      cid.innerHTML = '<option value="">Todas</option>' + cidades.map((c) => `<option ${c === v ? 'selected' : ''}>${U.esc(c)}</option>`).join('');
    }
  }

  // =============================================================
  // Formulário
  // =============================================================
  function bindForm() {
    const q = U.$('#ped-cli-q', root);
    const list = U.$('#ped-cli-list', root);
    let acItems = [], acIdx = 0;

    const renderAc = () => {
      const txt = q.value.trim();
      const n = U.norm(txt), d = U.digits(txt);
      if (!txt) { list.hidden = true; return; }
      const res = [];
      for (const c of Store.list('clientes')) {
        const cd = U.digits(c.cnpj);
        let score = 0;
        if (d.length >= 3 && cd.startsWith(d)) score = 3;
        else if (d.length >= 4 && cd.includes(d)) score = 2;
        else if (n.length >= 2 && !/^\d+$/.test(n)) {
          const name = U.norm(c.razao_social + ' ' + (c.nome_fantasia || ''));
          if (name.startsWith(n)) score = 2.5; else if (name.includes(n)) score = 1;
        }
        if (score) res.push({ c, score });
      }
      res.sort((a, b) => b.score - a.score || a.c.razao_social.localeCompare(b.c.razao_social));
      acItems = res.slice(0, 30).map((r) => r.c);
      acIdx = 0;
      let html = acItems.map((c, i) => `<div class="ac-item ${i === 0 ? 'on' : ''}" data-i="${i}"><b>${U.esc(c.razao_social)}</b>
        <small>${U.esc(U.fmtDoc(c.cnpj))} · ${U.esc(c.cidade || '')}${c.bairro ? ' · ' + U.esc(c.bairro) : ''} · ${U.esc(c.vendedor || 'sem vendedor')}</small></div>`).join('');
      if (d.length === 14 && !acItems.some((c) => U.digits(c.cnpj) === d)) {
        html += `<div class="ac-item ac-new" data-new="1">+ Cadastrar cliente com o CNPJ ${U.esc(U.fmtDoc(d))}</div>`;
      } else if (!acItems.length) {
        html += `<div class="ac-item ac-new" data-new="1">Nenhum cliente encontrado — + cadastrar novo cliente</div>`;
      }
      list.innerHTML = html;
      list.hidden = false;
    };
    q.addEventListener('input', () => {
      if (/^\d/.test(q.value)) {
        const pos = q.value.length;
        q.value = U.maskDoc(q.value);
        if (pos) q.setSelectionRange(q.value.length, q.value.length);
      }
      renderAc();
    });
    q.addEventListener('focus', () => { if (q.value) renderAc(); });
    q.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 180));
    q.addEventListener('keydown', (e) => {
      const els = U.$$('.ac-item', list);
      if (list.hidden || !els.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        acIdx = (acIdx + (e.key === 'ArrowDown' ? 1 : -1) + els.length) % els.length;
        els.forEach((el, i) => el.classList.toggle('on', i === acIdx));
        els[acIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        els[acIdx].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      } else if (e.key === 'Escape') list.hidden = true;
    });
    list.addEventListener('mousedown', (e) => {
      const it = e.target.closest('.ac-item');
      if (!it) return;
      e.preventDefault();
      list.hidden = true;
      if (it.dataset.new) cadastroRapido(U.digits(q.value).length >= 11 ? q.value : '', U.digits(q.value).length < 11 ? q.value : '');
      else selectCliente(acItems[+it.dataset.i]);
    });

    // Produtos
    U.$$('.prod', root).forEach((card) => {
      card.addEventListener('input', () => calc());
      const vu = card.querySelector('[data-k=valor_unitario]');
      vu.addEventListener('blur', () => { if (vu.value) vu.value = U.parseNum(vu.value).toFixed(2).replace('.', ','); });
      card.querySelector('[data-last]').onclick = (e) => {
        vu.value = e.target.dataset.v;
        calc();
      };
    });

    form.addEventListener('input', U.debounce(saveDraft, 400));
    form.addEventListener('change', saveDraft);
    form.addEventListener('submit', (e) => { e.preventDefault(); salvar(); });
    form.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); salvar(); }
    });
    const cbCanhoto = form.querySelector('[name=canhoto]');
    const dtCanhoto = form.querySelector('[name=canhoto_data]');
    cbCanhoto.addEventListener('change', () => { dtCanhoto.value = cbCanhoto.checked ? (dtCanhoto.value || U.today()) : ''; });
    dtCanhoto.addEventListener('input', () => { if (dtCanhoto.value) cbCanhoto.checked = true; });
    form.querySelector('[name=nota]').addEventListener('input', (e) => {
      const fat = form.querySelector('[name=data_faturamento]');
      if (e.target.value && !fat.value) fat.value = U.today();
    });
    U.$('#ped-limpar', root).onclick = () => { reset(); U.$('#ped-cli-q', root).focus(); };
    U.$('#ped-novo', root).onclick = () => abrirNovo();
    U.$('#ped-importar', root).onclick = importarNotas;
    // Ao fechar o painel durante uma edição, descarta a edição (o rascunho de pedido novo continua salvo)
    drawer.addEventListener('drawer-close', () => { if (editingId) reset(); });
    U.$$('.stepper button', root).forEach((b) => {
      b.onclick = () => {
        const inp = b.parentElement.querySelector('input');
        inp.value = Math.max(0, U.parseNum(inp.value) + +b.dataset.step) || '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      };
    });
  }

  function abrirNovo() {
    if (editingId) reset();
    U.openDrawer(drawer, cliente ? '.prod [data-k=caixas]' : '#ped-cli-q');
  }

  async function cadastroRapido(cnpj, nome) {
    let saved = null;
    await U.modal({
      title: 'Cadastrar novo cliente', wide: true,
      body: `<form id="quick-cli">${Pages.clientes.formHtml()}</form>`,
      buttons: [{ label: 'Cancelar', value: null }, {
        label: 'Salvar e usar no pedido', cls: 'btn-primary', value: 'ok',
        validate: (w) => { saved = Pages.clientes.saveFrom(w.querySelector('#quick-cli'), null); return !!saved; },
      }],
      onOpen: (w) => {
        const f = w.querySelector('#quick-cli');
        Pages.clientes.bindForm(f, () => null);
        if (nome) f.querySelector('[name=razao_social]').value = nome;
        if (cnpj) {
          const el = f.querySelector('[name=cnpj]');
          el.value = U.maskDoc(cnpj);
          el.dispatchEvent(new Event('input'));
        }
      },
    });
    if (saved) { U.toast('Cliente cadastrado'); selectCliente(saved); }
  }

  function selectCliente(c, keepFields) {
    cliente = c;
    const q = U.$('#ped-cli-q', root);
    const pill = U.$('#ped-cli-pill', root);
    if (!c) {
      q.hidden = false; pill.hidden = true; q.value = '';
      U.$$('[data-last]', root).forEach((el) => { el.hidden = true; });
      return;
    }
    const outros = D.clientesPorCnpj(c.cnpj).length;
    q.hidden = true;
    pill.hidden = false;
    pill.innerHTML = `<div><b>${U.esc(c.razao_social)}</b><small>${U.esc(U.fmtDoc(c.cnpj))} · ${U.esc(c.cidade || '')}${c.uf ? '/' + U.esc(c.uf) : ''}${outros > 1 ? ` · <span class="badge b-warn">CNPJ em ${outros} cadastros</span>` : ''}</small></div>
      <button type="button" class="btn btn-sm">Trocar</button>`;
    pill.querySelector('button').onclick = () => { selectCliente(null); q.focus(); };
    if (!keepFields) {
      const set = (k, v) => { form.querySelector(`[name=${k}]`).value = v || ''; };
      set('cliente_email', c.email);
      set('cidade', c.cidade);
      set('bairro', c.bairro);
      // Vendedor: o do último pedido deste cliente; se não houver, o do cadastro
      const d = U.digits(c.cnpj);
      let ult = null;
      for (const p of Store.list('pedidos')) if (U.digits(p.cnpj) === d && p.vendedor && (!ult || (p.data_pedido || '') > (ult.data_pedido || ''))) ult = p;
      set('vendedor', ult ? ult.vendedor : c.vendedor);
      // Prazo e transporte: repete os do último pedido deste cliente
      let ultP = null;
      for (const p of Store.list('pedidos')) if (U.digits(p.cnpj) === d && p.prazo && p.tipo === 'venda' && (!ultP || (p.data_pedido || '') > (ultP.data_pedido || ''))) ultP = p;
      if (ultP && !form.querySelector('[name=prazo]').value) set('prazo', ultP.prazo);
    }
    // Último preço praticado
    U.$$('.prod', root).forEach((card) => {
      const pid = card.dataset.pid;
      const last = D.ultimoPreco(c.cnpj, pid);
      const vu = card.querySelector('[data-k=valor_unitario]');
      const tag = card.querySelector('[data-last]');
      if (last != null) {
        if (!vu.value && !keepFields) vu.value = last.toFixed(2).replace('.', ',');
        tag.dataset.v = last.toFixed(2).replace('.', ',');
        tag.textContent = `Último: ${U.money(last)}`;
        tag.title = 'Clique para usar o último preço praticado com este cliente';
        tag.hidden = false;
      } else tag.hidden = true;
    });
    calc();
    saveDraft();
    const first = U.$('.prod [data-k=caixas]', root);
    if (first && !keepFields) first.focus();
  }

  function readItens() {
    return U.$$('.prod', root).map((card) => ({
      produto_id: card.dataset.pid,
      caixas: U.parseNum(card.querySelector('[data-k=caixas]').value),
      valor_unitario: U.parseNum(card.querySelector('[data-k=valor_unitario]').value),
    }));
  }

  function calc() {
    U.$$('.prod', root).forEach((card) => {
      const p = D.produto(card.dataset.pid);
      const upc = +p.unidades_caixa || 1;
      const cx = U.parseNum(card.querySelector('[data-k=caixas]').value);
      const vu = U.parseNum(card.querySelector('[data-k=valor_unitario]').value);
      card.querySelector('[data-k=unidades]').value = U.num(cx * upc);
      card.querySelector('[data-k=valor_caixa]').value = U.money(vu * upc);
      card.querySelector('[data-k=info]').textContent = `${U.int(cx * upc)} un · ${U.money(vu * upc)}/cx`;
      card.querySelector('[data-k=total]').textContent = U.money(cx * upc * vu);
      card.classList.toggle('has-qty', cx > 0);
    });
    U.$('#ped-total', root).textContent = U.money(D.pedidoTotal(readItens()));
  }

  function reset() {
    editingId = null;
    form.reset();
    form.querySelector('[name=data_pedido]').value = U.today();
    U.$$('.prod input[data-k=caixas], .prod input[data-k=valor_unitario]', root).forEach((i) => { i.value = ''; });
    selectCliente(null);
    calc();
    U.$('#ped-drawer-title', root).textContent = 'Novo pedido';
    U.$('#ped-drawer-sub', root).innerHTML = 'Rascunho salvo automaticamente · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva';
    U.$('#ped-salvar', root).textContent = 'Salvar pedido';
    localStorage.removeItem(DRAFT_KEY);
  }

  function saveDraft() {
    if (editingId) return;
    const d = { form: U.formData(form), itens: readItens().map((i, idx) => ({ ...i, raw: U.$$('.prod [data-k=valor_unitario]', root)[idx].value })), cliente_id: cliente && cliente.id };
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  }

  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { d = null; }
    reset();
    if (!d) return;
    U.fillForm(form, d.form);
    if (!form.querySelector('[name=data_pedido]').value) form.querySelector('[name=data_pedido]').value = U.today();
    fillItens(d.itens || []);
    if (d.cliente_id && Store.get('clientes', d.cliente_id)) selectCliente(Store.get('clientes', d.cliente_id), true);
    calc();
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
  }

  function fillItens(itens) {
    U.$$('.prod', root).forEach((card) => {
      const it = itens.find((i) => i.produto_id === card.dataset.pid);
      card.querySelector('[data-k=caixas]').value = it && +it.caixas ? it.caixas : '';
      card.querySelector('[data-k=valor_unitario]').value = it ? (it.raw != null ? it.raw : (+it.valor_unitario ? (+it.valor_unitario).toFixed(2).replace('.', ',') : '')) : '';
    });
  }

  function editar(id) {
    const p = Store.get('pedidos', id);
    if (!p) return;
    reset();
    editingId = id;
    U.fillForm(form, p);
    fillItens(p.itens || []);
    const c = Store.get('clientes', p.cliente_id) || D.clientesPorCnpj(p.cnpj)[0] ||
      { id: null, razao_social: p.cliente_nome, cnpj: p.cnpj, cidade: p.cidade, bairro: p.bairro };
    selectCliente(c, true);
    calc();
    U.$('#ped-drawer-title', root).textContent = `Pedido nº ${p.numero || ''}`;
    U.$('#ped-drawer-sub', root).textContent = `${p.cliente_nome || ''} · digitado em ${U.date(p.data_pedido)}${p.nota ? ' · NF ' + p.nota : ''}`;
    U.$('#ped-salvar', root).textContent = 'Salvar alterações';
    U.openDrawer(drawer);
  }

  function salvar() {
    if (!cliente) { U.toast('Selecione o cliente', 'warn'); U.$('#ped-cli-q', root).focus(); return; }
    const f = U.formData(form);
    if (!f.canhoto) f.canhoto_data = '';
    else if (!f.canhoto_data) f.canhoto_data = U.today();
    const itens = readItens().filter((i) => i.caixas > 0);
    if (!itens.length) { U.toast('Informe a quantidade de caixas de pelo menos um produto', 'warn'); const el = U.$('.prod [data-k=caixas]', root); if (el) el.focus(); return; }
    if (f.tipo !== 'troca' && itens.some((i) => !i.valor_unitario)) {
      U.toast('Informe o valor unitário dos produtos com quantidade', 'warn');
      return;
    }
    if (f.nota) {
      const dup = D.pedidos().find((p) => p.id !== editingId && p.nota && U.digits(p.nota) === U.digits(f.nota));
      if (dup && !window.confirm(`A nota ${f.nota} já está no pedido nº ${dup.numero} (${dup.cliente_nome}). Salvar mesmo assim?`)) return;
    }
    const old = editingId ? Store.get('pedidos', editingId) : null;
    const ped = {
      ...f,
      id: editingId || undefined,
      numero: old ? old.numero : D.proximoNumero('pedidos'),
      empresa_id: old ? old.empresa_id : D.empresaId(),
      cliente_id: cliente.id || (old && old.cliente_id) || null,
      cnpj: U.fmtDoc(cliente.cnpj),
      cliente_nome: cliente.razao_social,
      uf: cliente.uf || (old && old.uf) || '',
      itens,
      total: D.pedidoTotal(itens),
      status: old ? old.status : 'ativo',
      nota: f.nota ? U.digits(f.nota) || f.nota : '',
    };
    const saved = Store.save('pedidos', ped);
    U.toast(old ? `Pedido nº ${saved.numero} atualizado` : `Pedido nº ${saved.numero} salvo — ${U.money(saved.total)}. Pronto para o próximo.`);
    reset();
    if (old) U.closeDrawer(drawer);
    else U.$('#ped-cli-q', root).focus();
  }

  // =============================================================
  // Lista
  // =============================================================
  function bindList() {
    U.$('#ped-chips', root).onclick = (e) => {
      const b = e.target.closest('[data-chip]');
      if (b) applyChip(b.dataset.chip, true);
    };
    const re = () => { limit = PAGE; renderList(); };
    U.$$('[data-f]', root).forEach((el) => {
      el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', U.debounce(() => {
        if (['de', 'ate', 'fat', 'canhoto'].includes(el.dataset.f)) setChipUI(null);
        re();
      }, 150));
    });
    U.$('#ped-sort', root).onchange = (e) => { const [k, d] = e.target.value.split(':'); sort = { k, dir: +d }; re(); };
    U.$('#ped-filtros-btn', root).onclick = () => { const p = U.$('#ped-filtros', root); p.hidden = !p.hidden; };
    U.$('#ped-kpis', root).onclick = (e) => { const b = e.target.closest('[data-chip]'); if (b) applyChip(b.dataset.chip, true); };
    U.$('#ped-limpar-filtros', root).onclick = () => {
      U.$$('[data-f]', root).forEach((el) => { el.value = el.tagName === 'SELECT' ? el.options[0].value : ''; });
      applyChip('recentes', true);
    };
    U.$('#ped-mais', root).onclick = () => { limit += PAGE * 2; renderList(); };
    U.$('#ped-sel-vis', root).onclick = () => { filtered().slice(0, limit).forEach((p) => selected.add(p.id)); renderList(); };
    U.$('#ped-sel-limpar', root).onclick = () => { selected.clear(); renderList(); };
    const excel = () => {
      const list = selected.size ? D.pedidos().filter((p) => selected.has(p.id)) : filtered();
      if (!list.length) { U.toast('Nenhum pedido para exportar', 'warn'); return; }
      Excel.pedidos(list);
      U.toast(`Excel gerado com ${list.length} pedido(s)` + (selected.size ? ' selecionados' : ' filtrados'));
    };
    U.$('#ped-excel', root).onclick = excel;
    U.$('#ped-bulk-excel', root).onclick = excel;

    listEl.addEventListener('click', async (e) => {
      const row = e.target.closest('.prow[data-id]');
      if (!row) return;
      const id = row.dataset.id;
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'nota') editarNotaInline(act, id);
      if (a === 'edit') editar(id);
      if (a === 'canhoto') {
        const p = Store.get('pedidos', id);
        Store.save('pedidos', { id, canhoto: !p.canhoto, canhoto_data: !p.canhoto ? U.today() : null });
        U.toast(!p.canhoto ? `Canhoto da nota ${p.nota || 'nº ' + p.numero} assinado em ${U.date(U.today())}` : 'Canhoto marcado como pendente');
      }
      if (a === 'more') {
        const p = Store.get('pedidos', id);
        const v = await U.menu(act, [
          { label: 'Abrir / editar', value: 'edit', icon: 'edit' },
          { label: 'Repetir pedido', value: 'dup', icon: 'copy' },
          { label: 'Ocorrência (cancelar, devolver, trocar)', value: 'ocorr', icon: 'undo' },
          '-',
          ...U.DESTAQUES.map((d) => ({ label: d.label, value: 'dest:' + d.v, swatch: d.v, checked: (p.destaque || '') === d.v })),
          '-',
          { label: 'Excluir pedido', value: 'del', icon: 'trash', danger: true },
        ]);
        if (!v) return;
        if (v === 'edit') editar(id);
        if (v === 'dup') duplicar(id);
        if (v === 'ocorr') Pages.ocorrencias.novaPara(id);
        if (v === 'del') excluir(id);
        if (v.startsWith('dest:')) Store.save('pedidos', { id, destaque: v.slice(5) });
      }
    });
    listEl.addEventListener('change', (e) => {
      const row = e.target.closest('.prow[data-id]');
      if (!row || !e.target.matches('[data-sel]')) return;
      if (e.target.checked) selected.add(row.dataset.id); else selected.delete(row.dataset.id);
      row.classList.toggle('sel', e.target.checked);
      bulk();
    });
  }

  function bulk() {
    U.$('#ped-bulk', root).hidden = !selected.size;
    if (!selected.size) return;
    const sel = D.pedidos().filter((p) => selected.has(p.id));
    U.$('#ped-bulk-n', root).textContent = `${selected.size} selecionado(s) · ${U.money(sel.reduce((t, p) => t + (+p.total || 0), 0))}`;
  }

  function setChipUI(k) {
    chip = k;
    U.$$('#ped-chips .chip', root).forEach((c) => c.classList.toggle('on', c.dataset.chip === k));
  }

  function applyChip(k, render) {
    setChipUI(k);
    const set = (f, v) => { U.$(`[data-f=${f}]`, root).value = v; };
    const t = U.today();
    const d = new Date(t + 'T12:00:00');
    set('fat', ''); set('canhoto', ''); set('status', 'ativo');
    if (k === 'recentes') { set('de', U.addDays(t, -60)); set('ate', ''); }
    if (k === 'hoje') { set('de', t); set('ate', t); }
    if (k === 'semana') { set('de', U.addDays(t, -((d.getDay() + 6) % 7))); set('ate', ''); }
    if (k === 'mes') { set('de', t.slice(0, 8) + '01'); set('ate', ''); }
    if (k === 'mespassado') {
      const first = new Date(d.getFullYear(), d.getMonth() - 1, 1);
      const last = new Date(d.getFullYear(), d.getMonth(), 0);
      const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
      set('de', iso(first)); set('ate', iso(last));
    }
    if (k === 'semnota') { set('de', ''); set('ate', ''); set('fat', 'sem'); }
    if (k === 'canhoto') { set('de', U.addDays(t, -90)); set('ate', ''); set('fat', 'com'); set('canhoto', 'pend'); }
    if (k === 'tudo') { set('de', ''); set('ate', ''); set('status', ''); }
    if (render) { limit = PAGE; renderList(); }
  }

  function filters() {
    const o = {};
    U.$$('[data-f]', root).forEach((el) => { o[el.dataset.f] = el.value.trim(); });
    return o;
  }

  function filtered() {
    const f = filters();
    const q = U.norm(f.q), qd = U.digits(f.q);
    const obs = U.norm(f.obs);
    const notaD = U.digits(f.nota);
    const rows = D.pedidos().filter((p) => {
      if (f.status && (p.status || 'ativo') !== f.status) return false;
      if (f.fat === 'sem' && p.nota) return false;
      if (f.fat === 'com' && !p.nota) return false;
      if (f.canhoto === 'ok' && !p.canhoto) return false;
      if (f.canhoto === 'pend' && p.canhoto) return false;
      if (f.tipo && (p.tipo || 'venda') !== f.tipo) return false;
      if (f.produto && !(p.itens || []).some((i) => i.produto_id === f.produto && +i.caixas > 0)) return false;
      if (f.cidade && (p.cidade || '').trim().toUpperCase() !== f.cidade) return false;
      if (f.destaque !== '*' && (p.destaque || '') !== f.destaque) return false;
      const dt = p[f.campoData] || '';
      if (f.de && dt < f.de) return false;
      if (f.ate && (!dt || dt > f.ate)) return false;
      if (notaD && U.digits(p.nota) !== notaD) return false;
      if (obs && !U.norm([p.observacao, p.vendedor, p.pedido_cliente].join(' ')).includes(obs)) return false;
      if (q) {
        if (qd.length >= 3 && (U.digits(p.cnpj).includes(qd) || U.digits(p.nota) === qd || String(p.numero) === qd || U.digits(p.pedido_cliente) === qd)) return true;
        if (!U.norm([p.cliente_nome, p.cidade, p.bairro, p.observacao, p.vendedor, p.nota, p.transporte].join(' ')).includes(q)) return false;
      }
      return true;
    });
    const k = sort.k, dir = sort.dir;
    const val = (p) => {
      if (k === 'data') return (p.data_pedido || '') + String(p.numero || 0).padStart(8, '0');
      if (k === 'fat') return p.data_faturamento || '';
      if (k === 'cliente') return U.norm(p.cliente_nome);
      if (k === 'nota') return +U.digits(p.nota) || 0;
      if (k === 'total') return +p.total || 0;
      return '';
    };
    return rows.sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0; });
  }

  function kpis() {
    const t = U.today();
    const mes = t.slice(0, 8);
    const prods = produtos();
    let hojeN = 0, hojeV = 0, mesV = 0, mesN = 0, semNota = 0, canh = 0;
    const hojeCx = {};
    const lim = U.addDays(t, -90);
    for (const p of D.pedidos()) {
      if (p.status === 'cancelado') continue;
      if (p.data_pedido === t) { hojeN++; hojeV += +p.total || 0; for (const i of p.itens || []) hojeCx[i.produto_id] = (hojeCx[i.produto_id] || 0) + (+i.caixas || 0); }
      if ((p.data_pedido || '').startsWith(mes) && p.tipo !== 'bonificacao') { mesV += +p.total || 0; mesN++; }
      if (!p.nota && p.status === 'ativo') semNota++;
      if (p.nota && !p.canhoto && p.status === 'ativo' && (p.data_pedido || '') >= lim) canh++;
    }
    U.$('#ped-kpis', root).innerHTML = `
      <button class="kpi hero" data-chip="hoje"><small>Hoje</small><b>${U.money(hojeV)}</b><span>${hojeN} pedido(s) · ${prods.map((p) => `${U.num(hojeCx[p.id] || 0)} cx ${U.esc(p.nome.toLowerCase())}`).join(' · ')}</span></button>
      <button class="kpi" data-chip="mes"><small>Vendas no mês</small><b>${U.money(mesV)}</b><span>${U.int(mesN)} pedidos de venda</span></button>
      <button class="kpi ${semNota ? 'warn' : ''}" data-chip="semnota"><small>Aguardando nota</small><b>${U.int(semNota)}</b><span>pedidos sem faturamento</span></button>
      <button class="kpi" data-chip="canhoto"><small>Canhoto pendente</small><b>${U.int(canh)}</b><span>faturados nos últimos 90 dias</span></button>`;
  }

  function summary(rows) {
    const prods = produtos();
    const tot = rows.reduce((s, p) => s + (+p.total || 0), 0);
    U.$('#ped-summary', root).innerHTML = `<span><b>${U.int(rows.length)}</b> pedidos</span>` +
      prods.map((pr) => `<span>${U.esc(pr.nome)} <b>${U.num(rows.reduce((s, p) => s + D.caixasDe(p, pr.id), 0))} cx</b></span>`).join('') +
      `<span>Total <b>${U.money(tot)}</b></span>`;
    const f = filters();
    const n = ['obs', 'nota', 'tipo', 'produto', 'cidade', 'canhoto', 'fat'].filter((k) => f[k]).length + (f.destaque !== '*' ? 1 : 0) + (f.status !== 'ativo' ? 1 : 0);
    const badge = U.$('#ped-filtros-n', root);
    badge.hidden = !n;
    badge.textContent = n;
  }

  function rowHtml(p, prods) {
    const cls = ['prow', selected.has(p.id) && 'sel', p.status === 'cancelado' && 'cancelado', p.destaque && 'hl-' + p.destaque, p.canhoto && 'canhoto-ok'].filter(Boolean).join(' ');
    const nota = p.nota ? U.digits(p.nota) || p.nota : '';
    const badges = [p.tipo === 'bonificacao' && '<span class="badge b-warn">Bonificação</span>', p.tipo === 'troca' && '<span class="badge b-info">Troca</span>',
      p.status === 'cancelado' && '<span class="badge b-danger">Cancelado</span>', p.status === 'devolvido' && '<span class="badge b-warn">Devolvido</span>'].filter(Boolean).join(' ');
    const items = prods.map((pr, i) => {
      const cx = D.caixasDe(p, pr.id);
      return cx ? `<span class="qty q${i % 2}">${U.num(cx)} cx <i>${U.esc(pr.nome)}</i></span>` : '';
    }).join('');
    const local = [p.cidade, p.bairro].filter(Boolean).join(' · ');
    return `<div class="${cls}" data-id="${p.id}">
      <label class="cb"><input type="checkbox" data-sel ${selected.has(p.id) ? 'checked' : ''} aria-label="Selecionar pedido"></label>
      <div class="p-nota"><button class="nota-btn ${nota ? 'has' : ''}" data-act="nota" title="Clique para ${nota ? 'alterar' : 'lançar'} a nota">${nota ? U.esc(nota) : 'Sem nota'}</button></div>
      <div class="p-client" data-act="edit" title="Abrir pedido"><span class="avatar" style="--h:${U.hue(p.cliente_nome)}">${U.esc(U.initials(p.cliente_nome))}</span>
        <div><span class="p-name">${U.esc(p.cliente_nome || '(sem cliente)')}</span><span class="p-meta">${badges ? badges + ' ' : ''}${U.esc(local || U.fmtDoc(p.cnpj))}${p.prazo ? ' · ' + U.esc(p.prazo) : ''}</span></div></div>
      <div class="p-vend"><span>${U.esc(p.vendedor || '—')}</span><span class="p-meta">${[p.pedido_cliente && 'Ped. ' + U.esc(p.pedido_cliente), p.observacao && U.esc(p.observacao)].filter(Boolean).join(' · ')}</span></div>
      <div class="p-items">${items || '<span class="muted">—</span>'}</div>
      <div class="p-total">${U.money(p.total)}<small>Pedido ${p.numero || '—'}</small></div>
      <div class="p-flags"><button class="flag ${p.canhoto ? 'on' : ''}" data-act="canhoto" title="Canhoto ${p.canhoto ? 'assinado' + (p.canhoto_data ? ' em ' + U.date(p.canhoto_data) : '') : 'pendente'} — clique para alterar">${U.icon(p.canhoto ? 'check' : 'pen', 15)}${p.canhoto ? `<span class="flag-date">${p.canhoto_data ? U.date(p.canhoto_data).slice(0, 5) : 'ok'}</span>` : ''}</button></div>
      <div class="p-more"><button class="icon-btn" data-act="more" aria-label="Mais ações">${U.icon('more', 18)}</button></div>
    </div>`;
  }

  function renderList() {
    if (!listEl) return;
    kpis();
    const prods = produtos();
    const rows = filtered();
    summary(rows);
    bulk();
    const vis = rows.slice(0, limit);
    let html = '';
    if (sort.k === 'data') {
      const groups = [];
      for (const p of vis) {
        const g = groups[groups.length - 1];
        if (g && g.d === (p.data_pedido || '')) g.rows.push(p); else groups.push({ d: p.data_pedido || '', rows: [p] });
      }
      // Totais do dia consideram todos os pedidos filtrados daquele dia
      const tot = new Map();
      for (const p of rows) {
        const k = p.data_pedido || '';
        const t = tot.get(k) || { n: 0, v: 0, cx: {} };
        t.n++; t.v += +p.total || 0;
        for (const pr of prods) t.cx[pr.id] = (t.cx[pr.id] || 0) + D.caixasDe(p, pr.id);
        tot.set(k, t);
      }
      html = groups.map((g) => {
        const t = tot.get(g.d);
        return `<div class="day"><div class="day-head"><h3>${U.dayLabel(g.d)}</h3><span class="day-date">${U.date(g.d)}</span>
          <div class="day-tot"><span><b>${t.n}</b> pedido(s)</span>${prods.map((pr) => t.cx[pr.id] ? `<span>${U.esc(pr.nome)} <b>${U.num(t.cx[pr.id])} cx</b></span>` : '').join('')}<span><b>${U.money(t.v)}</b></span></div></div>
          ${g.rows.map((p) => rowHtml(p, prods)).join('')}</div>`;
      }).join('');
    } else if (vis.length) {
      html = `<div class="day">${vis.map((p) => rowHtml(p, prods)).join('')}</div>`;
    }
    listEl.innerHTML = html || `<div class="day"><div class="empty">${U.icon('search', 28)}Nenhum pedido com esses filtros.</div></div>`;
    U.$('#ped-foot', root).textContent = rows.length ? `Mostrando ${U.int(vis.length)} de ${U.int(rows.length)}` : '';
    U.$('#ped-mais', root).hidden = rows.length <= limit;
  }

  function editarNotaInline(btn, id) {
    const p = Store.get('pedidos', id);
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = 'numeric';
    inp.className = 'nota-input';
    inp.value = p.nota || '';
    inp.placeholder = 'Nº da nota';
    btn.replaceWith(inp);
    inp.focus();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = U.digits(inp.value);
      if (save && v !== (p.nota || '')) {
        const dup = v && D.pedidos().find((x) => x.id !== id && U.digits(x.nota) === v);
        if (dup && !window.confirm(`A nota ${v} já está no pedido nº ${dup.numero} (${dup.cliente_nome}). Usar mesmo assim?`)) { renderList(); return; }
        Store.save('pedidos', { id, nota: v, data_faturamento: v ? (p.data_faturamento || U.today()) : p.data_faturamento });
        U.toast(v ? `Nota ${v} lançada — estoque baixado` : 'Nota removida');
      } else renderList();
    };
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') finish(false);
    });
    inp.addEventListener('blur', () => finish(true));
  }

  function duplicar(id) {
    const p = Store.get('pedidos', id);
    reset();
    const c = Store.get('clientes', p.cliente_id) || D.clientesPorCnpj(p.cnpj)[0];
    U.fillForm(form, { ...p, nota: '', data_faturamento: '', canhoto: false, canhoto_data: '', destaque: '', data_pedido: U.today() });
    fillItens(p.itens || []);
    if (c) selectCliente(c, true);
    calc();
    saveDraft();
    U.openDrawer(drawer, '.prod [data-k=caixas]');
    U.toast('Pedido copiado — confira e salve');
  }

  async function excluir(id) {
    const p = Store.get('pedidos', id);
    const ok = await U.confirm(`Excluir definitivamente o pedido nº ${p.numero} de ${p.cliente_nome} (${U.money(p.total)})? Para cancelamentos, prefira lançar uma Ocorrência — assim fica registrado.`,
      { ok: 'Excluir', danger: true, title: 'Excluir pedido' });
    if (!ok) return;
    Store.remove('pedidos', id);
    selected.delete(id);
    if (editingId === id) reset();
    U.toast('Pedido excluído');
  }

  // =============================================================
  // Importação de notas (.zip com PDFs)
  // =============================================================
  async function importarNotas() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,.pdf,application/zip,application/pdf';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      const prog = document.createElement('div');
      prog.className = 'modal-back';
      prog.innerHTML = '<div class="login"><b>Lendo notas…</b><p class="muted" id="nf-msg">Preparando</p><div class="progress"><div id="nf-bar"></div></div></div>';
      document.body.appendChild(prog);
      let notas;
      try {
        notas = await NFe.readFiles(files, (i, n) => {
          prog.querySelector('#nf-msg').textContent = `Nota ${i + 1} de ${n}`;
          prog.querySelector('#nf-bar').style.width = Math.round(((i + 1) / n) * 100) + '%';
        });
      } catch (e) {
        prog.remove();
        U.toast('Erro ao ler arquivo: ' + e.message, 'error', 6000);
        return;
      }
      prog.remove();
      if (!notas.length) { U.toast('Nenhum PDF encontrado no arquivo', 'warn'); return; }
      revisarNotas(notas);
    };
    input.click();
  }

  function revisarNotas(notas) {
    const ordem = (r) => (r.nota.erro ? 0 : r.empate ? 1 : r.pedidoId && r.score < 120 ? 2 : !r.pedidoId && !r.jaLancada ? 3 : r.pedidoId ? 4 : 5);
    const res = NFe.match(notas, D.empresaId()).sort((a, b) => ordem(a) - ordem(b) || String(a.nota.numero).localeCompare(String(b.nota.numero)));
    const prods = D.produtos(D.empresaId(), true);
    const nomeProd = (id) => (prods.find((p) => p.id === id) || {}).nome || '?';
    const conf = (r) => {
      if (r.nota.erro) return '<span class="badge b-danger">Erro</span>';
      if (r.jaLancada) return '<span class="badge b-mute">Já lançada</span>';
      if (!r.pedidoId) return '<span class="badge b-danger">Sem par</span>';
      if (r.empate) return '<span class="badge b-warn">Conferir (empate)</span>';
      if (r.score >= 120) return '<span class="badge b-ok">Alta</span>';
      return '<span class="badge b-warn">Média — conferir</span>';
    };
    const optPed = (p) => `nº ${p.numero} · ${U.date(p.data_pedido)} · ${p.cliente_nome} · ${U.money(p.total)}${p.tipo !== 'venda' ? ' · ' + U.TIPOS_PEDIDO[p.tipo] : ''}`;
    const rows = res.map((r, i) => {
      const n = r.nota;
      if (n.erro) return `<tr><td colspan="7"><b>${U.esc(n.arquivo)}</b><span class="sub">${U.esc(n.erro)}</span></td><td>${conf(r)}</td></tr>`;
      const itens = Object.entries(r.mapped.porProduto).map(([pid, v]) => `${U.num(v.caixas)} cx ${U.esc(nomeProd(pid))} a ${U.money(v.valor_caixa)}/cx`).join('<br>') +
        (r.mapped.naoIdentificados.length ? `<br><span class="negv">Item não reconhecido: ${U.esc(r.mapped.naoIdentificados.join(', '))}</span>` : '');
      let sel;
      if (r.jaLancada) sel = `<span class="muted">Pedido nº ${r.jaLancada.numero} · ${U.esc(r.jaLancada.cliente_nome)}</span>`;
      else {
        const outros = D.pedidos().filter((p) => !p.nota && p.status !== 'cancelado' && U.digits(p.cnpj).slice(0, 8) === U.digits(n.cnpj).slice(0, 8) && !r.candidatos.some((c) => c.pedido.id === p.id));
        sel = `<select data-i="${i}" style="min-width:260px">
          <option value="">— Não vincular —</option>
          ${r.candidatos.map((c) => `<option value="${c.pedido.id}" ${c.pedido.id === r.pedidoId ? 'selected' : ''}>${U.esc(optPed(c.pedido))}</option>`).join('')}
          ${outros.map((p) => `<option value="${p.id}">${U.esc(optPed(p))} (tipo diferente)</option>`).join('')}
          <option value="__novo">+ Criar pedido a partir desta nota</option>
        </select>${r.pedidoId ? `<span class="sub">${U.esc(r.motivos.join(' · '))}</span>` : r.candidatos.length ? '' : '<span class="sub">Nenhum pedido sem nota para este CNPJ.</span>'}`;
      }
      return `<tr>
        <td><b>${U.esc(n.numero)}</b><span class="sub">${U.date(n.emissao)}</span></td>
        <td><b>${U.esc(n.destinatario || '')}</b><span class="sub">${U.esc(n.cnpj)} · ${U.esc(n.cidade || '')}</span></td>
        <td>${itens}</td>
        <td class="num">${U.money(n.total)}</td>
        <td>${n.bonificacao ? '<span class="badge b-warn">Bonificação</span>' : U.esc((n.prazo ? n.prazo + ' dias ' : '') + (n.forma || ''))}${n.pedido_cliente ? `<span class="sub">Ped. cliente ${U.esc(n.pedido_cliente)}</span>` : ''}</td>
        <td colspan="2">${sel}</td>
        <td>${conf(r)}</td>
      </tr>`;
    }).join('');
    const nAuto = res.filter((r) => r.pedidoId).length;
    const nJa = res.filter((r) => r.jaLancada).length;
    const nSem = res.filter((r) => !r.pedidoId && !r.jaLancada && !r.nota.erro).length;
    U.modal({
      title: `Notas importadas (${notas.length})`, wide: true,
      body: `<div class="summary"><span>Vinculadas automaticamente: <b>${nAuto}</b></span><span>Já lançadas: <b>${nJa}</b></span><span>Sem pedido correspondente: <b>${nSem}</b></span></div>
        <p class="muted small">Confira as sugestões. Ao confirmar, cada pedido recebe o número da nota e a data de emissão como data de faturamento (o estoque é baixado).</p>
        <div class="table-wrap" style="max-height:60vh"><table class="t"><thead><tr><th>Nota</th><th>Destinatário</th><th>Itens</th><th class="num">Total</th><th>Pagamento</th><th colspan="2">Pedido</th><th>Confiança</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      buttons: [{ label: 'Cancelar', value: null }, { label: 'Confirmar vínculos', cls: 'btn-primary', value: 'ok' }],
      onOpen: (w) => {
        w.addEventListener('change', (e) => {
          if (!e.target.matches('select[data-i]')) return;
          const r = res[+e.target.dataset.i];
          r.pedidoId = e.target.value || null;
        });
      },
    }).then((v) => {
      if (v !== 'ok') return;
      aplicarVinculos(res);
    });
  }

  function aplicarVinculos(res) {
    const upd = [];
    const usados = new Set();
    let criados = 0, conflitos = 0;
    for (const r of res) {
      if (!r.pedidoId || r.jaLancada || r.nota.erro) continue;
      const n = r.nota;
      if (r.pedidoId === '__novo') { criarPedidoDaNota(r); criados++; continue; }
      if (usados.has(r.pedidoId)) { conflitos++; continue; }
      usados.add(r.pedidoId);
      const p = Store.get('pedidos', r.pedidoId);
      upd.push({ id: p.id, nota: n.numero, data_faturamento: n.emissao || p.data_faturamento || U.today(),
        prazo: p.prazo || (n.prazo ? n.prazo + ' dias' : '') });
    }
    if (upd.length) Store.saveMany('pedidos', upd);
    U.toast(`${upd.length} nota(s) vinculada(s)` + (criados ? `, ${criados} pedido(s) criado(s)` : '') + (conflitos ? ` · ${conflitos} ignorada(s): mesmo pedido escolhido duas vezes` : ''), conflitos ? 'warn' : 'ok', 5000);
  }

  function criarPedidoDaNota(r) {
    const n = r.nota;
    let c = D.clientesPorCnpj(n.cnpj)[0];
    if (!c) c = Store.save('clientes', { cnpj: U.fmtDoc(n.cnpj), razao_social: n.destinatario, cidade: n.cidade, uf: n.uf });
    const itens = Object.entries(r.mapped.porProduto).map(([pid, v]) => {
      const p = D.produto(pid);
      return { produto_id: pid, caixas: v.caixas, valor_unitario: U.round2(v.valor_caixa / ((p && +p.unidades_caixa) || 1)) };
    });
    Store.save('pedidos', {
      numero: D.proximoNumero('pedidos'), empresa_id: D.empresaId(), cliente_id: c.id, cnpj: U.fmtDoc(c.cnpj), cliente_nome: c.razao_social,
      cliente_email: c.email, cidade: c.cidade, bairro: c.bairro, uf: c.uf, vendedor: c.vendedor, data_pedido: n.emissao, data_faturamento: n.emissao,
      prazo: n.prazo ? n.prazo + ' dias' : '', tipo: n.bonificacao ? 'bonificacao' : 'venda', pedido_cliente: n.pedido_cliente, itens,
      total: D.pedidoTotal(itens), nota: n.numero, status: 'ativo', observacao: 'Criado a partir da NF',
    });
  }

  // =============================================================
  Pages.pedidos = {
    build,
    show() { renderList(); },
    onData(tables, visible) {
      if (tables.has('pedidos')) {
        datalists();
        const live = new Set(D.pedidos().map((p) => p.id));
        selected.forEach((id) => { if (!live.has(id)) selected.delete(id); });
      }
      if (visible && (tables.has('pedidos') || tables.has('produtos'))) renderList();
    },
    novo() { App.ensure('pedidos'); abrirNovo(); },
    importar() { App.ensure('pedidos'); importarNotas(); },
    novoPara(clienteId) {
      App.ensure('pedidos');
      reset();
      U.openDrawer(drawer);
      const c = Store.get('clientes', clienteId);
      if (c) selectCliente(c);
    },
    editar(id) { App.ensure('pedidos'); editar(id); },
    revisarNotas,
  };
})();
