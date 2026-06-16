<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🎟️ 我的优惠券</h2>
      <div class="flex-row">
        <el-select v-model="status" placeholder="券状态" clearable style="width:140px;" @change="load">
          <el-option label="待绑定" value="issued" />
          <el-option label="待出场" value="bound" />
          <el-option label="已使用" value="verified" />
          <el-option label="已撤销" value="revoked" />
          <el-option label="已过期" value="expired" />
        </el-select>
        <el-button type="primary" @click="showBindDlg = true" :icon="Link">绑定优惠券</el-button>
      </div>
    </div>

    <div class="coupon-grid">
      <div
        v-for="c in list" :key="c.id"
        class="coupon-card"
        :class="c.status"
      >
        <div class="coupon-left">
          <div class="discount">
            <div class="num">{{ c.discount_hours }}</div>
            <div class="unit">小时</div>
          </div>
          <div class="discount-tag">免费停车</div>
        </div>
        <div class="coupon-right">
          <div class="coupon-header">
            <div class="shop">{{ c.shop_name }}</div>
            <el-tag size="small" :type="tagType(c.status)">{{ c.status_text }}</el-tag>
          </div>
          <div class="coupon-info">
            <div>订单号：{{ c.order_no }}</div>
            <div>消费金额：¥{{ c.amount }}</div>
            <div>绑定车牌：
              <el-tag v-if="c.plate_no" type="primary" size="small">{{ c.plate_no }}</el-tag>
              <span v-else style="color:#9ca3af;">未绑定</span>
            </div>
            <div>有效期至：<b class="text-danger">{{ c.expire_at }}</b></div>
          </div>
          <div class="coupon-actions">
            <el-button v-if="c.status === 'issued'" size="small" type="primary" plain @click="bind(c)">
              绑定车牌
            </el-button>
            <el-button v-if="c.status === 'bound'" size="small" type="success" disabled>
              ✓ 可正常出场抵扣
            </el-button>
            <el-tag v-if="c.status === 'verified'" type="success" size="small">已核销</el-tag>
          </div>
        </div>
        <div class="coupon-circle top"></div>
        <div class="coupon-circle bottom"></div>
      </div>

      <el-empty v-if="list.length === 0 && !loading" description="暂无优惠券，消费后可向商户领取" />
    </div>

    <el-dialog v-model="showBindDlg" title="绑定优惠券" width="460px">
      <el-form :model="bindForm" label-width="90px">
        <el-form-item label="优惠券号" required>
          <el-input v-model="bindForm.coupon_no" placeholder="请输入商户给的券号" maxlength="30" />
        </el-form-item>
        <el-form-item label="绑定车牌" required>
          <el-select v-model="bindForm.plate_no" placeholder="选择车牌" style="width:100%;" filterable allow-create>
            <el-option v-for="p in plates" :key="p.id" :label="p.plate_no" :value="p.plate_no" />
          </el-select>
          <div style="font-size:12px;color:#f59e0b;margin-top:4px;">
            ⚠️ 后端会校验：金额达标、一单一券、车辆已入场、券未过期
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBindDlg = false">取消</el-button>
        <el-button type="primary" :loading="binding" @click="doBind">确认绑定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import api from '@/api';
import { ElMessage } from 'element-plus';
import { Link } from '@element-plus/icons-vue';

const list = ref([]);
const loading = ref(false);
const status = ref('');
const plates = ref([]);
const showBindDlg = ref(false);
const binding = ref(false);
const bindForm = reactive({ coupon_no: '', plate_no: '' });

function tagType(s) {
  return ({ issued: 'warning', bound: 'primary', verified: 'success', revoked: 'info', expired: 'danger' })[s] || 'info';
}

async function load() {
  loading.value = true;
  try {
    const [coupons, pl] = await Promise.all([
      api.customer.getCoupons({ status: status.value }),
      api.customer.getPlates()
    ]);
    list.value = coupons;
    plates.value = pl;
  } finally {
    loading.value = false;
  }
}

function bind(c) {
  bindForm.coupon_no = c.coupon_no;
  showBindDlg.value = true;
}

async function doBind() {
  if (!bindForm.coupon_no || !bindForm.plate_no) {
    ElMessage.warning('请填写完整信息');
    return;
  }
  binding.value = true;
  try {
    const res = await api.customer.bindCoupon(bindForm);
    showBindDlg.value = false;
    bindForm.coupon_no = '';
    load();
  } finally {
    binding.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.coupon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}
.coupon-card {
  display: flex;
  background: linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%);
  border-radius: 12px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,.06);
  transition: transform .2s;
}
.coupon-card:hover { transform: translateY(-2px); }
.coupon-card.bound { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }
.coupon-card.verified { background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); opacity: .75; }
.coupon-card.revoked, .coupon-card.expired {
  background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); opacity: .7;
}
.coupon-left {
  width: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 12px;
  border-right: 2px dashed rgba(0,0,0,.1);
}
.discount {
  display: flex;
  align-items: baseline;
  line-height: 1;
  margin-bottom: 6px;
}
.discount .num {
  font-size: 48px;
  font-weight: 900;
  color: #ea580c;
}
.coupon-card.bound .discount .num { color: #059669; }
.discount .unit {
  font-size: 16px;
  font-weight: 600;
  color: #ea580c;
  margin-left: 4px;
}
.coupon-card.bound .discount .unit { color: #059669; }
.discount-tag {
  background: rgba(234,88,12,.1);
  color: #ea580c;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 10px;
}
.coupon-card.bound .discount-tag { background: rgba(5,150,105,.1); color: #059669; }
.coupon-right {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.coupon-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.shop {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}
.coupon-info {
  font-size: 13px;
  color: #4b5563;
  line-height: 1.9;
}
.coupon-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.coupon-circle {
  position: absolute;
  width: 16px; height: 16px;
  background: #f0f2f5;
  border-radius: 50%;
  left: 122px;
}
.coupon-circle.top { top: -8px; }
.coupon-circle.bottom { bottom: -8px; }
</style>
