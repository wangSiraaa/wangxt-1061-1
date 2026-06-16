<template>
  <div class="login-page card-shadow" style="width:420px;padding:32px;background:white;border-radius:12px;">
    <h2 style="text-align:center;margin:0 0 24px;color:#1f2937;">登录系统</h2>
    <el-form :model="form" label-width="0" @submit.prevent="submit">
      <el-form-item>
        <el-input v-model="form.username" placeholder="请输入用户名" size="large" :prefix-icon="User" />
      </el-form-item>
      <el-form-item>
        <el-input v-model="form.password" type="password" placeholder="请输入密码" size="large" :prefix-icon="Lock" show-password @keyup.enter="submit" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="submit">登 录</el-button>
      </el-form-item>
    </el-form>
    <el-divider>快速登录</el-divider>
    <div class="quick-login">
      <el-tag
        v-for="a in accounts"
        :key="a.username"
        size="large"
        class="quick-tag"
        effect="plain"
        @click="quickLogin(a)"
      >
        {{ a.name }}
      </el-tag>
    </div>
    <p class="tips">点击上方角色标签可快速登录体验，正式环境请使用个人账号</p>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useUserStore } from '../stores/user';
import { ElMessage } from 'element-plus';
import { User, Lock } from '@element-plus/icons-vue';

const userStore = useUserStore();
const loading = ref(false);
const form = reactive({ username: '', password: '' });

const accounts = [
  { name: '🛍️ 商户(星巴克)', username: 'merchant_sh001', password: '123456' },
  { name: '🍲 商户(海底捞)', username: 'merchant_sh002', password: '123456' },
  { name: '👤 顾客', username: 'customer01', password: '123456' },
  { name: '🎧 客服', username: 'service01', password: '123456' },
  { name: '🚧 岗亭(北1)', username: 'booth_n1', password: '123456' },
  { name: '⚙️ 管理员', username: 'admin', password: 'admin123' }
];

function quickLogin(a) {
  form.username = a.username;
  form.password = a.password;
  submit();
}

async function submit() {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码');
    return;
  }
  loading.value = true;
  try {
    await userStore.login({ ...form });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.quick-login {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.quick-tag {
  cursor: pointer;
  user-select: none;
  transition: all .2s;
}
.quick-tag:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59,130,246,.3);
}
.tips {
  margin: 16px 0 0;
  text-align: center;
  font-size: 12px;
  color: #9ca3af;
}
</style>
