<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">🔍 车牌信息查询（出场异常处理入口）</h2>
    </div>

    <div class="card-shadow" style="padding:20px;margin-bottom:20px;">
      <div class="flex-row" style="margin-bottom:16px;">
        <el-input v-model="plate" placeholder="请输入车牌号，如 京A12345" size="large" style="width:300px;letter-spacing:2px;text-transform:uppercase;" clearable @keyup.enter="query" />
        <el-button type="primary" size="large" @click="query" :icon="Search" :loading="loading">查询完整链路</el-button>
        <el-tag v-for="p in quickPlates" :key="p" size="large" class="quick-tag" effect="plain" @click="setPlate(p)">
          {{ p }}
        </el-tag>
      </div>
      <div class="flex-row" style="gap:20px;">
        <span style="color:#6b7280;">快速入口：</span>
        <el-button link type="primary" @click="$router.push('/service/releases')">人工放行审批 →</el-button>
        <el-button link type="primary" @click="$router.push('/service/approvals')">异常审批 →</el-button>
        <el-button link type="primary" @click="$router.push('/service/trace')">全链路追踪 →</el-button>
      </div>
    </div>

    <div v-if="info" class="info-grid">
      <div class="info-col">
        <div class="card-shadow info-card">
          <div class="card-title"><el-icon><Van /></el-icon>车辆信息</div>
          <div v-if="info.plate" class="info-body">
            <div class="row"><span class="k">车牌：</span><el-tag type="primary" size="large">{{ info.plate.plate_no }}</el-tag></div>
            <div class="row"><span class="k">客户：</span>{{ info.plate.customer_phone || '未登记' }}</div>
            <div class="row"><span class="k">绑定状态：</span><el-tag :type="info.plate.is_bound ? 'success' : 'info'" size="small">{{ info.plate.is_bound ? '已绑定' : '未绑定用户' }}</el-tag></div>
            <div class="row"><span class="k">在场状态：</span>
              <el-tag v-if="info.parking" type="warning" size="small">在场内</el-tag>
              <el-tag v-else type="info" size="small">已出场</el-tag>
            </div>
          </div>
          <el-empty v-else description="无车牌登记信息" :image-size="80" />
        </div>

        <div class="card-shadow info-card" style="margin-top:16px;">
          <div class="card-title"><el-icon><Location /></el-icon>当前停车状态</div>
          <div v-if="info.parking" class="info-body">
            <div class="row"><span class="k">入场时间：</span><b>{{ info.parking.in_time }}</b></div>
            <div class="row"><span class="k">入场岗亭：</span>{{ info.parking.in_booth || '-' }}</div>
            <div class="row"><span class="k">已停时长：</span><b class="text-info">{{ info.calculation?.hours }} 小时</b></div>
            <div class="row"><span class="k">预计费用：</span><b class="text-danger">¥{{ info.calculation?.fee }}</b></div>
          </div>
          <el-empty v-else description="该车辆当前未在场内" :image-size="80" />
        </div>
      </div>

      <div class="info-col">
        <div class="card-shadow info-card">
          <div class="card-title" style="display:flex;justify-content:space-between;">
            <span><el-icon><Ticket /></el-icon>已绑定优惠券（{{ info.bound_coupons?.length || 0 }}）</span>
            <el-button size="small" type="danger" plain @click="openRebind" :disabled="!info.bound_coupons?.length">改绑车牌</el-button>
          </div>
          <el-table v-if="info.bound_coupons?.length" :data="info.bound_coupons" size="small" stripe>
            <el-table-column prop="coupon_no" label="券号" width="190" />
            <el-table-column prop="shop_name" label="门店" />
            <el-table-column label="权益" width="80">
              <template #default="{row}">{{ row.discount_hours }}h</template>
            </el-table-column>
            <el-table-column prop="expire_at" label="到期时间" width="150" />
            <el-table-column label="操作" width="110">
              <template #default="{row}">
                <el-button size="small" type="danger" text @click="revokeCoupon(row)">撤销</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-else description="暂无绑定的优惠券" :image-size="70" />
        </div>

        <div class="card-shadow info-card" style="margin-top:16px;">
          <div class="card-title"><el-icon><Warning /></el-icon>异常处理</div>
          <div style="padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <el-button type="primary" size="large" :disabled="!info.plate" @click="releaseDlg = true">
              <el-icon><Promotion /></el-icon>人工放行登记
            </el-button>
            <el-button type="warning" size="large" :disabled="!info.plate" @click="approvalDlg = true">
              <el-icon><Document /></el-icon>提交异常审批
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <el-dialog v-model="rebindDlg" title="客服改绑车牌（特权操作）" width="560px">
      <div v-if="rebindCheckResult" style="margin-bottom:16px;">
        <el-alert v-if="rebindCheckResult.blockers?.length" type="error" :closable="false" style="margin-bottom:8px;">
          <template #title>阻断问题</template>
          <div v-for="(b,i) in rebindCheckResult.blockers" :key="i" style="font-size:13px;">• {{ b }}</div>
        </el-alert>
        <el-alert v-if="rebindCheckResult.warnings?.length" type="warning" :closable="false" style="margin-bottom:8px;">
          <template #title>风险提示</template>
          <div v-for="(w,i) in rebindCheckResult.warnings" :key="i" style="font-size:13px;">• {{ w }}</div>
        </el-alert>
        <div v-if="rebindCheckResult.must_void_coupons?.length" style="padding:12px;background:#fef3c7;border-radius:8px;margin-bottom:8px;">
          <div style="font-size:13px;font-weight:600;margin-bottom:6px;">以下旧车牌优惠券需作废：</div>
          <div v-for="c in rebindCheckResult.must_void_coupons" :key="c.id" style="font-size:12px;color:#6b7280;">
            {{ c.coupon_no }} - {{ c.shop_name }} ({{ c.discount_hours }}h)
          </div>
        </div>
      </div>
      <el-form :model="rebindForm" label-width="110px">
        <el-form-item label="原车牌">{{ rebindForm.old_plate }}</el-form-item>
        <el-form-item label="新车牌" required>
          <el-input v-model="rebindForm.new_plate" placeholder="如：京B88888" style="text-transform:uppercase;letter-spacing:2px;" @blur="checkRebind" />
        </el-form-item>
        <el-form-item v-if="rebindCheckResult?.must_void_coupons?.length" label="作废旧车牌券">
          <el-switch v-model="rebindForm.void_old_coupons" active-text="作废旧券" inactive-text="保留旧券" />
          <div style="font-size:12px;color:#d97706;margin-top:4px;">旧车牌在场时，如不选择作废旧券则无法完成改绑</div>
        </el-form-item>
        <el-form-item v-if="rebindCheckResult?.must_approve" label="审批确认">
          <el-switch v-model="rebindForm.force_rebind" active-text="确认强制改绑" />
          <div style="font-size:12px;color:#ef4444;margin-top:4px;">此操作将生成异常审批记录</div>
        </el-form-item>
        <el-form-item label="改绑原因">
          <el-input v-model="rebindForm.reason" type="textarea" :rows="2" placeholder="例如：顾客绑定错车牌" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeRebind">取消</el-button>
        <el-button type="primary" :loading="submitting" :disabled="!canRebind" @click="doRebind">确认改绑</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="releaseDlg" title="人工放行登记（将自动进入审批流程）" width="460px">
      <el-form :model="releaseForm" label-width="100px">
        <el-form-item label="车牌号">
          <el-input v-model="releaseForm.plate_no" disabled />
        </el-form-item>
        <el-form-item label="岗亭编号">
          <el-input v-model="releaseForm.booth_id" placeholder="如：BOOTH_N1" />
        </el-form-item>
        <el-form-item label="放行原因" required>
          <el-select v-model="releaseForm.release_reason" placeholder="选择原因" style="width:100%;">
            <el-option label="系统故障无法识别" value="系统故障" />
            <el-option label="设备故障无法扫码" value="设备故障" />
            <el-option label="优惠券异常核销失败" value="优惠券异常" />
            <el-option label="客户投诉紧急处理" value="客户投诉" />
            <el-option label="贵宾/特殊车辆" value="特殊车辆" />
            <el-option label="其他原因" value="其他" />
          </el-select>
        </el-form-item>
        <el-form-item label="豁免金额(元)">
          <el-input-number v-model="releaseForm.waive_fee" :min="0" :max="1000" style="width:100%;" />
          <div style="font-size:12px;color:#6b7280;margin-top:4px;">豁免超50元需上级审批</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="releaseDlg = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doRelease">提交放行申请</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="approvalDlg" title="提交异常审批申请" width="460px">
      <el-form :model="approvalForm" label-width="100px">
        <el-form-item label="异常类型" required>
          <el-select v-model="approvalForm.exception_type" style="width:100%;">
            <el-option label="车牌识别错误" value="plate_error" />
            <el-option label="优惠券核销失败" value="coupon_error" />
            <el-option label="入场记录缺失" value="in_missing" />
            <el-option label="出场重复记录" value="out_duplicate" />
            <el-option label="顾客投诉" value="customer_complaint" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联车牌">{{ plate }}</el-form-item>
        <el-form-item label="原因说明" required>
          <el-input v-model="approvalForm.reason" type="textarea" :rows="3" placeholder="详细描述异常情况" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="approvalDlg = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="doApproval">提交审批</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import api from '@/api';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Van, Location, Ticket, Warning, Promotion, Document } from '@element-plus/icons-vue';

