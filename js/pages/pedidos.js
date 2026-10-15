/* Página 2 — Pedidos e faturamento */
(function () {
  'use strict';

  const DRAFT_KEY = 'ourosaf-draft-pedido';
  const PAGE = 150;
  let root, form, tableEl;
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
    root.innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Página 2</div><h1>Pedidos e faturamento</h1></div>
        <div class="head-actions">
          <button class="btn btn-soft" id="ped-importar">Importar notas (.zip)</button>
          <button class="btn btn-primary" id="ped-novo">+ Novo pedido</button>
        </div>
      </div>
      ${Store.mode === 'local' ? '<div class="local-banner"><b>Modo local:</b> os dados estão sendo salvos apenas neste navegador. Configure a nuvem (veja o README) para acessar de qualquer aparelho.</div>' : ''}

      <div class="card" id="ped-form-card">
        <div class="card-head">
          <div><h2 id="ped-form-title">Digitar pedido</h2><div class="sub" id="ped-form-sub">Rascunho salvo automaticamente neste aparelho · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva</div></div>
          <div class="actions"><button class="btn btn-sm" id="ped-cancelar-edicao" hidden>Cancelar edição</button><button class="btn btn-sm" id="ped-limpar">Limpar</button></div>
        </div>
        <form id="ped-form" autocomplete="off">
          <div class="fields">
            <div class="f s4"><span class="lbl">Tipo do pedido</span>
              <div class="seg">${Object.entries(U.TIPOS_PEDIDO).map(([k, v]) => `<label><input type="radio" name="tipo" value="${k}" ${k === 'venda' ? 'checked' : ''}><span>${v}</span></label>`).join('')}</div></div>
            <div class="f s2"><label>Data do pedido</label><input type="date" name="data_pedido"></div>
            <div class="f s3"><label>Prazo de pagamento</label><input type="text" name="prazo" list="dl-prazos" placeholder="Ex.: 28 dias"></div>
            <div class="f s3"><label>Nº pedido do cliente</label><input type="text" name="pedido_cliente" placeholder="Opcional"></div>

            <div class="f s12"><label>Cliente <span class="req">*</span></label>
              <div class="ac" id="ped-cli-ac">
                <input type="text" id="ped-cli-q" placeholder="Digite CNPJ ou nome do cliente…" autocomplete="off">
                <div class="ac-list" id="ped-cli-list" hidden></div>
              </div>
              <div class="client-pill" id="ped-cli-pill" hidden></div>
            </div>

            <div class="f s4"><label>E-mail do cliente</label><input type="email" name="cliente_email"></div>
            <div class="f s4"><label>Cidade</label><input type="text" name="cidade"></div>
            <div class="f s4"><label>Bairro</label><input type="text" name="bairro"></div>
            <div class="f s4"><label>Vendedor</label><input type="text" name="vendedor" list="dl-vendedores"></div>
            <div class="f s4"><label>Transporte</label><input type="text" name="transporte" list="dl-transportes"></div>
            <div class="f s4"><label>Anotação do canhoto</label><input type="text" name="anotacao_canhoto"></div>
          </div>

          <div class="prod-grid">
            ${prods.map((p) => `
              <div class="prod" data-pid="${p.id}">
                <div class="prod-head"><div><div class="eyebrow">Produto</div><h3>${U.esc(p.nome)}</h3></div><span class="badge b-info">${U.int(p.unidades_caixa)} un./caixa</span></div>
                <div class="fields">
                  <div class="f"><label>Caixas</label><input type="number" min="0" step="any" inputmode="decimal" data-k="caixas" placeholder="0"></div>
                  <div class="f"><label>Unidades</label><input type="text" data-k="unidades" readonly tabindex="-1" value="0"></div>
                  <div class="f"><label>Valor unitário (R$)</label><input type="text" inputmode="decimal" data-k="valor_unitario" placeholder="0,00"><span class="last-price" data-last hidden></span></div>
                  <div class="f"><label>Valor da caixa</label><input type="text" data-k="valor_caixa" readonly tabindex="-1" value="R$ 0,00"></div>
                  <div class="total-line"><span class="muted">Total ${U.esc(p.nome.toLowerCase())}</span><b data-k="total">R$ 0,00</b></div>
                </div>
              </div>`).join('') || '<div class="alert alert-warn">Nenhum produto cadastrado para esta empresa. Cadastre em Ajustes.</div>'}
          </div>

          <div class="order-foot">
            <div class="total-box"><small>Valor total do pedido</small><div id="ped-total">R$ 0,00</div></div>
            <div class="fields">
              <div class="f s12"><label>Observação</label><input type="text" name="observacao" list="dl-obs" placeholder="Ex.: OUROSAF - ELI"></div>
              <div class="f s3"><label>Nota fiscal</label><input type="text" name="nota" inputmode="numeric" placeholder="Depois do faturamento"></div>
              <div class="f s3"><label>Data do faturamento</label><input type="date" name="data_faturamento"></div>
              <div class="f s3"><label>Destaque da linha</label><select name="destaque">${U.DESTAQUES.map((d) => `<option value="${d.v}">${d.label}</option>`).join('')}</select></div>
              <div class="f s3" style="justify-content:flex-end"><label class="check"><input type="checkbox" name="canhoto"> Canhoto assinado</label></div>
            </div>
            <button type="submit" class="btn btn-primary" style="min-height:48px;padding:0 26px" id="ped-salvar">Salvar pedido</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-head">
          <div><div class="eyebrow">Histórico e faturamento</div><h2>Pedidos digitados</h2></div>
          <div class="actions">
            <button class="btn btn-sm" id="ped-sel-vis">Selecionar visíveis</button>
            <button class="btn btn-sm" id="ped-sel-limpar">Limpar seleção</button>
            <button class="btn btn-sm btn-primary" id="ped-excel">Gerar Excel</button>
          </div>
        </div>
        <div class="chips" id="ped-chips">
          ${[['recentes', 'Últimos 60 dias'], ['hoje', 'Hoje'], ['semnota', 'Sem nota'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['mespassado', 'Mês passado'], ['canhoto', 'Canhoto pendente'], ['tudo', 'Histórico completo']]
            .map(([k, v]) => `<button class="chip ${k === chip ? 'on' : ''}" data-chip="${k}">${v}</button>`).join('')}
        </div>
        <div class="filters" id="ped-filters">
          <div class="f wide"><label>Busca geral</label><input type="search" data-f="q" placeholder="Cliente, CNPJ, cidade, bairro, nota, nº…"></div>
          <div class="f"><label>Observação / vendedor</label><input type="search" data-f="obs" list="dl-obs"></div>
          <div class="f"><label>Nota exata</label><input type="search" data-f="nota" inputmode="numeric"></div>
          <div class="f"><label>Período por</label><select data-f="campoData"><option value="data_pedido">Data do pedido</option><option value="data_faturamento">Data do faturamento</option></select></div>
          <div class="f"><label>De</label><input type="date" data-f="de"></div>
          <div class="f"><label>Até</label><input type="date" data-f="ate"></div>
          <div class="f"><label>Status</label><select data-f="status"><option value="ativo">Ativos</option><option value="cancelado">Cancelados</option><option value="">Todos</option></select></div>
          <div class="f"><label>Faturamento</label><select data-f="fat"><option value="">Todos</option><option value="sem">Sem nota</option><option value="com">Com nota</option></select></div>
          <div class="f"><label>Canhoto</label><select data-f="canhoto"><option value="">Todos</option><option value="ok">Assinado</option><option value="pend">Pendente</option></select></div>
          <div class="f"><label>Tipo</label><select data-f="tipo"><option value="">Todos</option>${Object.entries(U.TIPOS_PEDIDO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="f"><label>Produto</label><select data-f="produto"><option value="">Todos</option>${prods.map((p) => `<option value="${p.id}">Com ${U.esc(p.nome)}</option>`).join('')}</select></div>
          <div class="f"><label>Cidade</label><select data-f="cidade"><option value="">Todas</option></select></div>
          <div class="f"><label>Destaque</label><select data-f="destaque"><option value="*">Todos</option>${U.DESTAQUES.map((d) => `<option value="${d.v}">${d.label}</option>`).join('')}</select></div>
          <div class="f"><button class="btn" id="ped-limpar-filtros">Limpar filtros</button></div>
        </div>
        <div class="summary" id="ped-summary"></div>
        <div class="table-wrap" style="max-height:75vh"><table class="t cards" id="ped-table"></table></div>
        <div class="list-foot"><span id="ped-foot"></span><button class="btn btn-sm" id="ped-mais" hidden>Mostrar mais</button></div>
      </div>
      <div id="ped-dls"></div>`;

    form = U.$('#ped-form', root);
    tableEl = U.$('#ped-table', root);
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
    form.querySelector('[name=nota]').addEventListener('input', (e) => {
      const fat = form.querySelector('[name=data_faturamento]');
      if (e.target.value && !fat.value) fat.value = U.today();
    });
    U.$('#ped-limpar', root).onclick = () => { reset(); U.$('#ped-cli-q', root).focus(); };
    U.$('#ped-novo', root).onclick = () => { reset(); U.$('#ped-form-card', root).scrollIntoView({ behavior: 'smooth' }); U.$('#ped-cli-q', root).focus(); };
    U.$('#ped-cancelar-edicao', root).onclick = () => reset();
    U.$('#ped-importar', root).onclick = importarNotas;
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
      set('vendedor', c.vendedor);
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
        tag.textContent = `Último preço: ${U.money(last)} (usar)`;
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
    U.$('#ped-form-title', root).textContent = 'Digitar pedido';
    U.$('#ped-form-sub', root).innerHTML = 'Rascunho salvo automaticamente neste aparelho · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva';
    U.$('#ped-cancelar-edicao', root).hidden = true;
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
    U.$('#ped-form-title', root).textContent = `Editando pedido nº ${p.numero || ''}`;
    U.$('#ped-form-sub', root).textContent = `${p.cliente_nome || ''} · digitado em ${U.date(p.data_pedido)}`;
    U.$('#ped-cancelar-edicao', root).hidden = false;
    U.$('#ped-salvar', root).textContent = 'Salvar alterações';
    U.$('#ped-form-card', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function salvar() {
    if (!cliente) { U.toast('Selecione o cliente', 'warn'); U.$('#ped-cli-q', root).focus(); return; }
    const f = U.formData(form);
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
    U.toast(old ? `Pedido nº ${saved.numero} atualizado` : `Pedido nº ${saved.numero} salvo — ${U.money(saved.total)}`);
    reset();
    U.$('#ped-cli-q', root).focus();
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
    U.$('#ped-limpar-filtros', root).onclick = () => {
      U.$$('[data-f]', root).forEach((el) => { el.value = el.tagName === 'SELECT' ? el.options[0].value : ''; });
      applyChip('recentes', true);
    };
    U.$('#ped-mais', root).onclick = () => { limit += PAGE * 2; renderList(); };
    U.$('#ped-sel-vis', root).onclick = () => { filtered().slice(0, limit).forEach((p) => selected.add(p.id)); renderList(); };
    U.$('#ped-sel-limpar', root).onclick = () => { selected.clear(); renderList(); };
    U.$('#ped-excel', root).onclick = () => {
      const list = selected.size ? D.pedidos().filter((p) => selected.has(p.id)) : filtered();
      if (!list.length) { U.toast('Nenhum pedido para exportar', 'warn'); return; }
      Excel.pedidos(list);
      U.toast(`Excel gerado com ${list.length} pedido(s)` + (selected.size ? ' selecionados' : ' filtrados'));
    };

    tableEl.addEventListener('click', (e) => {
      const th = e.target.closest('th[data-k]');
      if (th) { sort = { k: th.dataset.k, dir: sort.k === th.dataset.k ? -sort.dir : -1 }; renderList(); return; }
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const id = tr.dataset.id;
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const a = act.dataset.act;
      if (a === 'nota') editarNotaInline(act, id);
      if (a === 'edit') editar(id);
      if (a === 'dup') duplicar(id);
      if (a === 'del') excluir(id);
      if (a === 'ocorr') Pages.ocorrencias.novaPara(id);
      if (a === 'canhoto') {
        const p = Store.get('pedidos', id);
        Store.save('pedidos', { id, canhoto: !p.canhoto });
      }
    });
    tableEl.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (e.target.matches('[data-sel]')) {
        if (e.target.checked) selected.add(tr.dataset.id); else selected.delete(tr.dataset.id);
        tr.classList.toggle('sel', e.target.checked);
        summary(filtered());
      }
      if (e.target.matches('[data-more]')) {
        const v = e.target.value;
        e.target.value = '';
        const id = tr.dataset.id;
        if (v.startsWith('dest:')) Store.save('pedidos', { id, destaque: v.slice(5) });
        else if (v === 'dup') duplicar(id);
        else if (v === 'ocorr') Pages.ocorrencias.novaPara(id);
        else if (v === 'del') excluir(id);
      }
    });
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
    if (k === 'canhoto') { set('de', ''); set('ate', ''); set('fat', 'com'); set('canhoto', 'pend'); }
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
    let rows = D.pedidos().filter((p) => {
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
      if (obs && !U.norm((p.observacao || '') + ' ' + (p.vendedor || '')).includes(obs)) return false;
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
      if (k === 'cidade') return U.norm(p.cidade);
      if (k === 'nota') return +U.digits(p.nota) || 0;
      if (k === 'total') return +p.total || 0;
      if (k.startsWith('p:')) return D.caixasDe(p, k.slice(2));
      return '';
    };
    return rows.sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0; });
  }

  function summary(rows) {
    const prods = produtos();
    const tot = rows.reduce((s, p) => s + (+p.total || 0), 0);
    const semNota = rows.filter((p) => !p.nota).length;
    U.$('#ped-summary', root).innerHTML = `<span>Pedidos: <b>${U.int(rows.length)}</b></span>` +
      prods.map((pr) => `<span>${U.esc(pr.nome)}: <b>${U.num(rows.reduce((s, p) => s + D.caixasDe(p, pr.id), 0))} cx</b></span>`).join('') +
      `<span>Valor: <b>${U.money(tot)}</b></span><span>Sem nota: <b>${U.int(semNota)}</b></span>` +
      (selected.size ? `<span class="badge b-info">${selected.size} selecionado(s)</span>` : '');
  }

  function renderList() {
    if (!tableEl) return;
    const prods = produtos();
    const rows = filtered();
    summary(rows);
    const arrow = (k) => (sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '');
    const head = `<thead><tr><th></th><th class="sortable" data-k="nota">Nota${arrow('nota')}</th><th class="sortable" data-k="data">Data${arrow('data')}</th>
      <th class="sortable" data-k="cliente">Cliente${arrow('cliente')}</th><th class="sortable" data-k="cidade">Cidade${arrow('cidade')}</th><th>Obs. / vendedor</th>
      ${prods.map((p) => `<th class="sortable num" data-k="p:${p.id}">${U.esc(p.nome)}${arrow('p:' + p.id)}</th>`).join('')}
      <th class="sortable num" data-k="total">Total${arrow('total')}</th><th></th></tr></thead>`;
    const body = rows.slice(0, limit).map((p) => {
      const cls = [selected.has(p.id) && 'sel', p.status === 'cancelado' && 'cancelado', p.destaque && 'hl-' + p.destaque, p.canhoto && 'canhoto-ok'].filter(Boolean).join(' ');
      const tipo = p.tipo && p.tipo !== 'venda' ? `<span class="badge ${p.tipo === 'bonificacao' ? 'b-warn' : 'b-info'}">${U.TIPOS_PEDIDO[p.tipo]}</span> ` : '';
      return `<tr data-id="${p.id}" class="${cls}">
        <td><input type="checkbox" data-sel ${selected.has(p.id) ? 'checked' : ''} aria-label="Selecionar"></td>
        <td data-l="Nota"><button class="nota-btn ${p.nota ? 'has' : ''}" data-act="nota">${p.nota ? U.esc(p.nota) : 'SEM NOTA'}</button><span class="sub">nº ${p.numero || '—'} ${p.status === 'cancelado' ? '<span class="badge b-danger">Cancelado</span>' : ''}</span></td>
        <td data-l="Data">${U.date(p.data_pedido)}${p.data_faturamento ? `<span class="sub">Fat.: ${U.date(p.data_faturamento)}</span>` : ''}</td>
        <td data-l="Cliente" class="nm">${tipo}<b>${U.esc(p.cliente_nome || '')}</b><span class="sub">${U.esc(U.fmtDoc(p.cnpj))}${p.prazo ? ' · ' + U.esc(p.prazo) : ''}</span></td>
        <td data-l="Cidade">${U.esc(p.cidade || '')}<span class="sub">${U.esc(p.bairro || '')}</span></td>
        <td data-l="Obs.">${U.esc(p.observacao || '')}${p.vendedor && p.vendedor !== p.observacao ? `<span class="sub">${U.esc(p.vendedor)}</span>` : ''}</td>
        ${prods.map((pr) => {
          const it = (p.itens || []).find((i) => i.produto_id === pr.id);
          const cx = it ? +it.caixas : 0;
          return `<td data-l="${U.esc(pr.nome)}" class="num">${cx ? `<b>${U.num(cx)} cx</b><span class="sub">${U.int(cx * pr.unidades_caixa)} un · ${U.money(it.valor_unitario)}</span>` : '<span class="muted">—</span>'}</td>`;
        }).join('')}
        <td data-l="Total" class="num"><b>${U.money(p.total)}</b><span class="sub"><button class="btn btn-xs ${p.canhoto ? 'canhoto-on' : ''}" data-act="canhoto" title="Canhoto: clique para marcar/desmarcar">${p.canhoto ? '✓ Canhoto' : 'Canhoto pend.'}</button></span></td>
        <td class="row-actions"><button class="btn btn-xs" data-act="edit">Editar</button>
          <select data-more class="more-sel" aria-label="Mais ações"><option value="">Mais ▾</option><option value="dup">Repetir pedido</option><option value="ocorr">Ocorrência (cancelar/devolver/trocar)</option><option value="del">Excluir</option>
            <optgroup label="Destaque da linha">${U.DESTAQUES.map((d) => `<option value="dest:${d.v}">${d.v === (p.destaque || '') ? '✓ ' : ''}${d.label}</option>`).join('')}</optgroup></select></td>
      </tr>`;
    }).join('');
    tableEl.innerHTML = head + `<tbody>${body || `<tr><td colspan="${8 + prods.length}" class="empty">Nenhum pedido com esses filtros.</td></tr>`}</tbody>`;
    U.$('#ped-foot', root).textContent = `Mostrando ${U.int(Math.min(limit, rows.length))} de ${U.int(rows.length)} · ordenado do mais recente para o mais antigo (clique nos títulos para mudar)`;
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
    U.fillForm(form, { ...p, nota: '', data_faturamento: '', canhoto: false, destaque: '', data_pedido: U.today() });
    fillItens(p.itens || []);
    if (c) selectCliente(c, true);
    calc();
    saveDraft();
    U.$('#ped-form-card', root).scrollIntoView({ behavior: 'smooth' });
    U.toast('Pedido copiado para o formulário — confira e salve');
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
    novoPara(clienteId) {
      App.go('pedidos');
      setTimeout(() => {
        reset();
        const c = Store.get('clientes', clienteId);
        if (c) selectCliente(c);
        U.$('#ped-form-card', root).scrollIntoView({ behavior: 'smooth' });
      }, 30);
    },
    editar: (id) => { App.go('pedidos'); setTimeout(() => editar(id), 30); },
    revisarNotas,
  };
})();
