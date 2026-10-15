/*
 * Camada de dados.
 * Mantém tudo em memória para a interface ser instantânea e persiste em:
 *  - Supabase (nuvem), quando js/config.js tem URL e chave preenchidas;
 *  - IndexedDB do navegador (modo local), caso contrário.
 * Gravações são otimistas: a tela atualiza na hora e o envio acontece em
 * segundo plano. Se a internet cair, as alterações ficam numa fila e são
 * reenviadas automaticamente.
 */
(function () {
  'use strict';

  const META = ['id', 'created_at', 'updated_at', 'deleted_at'];
  const COLS = {
    empresas: ['nome', 'cnpj', 'ativo'],
    produtos: ['empresa_id', 'nome', 'descricao', 'codigo_nf', 'palavra_chave', 'unidades_caixa', 'ordem', 'ativo'],
    clientes: ['cnpj', 'razao_social', 'nome_fantasia', 'ie', 'vendedor', 'produto', 'cep', 'endereco', 'numero',
      'complemento', 'bairro', 'cidade', 'uf', 'telefone', 'email', 'contato', 'observacao'],
    pedidos: ['numero', 'empresa_id', 'cliente_id', 'cnpj', 'cliente_nome', 'cliente_email', 'cidade', 'bairro', 'uf',
      'vendedor', 'data_pedido', 'data_faturamento', 'prazo', 'tipo', 'pedido_cliente', 'transporte',
      'anotacao_canhoto', 'observacao', 'itens', 'total', 'nota', 'canhoto', 'destaque', 'status'],
    entradas: ['empresa_id', 'produto_id', 'data', 'caixas', 'nota_fornecedor', 'fornecedor', 'lote', 'validade',
      'custo_unitario', 'observacao'],
    acertos: ['empresa_id', 'produto_id', 'data', 'sistema', 'contado', 'diferenca', 'motivo'],
    ocorrencias: ['numero', 'empresa_id', 'tipo', 'data', 'pedido_id', 'cliente_id', 'cnpj', 'cliente_nome', 'nota',
      'motivo', 'itens', 'reposicao', 'nota_devolucao', 'observacao'],
    config: ['valor'],
  };
  const TABLES = Object.keys(COLS);
  // Colunas de data/uuid: string vazia precisa virar null para o Postgres aceitar.
  const NULLABLE = /^(data|data_|validade|.*_id$|deleted_at)/;

  const mem = {};       // table -> Map(id -> row)
  const cache = {};     // table -> array (invalidado em alterações)
  const listeners = new Set();
  let mode = 'local';
  let sb = null;        // cliente supabase
  let lastSync = {};    // table -> maior updated_at visto
  let pending = [];     // [{table, row}] aguardando envio
  let flushing = false;

  TABLES.forEach((t) => { mem[t] = new Map(); });

  const status = (state, msg) => listeners.forEach((fn) => fn({ type: 'status', state, msg }));
  const changed = (table) => {
    delete cache[table];
    listeners.forEach((fn) => fn({ type: 'change', table }));
  };

  // Valores padrão: toda linha enviada tem todas as colunas, para que um envio
  // em lote nunca apague campos de outra linha com null.
  const DEFAULTS = {
    itens: () => [], reposicao: () => [], valor: () => ({}), total: () => 0, canhoto: () => false,
    status: () => 'ativo', ativo: () => true, unidades_caixa: () => 1, ordem: () => 0, caixas: () => 0,
    sistema: () => 0, contado: () => 0, diferenca: () => 0,
  };

  function clean(table, row) {
    const out = {};
    for (const k of META.concat(COLS[table])) {
      let v = row[k];
      if (v === '' && NULLABLE.test(k)) v = null;
      if (v === undefined || (v === null && DEFAULTS[k])) v = DEFAULTS[k] ? DEFAULTS[k]() : null;
      if (k === 'tipo' && v == null && table === 'pedidos') v = 'venda';
      out[k] = v;
    }
    return out;
  }

  // ===================== IndexedDB (modo local + fila) =====================
  const IDB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('ourosaf-gestao', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async get(key) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const q = db.transaction('kv').objectStore('kv').get(key);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    },
    async set(key, val) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    },
  };

  const localWriters = {};
  function persistLocal(table) {
    clearTimeout(localWriters[table]);
    localWriters[table] = setTimeout(async () => {
      try {
        await IDB.set('t:' + table, Array.from(mem[table].values()));
        status('ok', 'Salvo neste navegador');
      } catch (e) {
        status('error', 'Erro ao salvar localmente');
        console.error(e);
      }
    }, 250);
  }

  // ===================== Supabase =====================
  async function fetchTable(table) {
    const since = lastSync[table] || '1970-01-01T00:00:00Z';
    const rows = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb.from(table).select('*').gt('updated_at', since)
        .order('updated_at', { ascending: true }).order('id', { ascending: true }).range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    for (const r of rows) {
      if (r.deleted_at) mem[table].delete(r.id);
      else mem[table].set(r.id, r);
      if (!lastSync[table] || r.updated_at > lastSync[table]) lastSync[table] = r.updated_at;
    }
    return rows.length;
  }

  function savePending() {
    try { localStorage.setItem('ourosaf-pending', JSON.stringify(pending)); } catch (e) { /* cheio */ }
  }

  async function flush() {
    if (flushing || !pending.length || mode !== 'supabase') return;
    flushing = true;
    status('saving', 'Salvando…');
    try {
      while (pending.length) {
        // Agrupa por tabela, mantendo só a versão mais recente de cada linha.
        const table = pending[0].table;
        const batch = new Map();
        const taken = new Set();
        for (const p of pending) {
          if (p.table !== table) continue;
          if (batch.size >= 500 && !batch.has(p.row.id)) break;
          batch.set(p.row.id, p.row);
          taken.add(p);
        }
        const rows = Array.from(batch.values()).map((r) => {
          const o = { ...r };
          delete o.created_at;
          delete o.updated_at;
          return o;
        });
        const q = sb.from(table).upsert(rows, table === 'config' ? { onConflict: 'owner,id' } : undefined).select();
        const { data, error } = await q;
        if (error) throw error;
        for (const r of data) {
          if (!r.deleted_at && mem[table].has(r.id)) mem[table].set(r.id, { ...mem[table].get(r.id), updated_at: r.updated_at });
        }
        pending = pending.filter((p) => !taken.has(p));
        savePending();
      }
      status('ok', 'Salvo na nuvem');
    } catch (e) {
      console.error(e);
      const offline = !navigator.onLine || /fetch|network/i.test(e.message || '');
      status('error', offline ? `Sem internet — ${pending.length} alteração(ões) aguardando` : 'Erro ao salvar: ' + (e.message || e));
      if (!offline) U.toast('Erro ao salvar na nuvem: ' + (e.message || e), 'error', 6000);
    } finally {
      flushing = false;
    }
  }

  // ===================== API pública =====================
  const Store = {
    TABLES,
    get mode() { return mode; },
    get client() { return sb; },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Prepara o modo (nuvem/local). Retorna true se houver sessão ativa. */
    async setup() {
      const cfg = window.OUROSAF_CONFIG || {};
      if (cfg.supabaseUrl && cfg.supabaseKey && window.supabase) {
        mode = 'supabase';
        sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
          auth: { persistSession: true, autoRefreshToken: true },
        });
        try { pending = JSON.parse(localStorage.getItem('ourosaf-pending') || '[]'); } catch (e) { pending = []; }
        window.addEventListener('online', flush);
        setInterval(flush, 30000);
        const { data } = await sb.auth.getSession();
        return !!data.session;
      }
      mode = 'local';
      return true;
    },

    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      if (sb) await sb.auth.signOut();
      location.reload();
    },
    async user() {
      if (!sb) return null;
      const { data } = await sb.auth.getUser();
      return data.user;
    },

    /** Carrega todas as tabelas para a memória. */
    async load(onProgress) {
      if (mode === 'local') {
        for (const t of TABLES) {
          const rows = (await IDB.get('t:' + t)) || [];
          mem[t] = new Map(rows.filter((r) => !r.deleted_at).map((r) => [r.id, r]));
        }
        status('ok', 'Modo local (somente este navegador)');
      } else {
        let i = 0;
        for (const t of TABLES) {
          if (onProgress) onProgress(t, i++ / TABLES.length);
          await fetchTable(t);
        }
        flush();
        status('ok', 'Salvo na nuvem');
      }
      TABLES.forEach((t) => delete cache[t]);
    },

    /** Busca alterações feitas em outros aparelhos. */
    async sync() {
      if (mode !== 'supabase') return 0;
      let n = 0;
      for (const t of TABLES) {
        const c = await fetchTable(t);
        if (c) { n += c; changed(t); }
      }
      return n;
    },

    list(table) {
      if (!cache[table]) cache[table] = Array.from(mem[table].values());
      return cache[table];
    },
    get(table, id) { return id ? mem[table].get(id) || null : null; },

    save(table, row) { return this.saveMany(table, [row])[0]; },

    saveMany(table, rows) {
      const now = new Date().toISOString();
      const out = rows.map((r) => {
        const old = r.id ? mem[table].get(r.id) : null;
        const row = clean(table, { ...(old || {}), ...r });
        if (!row.id) row.id = U.uuid();
        if (!row.created_at) row.created_at = now;
        row.updated_at = now;
        mem[table].set(row.id, row);
        return row;
      });
      if (mode === 'local') persistLocal(table);
      else {
        out.forEach((row) => pending.push({ table, row }));
        savePending();
        flush();
      }
      changed(table);
      return out;
    },

    remove(table, id) {
      const row = mem[table].get(id);
      if (!row) return;
      mem[table].delete(id);
      if (mode === 'local') persistLocal(table);
      else {
        pending.push({ table, row: { ...clean(table, row), deleted_at: new Date().toISOString() } });
        savePending();
        flush();
      }
      changed(table);
    },

    // Configurações simples (chave -> objeto)
    getConfig(key, def) {
      const r = mem.config.get(key);
      return r ? r.valor : def;
    },
    setConfig(key, valor) { this.save('config', { id: key, valor }); },

    pendingCount: () => pending.length,
    flush,

    /** Exporta tudo para um objeto (backup). */
    dump() {
      const o = { versao: 1, gerado_em: new Date().toISOString() };
      TABLES.forEach((t) => { o[t] = this.list(t); });
      return o;
    },
  };

  window.Store = Store;
})();
