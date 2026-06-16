<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">📋 核验记录查询</h2>
      <div class="flex-row">
        <el-input v-model="plate" placeholder="按车牌筛选" clearable style="width:180px;" @keyup.enter="load" />
        <el-date-picker v-model="range" type="datetimerange" range-separator="至" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD HH:mm:ss" style="width:340px;" />
        <el-button type="primary" @click="load" :icon="Search">查询</el-button>
        <el-button @click="exportCSV" :icon="Download">导出CSV</el-button>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="label">总核验数</div><div class="value">{{ s.total }}</div></div>
      <div class="stat-card" style="border-left:4px solid #10b981;"><div class="label">优惠券通行</div><div class="value text-success">{{ s.coupon }}</div></div>
      <div class="stat-card" style="border-left:4px solid #f59e0b;"><div class="label">人工放行</div><div class="value text-warning">{{ s.manual }}</div></div>
      <div class="stat-card" style="border-left:4px solid #8b5cf6;"><div class="label">离线补录</div><div class="value text-info">{{ s.offline }}</div></div>
      <div class="stat-card" style="border-left:4px solid #ef4444;"><div class="label">实收总额</div><div class="value">¥{{ s.fee.toLocaleString() }}</div></div>
    </div>

    <div class="card-shadow" style="padding:16px;">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column prop="plate_no" label="车牌" width="120">
          <template #default="{row}"><el-tag size="small">{{ row.plate_no }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="booth_id" label="岗亭" width="120" />
        <el-table-column label="核验类型" width="110">
          <template #default="{row}">
            <el-tag :type="tType(row.verify_type)" size="small">
              {{ ({coupon:'优惠券',manual:'人工放行',offline:'离线补录'})[row.verify_type] || row.verify_type }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="coupon_no" label="关联券号" width="200" />
        <el-table-column label="优惠时长" width="100">
          <template #default="{row}">{{ row.discount_hours ? row.discount_hours + '小时' : '-' }}</template>
        </el-table-column>
        <el-table-column label="停车时长" width="100">
          <template #default="{row}">{{ row.parking_duration }}分钟</template>
        </el-table-column>
        <el-table-column label="应收" width="90">
          <template #default="{row}">¥{{ row.parking_fee }}</template>
        </el-table-column>
        <el-table-column label="实收" width="90">
          <template #default="{row}"><b>¥{{ row.actual_fee }}</b></template>
        </el-table-column>
        <el-table-column label="操作员" width="110">
          <template #default="{row}">{{ row.operator_name || ('用户#' + row.operator_id) }}</template>
        </el-table-column>
        <el-table-column prop="remark" label="备注" show-overflow-tooltip />
        <el-table-column prop="verify_time" label="核验时间" width="170" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import api from '@/api';
import { Search, Download } from '@element-plus/icons-vue';

const list = ref([]);
const loading = ref(false);
const plate = ref('');
const range = ref([]);
const s = reactive({ total: 0, coupon: 0, manual: 0, offline: 0, fee: 0 });

const tType = (t) => ({ coupon: 'success', manual: 'warning', offline: 'info' }[t] || 'primary');

async function load() {
  loading.value = true;
  try {
    let rows = await api.booth.getRecent();
    if (plate.value) rows = rows.filter(r => r.plate_no.includes(plate.value.toUpperCase()));
    if (range.value?.length === 2) {
      rows = rows.filter(r => r.verify_time >= range.value[0] && r.verify_time <= range.value[1]);
    }
    list.value = rows;
    s.total = rows.length;
    s.coupon = rows.filter(r => r.verify_type === 'coupon').length;
    s.manual = rows.filter(r => r.verify_type === 'manual').length;
    s.offline = rows.filter(r => r.verify_type === 'offline').length;
    s.fee = rows.reduce((x, r) => x + (r.actual_fee || 0), 0);
  } finally { loading.value = false; }
}

function exportCSV() {
  const headers = ['车牌', '岗亭', '类型', '券号', '优惠时长', '停车时长', '应收', '实收', '操作员', '备注', '核验时间'];
  const rows = list.value.map(r => [
    r.plate_no, r.booth_id, r.verify_type, r.coupon_no || '',
    (r.discount_hours || 0) + 'h', (r.parking_duration || 0) + '分',
    r.parking_fee, r.actual_fee, r.operator_name || r.operator_id,
    r.remark || '', r.verify_time
  ]);
  const csv = [headers, ...rows].map(x => x.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `核验记录_${Date.now()}.csv`;
  link.click();
}

onMounted(load);
</script>
