const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const { initTables } = require('./db/schema');
const { error: errResp } = require('./utils/response');

initTables();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

app.use((req, _res, next) => {
  req.requestId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/merchant', require('./routes/merchant'));
app.use('/api/customer', require('./routes/customer'));
app.use('/api/service', require('./routes/service'));
app.use('/api/booth', require('./routes/booth'));
app.use('/api', require('./routes/dashboard'));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/*', (_req, res) => {
  res.status(404).json(errResp('接口不存在', 404));
});

app.use((err, req, res, _next) => {
  console.error(`[${req.requestId}]`, err);
  res.status(500).json(errResp(err.message || '服务器内部错误', 500));
});

app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════════════╗
  ║   商场停车优惠券系统 - 后端服务已启动           ║
  ║   服务地址: http://localhost:${PORT}             ║
  ║   健康检查: http://localhost:${PORT}/api/health  ║
  ╚════════════════════════════════════════════════╝
  `);
});

module.exports = app;
