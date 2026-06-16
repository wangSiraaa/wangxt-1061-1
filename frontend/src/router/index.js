import { createRouter, createWebHashHistory } from 'vue-router';
import { useUserStore } from '../stores/user';

const roleRoutes = {
  admin: [
    { path: '/dashboard', component: () => import('../views/dashboard/Index.vue'), meta: { title: '运营大屏看板' } },
    { path: '/reconciliation', component: () => import('../views/dashboard/Reconciliation.vue'), meta: { title: '对账看板' } }
  ],
  merchant: [
    { path: '/merchant/orders', component: () => import('../views/merchant/Orders.vue'), meta: { title: '消费订单' } },
    { path: '/merchant/coupons', component: () => import('../views/merchant/Coupons.vue'), meta: { title: '优惠券管理' } },
    { path: '/merchant/quota', component: () => import('../views/merchant/Quota.vue'), meta: { title: '额度管理' } }
  ],
  customer: [
    { path: '/customer/coupons', component: () => import('../views/customer/Coupons.vue'), meta: { title: '我的优惠券' } },
    { path: '/customer/plates', component: () => import('../views/customer/Plates.vue'), meta: { title: '车牌管理' } },
    { path: '/customer/parking', component: () => import('../views/customer/Parking.vue'), meta: { title: '出场状态' } }
  ],
  service: [
    { path: '/service/plate', component: () => import('../views/service/PlateQuery.vue'), meta: { title: '车牌查询' } },
    { path: '/service/releases', component: () => import('../views/service/Releases.vue'), meta: { title: '人工放行审批' } },
    { path: '/service/approvals', component: () => import('../views/service/Approvals.vue'), meta: { title: '异常审批' } },
    { path: '/service/trace', component: () => import('../views/service/FullTrace.vue'), meta: { title: '全链路追踪' } }
  ],
  booth: [
    { path: '/booth/verify', component: () => import('../views/booth/Verify.vue'), meta: { title: '出场核验' } },
    { path: '/booth/release', component: () => import('../views/booth/Release.vue'), meta: { title: '人工放行' } },
    { path: '/booth/offline', component: () => import('../views/booth/Offline.vue'), meta: { title: '离线补录' } },
    { path: '/booth/recent', component: () => import('../views/booth/Recent.vue'), meta: { title: '核验记录' } }
  ]
};

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: () => import('../views/Login.vue'), meta: { title: '登录' } },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    meta: { requiresAuth: true },
    children: [
      ...Object.values(roleRoutes).flat(),
      { path: '/:pathMatch(.*)*', redirect: '/login' }
    ]
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore();
  userStore.initFromStorage();

  document.title = (to.meta?.title ? `${to.meta.title} - ` : '') + '商场停车优惠券系统';

  if (to.path === '/login') {
    if (userStore.isLoggedIn) {
      return next(userStore.roleInfo?.home || '/login');
    }
    return next();
  }

  if (!userStore.isLoggedIn) {
    return next('/login');
  }

  const allowedPaths = roleRoutes[userStore.role]?.map(r => r.path) || [];
  const isAllowed = allowedPaths.some(p => to.path === p || to.path.startsWith(p + '/'));
  if (!isAllowed && userStore.roleInfo?.home) {
    return next(userStore.roleInfo.home);
  }

  next();
});

export default router;
