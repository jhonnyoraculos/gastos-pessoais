# Gastos Pessoais (Node + Express + Postgres + Render)

Aplicacao full-stack de controle de gastos pessoais com dashboard dark, CRUD completo e calculo por mes (`YYYY-MM`).

## Stack

- Node.js 20+
- Express
- PostgreSQL (Render Postgres)
- Front-end vanilla (`HTML/CSS/JS`)
- Chart.js

## Funcionalidades

- Onboarding no primeiro acesso para configurar salario.
- Dashboard mensal com:
  - Salario total (salario liquido + renda extra)
  - Gasto do mes
  - Ganhos do mes (lancamentos de receita)
  - Percentual do salario gasto
  - Sobra estimada
  - Saldo real (salario + ganhos - gastos)
  - Orcamento e saldo do orcamento
  - Graficos por tipo, categoria, serie diaria e serie mensal (ultimos 12 meses)
  - Ultimos 10 gastos com editar/excluir
- Pagina de lancamentos com CRUD de gastos e ganhos, filtros, busca e carregamento incremental.
- Pagina de configuracoes com:
  - Salario padrao
  - Salario por mes (override por `YYYY-MM`)
  - Renda extra
  - Dia de pagamento
  - Orcamento mensal
- API REST em `/api/*` com validacao e SQL parametrizado.
- Migrations automaticas no start.

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
  routes/incomes.js
  routes/categories.js
  routes/settings.js
  routes/monthlyIncome.js
  utils/validators.js
db/
  migrations/001_init.sql
  migrations/002_monthly_income.sql
  migrations/003_incomes.sql
package.json
render.yaml
README.md
```

## Rodar local

1. Instale dependencias:

```bash
npm install
```

2. Defina `DATABASE_URL` para seu Postgres.

Exemplo PowerShell:

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/gastos_pessoais"
$env:PORT="3000"
```

3. Rode migrations:

```bash
npm run migrate
```

4. Suba a aplicacao:

```bash
npm start
```

5. Acesse:

- `http://localhost:3000`

## Deploy no Render (Blueprint)

O arquivo `render.yaml` cria:

- 1 Web Service Node (`gastos-pessoais-app`)
- 1 Postgres (`gastos-pessoais-db`)
- `DATABASE_URL` ligado ao Postgres
- Start com migration (`npm run migrate && node src/server.js`)

Passos:

1. Suba o projeto no GitHub.
2. No Render, clique em `New` -> `Blueprint`.
3. Selecione o repositorio com `render.yaml`.
4. Confirme os recursos.
5. Aguarde o deploy.

## Variaveis de ambiente

- `DATABASE_URL` (obrigatoria)
- `PORT` (opcional)
- `NODE_ENV=production` (recomendado)

## API REST

### Health

- `GET /api/health`

### Settings

- `GET /api/settings`
- `PUT /api/settings`
  - body parcial/completo:
    - `net_salary`
    - `extra_income`
    - `payday_day` (1..28)
    - `monthly_budget`

### Monthly Income (salario por mes)

- `GET /api/monthly-income?month=YYYY-MM`
  - retorna um registro de mes (`exists: true`) ou fallback vazio (`exists: false`)
- `GET /api/monthly-income`
  - lista registros mais recentes
- `PUT /api/monthly-income/:month`
  - body:
    - `net_salary`
    - `extra_income`
- `DELETE /api/monthly-income/:month`

### Categories

- `GET /api/categories`
- `POST /api/categories`
  - body:
    - `name` (unico)

### Expenses

- `GET /api/expenses?month=YYYY-MM&category=&type=&q=&limit=&offset=`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`

### Incomes (ganhos)

- `GET /api/incomes?month=YYYY-MM&category=&method=&q=&limit=&offset=`
- `POST /api/incomes`
- `PUT /api/incomes/:id`
- `DELETE /api/incomes/:id`

### Dashboard

- `GET /api/dashboard?month=YYYY-MM&type=&category=`
  - retorna payload para render com:
    - `income_source` (`default` ou `monthly`)
    - `totals`
    - `by_type`
    - `by_category`
    - `daily_series`
    - `monthly_series`
    - `latest_expenses`

## Seguranca

- `helmet`
- `express-rate-limit`
- SQL parametrizado
- Validacao de payload/query
- Erros JSON padrao: `{ "error": "mensagem" }`
