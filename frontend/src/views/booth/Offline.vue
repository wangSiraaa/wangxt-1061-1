<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">💾 离线补录（断网恢复后同步）</h2>
      <div class="flex-row">
        <el-button :icon="Plus" size="large" @click="addRow">新增补录行</el-button>
        <el-button type="primary" :icon="Upload" size="large" :loading="syncing" :disabled="records.length === 0" @click="doSync">
          批量同步（{{ records.length }}）
        </el-button>
        <el-button :icon="Delete" size="large" plain @click="records = []">清空</el-button>
      </div>
    </div>

    <el-alert type="info" :closable="false" style="margin-bottom:16px;">
      本页面用于网络中断时的离线记录补录：岗亭端在离线时将记录存在本地，恢复网络后进入本页面批量同步到服务端。同步后将自动执行入场/出场逻辑
    </el-alert>

    <div class="card-shadow" style="padding:16px;">
      <el-table :data="records" border style="width:100%;">
        <el-table-column label="序号" type="index" width="60" align="center" />
        <el-table-column label="车牌号" min-width="150">
          <template #default="{row,$index}">
            <el-input v-model="row.plate_no" placeholder="如 京A12345" @input="onInput" style="text-transform:uppercase;letter-spacing:2px;" />
          </template>
        </el-table-column>
        <el-table-column label="操作类型" width="130">
          <template #default="{row}">
            <el-radio-group v-model="row.action_type">
              <el-radio-button label="in">入场</el-radio-button>
              <el-radio-button label="out">出场</el-radio-button>
            </el-radio-group>
          </template>
        </el-table-column>
        <el-table-column label="动作时间" width="180">
          <template #default="{row}">
            <el-date-picker
              v-model="row.action_time"
              type="datetime"
              placeholder="选择记录时间"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width:100%;"
            />
          </template>
        </el-table-column>
        <el-table-column label="岗亭编号" width="150">
          <template #default="{row}">
            <el-select v-model="row.booth_id" style="width:100%;">
              <el-option label="北1岗亭" value="BOOTH_N1" />
              <el-option label="南1岗亭" value="BOOTH_S1" />
              <el-option label="东出入口" value="BOOTH_E1" />
              <el-option label="西出入口" value="BOOTH_W1" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="180">
          <template #default="{row}">
            <el-input v-model="row.remark" placeholder="选填说明" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right" align="center">
          <template #default="{$index}">
            <el-button type="danger" link @click="records.splice($index,1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-divider>快速模板</el-divider>
    <div style="display:flex;gap:12px;flex-wrap:wrap;">
      <el-button v-for="(t,i) in templates" :key="i" size="large" @click="applyTemplate(t)">
        {{ t.name }}
      </el-button>
    </div>

    <div v-if="syncResult" style="margin-top:20px;" class="card-shadow" :class="syncResult.success === syncResult.total ? 'all-ok' : 'has-fail'" style="padding:20px;">
      <h3 style="margin:0 0 12px;">
        {{ syncResult.success === syncResult.total ? '✅ 全部同步成功' : '⚠️ 同步结果' }}
      </h3>
      <div style="display:flex;gap:20px;flex-wrap:wrap;">
        <div><b>总记录数：</b>{{ syncResult.total }}</div>
        <div class="text-success"><b>成功：</b>{{ syncResult.success }}</div>
        <div v-if="syncResult.failed?.length" class="text-danger"><b>失败：</b>{{ syncResult.failed.length }}</div>
      </div>
      <el-collapse v-if="syncResult.failed?.length" style="margin-top:12px;">
        <el-collapse-item title="查看失败详情">
          <pre style="white-space:pre-wrap;max-height:200px;overflow:auto;">{{ JSON.stringify(syncResult.failed, null, 2) }}</pre>
        </el-collapse-item>
      </el-collapse>
      <div v-if="syncResult.reconcile_results?.length" style="margin-top:16px;">
        <h4 style="margin:0 0 8px;">📋 补对结果明细</h4>
        <el-table :data="syncResult.reconcile_results" size="small" stripe border>
          <el-table-column prop="record_no" label="离线记录号" width="180" />
          <el-table-column prop="plate_no" label="车牌" width="110" />
          <el-table-column label="类型" width="70">
            <template #default="{row}">{{ row.action_type === 'in' ? '入场' : '出场' }}</template>
          </el-table-column>
          <el-table-column label="补对状态" width="110">
            <template #default="{row}">
              <el-tag size="small" :type="row.reconcile_status === 'matched' ? 'success' : (row.reconcile_status === 'unmatched' ? 'danger' : 'warning')">
                {{ { matched: '已补对', unmatched: '未匹配', pending: '待处理' }[row.reconcile_status] || row.reconcile_status }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="匹配停车" width="100">
            <template #default="{row}">{{ row.matched_parking_id ? `#${row.matched_parking_id}` : '-' }}</template>
          </el-table-column>
          <el-table-column label="匹配优惠券" width="100">
            <template #default="{row}">{{ row.matched_coupon_id ? `#${row.matched_coupon_id}` : '-' }}</template>
          </el-table-column>
          <el-table-column label="匹配订单" width="100">
            <template #default="{row}">{{ row.matched_order_id ? `#${row.matched_order_id}` : '-' }}</template>
          </el-table-column>
        </el-table>
        <div style="margin-top:8px;display:flex;gap:12px;">
          <el-tag type="success" size="small">已补对: {{ syncResult.reconcile_results.filter(r => r.reconcile_status === 'matched').length }}</el-tag>
          <el-tag type="danger" size="small">未匹配: {{ syncResult.reconcile_results.filter(r => r.reconcile_status === 'unmatched').length }}</el-tag>
          <el-tag type="warning" size="small">待处理: {{ syncResult.reconcile_results.filter(r => r.reconcile_status === 'pending').length }}</el-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import api from '@/api';
import { ElMessage } from 'element-plus';
import { Plus, Upload, Delete } from '@element-plus/icons-vue';
import dayjs from 'dayjs';

const records = ref([]);
const syncing = ref(false);
const syncResult = ref(null);

const templates = [
  { name: '🅰️ 模拟3条入场', data: [
    { plate_no: '京X10001', action_type: 'in', booth_id: 'BOOTH_N1' },
    { plate_no: '京X10002', action_type: 'in', booth_id: 'BOOTH_N1' },
    { plate_no: '京X10003', action_type: 'in', booth_id: 'BOOTH_S1' }
  ]},
  { name: '🅱️ 模拟2出1入', data: [
    { plate_no: '京Y20001', action_type: 'out', booth_id: 'BOOTH_N1' },
    { plate_no: '京Y20002', action_type: 'in', booth_id: 'BOOTH_N1' },
    { plate_no: '京A12345', action_type: 'out', booth_id: 'BOOTH_N1' }
  ]}
];

function addRow(data = {}) {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  records.value.push({
    plate_no: '',
    action_type: 'in',
    action_time: now,
    booth_id: 'BOOTH_N1',
    remark: '',
    ...data
  });
}

function applyTemplate(t) {
  records.value = [];
  const now = dayjs();
  t.data.forEach((d, i) => {
    const tm = now.subtract(i * 10 + 5, 'minute').format('YYYY-MM-DD HH:mm:ss');
    addRow({ ...d, action_time: tm });
  });
  ElMessage.success(`已填入${t.data.length}条模板数据`);
}

function onInput() { syncResult.value = null; }

async function doSync() {
  const valid = records.value.filter(r => r.plate_no && r.action_type && r.action_time);
  if (valid.length === 0) { ElMessage.warning('请完善必填字段'); return; }
  syncing.value = true;
  try {
    syncResult.value = await api.booth.offlineSync({ records: valid, booth_id: 'BOOTH_N1' });
    if (syncResult.value.success === syncResult.value.total) {
      records.value = [];
    }
  } finally { syncing.value = false; }
}

addRow();
</script>

<style scoped>
.all-ok { border: 2px solid #10b981 !important; }
.has-fail { border: 2px solid #f59e0b !important; }
</style>
