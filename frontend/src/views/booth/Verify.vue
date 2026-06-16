<template>
  <div class="page-container booth-page">
    <div class="page-header">
      <h2 class="page-title">🚧 出场核验（岗亭作业端）</h2>
      <div class="flex-row">
        <el-tag type="success" size="large">北1岗亭 · BOOTH_N1</el-tag>
        <el-badge :value="exceptionCount" class="item" type="danger">
          <el-button @click="loadStatus">异常监控</el-button>
        </el-badge>
      </div>
    </div>

    <div class="verify-main">
      <div class="verify-left card-shadow">
        <h3 style="margin:0 0 16px;">📷 车牌识别</h3>
        <div class="plate-input-box">
          <el-input
            v-model="plate"
            placeholder="请输入或扫描车牌号"
            size="large"
            maxlength="8"
            style="text-align:center;letter-spacing:6px;font-size:22px;height:64px;font-weight:700;text-transform:uppercase;"
            clearable
            @keyup.enter="verify"
          >
            <template #prefix><el-icon style="font-size:22px;"><Camera /></el-icon></template>
          </el-input>
          <div class="quick-plates">
            <el-tag
              v-for="(p,i) in quickPlates" :key="i"
              size="large"
              effect="plain"
              @click="setPlate(p)"
            >
              {{ p }}
            </el-tag>
          </div>
        </div>

        <div style="display:flex;gap:12px;margin-top:16px;">
          <el-button size="large" type="primary" style="flex:1;height:56px;font-size:18px;" @click="verify" :loading="verifying" :icon="Search">
            核验出场
          </el-button>
          <el-button size="large" type="success" plain style="flex:1;height:56px;font-size:18px;" @click="registerIn" :icon="Promotion">
            入场登记
          </el-button>
        </div>

        <el-alert v-if="lastResult" :type="lastResult.can_pass ? 'success' : 'warning'" :closable="false" style="margin-top:20px;">
          <div style="font-size:14px;line-height:1.8;">
            <div><b>车牌：</b>{{ lastResult.plate_no }}</div>
            <div><b>入场时间：</b>{{ lastResult.in_time }}</div>
            <div v-if="lastResult.out_time"><b>出场时间：</b>{{ lastResult.out_time }}</div>
            <div><b>停车时长：</b>{{ lastResult.parked_minutes }}分钟</div>
            <div><b>应付总额：</b><span style="color:#ef4444;font-size:18px;">¥{{ lastResult.total_fee }}</span></div>
            <div v-if="lastResult.coupon_used">
              <b>优惠券：</b><span style="color:#10b981;">{{ lastResult.coupon_used }} (抵扣{{ lastResult.discount_hours }}小时，¥{{ lastResult.discount_fee }})</span>
            </div>
            <div><b>实付：</b><b :style="{color: lastResult.payable > 0 ? '#f59e0b' : '#10b981', fontSize:'20px'}">
              {{ lastResult.payable > 0 ? '¥' + lastResult.payable : '¥0.00 (免费通行)' }}
            </b></div>
            <div style="margin-top:8px;padding:8px 12px;background:rgba(0,0,0,.03);border-radius:6px;">
              {{ lastResult.message }}
            </div>
            <div v-if="lastResult.need_manual_release" style="margin-top:10px;text-align:right;">
              <el-button type="warning" size="large" @click="goRelease">→ 去人工放行</el-button>
            </div>
          </div>
        </el-alert>

        <div style="margin-top:20px;">
          <h4 style="margin:0 0 12px;">📊 今日概览</h4>
          <div class="mini-stats">
            <div class="mini-stat"><div class="n">{{ statusData.stats?.normal_coupon || 0 }}</div><div class="t">优惠券通行</div></div>
            <div class="mini-stat"><div class="n">{{ statusData.stats?.no_coupon_paid || 0 }}</div><div class="t">缴费通行</div></div>
            <div class="mini-stat warn"><div class="n">{{ statusData.stats?.manual_release || 0 }}</div><div class="t">人工放行</div></div>
            <div class="mini-stat err"><div class="n">{{ statusData.stats?.exception || 0 }}</div><div class="t">待处理异常</div></div>
          </div>
        </div>
      </div>

      <div class="verify-right card-shadow">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <h3 style="margin:0;">🚨 在场异常车辆</h3>
          <el-button size="small" @click="loadStatus" :icon="Refresh">刷新</el-button>
        </div>
        <el-table :data="statusData.issues || []" size="small" empty-text="暂无异常" stripe>
          <el-table-column label="车牌" width="110">
            <template #default="{row}"><el-tag type="danger" size="small">{{ row.plate_no }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="in_time" label="入场时间" width="150" />
          <el-table-column label="费用" width="80">
            <template #default="{row}"><b class="text-danger">¥{{ row.total_fee }}</b></template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{row}">
              <el-tag size="small" type="danger">异常</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{row}">
              <el-button size="small" type="warning" text @click="setPlate(row.plate_no);goRelease();">
                放行
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-divider />
        <h3 style="margin:0 0 12px;">📋 最近核验</h3>
        <el-table :data="recentList" size="small" stripe height="320" empty-text="暂无记录">
          <el-table-column label="车牌" width="90">
            <template #default="{row}">{{ row.plate_no }}</template>
          </el-table-column>
          <el-table-column label="类型" width="80">
            <template #default="{row}">
              <el-tag size="small" :type="vt(row.verify_type)">{{ row.verify_type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="费用" width="80">
            <template #default="{row}">¥{{ row.actual_fee }}</template>
          </el-table-column>
          <el-table-column prop="verify_time" label="时间" width="140" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import api from '@/api';
import { ElMessage } from 'element-plus';
import { Camera, Search, Promotion, Refresh } from '@element-plus/icons-vue';

const plate = ref('');
const verifying = ref(false);
const lastResult = ref(null);
const quickPlates = ['京A12345', '京B67890', '京C11111'];
const recentList = ref([]);
const statusData = reactive({ stats: {}, issues: [] });
const exceptionCount = ref(0);
let timer;

const vt = (t) => ({ coupon: 'success', manual: 'warning', offline: 'info' }[t] || 'info');

function setPlate(p) { plate.value = p; }

async function verify() {
  if (!plate.value) { ElMessage.warning('请输入车牌号'); return; }
  verifying.value = true;
  try {
    lastResult.value = await api.booth.verifyExit({ plate_no: plate.value, booth_id: 'BOOTH_N1' });
    loadRecent();
    loadStatus();
  } finally { verifying.value = false; }
}

async function registerIn() {
  if (!plate.value) { ElMessage.warning('请输入车牌号'); return; }
  try {
    await api.booth.registerIn({ plate_no: plate.value, booth_id: 'BOOTH_N1' });
    ElMessage.success('车辆入场登记成功');
  } catch (e) {}
}

async function loadRecent() {
  recentList.value = await api.booth.getRecent();
}

async function loadStatus() {
  try {
    const data = await api.dashboard.exitStatus();
    Object.assign(statusData, data);
    exceptionCount.value = data.stats?.exception || 0;
  } catch (e) {}
}

function goRelease() {
  location.hash = `/booth/release?plate=${plate.value}`;
}

onMounted(() => {
  loadRecent();
  loadStatus();
  timer = setInterval(loadStatus, 30000);
});
onUnmounted(() => clearInterval(timer));
</script>

<style scoped>
.booth-page { background: #f0f4f8; }
.verify-main {
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 20px;
}
@media (max-width: 1100px) { .verify-main { grid-template-columns: 1fr; } }
.verify-left { padding: 24px; }
.verify-right { padding: 20px; }
.plate-input-box {
  padding: 20px;
  background: linear-gradient(135deg, #eff6ff, #e0e7ff);
  border-radius: 12px;
}
.quick-plates {
  margin-top: 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
.quick-plates .el-tag { cursor: pointer; font-size: 14px; padding: 4px 10px; }
.mini-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.mini-stat {
  text-align: center;
  padding: 14px 8px;
  background: #f0fdf4;
  border-radius: 10px;
}
.mini-stat.warn { background: #fffbeb; }
.mini-stat.err { background: #fef2f2; }
.mini-stat .n { font-size: 26px; font-weight: 800; color: #15803d; }
.mini-stat.warn .n { color: #b45309; }
.mini-stat.err .n { color: #b91c1c; }
.mini-stat .t { font-size: 12px; color: #6b7280; margin-top: 4px; }
</style>
