<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🧾 对账看板</h2>
    </div>

    <el-tabs v-model="activeTab" type="border-card">
      <el-tab-pane label="按日期对账" name="daily">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
          <el-date-picker v-model="range" type="daterange" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" size="large" />
          <el-button type="primary" size="large" @click="loadDaily" :icon="Search">查询</el-button>
          <el-button size="large" @click="exportExcel" :icon="Download">导出</el-button>
        </div>

        <div v-if="data.totals" class="totals-bar">
          <div class="total-item">
            <span class="k">📅 查询区间</span>
            <span class="v">{{ data.date_range?.start?.slice(0,10) }} ~ {{ data.date_range?.end?.slice(0,10) }}</span>
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
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="月度对账" name="monthly">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
          <el-date-picker v-model="monthVal" type="month" placeholder="选择月份" value-format="YYYY-MM" size="large" />
          <el-button type="primary" size="large" @click="loadMonthly">查询月度对账</el-button>
        </div>

        <div v-if="monthlyData.totals" class="totals-bar">
          <div class="total-item">
            <span class="k">📅 对账月份</span>
            <span class="v">{{ monthlyData.month }}</span>
          </div>
          <div class="total-item">
            <span class="k">🎫 全额券发放</span>
            <span class="v blue">¥{{ Number(monthlyData.totals.full_issued_amount).toLocaleString() }} ({{ monthlyData.totals.full_issued_count }}张)</span>
          </div>
          <div class="total-item">
            <span class="k">🏷️ 折扣券发放</span>
            <span class="v warn">¥{{ Number(monthlyData.totals.discount_issued_amount).toLocaleString() }} ({{ monthlyData.totals.discount_issued_count }}张)</span>
          </div>
          <div class="total-item">
            <span class="k">✅ 核销数</span>
            <span class="v green">{{ monthlyData.totals.verified_count }}</span>
          </div>
          <div class="total-item">
            <span class="k">↩️ 撤销数</span>
            <span class="v gray">{{ monthlyData.totals.revoked_count }} (¥{{ Number(monthlyData.totals.revoked_amount).toLocaleString() }})</span>
          </div>
          <div class="total-item">
            <span class="k">⚖️ 对账平衡</span>
            <span class="v" :class="monthlyData.totals.balance_check?.is_balanced ? 'green' : 'red'">
              {{ monthlyData.totals.balance_check?.is_balanced ? '✅ 已平账' : '⚠️ 不平衡' }}
            </span>
          </div>
        </div>

        <div class="card-shadow" style="padding:16px;">
          <el-table :data="monthlyData.shops || []" v-loading="monthlyLoading" border stripe>
            <el-table-column prop="shop_code" label="门店编码" width="100" fixed />
            <el-table-column prop="shop_name" label="门店名称" width="130" fixed />
            <el-table-column label="全额券" align="center">
              <el-table-column label="金额" width="100" align="right">
                <template #default="{row}">¥{{ Number(row.full_issued_amount).toLocaleString() }}</template>
              </el-table-column>
              <el-table-column label="数量" width="70" align="right">
                <template #default="{row}">{{ row.full_issued_count }}</template>
              </el-table-column>
            </el-table-column>
            <el-table-column label="折扣券" align="center">
              <el-table-column label="金额" width="100" align="right">
                <template #default="{row}">¥{{ Number(row.discount_issued_amount).toLocaleString() }}</template>
              </el-table-column>
              <el-table-column label="数量" width="70" align="right">
                <template #default="{row}">{{ row.discount_issued_count }}</template>
              </el-table-column>
            </el-table-column>
            <el-table-column label="核销" width="70" align="right">
              <template #default="{row}"><span class="text-success">{{ row.verified_count }}</span></template>
            </el-table-column>
            <el-table-column label="撤销" width="70" align="right">
              <template #default="{row}"><span class="text-danger">{{ row.revoked_count }}</span></template>
            </el-table-column>
            <el-table-column label="月度额度" width="100" align="right">
              <template #default="{row}">¥{{ Number(row.monthly_quota || 0).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="已用" width="90" align="right">
              <template #default="{row}">¥{{ Number(row.monthly_used || 0).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="剩余" width="90" align="right">
              <template #default="{row}">
                <span :class="(row.monthly_remain || 0) > 0 ? 'text-success' : 'text-danger'">¥{{ Number(row.monthly_remain || 0).toLocaleString() }}</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="异常出场" name="exceptions">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
          <el-date-picker v-model="excRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" size="large" />
          <el-button type="primary" @click="loadExceptions">查询异常出场</el-button>
        </div>
        <div class="card-shadow" style="padding:16px;">
          <el-table :data="excData.exceptions || []" v-loading="excLoading" border stripe size="small">
            <el-table-column prop="plate_no" label="车牌" width="110" />
            <el-table-column prop="in_time" label="入场时间" width="160" />
            <el-table-column prop="exit_type_text" label="异常类型" width="110">
              <template #default="{row}">
                <el-tag size="small" type="danger">{{ row.exit_type_text }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="coupon_status" label="券状态" width="110" />
            <el-table-column prop="customer_phone" label="客户电话" width="130" />
            <el-table-column label="停车费" width="90" align="right">
              <template #default="{row}">¥{{ row.total_fee || 0 }}</template>
            </el-table-column>
            <el-table-column prop="status" label="当前状态" width="90">
              <template #default="{row}">
                <el-tag size="small" :type="row.status === 'exception' ? 'danger' : 'info'">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!excLoading && (!excData.exceptions || excData.exceptions.length === 0)" description="暂无异常出场记录" />
        </div>
      </el-tab-pane>

      <el-tab-pane label="后补核销" name="retro">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;">
          <el-date-picker v-model="retroRange" type="daterange" range-separator="至" start-placeholder="开始" end-placeholder="结束" value-format="YYYY-MM-DD" size="large" />
          <el-button type="primary" @click="loadRetro">查询后补核销</el-button>
        </div>
        <div class="card-shadow" style="padding:16px;">
          <h4 style="margin:0 0 8px;">🔄 离线后补核销记录</h4>
          <el-table :data="retroData.retro_records || []" v-loading="retroLoading" border stripe size="small">
            <el-table-column prop="plate_no" label="车牌" width="110" />
            <el-table-column prop="out_time" label="出场时间" width="160" />
            <el-table-column prop="exit_type_text" label="类型" width="130">
              <template #default="{row}">
                <el-tag size="small" type="warning">{{ row.exit_type_text }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="coupon_no" label="关联券号" width="180" />
            <el-table-column prop="shop_name" label="门店" width="120" />
            <el-table-column label="停车费" width="90" align="right">
              <template #default="{row}">¥{{ row.total_fee || 0 }}</template>
            </el-table-column>
            <el-table-column label="优惠额" width="90" align="right">
              <template #default="{row}">¥{{ row.discount_fee || 0 }}</template>
            </el-table-column>
            <el-table-column label="实缴" width="90" align="right">
              <template #default="{row}">¥{{ row.paid_fee || 0 }}</template>
            </el-table-column>
            <el-table-column prop="retro_remark" label="后补备注" min-width="160" />
          </el-table>
        </div>

        <div class="card-shadow" style="padding:16px;margin-top:16px;">
          <h4 style="margin:0 0 8px;">📋 离线补对匹配结果</h4>
          <el-table :data="retroData.offline_reconcile || []" border stripe size="small">
            <el-table-column prop="record_no" label="离线记录号" width="180" />
            <el-table-column prop="plate_no" label="车牌" width="110" />
            <el-table-column label="类型" width="70">
              <template #default="{row}">{{ row.action_type === 'in' ? '入场' : '出场' }}</template>
            </el-table-column>
            <el-table-column prop="action_time" label="动作时间" width="160" />
            <el-table-column label="补对状态" width="100">
              <template #default="{row}">
                <el-tag size="small" :type="row.reconcile_status === 'matched' ? 'success' : (row.reconcile_status === 'unmatched' ? 'danger' : 'warning')">
                  {{ { matched: '已匹配', unmatched: '未匹配', pending: '待处理', skipped: '已跳过' }[row.reconcile_status] || row.reconcile_status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="reconcile_remark" label="补对说明" min-width="140" />
            <el-table-column prop="reconcile_at" label="补对时间" width="160" />
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue';
import api from '@/api';
import { Search, Download } from '@element-plus/icons-vue';
import dayjs from 'dayjs';

const activeTab = ref('daily');
const loading = ref(false);
const data = reactive({ shops: [], totals: {}, date_range: {} });
const range = ref([dayjs().subtract(29, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]);

const monthVal = ref(dayjs().format('YYYY-MM'));
const monthlyLoading = ref(false);
const monthlyData = reactive({ shops: [], totals: {}, month: '' });

const excRange = ref([dayjs().subtract(7, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]);
const excLoading = ref(false);
const excData = reactive({ exceptions: [] });

const retroRange = ref([dayjs().subtract(7, 'day').format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]);
const retroLoading = ref(false);
const retroData = reactive({ retro_records: [], offline_reconcile: [] });

async function loadDaily() {
  loading.value = true;
  try {
    const [start, end] = range.value || [];
    const res = await api.dashboard.reconciliation({
      start_date: start + ' 00:00:00',
      end_date: (end || start) + ' 23:59:59'
    });
    Object.assign(data, res);
  } finally { loading.value = false; }
}

async function loadMonthly() {
  monthlyLoading.value = true;
  try {
    const res = await api.dashboard.monthlyReconciliation({ month: monthVal.value });
    Object.assign(monthlyData, res);
  } finally { monthlyLoading.value = false; }
}

async function loadExceptions() {
  excLoading.value = true;
  try {
    const [start, end] = excRange.value || [];
    const res = await api.dashboard.exceptionExits({
      start_date: start + ' 00:00:00',
      end_date: (end || start) + ' 23:59:59'
    });
    Object.assign(excData, res);
  } finally { excLoading.value = false; }
}

async function loadRetro() {
  retroLoading.value = true;
  try {
    const [start, end] = retroRange.value || [];
    const res = await api.dashboard.retroVerifications({
      start_date: start + ' 00:00:00',
      end_date: (end || start) + ' 23:59:59'
    });
    Object.assign(retroData, res);
  } finally { retroLoading.value = false; }
}

function exportExcel() {
  const headers = ['门店编码', '门店名称', '发券数', '核销数', '撤销数', '未使用', '核销率', '消费总额', '优惠总额'];
  const rows = data.shops.map(r => [
    r.shop_code, r.shop_name, r.issued, r.verified, r.revoked, r.issued - r.verified - r.revoked,
    (r.issued ? (r.verified / r.issued * 100).toFixed(1) : 0) + '%',
    r.order_total, r.discount_total
  ]);
  const csv = [headers, ...rows].map(x => x.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `对账明细_${range.value[0]}_${range.value[1] || range.value[0]}.csv`;
  link.click();
}

onMounted(loadDaily);
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
.total-item .v { font-size: 16px; font-weight: 700; margin-top: 4px; color: #111827; }
.total-item .v.blue { color: #2563eb; }
.total-item .v.green { color: #059669; }
.total-item .v.red { color: #dc2626; }
.total-item .v.warn { color: #d97706; }
.total-item .v.gray { color: #6b7280; }
</style>
