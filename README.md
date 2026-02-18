# Gastos Pessoais (Node + Express + Postgres + Render)

Aplicação full-stack de controle de gastos pessoais com dashboard moderno (tema dark), CRUD completo e cálculo de indicadores financeiros por mês (`YYYY-MM`).

## Stack

- Node.js 20
- Express
- PostgreSQL (Render Postgres)
- Front-end vanilla (`HTML/CSS/JS`)
- Chart.js

## Funcionalidades

- Onboarding obrigatório no primeiro acesso para configurar salário.
- Dashboard mensal com:
  - Salário total (salário líquido + renda extra)
  - Gasto do mês
  - `% do salário` já gasto
  - Sobra estimada
  - Orçamento e saldo do orçamento
  - Gráficos por tipo/categoria e série diária
  - Últimos 10 gastos com editar/excluir
- Página de gastos com CRUD, filtros, busca e paginação (carregar mais).
- Página de configurações para salário, renda extra, dia de pagamento e orçamento.
- API REST em `/api/*` com validação e SQL parametrizado.
- Migrations automáticas no start.

## Estrutura

```text
public/
  index.html
  gastos.html
  config.html
  css/styles.css
  js/ui.js
  js/dashboard.js
  js/gastos.js
  js/config.js
src/
  server.js
  db/pool.js
  db/migrate.js
  routes/dashboard.js
  routes/expenses.js
  routes/categories.js
  routes/settings.js
  utils/validators.js
db/
  migrations/001_init.sql
package.json
render.yaml
README.md
```

## Rodar local

1. Instale dependências:

```bash
npm install
```

2. Defina `DATABASE_URL` para seu Postgres local ou remoto.

Exemplo local:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/gastos_pessoais
```

Exemplo PowerShell:

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/gastos_pessoais"
```

3. Rode migrations:

```bash
npm run migrate
```

4. Suba a aplicação:

```bash
npm start
```

5. Acesse:

- `http://localhost:3000`

## Deploy no Render (Blueprint)

O arquivo `render.yaml` já cria:

- 1 serviço web Node (`gastos-pessoais-app`)
- 1 banco Postgres (`gastos-pessoais-db`)
- `DATABASE_URL` conectado automaticamente no web service
- `startCommand` com migrations:
  - `npm run migrate && node src/server.js`

Passos:

1. Suba o projeto em um repositório Git.
2. No Render, clique em **New +** -> **Blueprint**.
3. Selecione o repositório com `render.yaml`.
4. Confirme criação dos recursos.
5. Deploy automático roda build e start com migration.

## Variáveis de ambiente

- `DATABASE_URL` (obrigatória)
- `PORT` (opcional, Render injeta automaticamente)
- `NODE_ENV=production` (recomendado)
- `NODE_VERSION=20` (definido no `render.yaml`)

## API REST

### Health

- `GET /api/health`
  - resposta: `{ "ok": true }`

### Settings

- `GET /api/settings`
- `PUT /api/settings`
  - body (parcial ou completo):
    - `net_salary`
    - `extra_income`
    - `payday_day` (1..28)
    - `monthly_budget`

### Categories

- `GET /api/categories`
- `POST /api/categories`
  - body:
    - `name` (único)

### Expenses

- `GET /api/expenses?month=YYYY-MM&category=&type=&q=&limit=&offset=`
- `POST /api/expenses`
  - body:
    - `date` (`YYYY-MM-DD`)
    - `amount`
    - `description`
    - `category_id`
    - `type` (`Essencial|Besteira|Investimento|Lazer|Outros`)
    - `method` (`Pix|Cartão|Dinheiro|Outro`)
    - `notes` (opcional)
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`

### Dashboard

- `GET /api/dashboard?month=YYYY-MM&type=&category=`
  - retorna payload pronto para render:
    - `totals`
    - `by_type` (inclui `% do salário` e `% do gasto do mês`)
    - `by_category` (top categorias)
    - `daily_series`
    - `latest_expenses`

## Segurança aplicada

- `helmet`
- `express-rate-limit`
- queries SQL parametrizadas
- validação de payload/query no backend
- tratamento de erros padronizado:
  - `{ "error": "mensagem" }`
