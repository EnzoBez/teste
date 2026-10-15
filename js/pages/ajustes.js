/* Ajustes: empresas representadas, produtos, backup e importação. */
(function () {
  'use strict';

  let root;

  function build(r) {
    root = r;
    root.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Configurações</div><h1>Ajustes e backup</h1></div></div>
      <div class="card" id="aj-conta"></div>
      <div class="card">
        <div class="card-head"><div><h2>Empresas representadas e produtos</h2><div class="sub">Código na NF e palavra-chave são usados para reconhecer os produtos nas notas importadas</div></div>
          <button class="btn btn-soft" id="aj-nova-emp">+ Nova empresa</button></div>
        <div id="aj-emps"></div>
      </div>
      <div class="card" id="aj-mig-card">
        <div class="card-head"><div><h2>Importar do sistema antigo</h2><div class="sub">Arquivo de backup (.json) gerado pelo botão "Baixar backup em JSON" do sistema anterior</div></div>
          <button class="btn btn-primary" id="aj-mig">Escolher arquivo…</button></div>
        <p class="muted small mb0">Traz clientes, pedidos, estoque (data-base, entradas e acertos) e ocorrências. A observação é separada em vendedor e nº do pedido do cliente. Pode importar de novo sem duplicar: os registros são atualizados.</p>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card-head"><div><h2>Backup</h2><div class="sub">Cópia completa de todos os dados em um arquivo</div></div></div>
          <div class="actions" style="justify-content:flex-start">
            <button class="btn btn-primary" id="aj-backup">Baixar backup (.json)</button>
            <button class="btn" id="aj-restore">Restaurar backup…</button>
          </div>
          <p class="muted small mt">Mesmo com a nuvem, é boa prática baixar um backup por semana.</p>
        </div>
        <div class="card">
          <div class="card-head"><div><h2>Importar clientes de planilha</h2><div class="sub">Excel (.xlsx) ou CSV com cabeçalho na primeira linha</div></div></div>
          <button class="btn" id="aj-imp-cli">Escolher planilha…</button>
          <p class="muted small mt">Colunas reconhecidas: CNPJ, Razão social/Nome, Nome fantasia, IE, Vendedor, Produto, CEP, Endereço, Número, Bairro, Cidade, UF/Estado, Telefone, E-mail, Contato. CNPJs já cadastrados são atualizados, não duplicados.</p>
        </div>
      </div>`;

    U.$('#aj-nova-emp', root).onclick = novaEmpresa;
    U.$('#aj-backup', root).onclick = () => {
      U.download(`ourosaf_backup_${U.today()}.json`, JSON.stringify(Store.dump()));
      U.toast('Backup baixado');
    };
    U.$('#aj-restore', root).onclick = restaurar;
    U.$('#aj-imp-cli', root).onclick = importarClientes;
    U.$('#aj-mig', root).onclick = importarAntigo;
    root.addEventListener('change', onProdChange);
    root.addEventListener('click', onClick);
    render();
  }

  async function render() {
    const conta = U.$('#aj-conta', root);
    const user = await Store.user();
    conta.innerHTML = Store.mode === 'supabase'
      ? `<div class="card-head mb0"><div><h2>Conta</h2><div class="sub">Conectado como <b>${U.esc(user ? user.email : '')}</b> · dados na nuvem · ${Store.pendingCount()} alteração(ões) aguardando envio</div></div>
         <button class="btn" onclick="Store.signOut()">Sair</button></div>`
      : `<div class="card-head mb0"><div><h2>Modo local</h2><div class="sub">Os dados ficam só neste navegador. Para usar no celular e em outros computadores, configure o Supabase seguindo o arquivo README.md (leva uns 10 minutos).</div></div></div>`;

    const emps = Store.list('empresas').slice().sort((a, b) => a.nome.localeCompare(b.nome));
    U.$('#aj-emps', root).innerHTML = emps.map((e) => {
      const prods = D.produtos(e.id, true);
      return `<div class="card" style="box-shadow:none;background:var(--surface-2)" data-emp="${e.id}">
        <div class="card-head"><div><h3>${U.esc(e.nome)} ${e.ativo === false ? '<span class="badge b-mute">inativa</span>' : ''}</h3><div class="sub">${U.esc(e.cnpj || '')}</div></div>
          <div class="actions"><button class="btn btn-sm" data-act="ren-emp">Renomear</button><button class="btn btn-sm" data-act="tog-emp">${e.ativo === false ? 'Ativar' : 'Desativar'}</button><button class="btn btn-sm btn-soft" data-act="novo-prod">+ Produto</button></div></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Produto</th><th>Descrição</th><th class="num">Un./caixa</th><th>Código na NF</th><th>Palavra-chave na NF</th><th class="num">Ordem</th><th>Ativo</th></tr></thead><tbody>
        ${prods.map((p) => `<tr data-prod="${p.id}">
          <td><input type="text" data-pf="nome" value="${U.esc(p.nome)}"></td>
          <td><input type="text" data-pf="descricao" value="${U.esc(p.descricao || '')}"></td>
          <td><input type="number" data-pf="unidades_caixa" value="${p.unidades_caixa}" min="1" style="width:80px"></td>
          <td><input type="text" data-pf="codigo_nf" value="${U.esc(p.codigo_nf || '')}" style="width:100px"></td>
          <td><input type="text" data-pf="palavra_chave" value="${U.esc(p.palavra_chave || '')}" style="width:140px"></td>
          <td><input type="number" data-pf="ordem" value="${p.ordem || 0}" style="width:70px"></td>
          <td><input type="checkbox" data-pf="ativo" ${p.ativo !== false ? 'checked' : ''}></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sem produtos</td></tr>'}
        </tbody></table></div></div>`;
    }).join('');
  }

  function onProdChange(e) {
    const el = e.target.closest('[data-pf]');
    if (!el) return;
    const id = el.closest('tr').dataset.prod;
    const k = el.dataset.pf;
    let v = el.type === 'checkbox' ? el.checked : el.value.trim();
    if (k === 'unidades_caixa') {
      v = U.parseNum(v);
      if (!(v > 0)) { U.toast('Unidades por caixa deve ser maior que zero', 'warn'); render(); return; }
      U.toast('Atenção: os valores dos pedidos antigos deste produto passam a ser calculados com a nova quantidade por caixa.', 'warn', 6000);
    }
    if (k === 'ordem') v = parseInt(v, 10) || 0;
    if (k === 'nome' && !v) { render(); return; }
    Store.save('produtos', { id, [k]: v });
    U.toast('Produto atualizado');
  }

  async function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const empId = b.closest('[data-emp]') && b.closest('[data-emp]').dataset.emp;
    const emp = Store.get('empresas', empId);
    if (b.dataset.act === 'ren-emp') {
      const nome = await pedirTexto('Renomear empresa', 'Nome', emp.nome);
      if (nome) Store.save('empresas', { id: empId, nome });
    }
    if (b.dataset.act === 'tog-emp') Store.save('empresas', { id: empId, ativo: emp.ativo === false });
    if (b.dataset.act === 'novo-prod') {
      const nome = await pedirTexto('Novo produto', 'Nome do produto', '');
      if (nome) Store.save('produtos', { empresa_id: empId, nome, palavra_chave: U.norm(nome).toUpperCase().slice(0, 9), unidades_caixa: 1, ordem: D.produtos(empId, true).length + 1, ativo: true });
    }
    render();
  }

  async function pedirTexto(title, label, val) {
    let out = null;
    const v = await U.modal({
      title, body: `<div class="f"><label>${U.esc(label)}</label><input type="text" id="pt-in" value="${U.esc(val)}"></div>`,
      buttons: [{ label: 'Cancelar', value: null }, { label: 'Salvar', cls: 'btn-primary', value: 'ok', validate: (w) => { out = w.querySelector('#pt-in').value.trim(); return true; } }],
      onOpen: (w) => { w.querySelector('#pt-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') w.querySelector('.btn-primary').click(); }); },
    });
    return v === 'ok' ? out : null;
  }

  async function novaEmpresa() {
    let dados = null;
    const v = await U.modal({
      title: 'Nova empresa representada',
      body: `<div class="fields"><div class="f s12"><label>Nome</label><input type="text" id="ne-nome"></div><div class="f s12"><label>CNPJ</label><input type="text" id="ne-cnpj"></div></div>`,
      buttons: [{ label: 'Cancelar', value: null }, { label: 'Criar', cls: 'btn-primary', value: 'ok', validate: (w) => {
        dados = { nome: w.querySelector('#ne-nome').value.trim(), cnpj: U.fmtDoc(w.querySelector('#ne-cnpj').value) };
        if (!dados.nome) { U.toast('Informe o nome', 'warn'); return false; }
        return true;
      } }],
    });
    if (v !== 'ok') return;
    Store.save('empresas', { ...dados, ativo: true });
    U.toast('Empresa criada. Adicione os produtos dela abaixo.');
    render();
  }

  function escolherArquivo(accept) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = accept;
      i.onchange = () => res(i.files[0] || null);
      i.click();
    });
  }

  async function restaurar() {
    const f = await escolherArquivo('.json,application/json');
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (e) { U.toast('Arquivo inválido', 'error'); return; }
    if (!data || !data.versao || !Array.isArray(data.pedidos)) { U.toast('Este arquivo não é um backup do Ourosaf Gestão', 'error', 5000); return; }
    const resumo = Store.TABLES.map((t) => `${t}: ${(data[t] || []).length}`).join(', ');
    const ok = await U.confirm(`Restaurar o backup de ${U.date((data.gerado_em || '').slice(0, 10))}? (${resumo}). Registros com o mesmo identificador serão substituídos pela versão do backup; nada é apagado.`, { ok: 'Restaurar' });
    if (!ok) return;
    for (const t of Store.TABLES) if (Array.isArray(data[t]) && data[t].length) Store.saveMany(t, data[t]);
    U.toast('Backup restaurado');
    setTimeout(() => location.reload(), 1500);
  }

  const SINONIMOS = {
    cnpj: ['cnpj', 'cnpj/cpf', 'cpf/cnpj', 'documento', 'cpf'],
    razao_social: ['razao social', 'razão social', 'nome/razao social', 'nome/razão social', 'nome', 'cliente', 'razao'],
    nome_fantasia: ['nome fantasia', 'fantasia'],
    ie: ['ie', 'inscricao estadual', 'inscrição estadual', 'insc. estadual'],
    vendedor: ['vendedor', 'representante', 'canal'],
    produto: ['produto'],
    cep: ['cep'],
    endereco: ['endereco', 'endereço', 'logradouro', 'rua'],
    numero: ['numero', 'número', 'nº', 'n'],
    complemento: ['complemento'],
    bairro: ['bairro'],
    cidade: ['cidade', 'municipio', 'município'],
    uf: ['uf', 'estado'],
    telefone: ['telefone', 'fone', 'celular', 'whatsapp'],
    email: ['email', 'e-mail'],
    contato: ['contato', 'comprador'],
    observacao: ['observacao', 'observação', 'obs'],
  };

  async function importarClientes() {
    const f = await escolherArquivo('.xlsx,.xls,.csv');
    if (!f) return;
    await U.loadScript('js/vendor/xlsx.full.min.js');
    let rows;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
    } catch (e) { U.toast('Não foi possível ler a planilha: ' + e.message, 'error'); return; }
    if (!rows.length) { U.toast('Planilha vazia', 'warn'); return; }
    const headers = Object.keys(rows[0]);
    const map = {};
    for (const [campo, nomes] of Object.entries(SINONIMOS)) {
      const h = headers.find((x) => nomes.includes(U.norm(x)));
      if (h) map[campo] = h;
    }
    if (!map.cnpj || !map.razao_social) { U.toast('A planilha precisa ter colunas de CNPJ e Razão social/Nome', 'error', 6000); return; }
    const novos = [], atualizados = [];
    const vistos = new Set();
    for (const r of rows) {
      const o = {};
      for (const [campo, h] of Object.entries(map)) o[campo] = String(r[h] || '').trim();
      if (!U.digits(o.cnpj) || !o.razao_social) continue;
      o.cnpj = U.fmtDoc(o.cnpj);
      o.uf = (o.uf || '').toUpperCase().slice(0, 2);
      const k = U.digits(o.cnpj) + '|' + U.norm(o.bairro);
      if (vistos.has(k)) continue;
      vistos.add(k);
      const ex = D.clientesPorCnpj(o.cnpj)[0];
      if (ex) {
        const upd = { id: ex.id };
        for (const [kk, v] of Object.entries(o)) if (v && !ex[kk]) upd[kk] = v;
        if (Object.keys(upd).length > 1) atualizados.push(upd);
      } else novos.push(o);
    }
    const ok = await U.confirm(`Encontrados ${rows.length} linhas: ${novos.length} clientes novos e ${atualizados.length} cadastros existentes com campos vazios a completar. Importar?`, { ok: 'Importar' });
    if (!ok) return;
    if (novos.length) Store.saveMany('clientes', novos);
    if (atualizados.length) Store.saveMany('clientes', atualizados);
    U.toast(`${novos.length} cliente(s) importado(s)`);
  }

  async function importarAntigo() {
    const f = await escolherArquivo('.json,application/json');
    if (!f) return;
    let old;
    try { old = JSON.parse(await f.text()); } catch (e) { U.toast('Arquivo inválido', 'error'); return; }
    if (!Migracao.isOld(old)) { U.toast('Este arquivo não parece ser o backup do sistema antigo', 'error', 5000); return; }
    const empresaId = D.empresaId();
    const prods = D.produtos(empresaId, true);
    const achar = (k) => (prods.find((p) => U.norm(p.palavra_chave + ' ' + p.nome).includes(k === 'brig' ? 'brig' : 'pudim')) || {}).id;
    if (!achar('pudim') || !achar('brig')) { U.toast('A empresa atual precisa ter os produtos Pudim e Brigadeirão', 'error', 6000); return; }
    const r = Migracao.converter(old, { empresaId, produtoId: achar });
    const jaTem = D.pedidos(empresaId).length;
    const ok = await U.confirm(`Encontrado no arquivo (${U.date((old.exported_at || '').slice(0, 10))}): ${r.clientes.length} clientes, ${r.pedidos.length} pedidos ` +
      `(${r.ignorados} linhas vazias "#N/A" ignoradas), ${r.entradas.length} entradas de estoque, ${r.acertos.length} acertos, ${r.ocorrencias.length} ocorrências. ` +
      `Data-base do estoque: ${U.date(r.config.data_base) || '—'}.` + (jaTem ? ` Já existem ${jaTem} pedidos aqui; os importados serão somados (reimportação não duplica).` : '') + ' Importar agora?',
      { ok: 'Importar', title: 'Importar sistema antigo' });
    if (!ok) return;
    if (r.unidades.pudim) Store.save('produtos', { id: achar('pudim'), unidades_caixa: r.unidades.pudim });
    if (r.unidades.brig) Store.save('produtos', { id: achar('brig'), unidades_caixa: r.unidades.brig });
    Store.saveMany('clientes', r.clientes);
    Store.saveMany('pedidos', r.pedidos);
    if (r.entradas.length) Store.saveMany('entradas', r.entradas);
    if (r.acertos.length) Store.saveMany('acertos', r.acertos);
    if (r.ocorrencias.length) Store.saveMany('ocorrencias', r.ocorrencias);
    if (r.config.data_base) Store.setConfig('estoque:' + empresaId, r.config);
    const est = D.estoque(empresaId);
    const resumo = Object.values(est).map((e) => `${e.produto.nome}: ${U.num(e.saldo)} cx`).join(' · ');
    await U.modal({
      title: 'Importação concluída',
      body: `<p><b>${r.clientes.length}</b> clientes, <b>${r.pedidos.length}</b> pedidos, <b>${r.entradas.length}</b> entradas e <b>${r.ocorrencias.length}</b> ocorrências importados.</p>
        <p>Estoque calculado: <b>${U.esc(resumo)}</b></p>${r.avisos.map((a) => `<p class="muted">${U.esc(a)}</p>`).join('')}
        ${Store.mode === 'supabase' ? '<p class="muted">O envio para a nuvem continua em segundo plano — acompanhe no rodapé da barra lateral e não feche a página até aparecer "Salvo na nuvem".</p>' : ''}`,
    });
  }

  Pages.ajustes = {
    build,
    show: render,
    onData(tables, visible) { if (visible && (tables.has('empresas') || tables.has('produtos'))) render(); },
  };
})();
