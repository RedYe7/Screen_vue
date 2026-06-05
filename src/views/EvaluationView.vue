<script setup>
import { computed, reactive, ref } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const { executedPlans, fuelPlanningPacket, genericPlanningPackets, assistantOpen, showToast } = usePlatformState();

const workProgressStorageKey = "screen-vue-monitoring-work-progress";
const evidenceStorageKey = "screen-vue-monitoring-work-evidence";

const scopeOptions = ["某项", "某系统", "总体"];
const reportFormats = ["报表", "报告", "PPT"];
const reportTemplates = ["标准模板", "管理模板", "自定义组合模板"];

const state = reactive({
  scope: "某系统",
  system: "氧气系统",
  detailId: "",
  search: "",
  selectedPlanId: "",
  selectedWorkId: "",
  reportModalOpen: false,
  reportFormat: "报表",
  reportTemplate: "标准模板"
});

const selectedReportPlanIds = ref([]);
const generatedReports = ref([]);
const workProgressStore = ref(readStorage(workProgressStorageKey, {}));
const evidenceStore = ref(readStorage(evidenceStorageKey, {}));

const flowPlans = computed(() => {
  const rows = [];
  Object.entries(fuelPlanningPacket.value?.gasPackets || {}).forEach(([gasType, packet]) => {
    (packet.calendarPlans || []).forEach((plan) => {
      rows.push(normalizePlan(plan, "fuel", "特燃特气筹措流程", gasType, packet));
    });
  });

  Object.entries(genericPlanningPackets.value || {}).forEach(([flowId, packet]) => {
    Object.entries(packet.gasPackets || {}).forEach(([gasType, gasPacket]) => {
      (gasPacket.calendarPlans || []).forEach((plan) => {
        rows.push(normalizePlan(plan, flowId, flowTitle(flowId), gasType, gasPacket));
      });
    });
  });
  return rows.sort((left, right) => compareIso(left.startDate, right.startDate) || left.name.localeCompare(right.name, "zh-CN"));
});

const filteredPlans = computed(() => {
  const keyword = state.search.trim();
  return flowPlans.value.filter((plan) => {
    if (state.scope === "某系统" && state.system && plan.system !== state.system) return false;
    if (state.scope === "某项" && state.detailId && plan.id !== state.detailId) return false;
    if (keyword && !`${plan.name}${plan.flowTitle}${plan.system}${plan.statusLabel}`.includes(keyword)) return false;
    return true;
  });
});

const selectedPlan = computed(() => flowPlans.value.find((plan) => plan.id === state.selectedPlanId) || null);
const selectedPlanWorks = computed(() => (selectedPlan.value ? buildPlanWorks(selectedPlan.value) : []));
const selectedWork = computed(() => selectedPlanWorks.value.find((work) => work.id === state.selectedWorkId) || null);

const selectedReportPlans = computed(() =>
  flowPlans.value.filter((plan) => selectedReportPlanIds.value.includes(plan.id))
);

const completionRows = computed(() =>
  filteredPlans.value.map((plan) => ({
    id: plan.id,
    name: plan.name,
    flowTitle: plan.flowTitle,
    system: plan.system,
    progress: plan.progress,
    status: progressStatusLabel(plan.progress),
    evidence: plan.progress >= 95 ? "完整" : plan.progress >= 45 ? "部分上传" : "待补充"
  }))
);

const progressAssessment = computed(() => {
  const plans = filteredPlans.value;
  const total = Math.max(plans.length, 1);
  const avg = Math.round(plans.reduce((sum, plan) => sum + plan.progress, 0) / total);
  const conflicts = plans.reduce((sum, plan) => sum + plan.conflictCount, 0);
  const completed = plans.filter((plan) => plan.progress >= 100).length;
  return [
    { title: "总体完成度", value: `${avg}%`, desc: "按当前筛选范围内计划完成度平均计算。" },
    { title: "已完成计划", value: `${completed} 项`, desc: "完成度达到 100% 的计划数量。" },
    { title: "冲突数量", value: `${conflicts} 项`, desc: "来自日程规划和各流程规划中的冲突记录。" },
    { title: "计划余量", value: `${Math.max(0, 100 - avg)}%`, desc: "完成度越高，剩余执行余量越低。" }
  ];
});

