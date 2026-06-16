<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🎟️ 优惠券管理</h2>
      <div class="flex-row">
        <el-select v-model="status" placeholder="券状态" clearable style="width:140px;">
          <el-option label="已发券" value="issued" />
          <el-option label="已绑定" value="bound" />
          <el-option label="已核销" value="verified" />
          <el-option label="已撤销" value="revoked" />
          <el-option label="已过期" value="expired" />
        </el-select>
        <el-input v-model="kw" placeholder="搜索券号/订单号/手机号" clearable style="width:240px;" />
        <el-button type="primary" @click="load" :icon="Search">查询</el-button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card" style="border-left:4px solid #3b82f6;">
        <div class="label">已发券总数</div>
        <div class="value">{{ stat.issued }}</div>
      </div>
      <div class="stat-card" style="border-left:4px solid #10b981;">
        <div class="label">已核销数</div>
        <div class="value">{{ stat.verified }}</div>
      </div>
      <div class="stat-card" style="border-left:4px solid #f59e0b;">
        <div class="label">待使用(已绑定)</div>
        <div class="value">{{ stat.bound }}</div>
      </div>
      <div class="stat-card" style="border-left:4px solid #ef4444;">
        <div class="label">已撤销</div>
        <div class="value">{{ stat.revoked }}</div>
      </div>
    </div>

    <div class="card-shadow" style="padding:16px;">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="coupon_no" label="券号" width="200" />
        <el-table-column prop="order_no" label="关联订单" width="180" />
        <el-table-column label="消费/门槛">
          <template #default="{ row }">
            <div>
              <div><b>¥{{ row.order_amount }}</b></div>
              <div style="font-size:12px;color:#9ca3af;">对应门店 ¥{{ row.min_amount || 0 }} 门槛</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="权益" width="100">
          <template #default="{ row }"><b class="text-success">{{ row.discount_hours }}小时</b></template>
        </el-table-column>
        <el-table-column prop="plate_no" label="绑定车牌" width="120">
          <template #default="{ row }">
            <el-tag v-if="row.plate_no" type="primary" size="small">{{ row.plate_no }}</el-tag>
            <span v-else style="color:#9ca3af;">未绑定</span>
          </template>
        </el-table-column>
        <el-table-column prop="issued_at" label="发券时间" width="160" />
        <el-table-column prop="expire_at" label="有效期至" width="160" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="tagType(row.status)" size="small">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'issued' || row.status === 'bound'"
              size="small"
              type="danger"
              plain
              @click="revoke(row)"
            >撤销</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import api from '@/api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import dayjs from 'dayjs';

const list = ref([]);
const loading = ref(false);
const kw = ref('');
const status = ref('');
const stat = reactive({ issued: 0, verified: 0, bound: 0, revoked: 0, expired: 0 });

function tagType(s) {
  return ({ issued: 'warning', bound: 'primary', verified: 'success', revoked: 'info', expired: 'danger' })[s] || 'info';
}

async function load() {
  loading.value = true;
  try {
    list.value = await api.merchant.getCoupons({ keyword: kw.value, status: status.value });
    ['issued', 'verified', 'bound', 'revoked', 'expired'].forEach(k => {
      stat[k] = list.value.filter(c => c.status === k).length;
    });
  } finally {
    loading.value = false;
  }
}

async function revoke(row) {
  try {
    await ElMessageBox.confirm(
      `确认撤销优惠券 ${row.coupon_no}？${row.status === 'bound' ? '\n注意：当前已绑定车牌，若车辆已出场则无法撤销。' : ''}`,
      '撤券确认',
      { type: 'warning', confirmButtonText: '确认撤销' }
    );
    const { value } = await ElMessageBox.prompt('请输入撤销原因（选填）', '撤销原因', {
      inputPlaceholder: '例如：顾客申请退款',
      showCancelButton: true
    }).catch(() => ({ value: '' }));
    await api.merchant.revokeCoupon({ coupon_id: row.id, reason: value || '商户主动撤销' });
    load();
  } catch (e) {
    if (e !== 'cancel') console.error(e);
  }
}

onMounted(load);
</script>
