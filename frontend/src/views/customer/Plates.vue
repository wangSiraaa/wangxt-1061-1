<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🚗 车牌管理</h2>
      <el-button type="primary" @click="showBind = true" :icon="Plus">绑定新车牌</el-button>
    </div>

    <div class="card-shadow" style="padding:16px;">
      <el-alert type="info" :closable="false" style="margin-bottom:16px;">
        绑定车牌后，您领取的优惠券可自动关联车辆，出场时无需手动出示
      </el-alert>

      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="plate_no" label="车牌号" width="160">
          <template #default="{row}">
            <div style="display:flex;align-items:center;gap:8px;">
              <el-tag type="primary" size="large" style="font-size:15px;padding:4px 12px;letter-spacing:2px;">
                {{ row.plate_no }}
              </el-tag>
              <el-tag v-if="row.in_park" type="success" size="small">🚧 在场内</el-tag>
              <el-tag v-else type="info" size="small">已出场</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="customer_phone" label="绑定手机号" width="140" />
        <el-table-column prop="bound_time" label="绑定时间" width="170" />
        <el-table-column prop="last_in_time" label="最近入场" width="170">
          <template #default="{row}">{{ row.last_in_time || '-' }}</template>
        </el-table-column>
        <el-table-column prop="last_out_time" label="最近出场" width="170">
          <template #default="{row}">{{ row.last_out_time || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{row}">
            <el-button size="small" @click="viewParking(row)">查看出场状态</el-button>
            <el-button
              v-if="row.in_park"
              size="small"
              type="success"
              plain
              @click="viewParking(row)"
            >去绑券</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showBind" title="绑定车牌" width="420px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="车牌号" required>
          <el-input v-model="form.plate_no" placeholder="如：京A12345" maxlength="8" style="text-transform:uppercase;letter-spacing:2px;" />
          <div style="font-size:12px;color:#9ca3af;margin-top:4px;">支持蓝牌/绿牌/黄牌格式</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showBind = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">确认绑定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import api from '@/api';
import { ElMessage } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';

const list = ref([]);
const loading = ref(false);
const showBind = ref(false);
const submitting = ref(false);
const form = reactive({ plate_no: '' });

async function load() {
  loading.value = true;
  try {
    list.value = await api.customer.getPlates();
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!form.plate_no) {
    ElMessage.warning('请输入车牌号');
    return;
  }
  submitting.value = true;
  try {
    await api.customer.bindPlate(form);
    showBind.value = false;
    form.plate_no = '';
    load();
  } finally {
    submitting.value = false;
  }
}

function viewParking(row) {
  location.hash = '#/customer/parking';
}

onMounted(load);
</script>
