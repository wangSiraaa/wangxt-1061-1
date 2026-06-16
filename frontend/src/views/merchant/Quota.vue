<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">💰 店铺额度管理</h2>
    </div>

    <div v-if="shop" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;">
      <div class="card-shadow" style="padding:24px;">
        <h3 style="margin:0 0 8px;">🏬 店铺信息</h3>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">门店基础档案与发券规则</div>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="门店名称">{{ shop.shop_name }}</el-descriptions-item>
          <el-descriptions-item label="门店编码">{{ shop.shop_code }}</el-descriptions-item>
          <el-descriptions-item label="所在楼层">{{ shop.floor }}</el-descriptions-item>
          <el-descriptions-item label="联系电话">{{ shop.contact }}</el-descriptions-item>
          <el-descriptions-item label="发券门槛">单笔消费满 <b class="text-danger">¥{{ shop.min_amount }}</b></el-descriptions-item>
          <el-descriptions-item label="赠送权益"><b class="text-success">免费停车 {{ shop.discount_hours }} 小时</b></el-descriptions-item>
        </el-descriptions>
      </div>

      <div class="card-shadow" style="padding:24px;">
        <h3 style="margin:0 0 8px;">📊 额度使用情况</h3>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">按自然月计算累计消费额度</div>
        <div class="quota-display">
          <div class="quota-item">
            <div class="quota-label">总额度</div>
            <div class="quota-value text-info">¥{{ Number(shop.coupon_quota).toLocaleString() }}</div>
          </div>
          <div class="quota-item">
            <div class="quota-label">已使用</div>
            <div class="quota-value text-danger">¥{{ Number(shop.coupon_used).toLocaleString() }}</div>
          </div>
          <div class="quota-item">
            <div class="quota-label">剩余额度</div>
            <div class="quota-value text-success">¥{{ Number(shop.quota_remain).toLocaleString() }}</div>
          </div>
        </div>
        <div style="margin-top:20px;">
          <el-progress :percentage="percent" :color="progressColor" :stroke-width="18" />
          <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:#6b7280;">
            <span>使用率 {{ percent }}%</span>
            <span v-if="percent < 80" class="text-success">额度充足</span>
            <span v-else-if="percent < 100" class="text-warning">额度紧张</span>
            <span v-else class="text-danger">已用完</span>
          </div>
        </div>
      </div>

      <div class="card-shadow" style="padding:24px;">
        <h3 style="margin:0 0 8px;">📋 额度说明</h3>
        <el-timeline style="margin-top:12px;">
          <el-timeline-item
            v-for="(r,i) in rules" :key="i"
            :timestamp="r.time"
            :type="r.type"
            :hollow="r.hollow"
          >{{ r.text }}</el-timeline-item>
        </el-timeline>
      </div>
    </div>

    <div class="card-shadow" style="margin-top:20px;padding:20px;">
      <h3 style="margin:0 0 12px;">📈 近期发券记录</h3>
      <el-table :data="recentCoupons" size="small" stripe>
        <el-table-column prop="coupon_no" label="券号" width="200" />
        <el-table-column prop="order_no" label="关联订单" width="180" />
        <el-table-column prop="customer_phone" label="客户" width="130" />
        <el-table-column label="金额" width="100">
          <template #default="{row}">¥{{ row.order_amount }}</template>
        </el-table-column>
        <el-table-column label="权益" width="100">
          <template #default="{row}">{{ row.discount_hours }}小时</template>
        </el-table-column>
        <el-table-column prop="plate_no" label="绑定车牌" width="120" />
        <el-table-column prop="issued_at" label="发券时间" width="160" />
        <el-table-column label="状态" width="90">
          <template #default="{row}">
            <el-tag size="small" :type="tagType(row.status)">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue';
import api from '@/api';

const shop = ref(null);
const recentCoupons = ref([]);

const percent = computed(() => {
  if (!shop.value || !shop.value.coupon_quota) return 0;
  return Math.min(100, Math.round((shop.value.coupon_used / shop.value.coupon_quota) * 100));
});

const progressColor = computed(() => {
  if (percent.value < 60) return '#10b981';
  if (percent.value < 85) return '#f59e0b';
  return '#ef4444';
});

const tagType = (s) => ({
  issued: 'warning', bound: 'primary', verified: 'success', revoked: 'info', expired: 'danger'
}[s] || 'info');

const rules = [
  { text: '单笔消费不足门槛金额无法发券（由后端硬校验）', type: 'warning', hollow: false, time: '规则1' },
  { text: '同一订单只能发一张优惠券，重复操作被拦截', type: 'danger', hollow: false, time: '规则2' },
  { text: '车辆出场后，绑定的优惠券无法再被撤销', type: 'primary', hollow: false, time: '规则3' },
  { text: '发券金额计入门店额度，超额无法继续发券', type: 'success', hollow: false, time: '规则4' }
];

async function load() {
  shop.value = await api.merchant.getQuota();
  recentCoupons.value = await api.merchant.getCoupons();
}

onMounted(load);
</script>

<style scoped>
.quota-display {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.quota-item {
  flex: 1;
  text-align: center;
  padding: 14px;
  background: #f9fafb;
  border-radius: 10px;
}
.quota-label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 4px;
}
.quota-value {
  font-size: 22px;
  font-weight: 700;
}
</style>
