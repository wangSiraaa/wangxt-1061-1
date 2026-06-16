import axios from 'axios';
import { ElMessage } from 'element-plus';

const request = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json'
  }
});

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('parking_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

request.interceptors.response.use(
  (res) => {
    const data = res.data;
    if (data && data.code === 200) {
      if (data.message) {
        ElMessage.success(data.message);
      }
      return data.data;
    } else if (data && data.code === 401) {
      localStorage.removeItem('parking_token');
      localStorage.removeItem('parking_user');
      if (!location.hash.includes('/login')) {
        ElMessage.error(data.message || '登录已过期');
        location.hash = '#/login';
      }
      return Promise.reject(data);
    } else if (data && data.code === 403) {
      ElMessage.error(data.message || '无权限');
      return Promise.reject(data);
    } else {
      ElMessage.error(data?.message || '操作失败');
      return Promise.reject(data);
    }
  },
  (err) => {
    const msg = err?.response?.data?.message || err.message || '网络错误';
    ElMessage.error(msg);
    return Promise.reject(err);
  }
);

const api = {
  auth: {
    login: (data) => request.post('/auth/login', data),
    me: () => request.get('/auth/me')
  },
  merchant: {
    getQuota: () => request.get('/merchant/shop/quota'),
    getShops: () => request.get('/merchant/shops'),
    getOrders: (params) => request.get('/merchant/orders', { params }),
    getOrder: (id) => request.get(`/merchant/orders/${id}`),
    issueCoupon: (data) => request.post('/merchant/issue-coupon', data),
    getCoupons: (params) => request.get('/merchant/coupons', { params }),
    getCoupon: (id) => request.get(`/merchant/coupons/${id}`),
    revokeCoupon: (data) => request.post('/merchant/revoke-coupon', data),
    getMonthlyQuotas: (params) => request.get('/merchant/monthly-quotas', { params }),
    adjustMonthlyQuota: (data) => request.post('/merchant/monthly-quotas/adjust', data),
    getBudgetHint: (params) => request.get('/merchant/budget-hint', { params })
  },
  customer: {
    getPlates: () => request.get('/customer/my-plates'),
    bindPlate: (data) => request.post('/customer/bind-plate', data),
    rebindPlate: (data) => request.post('/customer/rebind-plate', data),
    rebindCheck: (data) => request.post('/customer/rebind-check', data),
    bindCoupon: (data) => request.post('/customer/bind-coupon', data),
    getCoupons: (params) => request.get('/customer/my-coupons', { params }),
    getParkingStatus: () => request.get('/customer/parking-status')
  },
  service: {
    getPlateInfo: (plate) => request.get(`/service/plate-info/${plate}`),
    fullTrace: (plate) => request.get(`/service/full-trace/${plate}`),
    manualRelease: (data) => request.post('/service/manual-release', data),
    approveRelease: (data) => request.post('/service/approve-release', data),
    getReleases: (params) => request.get('/service/releases', { params }),
    createApproval: (data) => request.post('/service/exception-approval', data),
    getApprovals: (params) => request.get('/service/approvals', { params }),
    approveException: (data) => request.post('/service/approve-exception', data)
  },
  booth: {
    verifyExit: (data) => request.post('/booth/verify-exit', data),
    boothRelease: (data) => request.post('/booth/booth-release', data),
    registerIn: (data) => request.post('/booth/register-in', data),
    offlineSync: (data) => request.post('/booth/offline-sync', data),
    getRecent: () => request.get('/booth/recent-verifications')
  },
  dashboard: {
    summary: () => request.get('/dashboard/summary'),
    shopRanking: () => request.get('/dashboard/shop-ranking'),
    hourlyExit: () => request.get('/dashboard/hourly-exit'),
    couponStatus: () => request.get('/dashboard/coupon-status'),
    plateStatus: () => request.get('/dashboard/plate-status'),
    reconciliation: (params) => request.get('/dashboard/reconciliation', { params }),
    exitStatus: () => request.get('/dashboard/exit-status'),
    monthlyReconciliation: (params) => request.get('/dashboard/monthly-reconciliation', { params }),
    exceptionExits: (params) => request.get('/dashboard/exception-exits', { params }),
    retroVerifications: (params) => request.get('/dashboard/retro-verifications', { params })
  }
};

export default api;
export { request };
