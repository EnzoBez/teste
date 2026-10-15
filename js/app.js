/* Inicialização, login, navegação entre páginas e barra lateral. */
(function () {
  'use strict';

  window.Pages = window.Pages || {};
  const PAGES = ['clientes', 'pedidos', 'estoque', 'ocorrencias', 'ajustes'];
  let current = null;
  const built = {};

  const App = {
    go(page) { location.hash = '#' + page; },
    current: () => current,
  };
  window.App = App;

  function show(page) {
    if (!PAGES.includes(page)) page = 'pedidos';
    current = page;
    PAGES.forEach((p) => { U.$('#page-' + p).hidden = p !== page; });
    U.$$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    const mod = Pages[page];
    const root = U.$('#page-' + page);
    if (!built[page]) { mod.build(root); built[page] = true; }
    if (mod.show) mod.show();
    window.scrollTo(0, 0);
  }

  function stats() {
    const peds = D.pedidos();
    U.$('#st-clientes').textContent = U.int(Store.list('clientes').length);
    U.$('#st-pedidos').textContent = U.int(peds.length);
    U.$('#st-semnota').textContent = U.int(peds.filter((p) => !p.nota && p.status !== 'cancelado').length);
  }

  function empresaSelects() {
    const list = D.empresas();
    const id = D.empresaId();
    const html = list.map((e) => `<option value="${e.id}" ${e.id === id ? 'selected' : ''}>${U.esc(e.nome)}</option>`).join('');
    const many = list.length > 1;
    U.$('#empresa-sel').innerHTML = html;
    U.$('#empresa-sel-m').innerHTML = html;
    U.$('#empresa-sel-wrap').hidden = !many;
    U.$('#empresa-sel-m').hidden = !many;
    const e = D.empresa();
    U.$('#side-empresa').textContent = e ? 'Gestão ' + e.nome : 'Gestão';
  }

  function onEmpresaChange(id) {
    D.setEmpresa(id);
    empresaSelects();
    stats();
    // Reconstrói páginas que dependem dos produtos da empresa
    ['pedidos', 'estoque', 'ocorrencias'].forEach((p) => { if (built[p]) { built[p] = false; U.$('#page-' + p).innerHTML = ''; } });
    show(current);
  }

  const refreshVisible = U.debounce((tables) => {
    stats();
    if (tables.has('empresas') || tables.has('produtos')) empresaSelects();
    if (tables.has('produtos')) {
      // Layout dos produtos mudou: reconstrói as páginas na próxima visita
      ['pedidos', 'estoque', 'ocorrencias'].forEach((p) => { if (built[p] && p !== current) { built[p] = false; U.$('#page-' + p).innerHTML = ''; } });
    }
    PAGES.forEach((p) => { if (built[p] && Pages[p].onData) Pages[p].onData(tables, p === current); });
    tables.clear();
  }, 120);
  const changedTables = new Set();

  async function boot() {
    const msg = U.$('#loading-msg');
    const bar = U.$('#loading-bar');
    let logged;
    try {
      logged = await Store.setup();
    } catch (e) {
      msg.textContent = 'Erro ao iniciar: ' + e.message;
      return;
    }
    if (!logged) {
      U.$('#loading').hidden = true;
      const form = U.$('#login-form');
      form.hidden = false;
      U.$('#login-email').focus();
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const err = U.$('#login-err');
        err.hidden = true;
        const btn = form.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'Entrando…';
        try {
          await Store.signIn(U.$('#login-email').value.trim(), U.$('#login-pass').value);
          form.hidden = true;
          U.$('#loading').hidden = false;
          await start(msg, bar);
        } catch (e) {
          err.textContent = /invalid/i.test(e.message) ? 'E-mail ou senha incorretos.' : e.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Entrar';
        }
      };
      return;
    }
    await start(msg, bar);
  }

  async function start(msg, bar) {
    try {
      msg.textContent = 'Carregando seus dados…';
      await Store.load((t, p) => { msg.textContent = 'Carregando ' + t + '…'; bar.style.width = Math.round(p * 100) + '%'; });
      bar.style.width = '100%';
    } catch (e) {
      msg.textContent = 'Não foi possível carregar os dados: ' + (e.message || e) + '. Verifique a internet e recarregue a página.';
      return;
    }
    D.seed();

    Store.on((e) => {
      if (e.type === 'status') {
        const dot = U.$('#save-dot');
        dot.className = 'dot ' + (e.state === 'saving' ? 'saving' : e.state === 'error' ? 'error' : '');
        U.$('#save-msg').textContent = e.msg;
      } else if (e.type === 'change') {
        changedTables.add(e.table);
        refreshVisible(changedTables);
      }
    });
    U.$('#save-msg').textContent = Store.mode === 'local' ? 'Modo local (somente este navegador)' : 'Salvo na nuvem';

    U.$('#splash').hidden = true;
    U.$('#app').hidden = false;
    U.$('#btn-logout').hidden = Store.mode !== 'supabase';
    U.$('#btn-sync').hidden = Store.mode !== 'supabase';
    U.$('#btn-logout').onclick = () => Store.signOut();
    U.$('#btn-sync').onclick = async () => {
      try {
        const n = await Store.sync();
        U.toast(n ? `${n} alteração(ões) recebidas` : 'Tudo atualizado');
      } catch (e) { U.toast('Erro ao atualizar: ' + e.message, 'error'); }
    };
    U.$('#empresa-sel').onchange = (e) => onEmpresaChange(e.target.value);
    U.$('#empresa-sel-m').onchange = (e) => onEmpresaChange(e.target.value);

    // Ao voltar para a aba depois de um tempo, busca alterações de outros aparelhos
    let lastSync = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Store.mode === 'supabase' && Date.now() - lastSync > 60000) {
        lastSync = Date.now();
        Store.sync().catch(() => {});
      }
    });
    window.addEventListener('beforeunload', (e) => {
      if (Store.pendingCount()) { e.preventDefault(); e.returnValue = ''; }
    });

    empresaSelects();
    stats();
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    show(location.hash.slice(1) || 'pedidos');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
