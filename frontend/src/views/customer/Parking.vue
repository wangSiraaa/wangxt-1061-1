<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🅿️ 出场状态</h2>
      <el-button @click="load" :icon="Refresh">刷新</el-button>
    </div>

    <el-empty v-if="list.length === 0 && !loading" description="当前没有在场内的车辆" />

    <div v-for="p in list" :key="p.id" class="parking-card card-shadow">
      <div class="parking-header">
        <div>
          <el-tag type="primary" size="large" style="font-size:18px;padding:6px 16px;letter-spacing:2px;">
            {{ p.plate_no }}
          </el-tag>
          <span style="margin-left:12px;">
            <el-tag type="success">🚧 在场内</el-tag>
          </span>
        </div>
        <el-button type="primary" @click="showBindDlg(p)" :disabled="p.discount_hours > 0" :icon="Ticket">
          {{ p.discount_hours > 0 ? '已绑定优惠券' : '绑定优惠券' }}
        </el-button>
      </div>

      <div class="parking-body">
        <div class="parking-stat">
          <div class="label">入场时间</div>
          <div class="value">{{ p.in_time }}</div>
        </div>
        <div class="parking-stat">
          <div class="label">已停时长</div>
          <div class="value text-info">
            <b style="font-size:22px;">{{ p.parked_hours }}</b> 小时
          </div>
        </div>
        <div class="parking-stat">
          <div class="label">停车费用</div>
          <div class="value text-danger">
            <b style="font-size:22px;">¥{{ p.total_fee }}</b>
          </div>
        </div>
        <div class="parking-stat highlight">
          <div class="label">优惠券抵扣</div>
          <div class="value text-success">
            <b style="font-size:22px;">¥{{ p.discount_fee }}</b>
            <el-tag v-if="p.discount_hours" type="success" size="small" style="margin-left:8px;">
              {{ p.discount_hours }}小时券
            </el-tag>
          </div>
        </div>
        <div class="parking-stat">
          <div class="label">应付金额</div>
          <div class="value" :class="p.payable_fee > 0 ? 'text-warning' : 'text-success'">
            <b style="font-size:24px;">
              {{ p.payable_fee > 0 ? '¥' + p.payable_fee : '🆓 免费' }}
            </b>
          </div>
        </div>
      </div>

      <div class="parking-footer">
        <el-alert
          v-if="p.payable_fee > 0"
          type="warning"
          :closable="false"
          title="出场需缴费或联系客服人工放行"
        />
        <el-alert
          v-else
          type="success"
          :closable="false"
          title="✅ 优惠券已覆盖费用，可直接出场，岗亭会自动核验放行"
        />
      </div>
    </div>

    <el-dialog v-model="showBind" title="绑定优惠券到车牌" width="460px">
      <el-form :model="bindForm" label-width="90px">
        <el-form-item label="车牌">
          <el-input v-model="bindForm.plate_no" disabled />
        </el-form-item>
        <el-form-item label="优惠券号" required>
          <el-input v-model="bindForm.coupon_no" placeholder="输入商户给您的券号" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBind = false">取消</el-button>
        <el-button type="primary" :loading="binding" @click="doBind">确认绑定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import api from '@/api';
import { ElMessage } from 'element-plus';
import { Refresh, Ticket } from '@element-plus/icons-vue';

const list = ref([]);
const loading = ref(false);
const showBind = ref(false);
const binding = ref(false);
const bindForm = reactive({ coupon_no: '', plate_no: '' });
let timer;

async function load() {
  loading.value = true;
  try {
    list.value = await api.customer.getParkingStatus();
  } finally {
    loading.value = false;
  }
}

function showBindDlg(p) {
  bindForm.plate_no = p.plate_no;
  bindForm.coupon_no = '';
  showBind.value = true;
}

async function doBind() {
  if (!bindForm.coupon_no) { ElMessage.warning('请输入券号'); return; }
  binding.value = true;
  try {
    await api.customer.bindCoupon(bindForm);
    showBind.value = false;
    load();
  } finally {
    binding.value = false;
  }
}

onMounted(() => {
  load();
  timer = setInterval(load, 60000);
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.parking-card {
  padding: 20px 24px;
  margin-bottom: 16px;
  border-radius: 12px;
  border-left: 5px solid #3b82f6;
}
.parking-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 16px;
}
.parking-body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}
.parking-stat {
  padding: 12px 16px;
  background: #f9fafb;
  border-radius: 10px;
}
.parking-stat.highlight {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
}
.parking-stat .label {
  font-size: 12px;
  color: #6b7280;
  margin-bottom: 6px;
}
.parking-stat .value {
  font-weight: 600;
  color: #111827;
  font-size: 14px;
}
</style>
