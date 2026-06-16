import { defineStore } from 'pinia';
import router from '../router';
import api from '../api';

const roleMap = {
  admin: { name: '管理员', home: '/dashboard' },
  merchant: { name: '商户', home: '/merchant/orders' },
  customer: { name: '顾客', home: '/customer/coupons' },
  service: { name: '客服', home: '/service/plate' },
  booth: { name: '岗亭', home: '/booth/verify' }
};

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '',
    user: null,
    roleInfo: null
  }),
  getters: {
    isLoggedIn: (s) => !!s.token && !!s.user,
    role: (s) => s.user?.role,
    userName: (s) => s.user?.name || s.user?.username
  },
  actions: {
    async login(payload) {
      const res = await api.auth.login(payload);
      this.token = res.token;
      this.user = res.user;
      this.roleInfo = roleMap[res.user.role];
      localStorage.setItem('parking_token', res.token);
      localStorage.setItem('parking_user', JSON.stringify(res.user));
      this.redirectHome();
      return res;
    },
    initFromStorage() {
      const t = localStorage.getItem('parking_token');
      const u = localStorage.getItem('parking_user');
      if (t && u) {
        this.token = t;
        this.user = JSON.parse(u);
        this.roleInfo = roleMap[this.user.role];
      }
    },
    redirectHome() {
      const home = this.roleInfo?.home || '/login';
      router.push(home);
    },
    logout() {
      this.token = '';
      this.user = null;
      this.roleInfo = null;
      localStorage.removeItem('parking_token');
      localStorage.removeItem('parking_user');
      router.push('/login');
    }
  }
});
