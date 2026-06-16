<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">✅ 人工放行审批</h2>
      <div class="flex-row">
        <el-select v-model="status" placeholder="审批状态" clearable style="width:140px;" @change="load">
          <el-option label="待审批" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
        <el-input v-model="kw" placeholder="车牌/放行单号" clearable style="width:200px;" @keyup.enter="load" />
        <el-button type="primary" @click="load" :icon="Search">查询</el-button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card" style="border-left:4px solid #f59e0b;">
        <div class="label">待审批数</div>
        <div class="value text-warning">{{ stat.pending }}</div>
      </div>
      <div class="stat-card" style="border-left:4px solid #10b981;">
        <div class="label">今日通过</div>
        <div class="value text-success">{{ stat.approved }}</div>
      </div>
      <div class="stat-card" style="border-left:4px solid #ef4444;">
        <div class="label">今日驳回</div>
        <div class="value text-danger">{{ stat.rejected }}</div>
      </div>
      <div class="stat-card" style="border-left:4px solid #8b5cf6;">
        <div class="label">累计豁免金额</div>
        <div class="value">¥{{ Number(stat.total_waived).toLocaleString() }}</div>
      </div>
    </div>

    <div class="card-shadow" style="padding:16px;">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="release_no" label="放行单号" width="200" />
        <el-table-column label="车辆" width="130">
          <template #default="{row}"><el-tag type="primary" size="small">{{ row.plate_no }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="booth_id" label="岗亭" width="110" />
        <el-table-column prop="release_type" label="发起方" width="90">
          <template #default="{row}">
            <el-tag size="small" :type="row.release_type === 'service' ? 'primary' : 'warning'">
              {{ row.release_type === 'service' ? '客服' : '岗亭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="release_reason" label="放行原因" show-overflow-tooltip />
        <el-table-column label="豁免金额" width="110">
          <template #default="{row}"><b class="text-danger">¥{{ row.waived_fee }}</b></template>
        </el-table-column>
        <el-table-column prop="operator_name" label="登记人" width="110" />
        <el-table-column prop="released_at" label="登记时间" width="160" />
        <el-table-column label="审批状态" width="100">
          <template #default="{row}">
            <el-tag :type="typeMap[row.approve_status]" size="small">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{row}">
            <el-button v-if="row.approve_status === 'pending'" size="small" type="success" @click="approve(row, true)">
              通过
            </el-button>
            <el-button v-if="row.approve_status === 'pending'" size="small" type="danger" plain @click="approve(row, false)">
              驳回
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import api from '@/api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

const list = ref([]);
const loading = ref(false);
const kw = ref('');
const status = ref('pending');
const stat = reactive({ pending: 0, approved: 0, rejected: 0, total_waived: 0 });
const typeMap = { pending: 'warning', approved: 'success', rejected: 'danger' };

async function load() {
  loading.value = true;
  try {
    const all = await api.service.getReleases({ plate_no: kw.value, status: status.value });
    list.value = all;
    stat.pending = all.filter(r => r.approve_status === 'pending').length;
    stat.approved = all.filter(r => r.approve_status === 'approved').length;
    stat.rejected = all.filter(r => r.approve_status === 'rejected').length;
    stat.total_waived = all.reduce((s, r) => s + (r.waived_fee || 0), 0);
  } finally { loading.value = false; }
}

async function approve(row, ok) {
  try {
    let remark = '';
    if (!ok) {
      const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回审批', {
        inputPlaceholder: '例如：豁免金额过大，请核实',
        confirmButtonText: '确认驳回',
        inputValidator: v => !!v || '驳回原因必填'
      });
      remark = value;
    } else {
      await ElMessageBox.confirm(`确认通过放行 ${row.plate_no}？豁免金额 ¥${row.waived_fee}`, '审批通过', { type: 'success' });
    }
    await api.service.approveRelease({ release_id: row.id, approve: ok, remark });
    load();
  } catch (e) { if (e !== 'cancel') console.error(e); }
}

onMounted(load);
</script>
