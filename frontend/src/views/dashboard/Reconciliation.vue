<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🧾 对账看板 · 门店发券核销明细</h2>
      <div class="flex-row">
        <el-date-picker v-model="range" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" size="large" />
        <el-button type="primary" size="large" @click="load" :icon="Search">查询</el-button>
        <el-button size="large" @click="exportExcel" :icon="Download">导出</el-button>
      </div>
    </div>

    <div v-if="data.totals" class="totals-bar">
      <div class="total-item">
        <span class="k">📅 查询区间</span>
        <span class="v">{{ data.date_range?.start || '-' }} ~ {{ data.date_range?.end || '-' }}</span>
      </div>
      <div class="total-item">
        <span class="k">🎫 发券总数</span>
        <span class="v blue">{{ data.totals.issued }}</span>
      </div>
      <div class="total-item">
        <span class="k">✅ 核销数</span>
        <span class="v green">{{ data.totals.verified }}</span>
      </div>
      <div class="total-item">
        <span class="k">↩️ 撤销数</span>
        <span class="v gray">{{ data.totals.revoked }}</span>
      </div>
      <div class="total-item">
        <span class="k">💰 消费总额</span>
        <span class="v red">¥{{ Number(data.totals.order_total).toLocaleString() }}</span>
      </div>
      <div class="total-item">
        <span class="k">💝 优惠总额</span>
        <span class="v warn">¥{{ Number(data.totals.discount_total).toLocaleString() }}</span>
      </div>
      <div class="total-item">
        <span class="k">📊 核销率</span>
        <span class="v" :class="rateColor">
          {{ data.totals.issued ? (data.totals.verified / data.totals.issued * 100).toFixed(1) : '0' }}%
        </span>
      </div>
    </div>

    <div class="card-shadow" style="padding:16px;">
      <el-table :data="data.shops || []" v-loading="loading" border stripe>
        <el-table-column prop="shop_code" label="门店编码" width="110" fixed />
        <el-table-column prop="shop_name" label="门店名称" min-width="140" fixed />
        <el-table-column label="发券数" width="90" align="right">
          <template #default="{row}"><b>{{ row.issued }}</b></template>
        </el-table-column>
        <el-table-column label="核销数" width="90" align="right">
          <template #default="{row}"><span class="text-success">{{ row.verified }}</span></template>
        </el-table-column>
        <el-table-column label="撤销数" width="90" align="right">
          <template #default="{row}"><span class="text-danger">{{ row.revoked }}</span></template>
        </el-table-column>
        <el-table-column label="未使用" width="90" align="right">
          <template #default="{row}">{{ row.issued - row.verified - row.revoked }}</template>
        </el-table-column>
        <el-table-column label="核销率" width="120">
          <template #default="{row}">
            <el-progress :percentage="row.issued ? Math.round(row.verified / row.issued * 100) : 0" :stroke-width="14" />
          </template>
        </el-table-column>
        <el-table-column label="关联消费额" width="130" align="right">
          <template #default="{row}"><b>¥{{ Number(row.order_total).toLocaleString() }}</b></template>
        </el-table-column>
        <el-table-column label="核销优惠额" width="130" align="right">
          <template #default="{row}"><span class="text-success">¥{{ Number(row.discount_total).toLocaleString() }}</span></template>
        </el-table-column>
        <el-table-column label="单均优惠" width="110" align="right">
          <template #default="{row}">
            {{ row.verified ? '¥' + (row.discount_total / row.verified).toFixed(0) : '-' }}
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-divider />
    <div class="recon-extra">
      <div class="card-shadow recon-chart-card" style="flex:1;">
        <h3 style="margin:0 0 12px;">📈 各门店发券vs核销对比</h3>
        <div ref="chartRef" style="height:320px;"></div>
      </div>

      <div class="card-shadow recon-chart-card" style="flex:1;">
        <h3 style="margin:0 0 12px;">🔍 对账说明 / 校验规则</h3>
        <el-timeline style="padding:8px;">
          <el-timeline-item type="primary" icon="📋">门店发券 → 记录订单+金额+有效期 → 扣除门店额度</el-timeline-item>
          <el-timeline-item type="success" icon="🔗">顾客绑券 → 后端校验金额达标/一单一券/车辆在场/券未过期</el-timeline-item>
          <el-timeline-item type="warning" icon="🚧">岗亭核验 → 自动核销优惠券，记录优惠时长和金额</el-timeline-item>
          <el-timeline-item type="danger" icon="↩️">商户撤券 → 校验未核销/车辆未出场 → 恢复额度/订单状态</el-timeline-item>
          <el-timeline-item type="info" icon="🚪">人工放行 → 豁免>50元需审批 → 计入对账异常项</el-timeline-item>
        </el-timeline>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, computed, watch } from 'vue';
