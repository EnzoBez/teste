# Ourosaf Gestão

Sistema de representação comercial da Ourosaf, usado hoje na representação da Rebeka (pudim e brigadeirão).

| Página | O que faz |
|---|---|
| **01 Clientes** | Cadastro com preenchimento automático pelo CNPJ (Receita, incluindo inscrição estadual), busca, filtros (vendedor, cidade, clientes inativos, CNPJ duplicado), histórico de compras e exportação para Excel |
| **02 Pedidos** | Digitação rápida, com busca de cliente por CNPJ ou nome e o último preço praticado já preenchido. Unidades, valor da caixa e total são calculados sozinhos. Tem rascunho automático, lista com filtros, nota editável direto na lista, Excel com as abas Pedidos e Clientes, e **importação do .zip de notas (PDF)**, que vincula cada nota ao pedido certo |
| **03 Estoque** | Saldo por produto, entradas de carga (lote, validade, nota, custo), acerto por inventário, extrato de todas as movimentações e alerta de validade |
| **04 Ocorrências** | Cancelamentos, devoluções e trocas. Para cada item você define se volta ao estoque ou se é perda |

## Como o estoque é calculado

```
saldo = estoque inicial (na data-base)
      + entradas de carga
      − saídas por nota fiscal (o pedido baixa quando recebe o número da nota)
      + retornos (ocorrências com "volta ao estoque = sim")
      − reposições enviadas em trocas
      ± acertos de inventário
```

Quando um produto não volta ao estoque (avariado, vencido), ele fica registrado como **perda** e não muda o saldo, porque a mercadoria já tinha saído na nota.
Quando se cancela um pedido que ainda não tinha nota, nada muda no estoque, porque a mercadoria nunca saiu.

## Como funciona a vinculação das notas (.zip)

O sistema lê cada DANFE em PDF (número, emissão, CNPJ do destinatário, itens, valor, prazo, se é bonificação e o nº do pedido do cliente) e compara com os pedidos **sem nota** de mesmo CNPJ:

- Nota de **bonificação** (CFOP x910 ou natureza "BONIF") só se liga a pedido do tipo Bonificação. Uma nota de venda só se liga a pedido de Venda.
- Também são comparados: quantidade de caixas, preço da caixa, valor total, prazo (ex.: "28 DDL" × "28 dias") e o nº do pedido do cliente, quando ele existe.
- Antes de gravar, aparece uma tela de conferência. Você pode trocar qualquer vínculo ou criar um pedido a partir de uma nota que não tem par.

Testado com o arquivo `notas_13.10.2026.zip`: as 23 notas foram lidas corretamente.

---

## Colocar no ar (uma vez só, cerca de 15 minutos)

Sem configuração, o sistema funciona em **modo local**: os dados ficam só no navegador onde foram digitados. Para usar no celular, no computador e no notebook com os mesmos dados, siga os passos abaixo.

### 1. Criar o banco de dados (Supabase, gratuito)
1. Crie uma conta em <https://supabase.com> e clique em **New project**. Escolha a região **South America (São Paulo)** e guarde a senha do banco.
2. No menu da esquerda, abra **SQL Editor**, cole todo o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**.
3. Em **Authentication → Users → Add user → Create new user**, crie o seu login (e-mail e senha) e marque **Auto Confirm User**.
4. Em **Authentication → Sign In / Providers**, **desative "Allow new users to sign up"**. Assim, ninguém mais consegue criar conta no seu sistema.
5. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.

### 2. Ligar o site ao banco
Abra `js/config.js` e preencha:
```js
window.OUROSAF_CONFIG = {
  supabaseUrl: 'https://SEU-PROJETO.supabase.co',
  supabaseKey: 'eyJ...a chave anon public...',
};
```
A chave *anon* foi feita para ficar no site. Quem protege os dados é o login, junto com as regras de acesso do `schema.sql`: cada usuário só enxerga os próprios registros.

### 3. Publicar o site
Escolha uma das opções:
- **Netlify (mais simples):** em <https://app.netlify.com/drop>, arraste a pasta do projeto. Você recebe um endereço na hora.
- **GitHub Pages:** em *Settings → Pages* do repositório, escolha a branch e a pasta `/ (root)`. No plano gratuito, o repositório precisa ser público. Isso não expõe nenhum dado, porque os dados ficam no Supabase, atrás do login.

Depois, abra o endereço no celular e use **Adicionar à tela inicial** para ele funcionar como um aplicativo.

### Testar no próprio computador
Basta abrir o `index.html` com dois cliques. Se o navegador bloquear algo, rode `python3 -m http.server` na pasta e acesse <http://localhost:8000>.

---

## Estrutura

```
index.html            página única (as 4 telas + ajustes)
css/app.css           visual (paleta #F7F0BA #E0DBA4 #A9CBA6 #7EBEA3 #53A08E)
js/config.js          chaves do Supabase
js/store.js           dados: memória + nuvem/IndexedDB, fila offline
js/domain.js          regras de negócio (estoque, preços, consulta CNPJ)
js/nfe.js             leitura dos PDFs e vinculação nota × pedido
js/excel.js           exportações .xlsx
js/pages/*.js         uma página por arquivo
js/vendor/            bibliotecas (Supabase, PDF.js, JSZip, SheetJS), salvas no projeto, sem depender de CDN
supabase/schema.sql   criação do banco
```

## Backup
O menu **Ajustes e backup** baixa um arquivo `.json` com todos os dados e também restaura um backup. Mesmo usando a nuvem, vale baixar um backup por semana.
