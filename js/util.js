/* Utilidades gerais: formatação, datas, CNPJ, DOM, avisos e modais. */
(function () {
  'use strict';

  const U = {};

  // ---------- Números e dinheiro ----------
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

  U.money = (v) => brl.format(Number(v) || 0);
  U.num = (v) => num.format(Number(v) || 0);
  U.int = (v) => num0.format(Number(v) || 0);
  U.round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

  /** Converte "1.234,56", "1234.56", "R$ 12,3" em número. */
  U.parseNum = (v) => {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    let s = String(v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  // ---------- Datas (sempre ISO yyyy-mm-dd no banco) ----------
  U.today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  U.addDays = (iso, days) => {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  U.date = (iso) => {
    if (!iso) return '';
    const [y, m, d] = String(iso).slice(0, 10).split('-');
    return d ? `${d}/${m}/${y}` : iso;
  };
  U.daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

  // ---------- CNPJ / CPF ----------
  U.digits = (v) => String(v || '').replace(/\D/g, '');
  U.fmtDoc = (v) => {
    const d = U.digits(v);
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return v || '';
  };
  U.maskDoc = (v) => {
    const d = U.digits(v).slice(0, 14);
    if (d.length <= 11) {
      return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2');
    }
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
  };
  U.validCnpj = (v) => {
    const c = U.digits(v);
    if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const calc = (len) => {
      let sum = 0, pos = len - 7;
      for (let i = len; i >= 1; i--) {
        sum += c[len - i] * pos--;
        if (pos < 2) pos = 9;
      }
      const r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === +c[12] && calc(13) === +c[13];
  };
  U.maskPhone = (v) => {
    const d = U.digits(v).slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  };

  // ---------- Texto ----------
  U.norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.uuid = () => (crypto.randomUUID ? crypto.randomUUID() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));
  /** Extrai dias de prazo de textos como "28 dias", "28 DDL", "28/35". Retorna o primeiro número. */
  U.prazoDias = (s) => {
    const m = String(s || '').match(/\d+/);
    return m ? +m[0] : null;
  };

  // ---------- DOM ----------
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  U.debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  /** Lê os campos [name] de um formulário para um objeto. */
  U.formData = (form) => {
    const o = {};
    U.$$('[name]', form).forEach((el) => {
      if (el.type === 'checkbox') o[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else o[el.name] = el.value.trim();
    });
    return o;
  };
  U.fillForm = (form, obj) => {
    U.$$('[name]', form).forEach((el) => {
      const v = obj[el.name];
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = el.value === v;
      else el.value = v == null ? '' : v;
    });
  };

  // ---------- Avisos (toast) ----------
  U.toast = (msg, type = 'ok', ms = 3200) => {
    let box = U.$('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  };

  // ---------- Modal ----------
  /**
   * Abre um modal. `body` é HTML. `buttons`: [{label, cls, value}].
   * Retorna Promise com o value do botão (ou null ao fechar).
   * onOpen(root) permite ligar eventos no conteúdo.
   */
  U.modal = ({ title, body, buttons = [{ label: 'Fechar', value: null }], wide = false, onOpen }) =>
    new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-back';
      wrap.innerHTML = `
        <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
          <div class="modal-head"><h3>${U.esc(title)}</h3><button class="icon-btn" data-close aria-label="Fechar">✕</button></div>
          <div class="modal-body">${body}</div>
          <div class="modal-foot">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${U.esc(b.label)}</button>`).join('')}</div>
        </div>`;
      const close = (v) => {
        document.removeEventListener('keydown', onKey);
        wrap.remove();
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') close(null); };
      wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(null); });
      wrap.querySelector('[data-close]').onclick = () => close(null);
      wrap.querySelectorAll('.modal-foot .btn').forEach((b) => {
        b.onclick = async () => {
          const btn = buttons[+b.dataset.i];
          if (btn.validate) {
            const ok = await btn.validate(wrap);
            if (!ok) return;
          }
          close(btn.value !== undefined ? btn.value : btn.label);
        };
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(wrap);
      if (onOpen) onOpen(wrap);
      const first = wrap.querySelector('.modal-body input, .modal-body select, .modal-body textarea');
      if (first) first.focus();
    });

  U.confirm = (msg, { ok = 'Confirmar', danger = false, title = 'Confirmar' } = {}) =>
    U.modal({
      title,
      body: `<p>${U.esc(msg)}</p>`,
      buttons: [{ label: 'Cancelar', value: false }, { label: ok, cls: danger ? 'btn-danger' : 'btn-primary', value: true }],
    }).then((v) => v === true);

  // ---------- Carregamento sob demanda de scripts pesados ----------
  const loaded = {};
  U.loadScript = (src) => {
    if (!loaded[src]) {
      loaded[src] = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = () => { delete loaded[src]; rej(new Error('Falha ao carregar ' + src)); };
        document.head.appendChild(s);
      });
    }
    return loaded[src];
  };

  // ---------- Download ----------
  U.download = (filename, content, type = 'application/json') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };

  // ---------- Cores de destaque para linhas de pedido ----------
  U.DESTAQUES = [
    { v: '', label: 'Sem cor' },
    { v: 'amarelo', label: 'Amarelo' },
    { v: 'verde', label: 'Verde' },
    { v: 'azul', label: 'Azul' },
    { v: 'vermelho', label: 'Vermelho' },
    { v: 'roxo', label: 'Roxo' },
  ];

  U.TIPOS_PEDIDO = { venda: 'Venda', bonificacao: 'Bonificação', troca: 'Troca' };
  U.TIPOS_OCORRENCIA = { cancelamento: 'Cancelamento', devolucao: 'Devolução', troca: 'Troca' };

  window.U = U;
  window.Pages = window.Pages || {};
})();
