<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🛒 消费订单管理</h2>
      <div class="flex-row">
        <el-input v-model="kw" placeholder="搜索订单号/手机号" clearable style="width:220px;" @keyup.enter="load" />
        <el-button type="primary" @click="load" :icon="Search">查询</el-button>
      </div>
    </div>

    <div class="card-shadow" style="padding:16px;">
      <el-table :data="list" loading v-loading="loading" stripe>
        <el-table-column prop="order_no" label="订单号" width="180" />
        <el-table-column prop="customer_phone" label="客户手机号" width="140" />
        <el-table-column prop="shop_name" label="门店" />
        <el-table-column label="消费金额" width="120">
          <template #default="{ row }"><b style="color:#ef4444;">¥{{ row.amount }}</b></template>
        </el-table-column>
        <el-table-column label="发券门槛" width="110">
          <template #default="{ row }">满{{ row.min_amount || (shop?.min_amount) }}元</template>
        </el-table-column>
        <el-table-column prop="pay_time" label="支付时间" width="170" />
        <el-table-column label="发券状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.coupon_issued === 1" type="success" size="small">已发券</el-tag>
            <el-tag v-else type="warning" size="small">未发券</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.coupon_issued !== 1"
              type="primary"
              size="small"
              :disabled="row.amount < (shop?.min_amount || 0)"
              @click="issue(row)"
            >
              <el-icon><Ticket /></el-icon>发券
            </el-button>
            <el-tag v-else-if="row.coupon_id" type="info" size="small" @click="viewCoupon(row)">关联券</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" title="确认发放优惠券" width="420">
      <el-descriptions v-if="curOrder" :column="1" border size="small">
        <el-descriptions-item label="订单号">{{ curOrder.order_no }}</el-descriptions-item>
        <el-descriptions-item label="客户">{{ curOrder.customer_phone }}</el-descriptions-item>
        <el-descriptions-item label="消费金额"><b class="text-danger">¥{{ curOrder.amount }}</b></el-descriptions-item>
        <el-descriptions-item label="优惠权益">免费停车 <b class="text-success">{{ shop?.discount_hours }} 小时</b></el-descriptions-item>
        <el-descriptions-item label="有效期">发券后 24 小时内</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="confirmIssue">确认发券</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import api from '@/api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Ticket } from '@element-plus/icons-vue';

const list = ref([]);
const loading = ref(false);
const kw = ref('');
const shop = ref(null);
const dlg = ref(false);
const curOrder = ref(null);
const submitting = ref(false);

async function loadShop() {
  shop.value = await api.merchant.getQuota();
}

async function load() {
  loading.value = true;
  try {
    list.value = await api.merchant.getOrders({ keyword: kw.value });
  } finally {
    loading.value = false;
  }
}

function issue(row) {
  if (row.amount < shop.value.min_amount) {
    ElMessage.warning(`金额不足，需满${shop.value.min_amount}元`);
    return;
  }
  curOrder.value = row;
  dlg.value = true;
}

async function confirmIssue() {
  submitting.value = true;
  try {
    const res = await api.merchant.issueCoupon({ order_id: curOrder.value.id });
    ElMessage.success(`发券成功！券号：${res.coupon_no}`);
    dlg.value = false;
    load();
    loadShop();
  } finally {
    submitting.value = false;
  }
}

function viewCoupon(row) {
  location.hash = `#/merchant/coupons?coupon_id=${row.coupon_id}`;
}

onMounted(() => {
  loadShop();
  load();
});
</script>
