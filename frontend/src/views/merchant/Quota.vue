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
        <h3 style="margin:0 0 8px;">📊 总额度使用情况</h3>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">累计消费额度</div>
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
        <h3 style="margin:0 0 8px;">📅 本月额度 ({{ shop.current_month }})</h3>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">当月预算控制</div>
        <div class="quota-display">
          <div class="quota-item">
            <div class="quota-label">月度额度</div>
            <div class="quota-value text-info">¥{{ Number(shop.monthly_quota || 0).toLocaleString() }}</div>
          </div>
          <div class="quota-item">
            <div class="quota-label">本月已用</div>
            <div class="quota-value text-danger">¥{{ Number(shop.monthly_used || 0).toLocaleString() }}</div>
          </div>
          <div class="quota-item">
            <div class="quota-label">本月剩余</div>
            <div class="quota-value" :class="shop.monthly_remain > 0 ? 'text-success' : 'text-danger'">¥{{ Number(shop.monthly_remain || 0).toLocaleString() }}</div>
          </div>
        </div>
        <div style="margin-top:16px;">
          <el-progress :percentage="monthlyPercent" :color="monthlyProgressColor" :stroke-width="14" />
        </div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <el-tag type="success" size="small">全额券: ¥{{ monthlyQuota.full_coupon_used || 0 }}</el-tag>
          <el-tag type="warning" size="small">折扣券: ¥{{ monthlyQuota.discount_coupon_used || 0 }}</el-tag>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-top:20px;">
      <div class="card-shadow" style="padding:24px;">
        <h3 style="margin:0 0 8px;">🎯 发券预算提示</h3>
        <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">发券前自动检测本月额度是否足够</div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">
          <span style="font-size:13px;white-space:nowrap;">拟发券金额</span>
          <el-input-number v-model="budgetAmount" :min="1" :max="9999" :step="10" size="small" style="width:140px;" />
          <el-button type="primary" size="small" @click="checkBudget" :loading="budgetLoading">查询</el-button>
        </div>
        <div v-if="budgetHint" style="padding:12px;border-radius:8px;" :style="{ background: budgetHint.can_issue_full ? '#ecfdf5' : (budgetHint.can_issue_discount ? '#fffbeb' : '#fef2f2') }">
          <div style="font-size:13px;margin-bottom:6px;">
            <span v-if="budgetHint.can_issue_full" style="color:#059669;">✅ 可发放全额券</span>
            <span v-else-if="budgetHint.can_issue_discount" style="color:#d97706;">⚠️ 额度不足全额，可发折扣券</span>
            <span v-else style="color:#dc2626;">🚫 本月额度已用完，无法发券</span>
          </div>
          <div style="font-size:12px;color:#6b7280;">{{ budgetHint.message }}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">建议类型: <b>{{ budgetHint.suggested_type === 'full' ? '全额券' : (budgetHint.suggested_type === 'discount' ? '折扣券' : '不可发放') }}</b></div>
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h3 style="margin:0;">📈 近期发券记录</h3>
        <el-tag v-if="currentMonth" size="small" type="info">{{ currentMonth }}</el-tag>
      </div>
      <el-table :data="recentCoupons" size="small" stripe>
        <el-table-column prop="coupon_no" label="券号" width="200" />
        <el-table-column prop="order_no" label="关联订单" width="180" />
        <el-table-column prop="customer_phone" label="客户" width="130" />
        <el-table-column label="券类型" width="90">
          <template #default="{row}">
            <el-tag size="small" :type="row.coupon_type === 'discount' ? 'warning' : 'success'">
              {{ row.coupon_type === 'discount' ? '折扣券' : '全额券' }}
            </el-tag>
          </template>
        </el-table-column>
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
import { ref, computed, onMounted } from 'vue';
import api from '@/api';

const shop = ref(null);
const recentCoupons = ref([]);
const monthlyQuota = ref({});
const budgetAmount = ref(100);
const budgetLoading = ref(false);
const budgetHint = ref(null);
const currentMonth = ref('');

const percent = computed(() => {
  if (!shop.value || !shop.value.coupon_quota) return 0;
  return Math.min(100, Math.round((shop.value.coupon_used / shop.value.coupon_quota) * 100));
});

const progressColor = computed(() => {
  if (percent.value < 60) return '#10b981';
  if (percent.value < 85) return '#f59e0b';
  return '#ef4444';
});

const monthlyPercent = computed(() => {
  if (!shop.value || !shop.value.monthly_quota) return 0;
  return Math.min(100, Math.round(((shop.value.monthly_used || 0) / shop.value.monthly_quota) * 100));
});

const monthlyProgressColor = computed(() => {
  if (monthlyPercent.value < 60) return '#10b981';
  if (monthlyPercent.value < 85) return '#f59e0b';
  return '#ef4444';
});

const tagType = (s) => ({
  issued: 'warning', bound: 'primary', verified: 'success', revoked: 'info', expired: 'danger'
}[s] || 'info');

const rules = [
  { text: '单笔消费不足门槛金额无法发券（由后端硬校验）', type: 'warning', hollow: false, time: '规则1' },
  { text: '同一订单只能发一张优惠券，重复操作被拦截', type: 'danger', hollow: false, time: '规则2' },
  { text: '车辆出场后，绑定的优惠券无法再被撤销', type: 'primary', hollow: false, time: '规则3' },
  { text: '发券金额计入门店额度，超额无法继续发券', type: 'success', hollow: false, time: '规则4' },
  { text: '月度额度不足时，系统自动提示可发折扣券', type: 'warning', hollow: false, time: '规则5' }
];

async function checkBudget() {
  budgetLoading.value = true;
  try {
    budgetHint.value = await api.merchant.getBudgetHint({ amount: budgetAmount.value });
  } catch (e) { /* handled by interceptor */ }
  budgetLoading.value = false;
}

async function load() {
  shop.value = await api.merchant.getQuota();
  recentCoupons.value = await api.merchant.getCoupons();
  currentMonth.value = shop.value.current_month || '';
  monthlyQuota.value = {
    full_coupon_used: shop.value.full_coupon_used || 0,
    discount_coupon_used: shop.value.discount_coupon_used || 0
  };
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
