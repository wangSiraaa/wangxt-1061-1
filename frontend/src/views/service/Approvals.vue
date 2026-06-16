<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">📄 异常审批工单</h2>
      <div class="flex-row">
        <el-select v-model="status" placeholder="状态" clearable style="width:140px;" @change="load">
          <el-option label="待处理" value="pending" />
          <el-option label="已通过" value="approved" />
          <el-option label="已驳回" value="rejected" />
        </el-select>
        <el-button type="primary" @click="load" :icon="Search">刷新</el-button>
      </div>
    </div>

    <div class="card-shadow" style="padding:16px;">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="approval_no" label="审批单号" width="200" />
        <el-table-column prop="exception_type" label="异常类型" width="130">
          <template #default="{row}">
            <el-tag size="small" type="warning">{{ typeText(row.exception_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="关联车牌" width="120">
          <template #default="{row}">
            <el-tag v-if="row.plate_no" type="primary" size="small">{{ row.plate_no }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="原因说明" min-width="240" show-overflow-tooltip />
        <el-table-column prop="applicant_name" label="申请人" width="100" />
        <el-table-column prop="applicant_role" label="角色" width="80">
          <template #default="{row}">{{ roleText(row.applicant_role) }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="申请时间" width="160" />
        <el-table-column label="状态" width="90">
          <template #default="{row}">
            <el-tag size="small" :type="map[row.approve_status]">{{ row.status_text }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{row}">
            <el-button v-if="row.approve_status === 'pending'" size="small" type="success" @click="doApprove(row, true)">通过</el-button>
            <el-button v-if="row.approve_status === 'pending'" size="small" type="danger" plain @click="doApprove(row, false)">驳回</el-button>
            <el-button size="small" @click="view(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dlg" title="审批详情" width="480px">
      <el-descriptions v-if="cur" :column="1" border>
        <el-descriptions-item label="审批单号">{{ cur.approval_no }}</el-descriptions-item>
        <el-descriptions-item label="异常类型">{{ typeText(cur.exception_type) }}</el-descriptions-item>
        <el-descriptions-item label="关联车牌">{{ cur.plate_no || '-' }}</el-descriptions-item>
        <el-descriptions-item label="申请原因">{{ cur.reason }}</el-descriptions-item>
        <el-descriptions-item label="申请人">{{ cur.applicant_name }}（{{ roleText(cur.applicant_role) }}）</el-descriptions-item>
        <el-descriptions-item label="申请时间">{{ cur.created_at }}</el-descriptions-item>
        <el-descriptions-item v-if="cur.approve_status !== 'pending'" label="审批人">
          {{ cur.approver_id ? 'ID:' + cur.approver_id : '-' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="cur.approve_status !== 'pending'" label="审批备注">
          {{ cur.approve_remark || '-' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="cur.approve_status !== 'pending'" label="审批时间">
          {{ cur.approved_at || '-' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import api from '@/api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';

const list = ref([]);
const loading = ref(false);
const status = ref('pending');
const dlg = ref(false);
const cur = ref(null);
const map = { pending: 'warning', approved: 'success', rejected: 'danger' };

const types = {
  plate_error: '车牌识别错误',
  coupon_error: '优惠券核销失败',
  in_missing: '入场记录缺失',
  out_duplicate: '出场重复记录',
  customer_complaint: '顾客投诉',
  other: '其他'
};
const roles = { admin: '管理员', merchant: '商户', customer: '顾客', service: '客服', booth: '岗亭' };
const typeText = (t) => types[t] || t;
const roleText = (r) => roles[r] || r;

async function load() {
  loading.value = true;
  try {
    list.value = await api.service.getApprovals({ status: status.value });
  } finally { loading.value = false; }
}

function view(row) { cur.value = row; dlg.value = true; }

async function doApprove(row, ok) {
  try {
    let remark = '';
    if (!ok) {
      const { value } = await ElMessageBox.prompt('请输入驳回原因', '驳回审批', {
        inputValidator: v => !!v || '必须填写驳回原因'
      });
      remark = value;
    } else {
      await ElMessageBox.confirm('确认通过该异常审批？', '审批通过', { type: 'success' });
    }
    await api.service.approveException({ approval_id: row.id, approve: ok, remark });
    load();
  } catch (e) { if (e !== 'cancel') console.error(e); }
}

onMounted(load);
</script>
