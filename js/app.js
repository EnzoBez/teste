/* Inicialização, login, navegação, tema e atalhos de teclado. */
(function () {
  'use strict';

  window.Pages = window.Pages || {};
  const PAGES = ['clientes', 'pedidos', 'estoque', 'ocorrencias', 'ajustes'];
  const NAV = [['clientes', 'Clientes', 'users'], ['pedidos', 'Pedidos', 'receipt'], ['estoque', 'Estoque', 'box'], ['ocorrencias', 'Ocorrências', 'alert']];
  let current = null;
  const built = {};

  const App = {
    go(page) {
      if (location.hash === '#' + page) show(page);
      else location.hash = '#' + page;
    },
    current: () => current,
    /** Garante que a página está montada (para abrir painéis vindos de outra página). */
    ensure(page) {
      if (current !== page) App.go(page);
      if (!built[page]) show(page);
    },
    toggleTheme() {
      const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem('ourosaf-tema', t); } catch (e) { /* ignore */ }
      themeIcon();
    },
  };
  window.App = App;

  function themeIcon() {
    const dark = document.documentElement.dataset.theme === 'dark';
    U.$('#btn-theme').innerHTML = U.icon(dark ? 'sun' : 'moon', 18);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = dark ? '#0E1513' : '#F5F4EC';
  }

  function show(page) {
    if (!PAGES.includes(page)) page = 'pedidos';
    const changed = current !== page;
    current = page;
    PAGES.forEach((p) => { U.$('#page-' + p).hidden = p !== page; });
    U.$$('.nav a, .tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.page === page));
    const mod = Pages[page];
    const root = U.$('#page-' + page);
    if (!built[page]) { mod.build(root); built[page] = true; }
    if (mod.show) mod.show();
    if (changed) window.scrollTo(0, 0);
  }

  function navs() {
    const html = NAV.map(([k, l, ic]) => `<a href="#${k}" data-page="${k}">${U.icon(ic, 16)}<span>${l}</span></a>`).join('');
    U.$('#nav').innerHTML = html;
    U.$('#tabbar').innerHTML = NAV.map(([k, l, ic]) => `<a href="#${k}" data-page="${k}">${U.icon(ic, 20)}<span>${l}</span></a>`).join('');
  }

  function empresaSelects() {
    const list = D.empresas();
    const id = D.empresaId();
    const sel = U.$('#empresa-sel');
    sel.innerHTML = list.map((e) => `<option value="${e.id}" ${e.id === id ? 'selected' : ''}>${U.esc(e.nome)}</option>`).join('');
    sel.hidden = list.length < 2;
    const e = D.empresa();
    U.$('#side-empresa').textContent = e ? 'Representação ' + e.nome : 'Gestão';
  }

  function onEmpresaChange(id) {
    D.setEmpresa(id);
    empresaSelects();
    ['pedidos', 'estoque', 'ocorrencias'].forEach((p) => { if (built[p]) { built[p] = false; U.$('#page-' + p).innerHTML = ''; } });
    show(current);
  }

  const changedTables = new Set();
  const refreshVisible = U.debounce(() => {
    if (changedTables.has('empresas') || changedTables.has('produtos')) empresaSelects();
    if (changedTables.has('produtos')) {
      ['pedidos', 'estoque', 'ocorrencias'].forEach((p) => { if (built[p] && p !== current) { built[p] = false; U.$('#page-' + p).innerHTML = ''; } });
    }
    PAGES.forEach((p) => { if (built[p] && Pages[p].onData) Pages[p].onData(changedTables, p === current); });
    changedTables.clear();
  }, 120);

  async function menuPrincipal(btn) {
    const items = [
      { label: 'Ajustes e backup', value: 'ajustes', icon: 'settings' },
      { label: 'Baixar backup agora', value: 'backup', icon: 'download' },
    ];
    if (Store.mode === 'supabase') items.push({ label: 'Atualizar dados', value: 'sync', icon: 'refresh' }, '-', { label: 'Sair da conta', value: 'sair', icon: 'logout', danger: true });
    const v = await U.menu(btn, items);
    if (v === 'ajustes') App.go('ajustes');
    if (v === 'backup') { U.download(`ourosaf_backup_${U.today()}.json`, JSON.stringify(Store.dump())); U.toast('Backup baixado'); }
    if (v === 'sair') Store.signOut();
    if (v === 'sync') {
      try { const n = await Store.sync(); U.toast(n ? `${n} alteração(ões) recebidas` : 'Tudo atualizado'); } catch (e) { U.toast('Erro ao atualizar: ' + e.message, 'error'); }
    }
  }

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
        U.$('#save-dot').className = 'dot ' + (e.state === 'saving' ? 'saving' : e.state === 'error' ? 'error' : '');
        U.$('#save-msg').textContent = e.msg;
      } else if (e.type === 'change') {
        changedTables.add(e.table);
        refreshVisible();
      }
    });
    U.$('#save-msg').textContent = Store.mode === 'local' ? 'Modo local' : 'Salvo na nuvem';

    navs();
    themeIcon();
    U.$('#ic-search').innerHTML = U.icon('search', 16);
    U.$('#btn-menu').innerHTML = U.icon('more', 18);
    U.$('#splash').hidden = true;
    U.$('#app').hidden = false;
    U.$('#btn-theme').onclick = App.toggleTheme;
    U.$('#btn-menu').onclick = (e) => menuPrincipal(e.currentTarget);
    U.$('#open-palette').onclick = () => Palette.show();
    U.$('#empresa-sel').onchange = (e) => onEmpresaChange(e.target.value);

    // Atalhos: Ctrl+K busca, N novo pedido, / busca na lista
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); Palette.show(); return; }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-back, .palette-back') || U.drawerOpen()) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); Pages.pedidos.novo(); }
      if (e.key === '/') { const s = U.$(`#page-${current} .toolbar .search input`); if (s) { e.preventDefault(); s.focus(); } }
    });

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
    window.addEventListener('hashchange', () => show(location.hash.slice(1)));
    show(location.hash.slice(1) || 'pedidos');
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