const historyCompareRows = computed(() => {
  const current = filteredPlans.value.slice(0, 5);
  const history = (executedPlans.value || []).filter((item) => item.kind === "monitoring-plan-history").slice(0, 5);
  return current.map((plan, index) => {
    const old = history[index] || {};
    const oldProgress = old.completionMeta?.progress ?? old.progress ?? 100;
    return {
      id: plan.id,
      name: plan.name,
      time: `${plan.startDate} - ${plan.endDate}`,
      personnel: plan.assignees.length,
      resource: plan.equipment.length,
      margin: `${Math.max(0, 100 - plan.progress)}%`,
      conflict: plan.conflictCount,
      completion: `${plan.progress}%`,
      conclusion: plan.progress >= oldProgress ? "优于历史参考" : "低于历史参考，建议复核资源和关键节点"
    };
  });
});

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function normalizePlan(plan, flowId, flowTitleText, gasType, packet) {
  const progress = Number(plan.completionMeta?.progress ?? inferPacketProgress(packet.planStatus));
  const conflictRecords = packet.conflictRecords || [];
  const conflictCount = conflictRecords
    .filter((record) => record.planId === plan.id || record.planName === plan.name)
    .reduce((sum, record) => sum + Math.max(1, (record.conflicts || []).length), 0);
  return {
    ...plan,
    id: `${flowId}-${gasType}-${plan.id}`,
    sourcePlanId: plan.id,
    flowId,
    flowTitle: flowTitleText,
    gasType,
    gasLabel: gasLabel(gasType),
    system: `${gasLabel(gasType)}系统`,
    assignees: Array.isArray(plan.assignees) ? plan.assignees : [],
    equipment: Array.isArray(plan.equipment) ? plan.equipment : [],
    status: packet.planStatus || "draft",
    statusLabel: planStatusLabel(packet.planStatus || "draft"),
    progress,
    conflictCount,
    conflictRecords
  };
}

function buildPlanWorks(plan) {
  const workDays = Array.isArray(plan.workDays) && plan.workDays.length
    ? plan.workDays
    : enumerateDates(plan.startDate, plan.endDate).map((dateIso, index) => ({
        id: `${dateIso}-${index}`,
        dateIso,
        actionLabel: inferActionLabel(plan, index),
        timeRange: "08:00-10:00",
        personnel: plan.assignees,
        equipment: plan.equipment,
        position: `${plan.gasLabel}系统执行岗`,
        sortKey: index,
        status: progressStatusLabel(plan.progress)
      }));

  return workDays
    .map((workDay, index) => {
      const workKey = `${plan.sourcePlanId}-${workDay.id}`;
      const fallbackDateKey = `${plan.sourcePlanId}-${workDay.dateIso}`;
      const progressMeta = workProgressStore.value[workKey] || workProgressStore.value[fallbackDateKey] || {
        progress: plan.progress,
        status: progressStatusLabel(plan.progress),
        updatedAt: ""
      };
      const evidence = evidenceStore.value[workKey] || evidenceStore.value[fallbackDateKey] || {};
      const conflictItems = getWorkConflictItems(plan, workDay);
      return {
        id: `${plan.id}-${workDay.id || index}`,
        workKey,
        dateIso: workDay.dateIso,
        actionLabel: workDay.actionLabel || inferActionLabel(plan, index),
        timeRange: normalizeTimeRange(workDay.timeRange || "08:00-10:00"),
        personnel: normalizeList(workDay.personnel?.length ? workDay.personnel : plan.assignees),
        equipment: normalizeList(workDay.equipment?.length ? workDay.equipment : plan.equipment),
        position: workDay.position || `${plan.gasLabel}系统执行岗`,
        status: progressMeta.status || workDay.status || "未开始",
        progressMeta,
        evidence,
        conflictItems,
        hasConflict: conflictItems.length > 0,
        evaluation: buildWorkEvaluation(plan, workDay, progressMeta, conflictItems)
      };
    })
    .sort((left, right) => compareIso(left.dateIso, right.dateIso) || left.timeRange.localeCompare(right.timeRange));
}