const plate = ref('');
const loading = ref(false);
const info = ref(null);
const quickPlates = ['京A12345', '京B67890', '京C11111', '京D22222'];
const submitting = ref(false);

const rebindDlg = ref(false);
const rebindForm = reactive({ coupon_id: null, old_plate: '', new_plate: '', reason: '', void_old_coupons: false, force_rebind: false });
const rebindCheckResult = ref(null);
const canRebind = computed(() => {
  if (!rebindForm.new_plate) return false;
  if (!rebindCheckResult.value) return true;
  if (rebindCheckResult.value.blockers?.length) return false;
  if (rebindCheckResult.value.must_void_coupons?.length && !rebindForm.void_old_coupons) return false;
  if (rebindCheckResult.value.must_approve && !rebindForm.force_rebind) return false;
  return rebindCheckResult.value.can_rebind !== false;
});

const releaseDlg = ref(false);
const releaseForm = reactive({ plate_no: '', booth_id: 'BOOTH_N1', release_reason: '', waive_fee: 0 });

const approvalDlg = ref(false);
const approvalForm = reactive({ exception_type: '', plate_no: '', reason: '' });

function setPlate(p) { plate.value = p; query(); }

async function query() {
  if (!plate.value) { ElMessage.warning('请输入车牌号'); return; }
  loading.value = true;
  try {
    info.value = await api.service.getPlateInfo(plate.value.trim().toUpperCase());
  } finally { loading.value = false; }
}

