<template>
  <el-container style="height:100vh;">
    <el-aside width="220px" class="aside">
      <div class="logo">
        <span style="font-size:24px;">🅿️</span>
        <div>
          <div class="logo-title">停车优惠券</div>
          <div class="logo-sub">{{ roleInfo?.name || '系统' }}</div>
        </div>
      </div>
      <el-menu
        :default-active="$route.path"
        router
        background-color="transparent"
        text-color="#d1d5db"
        active-text-color="#ffffff"
        :collapse="false"
      >
        <el-menu-item
          v-for="m in menus"
          :key="m.path"
          :index="m.path"
          class="menu-item"
        >
          <el-icon><component :is="m.icon" /></el-icon>
          <template #title>{{ m.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="crumbs">
          <el-icon><Location /></el-icon>
          <span>{{ $route.meta?.title || '首页' }}</span>
        </div>
        <div class="header-right">
          <el-tooltip content="刷新数据">
            <el-button circle :icon="Refresh" @click="$router.go(0)" />
          </el-tooltip>
          <el-dropdown>
            <div class="user-info">
              <el-avatar :size="32" style="background:#3b82f6;">{{ avatarText }}</el-avatar>
              <div class="user-text">
                <div class="user-name">{{ userName }}</div>
                <div class="user-role">{{ roleInfo?.name }}</div>
              </div>
              <el-icon><CaretBottom /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>账号：{{ user?.username }}</el-dropdown-item>
                <el-dropdown-item divided @click="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useUserStore } from '../stores/user';
import {
  Location, Refresh, CaretBottom, SwitchButton,
  ShoppingCart, Ticket, Wallet,
  User, CreditCard, Van,
  Search, Check, Document, Connection,
  Camera, Promotion, Upload, List,
  DataAnalysis, PieChart
} from '@element-plus/icons-vue';

const userStore = useUserStore();
const user = computed(() => userStore.user);
const userName = computed(() => userStore.userName);
const roleInfo = computed(() => userStore.roleInfo);
const avatarText = computed(() => (userName.value || 'U').slice(0, 1));

const menuMap = {
  admin: [
    { path: '/dashboard', title: '运营大屏', icon: DataAnalysis },
    { path: '/reconciliation', title: '对账看板', icon: PieChart }
  ],
  merchant: [
    { path: '/merchant/orders', title: '消费订单', icon: ShoppingCart },
    { path: '/merchant/coupons', title: '优惠券', icon: Ticket },
    { path: '/merchant/quota', title: '额度管理', icon: Wallet }
  ],
  customer: [
    { path: '/customer/coupons', title: '我的优惠券', icon: Ticket },
    { path: '/customer/plates', title: '车牌管理', icon: CreditCard },
    { path: '/customer/parking', title: '出场状态', icon: Van }
  ],
  service: [
    { path: '/service/plate', title: '车牌查询', icon: Search },
    { path: '/service/releases', title: '放行审批', icon: Check },
    { path: '/service/approvals', title: '异常审批', icon: Document },
    { path: '/service/trace', title: '全链路追踪', icon: Connection }
  ],
  booth: [
    { path: '/booth/verify', title: '出场核验', icon: Camera },
    { path: '/booth/release', title: '人工放行', icon: Promotion },
    { path: '/booth/offline', title: '离线补录', icon: Upload },
    { path: '/booth/recent', title: '核验记录', icon: List }
  ]
};

const menus = computed(() => menuMap[user.value?.role] || []);

function logout() {
  userStore.logout();
}
</script>

<style scoped>
.aside {
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  color: white;
  display: flex;
  flex-direction: column;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 20px 16px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.logo-title {
  font-size: 16px;
  font-weight: 700;
}
.logo-sub {
  font-size: 12px;
  opacity: .6;
}
.menu-item {
  border-radius: 8px;
  margin: 4px 8px;
}
:deep(.el-menu-item.is-active) {
  background: linear-gradient(90deg, #3b82f6, #8b5cf6) !important;
  color: white !important;
}
:deep(.el-menu) {
  border-right: none !important;
  padding: 8px 0;
}
.header {
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #e5e7eb;
  height: 60px;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;
  font-size: 14px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .2s;
}
.user-info:hover {
  background: #f3f4f6;
}
.user-text {
  line-height: 1.2;
}
.user-name {
  font-size: 14px;
  font-weight: 500;
}
.user-role {
  font-size: 11px;
  color: #9ca3af;
}
.main {
  background: #f0f2f5;
  padding: 20px;
  overflow: auto;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity .2s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
