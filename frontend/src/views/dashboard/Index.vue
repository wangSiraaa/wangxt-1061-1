<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">📊 运营大屏看板</h2>
      <div class="flex-row">
        <el-tag type="primary" size="large">运营数据 · 实时刷新</el-tag>
        <el-button :icon="Refresh" circle @click="load" />
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-card" style="background:linear-gradient(135deg,#667eea,#764ba2);">
        <div class="kpi-label">🚗 在场车辆</div>
        <div class="kpi-value">{{ summary?.in_park_now?.cnt || 0 }}</div>
        <div class="kpi-trend">辆停在场内</div>
      </div>
      <div class="kpi-card" style="background:linear-gradient(135deg,#f093fb,#f5576c);">
        <div class="kpi-label">🎟️ 今日发券</div>
        <div class="kpi-value">{{ summary?.issued_today?.cnt || 0 }}</div>
        <div class="kpi-trend">¥{{ Number(summary?.issued_today?.amt || 0).toLocaleString() }} 消费额</div>
      </div>
      <div class="kpi-card" style="background:linear-gradient(135deg,#4facfe,#00f2fe);">
        <div class="kpi-label">✅ 今日核销</div>
        <div class="kpi-value">{{ summary?.verified_today?.cnt || 0 }}</div>
        <div class="kpi-trend">¥{{ Number(summary?.verified_today?.discount_amt || 0).toLocaleString() }} 优惠额</div>
      </div>
      <div class="kpi-card" style="background:linear-gradient(135deg,#43e97b,#38f9d7);">
        <div class="kpi-label">🚪 今日出场</div>
        <div class="kpi-value">{{ summary?.exited_today?.cnt || 0 }}</div>
        <div class="kpi-trend">实收 ¥{{ Number(summary?.exited_today?.paid_fee || 0).toLocaleString() }}</div>
      </div>
      <div class="kpi-card" style="background:linear-gradient(135deg,#fa709a,#fee140);">
        <div class="kpi-label">🔓 人工放行</div>
        <div class="kpi-value">{{ summary?.manual_today?.cnt || 0 }}</div>
        <div class="kpi-trend">豁免 ¥{{ Number(summary?.manual_today?.waived_amt || 0).toLocaleString() }}</div>
      </div>
      <div class="kpi-card" style="background:linear-gradient(135deg,#30cfd0,#330867);">
        <div class="kpi-label">⚠️ 待处理</div>
        <div class="kpi-value text-warning" style="color:#fff59d;">
          {{ (summary?.pending_approvals?.cnt || 0) + (summary?.exception_count?.cnt || 0) }}
        </div>
        <div class="kpi-trend">
          待审批{{ summary?.pending_approvals?.cnt || 0 }} + 异常{{ summary?.exception_count?.cnt || 0 }}
        </div>
      </div>
    </div>

    <div class="dashboard-row">
      <div class="card-shadow dashboard-chart" style="flex:1.3;">
        <h3 class="chart-title">📈 今日24小时出场趋势</h3>
        <div ref="hourlyChartRef" style="height:300px;"></div>
      </div>

      <div class="card-shadow dashboard-chart" style="flex:1;">
        <h3 class="chart-title">🎫 优惠券状态分布</h3>
        <div ref="statusChartRef" style="height:300px;"></div>
      </div>
    </div>

    <div class="dashboard-row">
      <div class="card-shadow dashboard-chart" style="flex:1.2;">
        <h3 class="chart-title">🏬 门店发券排名</h3>
        <el-table :data="ranking" size="small" stripe>
          <el-table-column label="排名" width="70" align="center">
            <template #default="{$index}">
              <el-tag v-if="$index < 3" :type="['danger','warning','info'][$index]" size="small">
                {{ ['🥇','🥈','🥉'][$index] }}
              </el-tag>
              <span v-else style="color:#6b7280;">#{{ $index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column label="门店" prop="shop_name" />
          <el-table-column label="发券数" width="90">
            <template #default="{row}"><b>{{ row.coupon_count }}</b></template>
          </el-table-column>
          <el-table-column label="核销数" width="90">
            <template #default="{row}">{{ row.used_count }}</template>
          </el-table-column>
          <el-table-column label="消费总额" width="110">
            <template #default="{row}">¥{{ Number(row.order_amount).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="优惠总额" width="110">
            <template #default="{row}">¥{{ Number(row.used_hours * 10).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="额度使用率" width="160">
            <template #default="{row}">
              <el-progress :percentage="Math.min(100, Math.round(row.coupon_used / (row.quota_remain + row.coupon_used) * 100))" />
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="card-shadow dashboard-chart" style="flex:1;">
        <h3 class="chart-title">🚨 在场车辆TOP列表</h3>
        <el-table :data="plateStatus" size="small" stripe height="310" empty-text="暂无在场车辆">
          <el-table-column label="车牌" width="110">
            <template #default="{row}"><el-tag type="primary" size="small">{{ row.plate_no }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="in_time" label="入场" width="150" />
          <el-table-column label="优惠券" width="70">
            <template #default="{row}">
              <el-tag v-if="row.coupon_count" size="small" type="success">{{ row.coupon_count }}</el-tag>
              <el-tag v-else size="small" type="danger">无</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="手机号" width="120">
            <template #default="{row}">{{ row.customer_phone || '未登记' }}</template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import api from '@/api';
import { Refresh } from '@element-plus/icons-vue';
import * as echarts from 'echarts';

const summary = ref(null);
const ranking = ref([]);
const plateStatus = ref([]);
const hourlyData = ref([]);
const couponStatus = ref({});

const hourlyChartRef = ref(null);
const statusChartRef = ref(null);
let hourlyChart, statusChart;
let timer;

async function load() {
  const [s, r, h, cs, ps] = await Promise.all([
    api.dashboard.summary(),
    api.dashboard.shopRanking(),
    api.dashboard.hourlyExit(),
    api.dashboard.couponStatus(),
    api.dashboard.plateStatus()
  ]);
  summary.value = s;
  ranking.value = r;
  hourlyData.value = h;
  couponStatus.value = cs;
  plateStatus.value = ps;
  await nextTick();
  renderCharts();
}

function renderCharts() {
  if (hourlyChartRef.value) {
    if (!hourlyChart) hourlyChart = echarts.init(hourlyChartRef.value);
    hourlyChart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: ['出场总数', '优惠券放行', '人工放行'] },
      grid: { left: 40, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: hourlyData.value.map(d => d.hour) },
      yAxis: { type: 'value' },
      series: [
        { name: '出场总数', type: 'bar', stack: 'a', data: hourlyData.value.map(d => d.exit_count), itemStyle: { color: '#8b5cf6' } },
        { name: '优惠券放行', type: 'line', smooth: true, data: hourlyData.value.map(d => d.coupon_exit), itemStyle: { color: '#10b981' }, lineStyle: { width: 3 } },
        { name: '人工放行', type: 'line', smooth: true, data: hourlyData.value.map(d => d.release_exit), itemStyle: { color: '#f59e0b' } }
      ]
    });
  }

  if (statusChartRef.value) {
    if (!statusChart) statusChart = echarts.init(statusChartRef.value);
    const labels = { issued: '已发券', bound: '已绑定', verified: '已核销', revoked: '已撤销', expired: '已过期' };
    const colors = { issued: '#f59e0b', bound: '#3b82f6', verified: '#10b981', revoked: '#6b7280', expired: '#ef4444' };
    const data = Object.keys(labels).map(k => ({
      name: labels[k],
      value: couponStatus.value[k] || 0,
      itemStyle: { color: colors[k] }
    }));
    statusChart.setOption({
      tooltip: { trigger: 'item', formatter: '{b}: {c}张 ({d}%)' },
      legend: { bottom: 0, type: 'scroll' },
      series: [{
        type: 'pie',
        radius: ['45%', '72%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
        label: { formatter: '{b}\n{c}张' },
        data
      }]
    });
  }
}

const resizeHandler = () => {
  hourlyChart?.resize();
  statusChart?.resize();
};

onMounted(async () => {
  await load();
  window.addEventListener('resize', resizeHandler);
  timer = setInterval(load, 60000);
});
onUnmounted(() => {
  window.removeEventListener('resize', resizeHandler);
  hourlyChart?.dispose();
  statusChart?.dispose();
  clearInterval(timer);
});
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.kpi-card {
  color: white;
  border-radius: 14px;
  padding: 20px 22px;
  box-shadow: 0 4px 20px rgba(0,0,0,.1);
}
.kpi-label { font-size: 14px; opacity: .9; margin-bottom: 8px; }
.kpi-value { font-size: 34px; font-weight: 800; line-height: 1.1; }
.kpi-trend { font-size: 13px; opacity: .85; margin-top: 6px; }
.dashboard-row {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.dashboard-chart { padding: 18px; min-width: 320px; }
.chart-title {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 600;
  padding-bottom: 10px;
  border-bottom: 1px solid #f3f4f6;
}
</style>
