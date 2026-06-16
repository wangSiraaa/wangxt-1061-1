const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'parking_coupon_secret_2026';
const TOKEN_EXPIRES_IN = '24h';

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

function authMiddleware(requiredRoles) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ code: 401, message: '未提供认证令牌' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ code: 401, message: '令牌无效或已过期' });
    }

    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(decoded.role)) {
      return res.status(403).json({ code: 403, message: '无权限执行此操作' });
    }

    req.user = decoded;
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  authMiddleware
};