function getWorkConflictItems(plan, workDay) {
  const displayDate = formatDisplayDate(workDay.dateIso);
  return (plan.conflictRecords || [])
    .filter((record) => record.planId === plan.sourcePlanId || record.planName === plan.name)
    .flatMap((record) => record.conflicts || [])
    .filter((item) => {
      if (item.workDayId && workDay.id && item.workDayId !== workDay.id) return false;
      const dates = [...(item.conflictDates || []), ...(item.highlightDates || [])];
      if (!dates.length) return true;
      return dates.includes(workDay.dateIso) || dates.includes(displayDate);
    });
}

function buildWorkEvaluation(plan, workDay, progressMeta, conflicts) {
  const todayIso = today();
  const dueSoon = compareIso(workDay.dateIso, todayIso) >= 0 && diffDays(todayIso, workDay.dateIso) <= 3;
  const overdue = compareIso(workDay.dateIso, todayIso) < 0 && progressMeta.progress < 100;
  return {
    scheduleState: overdue ? "超期" : dueSoon ? "临期" : progressMeta.progress >= 100 ? "已完成" : "正常",
    riskText: conflicts.length
      ? `存在 ${conflicts.length} 条冲突，请优先复核人员、设备和关键节点。`
      : overdue
        ? "工作已超过计划日期，建议补充说明并尽快闭环。"
        : "当前执行状态未发现明显阻断项。",
    suggestion: progressMeta.progress >= 100
      ? "建议归档质量证据并纳入历史对比。"
      : "建议结合现场材料、签字表和电子报表持续更新完成情况。",
    planState: `${plan.statusLabel} / ${plan.progress}%`
  };
}

function openPlanDetail(plan) {
  state.selectedPlanId = plan.id;
  state.selectedWorkId = "";
}

function closePlanDetail() {
  state.selectedPlanId = "";
  state.selectedWorkId = "";
}

function openWorkDetail(work) {
  state.selectedWorkId = work.id;
}

function toggleReportPlan(planId) {
  selectedReportPlanIds.value = selectedReportPlanIds.value.includes(planId)
    ? selectedReportPlanIds.value.filter((id) => id !== planId)
    : [...selectedReportPlanIds.value, planId];
}

function openReportModal() {
  if (!selectedReportPlanIds.value.length) {
    showToast("请先选择需要生成报表的计划");
    return;
  }
  state.reportModalOpen = true;
}

function closeReportModal() {
  state.reportModalOpen = false;
}

function generateReport() {
  if (!selectedReportPlans.value.length) {
    showToast("请先选择需要生成报表的计划");
    return;
  }
  generatedReports.value.unshift({
    id: `report-${Date.now()}`,
    title: `${state.reportTemplate}${state.reportFormat}`,
    format: state.reportFormat,
    template: state.reportTemplate,
    range: selectedReportPlans.value.map((plan) => plan.name).join("、"),
    count: selectedReportPlans.value.length,
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false })
  });
  closeReportModal();
  showToast(`${state.reportFormat}已生成`);
}

function inferPacketProgress(status) {
  if (status === "completed") return 100;
  if (status === "executing") return 65;
  if (status === "confirmed") return 35;
  return 0;
}

function progressStatusLabel(progress) {
  if (progress >= 100) return "已完成";
  if (progress > 0) return "执行中";
  return "未开始";
}

function planStatusLabel(status) {
  return {
    idle: "未生成",
    draft: "草稿",
    confirmed: "已确认",
    executing: "执行中",
    completed: "已完成"
  }[status] || status || "未开始";
}

function flowTitle(flowId) {
  return {
    mission: "任务工作流程",
    launch: "发射日工作规划",
    repair: "装备维修流程",
    maintenance: "日常维护流程",
    custom: "自定义工作流程"
  }[flowId] || "流程规划";
}

function gasLabel(gasType) {
  return { oxygen: "氧气", hydrogen: "氢气", nitrogen: "氮气", helium: "氦气" }[gasType] || "气体";
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => item?.name || item).filter(Boolean);
  if (!value) return [];
  return String(value).split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
}