async function revokeCoupon(c) {
  try {
    await ElMessageBox.confirm(`确认撤销优惠券 ${c.coupon_no}？撤销后额度会退回门店`, '撤券确认', { type: 'warning' });
    await api.merchant.revokeCoupon({ coupon_id: c.id, reason: '客服操作撤销' });
    ElMessage.success('撤销成功');
    query();
  } catch (e) { if (e !== 'cancel') console.error(e); }
}

async function doRebind() {
  if (!rebindForm.new_plate) { ElMessage.warning('请输入新车牌'); return; }
  submitting.value = true;
  try {
    const c = rebindForm.coupon_id ? info.value.bound_coupons.find(x => x.id === rebindForm.coupon_id) : null;
    await api.customer.rebindPlate({
      coupon_id: rebindForm.coupon_id,
      old_plate: rebindForm.old_plate || info.value.bound_coupons?.[0]?.plate_no,
      new_plate: rebindForm.new_plate,
      reason: rebindForm.reason,
      void_old_coupons: rebindForm.void_old_coupons,
      force_rebind: rebindForm.force_rebind
    });
    rebindDlg.value = false;
    rebindForm.coupon_id = null;
    rebindForm.new_plate = '';
    rebindForm.void_old_coupons = false;
    rebindForm.force_rebind = false;
    rebindCheckResult.value = null;
    query();
  } finally { submitting.value = false; }
}

function openRebind() {
  rebindForm.old_plate = info.value.bound_coupons?.[0]?.plate_no || plate.value.toUpperCase();
  rebindCheckResult.value = null;
  rebindDlg.value = true;
}

async function checkRebind() {
  if (!rebindForm.new_plate || !rebindForm.old_plate) return;
  try {
    rebindCheckResult.value = await api.customer.rebindCheck({
      old_plate: rebindForm.old_plate,
      new_plate: rebindForm.new_plate
    });
  } catch (e) { /* handled */ }
}

function closeRebind() {
  rebindDlg.value = false;
  rebindCheckResult.value = null;
  rebindForm.void_old_coupons = false;
  rebindForm.force_rebind = false;
}

async function doRelease() {
  if (!releaseForm.release_reason) { ElMessage.warning('请选择放行原因'); return; }
  submitting.value = true;
  try {
    await api.service.manualRelease(releaseForm);
    releaseDlg.value = false;
    query();
  } finally { submitting.value = false; }
}

async function doApproval() {
  if (!approvalForm.exception_type || !approvalForm.reason) { ElMessage.warning('请完善信息'); return; }
  submitting.value = true;
  try {
    await api.service.createApproval({
      ...approvalForm,
      plate_no: plate.value.toUpperCase()
    });
    approvalDlg.value = false;
    approvalForm.exception_type = '';
    approvalForm.reason = '';
  } finally { submitting.value = false; }
}
</script>

<style scoped>
.quick-tag { cursor: pointer; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 992px) { .info-grid { grid-template-columns: 1fr; } }
.info-card { padding: 16px; }
.card-title {
  font-size: 15px;
  font-weight: 600;
  padding: 0 0 12px;
  border-bottom: 1px solid #f3f4f6;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.info-body .row {
  display: flex;
  padding: 6px 0;
  font-size: 14px;
  align-items: center;
  gap: 8px;
}
.info-body .row .k { color: #6b7280; width: 84px; flex-shrink: 0; }
</style>
