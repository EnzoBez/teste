/* Busca global (Ctrl+K): clientes, pedidos, notas e ações rápidas. */
(function () {
  'use strict';

  let open = false;

  function acoes() {
    return [
      { g: 'Ações', icon: 'plus', t: 'Novo pedido', s: 'Atalho: N', run: () => Pages.pedidos.novo() },
      { g: 'Ações', icon: 'upload', t: 'Importar notas (.zip)', s: 'Vincular notas fiscais aos pedidos', run: () => Pages.pedidos.importar() },
      { g: 'Ações', icon: 'users', t: 'Novo cliente', s: 'Cadastro com busca automática do CNPJ', run: () => Pages.clientes.novo() },
      { g: 'Ações', icon: 'truck', t: 'Registrar entrada de mercadoria', s: 'Estoque', run: () => Pages.estoque.entrada() },
      { g: 'Ações', icon: 'clipboard', t: 'Contagem de inventário', s: 'Estoque', run: () => Pages.estoque.inventario() },
      { g: 'Ações', icon: 'alert', t: 'Nova ocorrência', s: 'Cancelamento, devolução ou troca', run: () => Pages.ocorrencias.nova() },
      { g: 'Ir para', icon: 'users', t: 'Clientes', run: () => App.go('clientes') },
      { g: 'Ir para', icon: 'receipt', t: 'Pedidos', run: () => App.go('pedidos') },
      { g: 'Ir para', icon: 'box', t: 'Estoque', run: () => App.go('estoque') },
      { g: 'Ir para', icon: 'alert', t: 'Ocorrências', run: () => App.go('ocorrencias') },
      { g: 'Ir para', icon: 'settings', t: 'Ajustes e backup', run: () => App.go('ajustes') },
      { g: 'Ações', icon: 'moon', t: 'Alternar tema claro/escuro', run: () => App.toggleTheme() },
    ];
  }

  function buscar(q) {
    const n = U.norm(q), d = U.digits(q);
    if (!q.trim()) return acoes();
    const out = acoes().filter((a) => U.norm(a.t + ' ' + (a.s || '')).includes(n));
    const peds = D.pedidos();
    let cnt = 0;
    for (const p of peds) {
      if (cnt >= 8) break;
      const hit = (d.length >= 3 && (U.digits(p.nota) === d || String(p.numero) === d || U.digits(p.pedido_cliente) === d));
      if (hit) {
        out.push({ g: 'Pedidos', icon: 'receipt', t: `${p.cliente_nome} — ${U.money(p.total)}`, s: `Pedido nº ${p.numero} · ${U.date(p.data_pedido)} · ${p.nota ? 'NF ' + p.nota : 'sem nota'}`, run: () => Pages.pedidos.editar(p.id) });
        cnt++;
      }
    }
    let c2 = 0;
    for (const c of Store.list('clientes')) {
      if (c2 >= 8) break;
      const cd = U.digits(c.cnpj);
      if ((d.length >= 3 && cd.includes(d)) || (n.length >= 2 && !/^\d+$/.test(n) && U.norm(c.razao_social + ' ' + (c.nome_fantasia || '')).includes(n))) {
        out.push({ g: 'Clientes', avatar: c.razao_social, t: c.razao_social, s: `${U.fmtDoc(c.cnpj)} · ${c.cidade || ''}`, run: () => Pages.clientes.abrir(c.id),
          alt: { label: 'Novo pedido', run: () => Pages.pedidos.novoPara(c.id) } });
        c2++;
      }
    }
    return out;
  }

  function show() {
    if (open) return;
    open = true;
    const back = document.createElement('div');
    back.className = 'palette-back';
    back.innerHTML = `<div class="palette" role="dialog" aria-label="Busca global">
      <div class="palette-in">${U.icon('search', 18)}<input type="text" placeholder="Buscar cliente, CNPJ, nota, nº do pedido ou ação…" autocomplete="off"></div>
      <div class="palette-list"></div>
      <div class="palette-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Shift</kbd>+<kbd>Enter</kbd> novo pedido p/ cliente</span><span><kbd>Esc</kbd> fechar</span></div>
    </div>`;
    document.body.appendChild(back);
    const input = back.querySelector('input');
    const list = back.querySelector('.palette-list');
    let items = [], idx = 0;
    const render = () => {
      items = buscar(input.value);
      idx = Math.min(idx, Math.max(0, items.length - 1));
      let g = null, html = '';
      items.forEach((it, i) => {
        if (it.g !== g) { g = it.g; html += `<div class="palette-group">${g}</div>`; }
        const ic = it.avatar ? `<span class="avatar" style="--h:${U.hue(it.avatar)};width:32px;height:32px;border-radius:9px;font-size:11px">${U.esc(U.initials(it.avatar))}</span>` : `<span class="ic-wrap">${U.icon(it.icon, 16)}</span>`;
        html += `<div class="palette-item ${i === idx ? 'on' : ''}" data-i="${i}">${ic}<div><b>${U.esc(it.t)}</b>${it.s ? `<small>${U.esc(it.s)}</small>` : ''}</div><span class="go">${U.icon('arrow', 16)}</span></div>`;
      });
      list.innerHTML = html || '<div class="empty">Nada encontrado</div>';
      const on = list.querySelector('.on');
      if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const close = () => { back.remove(); open = false; };
    const run = (it, alt) => { close(); (alt && it.alt ? it.alt.run : it.run)(); };
    input.addEventListener('input', () => { idx = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
      else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); run(items[idx], e.shiftKey); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousemove', (e) => { const it = e.target.closest('[data-i]'); if (it && +it.dataset.i !== idx) { idx = +it.dataset.i; list.querySelectorAll('.palette-item').forEach((el) => el.classList.toggle('on', +el.dataset.i === idx)); } });
    list.addEventListener('click', (e) => { const it = e.target.closest('[data-i]'); if (it) run(items[+it.dataset.i]); });
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    render();
    input.focus();
  }

  window.Palette = { show };
})();
