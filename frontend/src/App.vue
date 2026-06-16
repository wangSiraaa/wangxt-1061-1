<template>
  <router-view v-if="!isLoginPage" />
  <div v-else id="login-layout">
    <div class="login-header">
      <h1>🏬 商场停车优惠券系统</h1>
      <p>商户 · 顾客 · 客服 · 岗亭 全链路协同平台</p>
    </div>
    <router-view />
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElNotification } from 'element-plus';
import { useUserStore } from './stores/user';

const route = useRoute();
const userStore = useUserStore();
const isLoginPage = computed(() => route.path === '/login');

onMounted(() => {
  userStore.initFromStorage();
  if (['/login', '/'].includes(route.path) && userStore.token) {
    userStore.redirectHome();
  }
});
</script>

<style>
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #f0f2f5;
}
#login-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-header {
  text-align: center;
  color: white;
  margin-bottom: 40px;
}
.login-header h1 {
  font-size: 36px;
  margin: 0 0 12px;
}
.login-header p {
  opacity: .85;
  margin: 0;
  font-size: 16px;
}
</style>