function inferActionLabel(plan, index) {
  const names = ["安全准备", "任务执行", "在线检查", "质量复核", "结果归档"];
  if (plan.name.includes("转运")) return ["转运准备", "路线确认", "转运执行", "回场确认"][index % 4];
  if (plan.name.includes("维修")) return ["安全隔离", "维修执行", "复测确认", "质量记录"][index % 4];
  return names[index % names.length];
}

function normalizeTimeRange(value) {
  return String(value || "08:00-10:00").replace(/\s+/g, "");
}

function enumerateDates(startIso, endIso) {
  if (!startIso || !endIso) return [];
  const dates = [];
  let cursor = startIso;
  while (compareIso(cursor, endIso) <= 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function addDays(iso, offset) {
  const date = toDate(iso);
  date.setDate(date.getDate() + offset);
  return formatIso(date);
}

function diffDays(startIso, endIso) {
  return Math.round((toDate(endIso) - toDate(startIso)) / 86400000);
}

function compareIso(left, right) {
  return String(left || "").localeCompare(String(right || ""));
}

function toDate(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function today() {
  return formatIso(new Date());
}

function formatDisplayDate(iso) {
  const [year, month, day] = String(iso || "").split("-");
  return year ? `${year}年${Number(month)}月${Number(day)}日` : "";
}
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>流程智能评估</h1>
        <div class="muted">围绕流程监控、工作完成情况、计划执行评估、历史对比和报表生成进行综合分析。</div>
      </div>
      <div class="topbar-actions">
        <button class="button" type="button" @click="assistantOpen = true">智能助手</button>
      </div>
    </div>

    <section class="panel">
      <div class="panel-head">
        <div>
          <h3>流程监控列表</h3>
          <div class="muted">按某项、某系统和总体筛选监控范围，勾选计划后可生成报表。</div>
        </div>
        <button class="button" type="button" @click="openReportModal">报表生成</button>
      </div>

      <div class="filter-grid">
        <label class="field">
          <span>范围筛选</span>
          <select v-model="state.scope">
            <option v-for="item in scopeOptions" :key="item">{{ item }}</option>
          </select>
        </label>
        <label class="field" v-if="state.scope === '某系统'">
          <span>系统</span>
          <select v-model="state.system">
            <option>氧气系统</option>
            <option>氢气系统</option>
            <option>氮气系统</option>
            <option>氦气系统</option>
          </select>
        </label>
        <label class="field" v-if="state.scope === '某项'">
          <span>单项计划</span>
          <select v-model="state.detailId">
            <option value="">自动选择</option>
            <option v-for="plan in flowPlans" :key="plan.id" :value="plan.id">{{ plan.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>搜索</span>
          <input v-model="state.search" placeholder="搜索计划、流程或状态">
        </label>
      </div>

      <div class="report-monitor-list">
        <article
          v-for="plan in filteredPlans"
          :key="plan.id"
          class="rule-entry evaluation-plan-row"
          @click="openPlanDetail(plan)"
        >
          <label class="evaluation-plan-check" @click.stop>
            <input
              type="checkbox"
              :checked="selectedReportPlanIds.includes(plan.id)"
              @change="toggleReportPlan(plan.id)"
            >
          </label>
          <div class="evaluation-plan-main">
            <div class="rule-entry-head">
              <div class="rule-entry-title">
                <strong class="evaluation-plan-title">{{ plan.name }}</strong>
                <span class="rule-entry-subtext">{{ plan.flowTitle }} · {{ plan.system }} · {{ plan.startDate }} - {{ plan.endDate }}</span>
              </div>
              <div class="button-row">
                <span v-if="plan.conflictCount" class="chip warning">冲突 {{ plan.conflictCount }}</span>
                <span class="chip">{{ plan.statusLabel }}</span>
                <span class="chip" :class="{ active: plan.progress >= 100 }">{{ plan.progress }}%</span>
              </div>
            </div>
            <div class="progress"><span :style="{ width: `${plan.progress}%` }"></span></div>
          </div>
        </article>
        <div v-if="!filteredPlans.length" class="notice-card">
          <span>当前筛选范围内暂无流程监控计划。</span>
          <span class="warning">无数据</span>
        </div>
      </div>
    </section>

    <section class="panel-grid two" style="margin-top:18px;">
      <section class="panel">
        <h3>工作完成情况</h3>
        <div class="rules-list">
          <div v-for="row in completionRows" :key="row.id" class="notice-card">
            <div>
              <strong>{{ row.name }}</strong>
              <div class="muted">{{ row.flowTitle }} · {{ row.system }} · 质量证据：{{ row.evidence }}</div>
            </div>
            <span class="accent">{{ row.progress }}% / {{ row.status }}</span>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>计划执行评估</h3>
        <div class="rules-list">
          <div v-for="item in progressAssessment" :key="item.title" class="notice-card">
            <div>
              <strong>{{ item.title }}</strong>
              <div class="muted">{{ item.desc }}</div>
            </div>
            <span class="accent">{{ item.value }}</span>
          </div>
        </div>
      </section>
    </section>

    <section class="panel" style="margin-top:18px;">
      <div class="panel-head">
        <div>
          <h3>历史对比</h3>
          <div class="muted">比较时间、人员、资源、余量、冲突和完成度，并给出结论建议。</div>
        </div>
      </div>
      <table class="fuel-report-table">
        <thead>
          <tr>
            <th>流程</th>
            <th>时间</th>
            <th>人员</th>
            <th>资源</th>
            <th>余量</th>
            <th>冲突</th>
            <th>完成度</th>
            <th>结论建议</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in historyCompareRows" :key="row.id">
            <td>{{ row.name }}</td>
            <td>{{ row.time }}</td>
            <td>{{ row.personnel }}</td>
            <td>{{ row.resource }}</td>
            <td>{{ row.margin }}</td>
            <td>{{ row.conflict }}</td>
            <td>{{ row.completion }}</td>
            <td>{{ row.conclusion }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="generatedReports.length" class="panel" style="margin-top:18px;">
      <h3>已生成报表</h3>
      <div class="rules-list">
        <div v-for="item in generatedReports" :key="item.id" class="notice-card">
          <div>
            <strong>{{ item.title }}</strong>
            <div class="muted">{{ item.template }} · {{ item.count }} 项计划 · {{ item.createdAt }}</div>
            <div class="muted">{{ item.range }}</div>
          </div>
          <span class="accent">{{ item.format }}预览</span>
        </div>
      </div>
    </section>

    <div class="modal-overlay" :class="{ open: Boolean(selectedPlan) }" @click.self="closePlanDetail">
      <div class="modal-card monitoring-plan-detail-modal">
        <template v-if="selectedPlan">
          <div class="panel-head">
            <div>
              <h3>{{ selectedPlan.name }}</h3>
              <div class="muted">所属流程：{{ selectedPlan.flowTitle }} · {{ selectedPlan.system }}</div>
            </div>
            <span class="chip" :class="{ active: selectedPlan.progress >= 100 }">{{ selectedPlan.statusLabel }}</span>
          </div>

          <div class="plan-detail-meta-grid">
            <div class="summary-line"><span>日期范围</span><strong>{{ formatDisplayDate(selectedPlan.startDate) }} - {{ formatDisplayDate(selectedPlan.endDate) }}</strong></div>
            <div class="summary-line"><span>完成进度</span><strong>{{ selectedPlan.progress }}%</strong></div>
            <div class="summary-line"><span>组成工作</span><strong>{{ selectedPlanWorks.length }} 项</strong></div>
          </div>

          <div v-if="selectedPlan.conflictCount" class="plan-detail-conflict">
            <div class="plan-detail-conflict-head">
              <strong>冲突摘要</strong>
              <span class="monitor-flow-conflict-chip">冲突 {{ selectedPlan.conflictCount }} 项</span>
            </div>
            <div class="conflict-detail-text">该计划存在冲突记录，请在组成工作中查看具体影响。</div>
          </div>

          <div class="plan-detail-section-head">
            <h3>组成工作 {{ selectedPlanWorks.length }} 项</h3>
            <div class="muted">点击工作可查看工作完成情况与计划执行评估。</div>
          </div>

          <div class="plan-detail-work-list">
            <button
              v-for="(work, index) in selectedPlanWorks"
              :key="work.id"
              class="plan-detail-work-item evaluation-work-button"
              :class="{ conflict: work.hasConflict, done: work.progressMeta.progress >= 100, active: work.progressMeta.progress > 0 && work.progressMeta.progress < 100 }"
              type="button"
              @click="openWorkDetail(work)"
            >
              <div class="plan-detail-timeline-node">{{ index + 1 }}</div>
              <div class="plan-detail-work-card">
                <div class="plan-detail-work-head">
                  <div>
                    <strong>{{ work.actionLabel }}</strong>
                    <span>{{ formatDisplayDate(work.dateIso) }} · {{ work.timeRange }}</span>
                  </div>
                  <div class="button-row">
                    <span v-if="work.hasConflict" class="chip warning">冲突</span>
                    <span class="chip" :class="{ active: work.progressMeta.progress >= 100 }">{{ work.status }}</span>
                  </div>
                </div>
                <div class="plan-detail-work-meta">
                  <span>人员：{{ work.personnel.join("、") || "待分配" }}</span>
                  <span>岗位：{{ work.position }}</span>
                  <span>设备：{{ work.equipment.join("、") || "待分配" }}</span>
                </div>
              </div>
            </button>
          </div>

          <section v-if="selectedWork" class="panel evaluation-work-detail">
            <div class="panel-head">
              <div>
                <h3>{{ selectedWork.actionLabel }}</h3>
                <div class="muted">{{ formatDisplayDate(selectedWork.dateIso) }} · {{ selectedWork.timeRange }} · {{ selectedWork.position }}</div>
              </div>
              <span class="chip" :class="{ active: selectedWork.progressMeta.progress >= 100 }">{{ selectedWork.status }}</span>
            </div>
            <div class="plan-detail-meta-grid">
              <div class="summary-line"><span>工作完成情况</span><strong>{{ selectedWork.progressMeta.progress }}%</strong></div>
              <div class="summary-line"><span>质量证据</span><strong>{{ Object.values(selectedWork.evidence).filter((item) => item?.uploaded).length }} / 3 项</strong></div>
              <div class="summary-line"><span>计划执行评估</span><strong>{{ selectedWork.evaluation.scheduleState }}</strong></div>
            </div>
            <div class="monitor-day-progress-bar large">
              <span :style="{ width: `${selectedWork.progressMeta.progress}%` }"></span>
            </div>
            <div class="detail-list" style="margin-top: 14px;">
              <div class="notice-card"><span>{{ selectedWork.evaluation.riskText }}</span><span class="warning">风险</span></div>
              <div class="notice-card"><span>{{ selectedWork.evaluation.suggestion }}</span><span class="accent">建议</span></div>
              <div class="notice-card"><span>人员：{{ selectedWork.personnel.join("、") || "待分配" }}；设备：{{ selectedWork.equipment.join("、") || "待分配" }}</span><span class="accent">资源</span></div>
            </div>
          </section>

          <div class="button-row" style="margin-top: 18px;">
            <button class="ghost" type="button" @click="closePlanDetail">关闭</button>
          </div>
        </template>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.reportModalOpen }" @click.self="closeReportModal">
      <div class="modal-card confirm-dialog">
        <h3>报表生成</h3>
        <p class="muted">已选择 {{ selectedReportPlans.length }} 项计划，请选择输出格式和模板。</p>
        <div class="filter-grid" style="margin-top: 14px;">
          <label class="field">
            <span>输出格式</span>
            <select v-model="state.reportFormat">
              <option v-for="item in reportFormats" :key="item">{{ item }}</option>
            </select>
          </label>
          <label class="field">
            <span>模板选择</span>
            <select v-model="state.reportTemplate">
              <option v-for="item in reportTemplates" :key="item">{{ item }}</option>
            </select>
          </label>
        </div>
        <div class="rules-list" style="margin-top: 14px;">
          <div v-for="plan in selectedReportPlans" :key="plan.id" class="notice-card">
            <span>{{ plan.name }}</span>
            <span class="accent">{{ plan.system }} · {{ plan.progress }}%</span>
          </div>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeReportModal">取消</button>
          <button class="button" type="button" @click="generateReport">确认生成</button>
        </div>
      </div>
    </div>
  </div>
</template>
