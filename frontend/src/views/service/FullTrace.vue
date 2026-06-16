<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🔗 全链路追踪（按车牌还原处理链路）</h2>
      <div class="flex-row">
        <el-input v-model="plate" placeholder="输入车牌号追溯，如 京A12345" size="large" style="width:300px;text-transform:uppercase;letter-spacing:2px;" clearable @keyup.enter="load" />
        <el-button type="primary" size="large" @click="load" :icon="Search" :loading="loading">追溯链路</el-button>
        <el-tag v-for="p in quick" :key="p" size="large" class="quick-tag" effect="plain" @click="setPlate(p)">{{ p }}</el-tag>
      </div>
    </div>

    <div class="card-shadow" style="padding:20px;">
      <el-steps v-if="!list.length && !loading" finish-status="success" active="0" style="margin-bottom:24px;">
        <el-step title="消费下单" description="商户门店产生消费订单" />
        <el-step title="发券校验" description="后端校验：金额达标、一单一券、额度充足" />
        <el-step title="车牌绑定" description="顾客绑定车牌并关联优惠券（入场后方可绑）" />
        <el-step title="岗亭核验" description="自动识别车牌并核销优惠券" />
        <el-step title="异常放行" description="如遇问题，走客服或岗亭人工放行流程" />
      </el-steps>

      <el-timeline v-if="list.length" style="padding:8px 0;">
        <el-timeline-item
          v-for="(t,i) in list" :key="i"
          :timestamp="t.time"
          :type="iconMap[t.type]?.type || 'primary'"
          :icon="iconMap[t.type]?.icon"
          size="large"
          hollow
        >
          <el-card class="trace-card" shadow="hover">
            <div class="trace-title">
              <span class="trace-action" :class="t.action?.toLowerCase()">{{ t.action || t.type }}</span>
              <el-tag size="small" :type="iconMap[t.type]?.type || 'info'">{{ category(t.type) }}</el-tag>
            </div>
            <div class="trace-main">
              <h4 style="margin:0 0 8px;">{{ t.title }}</h4>
              <p v-if="t.no" style="margin:4px 0;"><b>单号：</b><code>{{ t.no }}</code></p>
              <p v-if="t.sub" style="margin:4px 0;color:#4b5563;">{{ t.sub }}</p>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>

      <el-empty v-if="!list.length && !loading" description="请输入车牌号追溯完整处理链路，将展示：消费→发券→绑定→核验→放行等所有记录" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, markRaw } from 'vue';
import api from '@/api';
import { ElMessage } from 'element-plus';
import { Search, ShoppingCart, Ticket, Link, Camera, Promotion, Warning, Check, Close } from '@element-plus/icons-vue';

const plate = ref('京A12345');
const list = ref([]);
const loading = ref(false);
const quick = ['京A12345', '京B67890'];

const iconMap = {
  coupon: { type: 'warning', icon: markRaw(Ticket) },
  revocation: { type: 'info', icon: markRaw(Close) },
  verification: { type: 'success', icon: markRaw(Camera) },
  release: { type: 'danger', icon: markRaw(Promotion) },
  approval: { type: 'warning', icon: markRaw(Warning) },
  bind_coupon: { type: 'primary', icon: markRaw(Link) },
  order: { type: 'primary', icon: markRaw(ShoppingCart) },
  bind: { type: 'primary', icon: markRaw(Link) },
  verify: { type: 'success', icon: markRaw(Check) }
};

const cats = {
  coupon: '优惠券', revocation: '撤销', verification: '岗亭核验', release: '人工放行',
  approval: '审批', bind_coupon: '绑定', order: '消费', bind: '绑定', verify: '核验'
};
const category = (t) => cats[t] || t;

function setPlate(p) { plate.value = p; load(); }

async function load() {
  if (!plate.value) { ElMessage.warning('请输入车牌号'); return; }
  loading.value = true;
  try {
    list.value = await api.service.fullTrace(plate.value.trim().toUpperCase());
  } finally { loading.value = false; }
}

onMounted(load);
</script>

<style scoped>
.quick-tag { cursor: pointer; }
.trace-card { border-radius: 8px; }
.trace-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.trace-action {
  padding: 2px 8px;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}
.trace-action.success { background: #dcfce7; color: #15803d; }
.trace-action.bound { background: #dbeafe; color: #1d4ed8; }
.trace-action.verified { background: #dcfce7; color: #15803d; }
.trace-action.待审批 { background: #fef3c7; color: #a16207; }
.trace-action.审批通过 { background: #dcfce7; color: #15803d; }
.trace-action.审批驳回 { background: #fee2e2; color: #b91c1c; }
.trace-main h4 { color: #1f2937; }
</style>
