const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const dashboardRoutes = require('./routes/dashboard');
const expensesRoutes = require('./routes/expenses');
const categoriesRoutes = require('./routes/categories');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const publicDir = path.join(__dirname, '../public');

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(publicDir));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/api/settings', settingsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Rota nao encontrada.' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.get('/gastos', (req, res) => {
  res.sendFile(path.join(publicDir, 'gastos.html'));
});

app.get('/config', (req, res) => {
  res.sendFile(path.join(publicDir, 'config.html'));
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) {
    return next(error);
  }
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
