const dayjs = require('dayjs');
const { v4: uuidv4 } = require('uuid');

function success(data = null, message = '操作成功') {
  return { code: 200, data, message, timestamp: Date.now() };
}

function error(message = '操作失败', code = 400, data = null) {
  return { code, data, message, timestamp: Date.now() };
}

function generateNo(prefix = '') {
  const timestamp = dayjs().format('YYYYMMDDHHmmss');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}${timestamp}${rand}`;
}

function formatDateTime(date) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
}

function isValidPlate(plate) {
  return /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9]{4,5}[A-Z0-9挂学警港澳]$/.test(plate);
}

function calculateParkingFee(inTime, ratePerHour = 10) {
  const inT = dayjs(inTime);
  const now = dayjs();
  const hours = Math.max(0, now.diff(inT, 'hour', true));
  const roundedHours = Math.ceil(hours * 2) / 2;
  return {
    hours: roundedHours,
    fee: Number((roundedHours * ratePerHour).toFixed(2))
  };
}

function parseBoolean(val) {
  if (typeof val === 'boolean') return val;
  return ['1', 'true', 'yes', 'on'].includes(String(val).toLowerCase());
}

module.exports = {
  success,
  error,
  generateNo,
  formatDateTime,
  isValidPlate,
  calculateParkingFee,
  parseBoolean,
  dayjs
};
