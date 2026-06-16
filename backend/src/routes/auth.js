const express = require('express');
const db = require('../db/index');
const { verifyPassword, generateToken } = require('../utils/auth');
const { success, error } = require('../utils/response');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json(error('用户名和密码不能为空'));
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.json(error('用户不存在', 404));
  }

  if (!verifyPassword(password, user.password)) {
    return res.json(error('密码错误'));
  }

  const token = generateToken({
    id: user.id,
    username: user.username,
    role: user.role,
    name: user.name,
    phone: user.phone,
    shop_id: user.shop_id
  });

  db.prepare('INSERT INTO audit_logs (user_id, user_role, action, module) VALUES (?, ?, ?, ?)')
    .run(user.id, user.role, 'login', 'auth');

  res.json(success({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      phone: user.phone,
      shop_id: user.shop_id
    }
  }, '登录成功'));
});

router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const decoded = token ? require('../utils/auth').verifyToken(token) : null;

  if (!decoded) {
    return res.status(401).json(error('未登录', 401));
  }

  const user = db.prepare('SELECT id, username, role, name, phone, shop_id FROM users WHERE id = ?').get(decoded.id);
  res.json(success(user));
});

module.exports = router;