import api from '@/api';
import { Search, Download } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import * as echarts from 'echarts';

const loading = ref(false);
const data = reactive({ shops: [], totals: {}, date_range: {} });
const range = ref([dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]);
const chartRef = ref(null);
let chart;

const rateColor = computed(() => {
  const r = data.totals.issued ? data.totals.verified / data.totals.issued : 0;
  if (r >= 0.7) return 'green';
  if (r >= 0.4) return 'warn';
  return 'red';
});

async function load() {
  loading.value = true;
  try {
    const [start, end] = range.value || [];
    const res = await api.dashboard.reconciliation({
      start_date: start + ' 00:00:00',
      end_date: (end || start) + ' 23:59:59'
    });
    Object.assign(data, res);
    await nextTick();
    renderChart();
  } finally { loading.value = false; }
}

function renderChart() {
  if (!chartRef.value) return;
  if (!chart) chart = echarts.init(chartRef.value);
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['发券数', '核销数', '核销率(%)'] },
    grid: { left: 50, right: 50, top: 40, bottom: 60 },
    xAxis: { type: 'category', data: data.shops.map(s => s.shop_name), axisLabel: { rotate: 30 } },
    yAxis: [
      { type: 'value', name: '数量' },
      { type: 'value', name: '核销率(%)', max: 100 }
    ],
    series: [
      { name: '发券数', type: 'bar', data: data.shops.map(s => s.issued), itemStyle: { color: '#3b82f6', borderRadius: [6,6,0,0] }, barWidth: 20 },
      { name: '核销数', type: 'bar', data: data.shops.map(s => s.verified), itemStyle: { color: '#10b981', borderRadius: [6,6,0,0] }, barWidth: 20 },
      { name: '核销率(%)', type: 'line', yAxisIndex: 1, smooth: true, data: data.shops.map(s => s.issued ? (s.verified / s.issued * 100).toFixed(1) : 0), itemStyle: { color: '#f59e0b' }, lineStyle: { width: 3 } }
    ]
  });
}

function exportExcel() {
  const headers = ['门店编码', '门店名称', '发券数', '核销数', '撤销数', '未使用', '核销率', '消费总额', '优惠总额', '单均优惠'];
  const rows = data.shops.map(r => [
    r.shop_code, r.shop_name, r.issued, r.verified, r.revoked, r.issued - r.verified - r.revoked,
    (r.issued ? (r.verified / r.issued * 100).toFixed(1) : 0) + '%',
    r.order_total, r.discount_total,
    r.verified ? (r.discount_total / r.verified).toFixed(0) : '-'
  ]);
  const csv = [headers, ...rows, [
    '合计', '', data.totals.issued, data.totals.verified, data.totals.revoked,
    data.totals.issued - data.totals.verified - data.totals.revoked,
    (data.totals.issued ? (data.totals.verified / data.totals.issued * 100).toFixed(1) : 0) + '%',
    data.totals.order_total, data.totals.discount_total, ''
  ]].map(x => x.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `对账明细_${range.value[0]}_${range.value[1] || range.value[0]}.csv`;
  link.click();
}

window.addEventListener?.('resize', () => chart?.resize());
watch(range, load);
onMounted(load);
</script>

<style scoped>
.totals-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f8fafc, #eef2ff);
  border-radius: 10px;
  margin-bottom: 20px;
}
.total-item {
  display: flex;
  flex-direction: column;
  padding: 8px 14px;
  background: white;
  border-radius: 8px;
  flex: 1;
  min-width: 140px;
}
.total-item .k { font-size: 12px; color: #6b7280; }
.total-item .v { font-size: 18px; font-weight: 700; margin-top: 4px; color: #111827; }
.total-item .v.blue { color: #2563eb; }
.total-item .v.green { color: #059669; }
.total-item .v.red { color: #dc2626; }
.total-item .v.warn { color: #d97706; }
.total-item .v.gray { color: #6b7280; }
.recon-extra { display: flex; gap: 20px; flex-wrap: wrap; }
.recon-chart-card { padding: 18px; min-width: 320px; }
</style>
