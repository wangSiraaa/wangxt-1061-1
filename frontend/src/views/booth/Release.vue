<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🚦 人工放行（岗亭端）</h2>
      <el-tag type="warning" size="large">北1岗亭 · BOOTH_N1</el-tag>
    </div>

    <div class="release-layout">
      <div class="card-shadow release-form-card">
        <h3 style="margin:0 0 16px;">📝 放行登记</h3>
        <el-form :model="form" label-width="100px" size="large">
          <el-form-item label="车牌号" required>
            <el-input v-model="form.plate_no" placeholder="请输入或扫描" style="letter-spacing:4px;text-transform:uppercase;font-size:18px;" @keyup.enter="doSubmit" />
          </el-form-item>
          <el-form-item label="豁免停车费">
            <el-switch v-model="allWaive" active-text="全免" inactive-text="部分豁免" />
          </el-form-item>
          <el-form-item v-if="!allWaive" label="豁免金额(元)">
            <el-input-number v-model="form.waive_fee" :min="0" :max="2000" style="width:100%;" />
            <div style="font-size:12px;color:#f59e0b;margin-top:4px;">
              ⚠️ 豁免金额 > 50元 将进入上级审批流程
            </div>
          </el-form-item>
          <el-form-item label="放行原因" required>
            <el-select v-model="form.release_reason" placeholder="选择原因" style="width:100%;" filterable allow-create>
              <el-option label="设备故障，无法识别车牌" value="设备故障" />
              <el-option label="优惠券异常，无法核销" value="优惠券异常" />
              <el-option label="客户情绪激动，特批放行" value="客户投诉" />
              <el-option label="紧急车辆（消防/医疗/警车）" value="紧急车辆" />
              <el-option label="员工车辆/内部车辆" value="内部车辆" />
              <el-option label="已现场收取现金" value="现金收取" />
              <el-option label="其他原因" value="其他" />
            </el-select>
          </el-form-item>
          <el-form-item label="岗亭备注">
            <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="现场情况补充说明" />
          </el-form-item>
        </el-form>

        <el-alert v-if="preview" :type="preview.need_approval ? 'warning' : 'success'" :closable="false" style="margin:20px 0;">
          <div style="line-height:1.9;">
            <div v-if="preview.total_fee"><b>预估停车费：</b>¥{{ preview.total_fee }}</div>
            <div><b>实际豁免：</b><span style="color:#10b981;font-size:16px;">¥{{ preview.waived_fee }}</span></div>
            <div v-if="preview.total_fee"><b>剩余应收：</b>¥{{ Math.max(0, preview.total_fee - preview.waived_fee) }}</div>
            <div style="margin-top:8px;">
              <b>处理方式：</b>
              <el-tag :type="preview.need_approval ? 'warning' : 'success'" size="large">
                {{ preview.need_approval ? '🔒 需客服审批后通行' : '✅ 立即抬杆放行' }}
              </el-tag>
            </div>
          </div>
        </el-alert>

        <div style="display:flex;gap:12px;">
          <el-button type="primary" size="large" style="flex:1;height:56px;font-size:18px;" :loading="submitting" @click="doSubmit">
            提交放行
          </el-button>
          <el-button size="large" @click="reset">重置</el-button>
        </div>
      </div>

      <div class="card-shadow release-recent-card">
        <h3 style="margin:0 0 16px;">🕒 本岗亭今日放行记录</h3>
        <el-table :data="list" v-loading="loading" stripe size="small" empty-text="暂无记录">
          <el-table-column label="车牌" width="100">
            <template #default="{row}"><el-tag type="primary" size="small">{{ row.plate_no }}</el-tag></template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{row}">
              <el-tag :type="typeMap[row.approve_status]" size="small">{{ row.status_text }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="release_reason" label="原因" show-overflow-tooltip />
          <el-table-column label="豁免" width="80">
            <template #default="{row}">¥{{ row.waived_fee }}</template>
          </el-table-column>
          <el-table-column prop="released_at" label="时间" width="150" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, watch } from 'vue';
import api from '@/api';
import { ElMessage } from 'element-plus';

const form = reactive({
  plate_no: '',
  booth_id: 'BOOTH_N1',
  release_reason: '',
  waive_fee: 0,
  remark: ''
});
const allWaive = ref(true);
const submitting = ref(false);
const list = ref([]);
const loading = ref(false);
const typeMap = { pending: 'warning', approved: 'success', rejected: 'danger' };

const preview = computed(() => {
  if (!form.plate_no || !form.release_reason) return null;
  const waive = allWaive.value ? 500 : form.waive_fee;
  return {
    waived_fee: waive,
    total_fee: 30,
    need_approval: waive > 50
  };
});

watch([() => form.plate_no, allWaive], ([p]) => {
  if (allWaive.value || p) {
    form.waive_fee = allWaive.value ? 500 : 0;
  }
});

async function load() {
  loading.value = true;
  try {
    list.value = (await api.service.getReleases()).filter(r => r.booth_id === 'BOOTH_N1').slice(0, 30);
  } finally { loading.value = false; }
}

function reset() {
  form.plate_no = '';
  form.release_reason = '';
  form.waive_fee = 0;
  form.remark = '';
  allWaive.value = true;
}

async function doSubmit() {
  if (!form.plate_no || !form.release_reason) {
    ElMessage.warning('请完善必填信息');
    return;
  }
  const payload = {
    ...form,
    waive_fee: allWaive.value ? 500 : form.waive_fee
  };
  submitting.value = true;
  try {
    const res = await api.booth.boothRelease(payload);
    if (res.can_pass) {
      ElMessage.success('已放行，抬杆！');
      reset();
    } else {
      ElMessage.warning('已提交，等待客服审批后可通行');
    }
    load();
  } finally { submitting.value = false; }
}

onMounted(() => {
  const u = new URLSearchParams(location.hash.split('?')[1] || '');
  if (u.get('plate')) form.plate_no = u.get('plate');
  load();
});
</script>

<style scoped>
.release-layout {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 20px;
}
@media (max-width: 1100px) { .release-layout { grid-template-columns: 1fr; } }
.release-form-card { padding: 24px; }
.release-recent-card { padding: 20px; }
</style>
