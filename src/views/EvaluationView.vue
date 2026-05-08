<script setup>
import { computed, reactive, ref, watch } from "vue";
import { usePlatformState } from "../composables/usePlatformState";
import { queryDemoData } from "../data/queryDemoData";
import { maskSensitiveText } from "../utils/maskSensitiveText";

const {
  showToast: rawShowToast,
  assistantOpen,
  keyTimeNodes,
  listExecutedPlans,
  listMonitoringPlans
} = usePlatformState();

const m = maskSensitiveText;

function showToast(message) {
  rawShowToast(maskSensitiveText(message));
}

const annotationStorageKey = "screen-vue-evaluation-annotations";
const reviewStorageKey = "screen-vue-evaluation-review-state";
const reportStorageKey = "screen-vue-evaluation-reports";

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function createId(prefix = "eval") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function toDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return value || "待设置";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sameDate(left, right) {
  return left && right
    && left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function normalizeSteps(steps = []) {
  return steps.map((step, index) => ({
    id: step.id || `${step.name}-${index}`,
    name: step.name || `步骤 ${index + 1}`,
    assignees: Array.isArray(step.assignees) && step.assignees.length ? step.assignees : ["待分配"],
    equipment: step.equipment || "待定设备",
    executionDuration: step.executionDuration || "30分钟"
  }));
}

function derivePriority(plan) {
  if (plan.priority) return plan.priority;
  if (String(plan.title).includes("发射")) return "高优先级";
  if (String(plan.title).includes("特燃特气")) return "高优先级";
  if (String(plan.title).includes("维修")) return "中优先级";
  return "常规";
}

function deriveRisk(plan) {
  if (plan.risk) return plan.risk;
  if (plan.status === "已终止") return "高";
  if (plan.progress >= 90) return "低";
  if (plan.progress >= 60) return "中";
  return "高";
}

function deriveDataStatus(plan) {
  if (plan.progress >= 95) return "上传完毕";
  if (plan.progress >= 45) return "部分上传";
  return "未上传";
}

function deriveStage(plan) {
  const stepName = plan.currentStep?.name || plan.steps[0]?.name || "";
  if (stepName.includes("筹措") || stepName.includes("转运")) return "筹措阶段";
  if (stepName.includes("测试") || stepName.includes("试验")) return "测试阶段";
  if (stepName.includes("保障") || stepName.includes("供气")) return "保障阶段";
  if (stepName.includes("归档") || stepName.includes("审签")) return "归档阶段";
  return "执行阶段";
}

function totalHours(steps) {
  return steps.reduce((sum, step) => {
    const match = String(step.executionDuration || "").match(/\d+(?:\.\d+)?/);
    return sum + Number(match?.[0] || 0);
  }, 0);
}

function normalizeMonitoringPlan(plan) {
  const steps = normalizeSteps(plan.steps);
  return {
    id: plan.id,
    title: plan.title,
    system: plan.system || "未标注系统",
    type: plan.type || "执行计划",
    flowId: plan.flowId || "custom",
    source: "monitoring",
    startTime: plan.startTime || "",
    endTime: plan.endTime || "",
    status: plan.status || "执行中",
    progress: Number(plan.progress || 0),
    priority: derivePriority(plan),
    risk: deriveRisk(plan),
    steps,
    currentStep: steps[Math.min(steps.length - 1, plan.currentStepIndex || 0)] || steps[0] || null,
    owner: steps[0]?.assignees?.[0] || "系统工程师",
    tags: plan.keyNodes || [],
    dataStatus: deriveDataStatus(plan),
    phase: deriveStage({ ...plan, steps, currentStep: steps[Math.min(steps.length - 1, plan.currentStepIndex || 0)] || steps[0] || null }),
    workHours: totalHours(steps)
  };
}

function normalizeExecutedPlan(plan) {
  const steps = normalizeSteps(plan.steps);
  return {
    id: plan.id,
    title: plan.title,
    system: plan.system || "未标注系统",
    type: plan.type || "执行计划",
    flowId: plan.tags?.[0] || "custom",
    source: "executed",
    startTime: plan.startTime || `${plan.date || new Date().toISOString().slice(0, 10)}T08:00`,
    endTime: plan.endTime || `${plan.date || new Date().toISOString().slice(0, 10)}T18:00`,
    status: plan.status || "已执行",
    progress: plan.status === "已执行" ? 100 : 0,
    priority: derivePriority(plan),
    risk: deriveRisk(plan),
    steps,
    currentStep: steps.at(-1) || null,
    owner: plan.owner || steps[0]?.assignees?.[0] || "系统工程师",
    tags: plan.tags || [],
    dataStatus: "上传完毕",
    phase: "归档阶段",
    workHours: totalHours(steps)
  };
}

function normalizeQueryPlan(plan, index) {
  const demoSteps = normalizeSteps([
    {
      id: `${plan.title}-step-1`,
      name: `${plan.title}准备`,
      assignees: [plan.owner],
      equipment: `${plan.system}终端`,
      executionDuration: "1小时"
    },
    {
      id: `${plan.title}-step-2`,
      name: `${plan.title}执行`,
      assignees: [plan.owner],
      equipment: `${plan.system}设备`,
      executionDuration: "2小时"
    },
    {
      id: `${plan.title}-step-3`,
      name: `${plan.title}归档`,
      assignees: [plan.owner],
      equipment: "记录终端",
      executionDuration: "1小时"
    }
  ]);
  const progressMap = {
    "已完成": 100,
    "执行中": 68,
    "待审核": 82,
    "草稿": 22
  };
  return {
    id: `query-${index}-${plan.title}`,
    title: plan.title,
    system: plan.system,
    type: plan.type,
    flowId: plan.tags?.[0] || "custom",
    source: "query-demo",
    startTime: `${plan.date}T08:00`,
    endTime: `${plan.date}T18:00`,
    status: plan.status,
    progress: progressMap[plan.status] ?? 50,
    priority: derivePriority(plan),
    risk: deriveRisk(plan),
    steps: demoSteps,
    currentStep: demoSteps[Math.min(demoSteps.length - 1, Math.floor(((progressMap[plan.status] ?? 50) / 100) * demoSteps.length))] || demoSteps[0],
    owner: plan.owner,
    tags: plan.tags || [],
    dataStatus: plan.status === "已完成" ? "上传完毕" : plan.status === "执行中" ? "部分上传" : "未上传",
    phase: deriveStage({ steps: demoSteps, currentStep: demoSteps[1] || demoSteps[0] }),
    workHours: totalHours(demoSteps)
  };
}

const state = reactive({
  mode: "all",
  range: "全部",
  phase: "全部阶段",
  role: "systemEngineer",
  systemFilter: "全部",
  palette: "海蓝",
  zoom: 1,
  assessmentTab: "completion",
  detailOpen: false,
  compareOpen: false,
  detailPlanId: "",
  hoverPlanId: "",
  compareLeftId: "",
  compareRightId: "",
  annotationDimension: "流程区间",
  annotationContent: "",
  annotationNote: "",
  manualInput: "",
  ocrInput: "",
  voiceInput: "",
  evidenceInput: "",
  reportCategory: "single-work",
  reportFormat: "报表",
  reportRange: "当日",
  reportTemplate: "标准模板",
  reportWorkItem: "",
  reportPlanId: "",
  reportStartTime: "",
  reportEndTime: "",
  reportStage: ""
});

const annotations = ref(readLocal(annotationStorageKey, []));
const reviewState = reactive(readLocal(reviewStorageKey, {}));
const generatedReports = ref(readLocal(reportStorageKey, []));
const timelineRef = ref(null);

watch(annotations, (value) => writeLocal(annotationStorageKey, value), { deep: true });
watch(generatedReports, (value) => writeLocal(reportStorageKey, value), { deep: true });
watch(() => JSON.stringify(reviewState), (value) => writeLocal(reviewStorageKey, JSON.parse(value)));

const palettePresets = {
  海蓝: ["#39c5bb", "#81b3ff", "#ff9b54", "#ff7373"],
  暖橙: ["#ff9b54", "#ffd166", "#8fd6b5", "#ff7373"],
  青绿: ["#4dd59f", "#39c5bb", "#81b3ff", "#ffc857"]
};

const workflows = computed(() => {
  const executedMap = new Map(listExecutedPlans().map((plan) => [plan.id, normalizeExecutedPlan(plan)]));
  const monitoring = listMonitoringPlans().map(normalizeMonitoringPlan);
  queryDemoData.map(normalizeQueryPlan).forEach((plan) => {
    if (!executedMap.has(plan.id)) executedMap.set(plan.id, plan);
  });
  monitoring.forEach((plan) => {
    const current = executedMap.get(plan.id);
    if (current) executedMap.set(plan.id, { ...current, ...plan, steps: plan.steps.length ? plan.steps : current.steps });
    else executedMap.set(plan.id, plan);
  });
  return [...executedMap.values()].sort((left, right) => (toDate(right.startTime)?.getTime() || 0) - (toDate(left.startTime)?.getTime() || 0));
});

const systems = computed(() => ["全部", ...new Set(workflows.value.map((item) => item.system))]);

watch(workflows, (items) => {
  if (!items.length) return;
  if (!state.detailPlanId) state.detailPlanId = items[0].id;
  if (!state.compareLeftId) state.compareLeftId = items[0].id;
  if (!state.compareRightId) state.compareRightId = items[1]?.id || items[0].id;
  if (!state.reportPlanId) state.reportPlanId = items[0].id;
  if (!state.reportWorkItem) state.reportWorkItem = items[0]?.steps?.[0]?.name || "";
  if (!state.reportStage) state.reportStage = "筹措阶段";
  if (!state.reportStartTime) state.reportStartTime = items[0].startTime || "";
  if (!state.reportEndTime) state.reportEndTime = items[0].endTime || "";
  if (state.role === "systemUser" && state.systemFilter === "全部") state.systemFilter = items[0].system;
}, { immediate: true, deep: true });

const visibleWorkflows = computed(() => {
  const today = new Date();
  return workflows.value.filter((plan) => {
    const start = toDate(plan.startTime);
    const byRole = state.role === "systemUser" ? plan.system === state.systemFilter : (state.systemFilter === "全部" || plan.system === state.systemFilter);
    const byRange = state.range === "全部"
      || (state.range === "当日" && sameDate(start, today))
      || (state.range === "本周" && start && (today - start) <= 7 * 24 * 3600 * 1000)
      || (state.range === "本月" && start && start.getMonth() === today.getMonth());
    const byPhase = state.phase === "全部阶段" || plan.phase === state.phase;
    const byMode = state.mode !== "today" || sameDate(start, today);
    return byRole && byRange && byPhase && byMode;
  });
});

const fallbackToAll = computed(() => !visibleWorkflows.value.length && workflows.value.length > 0);
const displayWorkflows = computed(() => fallbackToAll.value ? workflows.value : visibleWorkflows.value);

const activePalette = computed(() => palettePresets[state.palette]);
const workItemOptions = computed(() => [...new Set(workflows.value.flatMap((item) => item.steps.map((step) => step.name)))]);
const stageOptions = computed(() => ["筹措阶段", "测试阶段", "保障阶段", "执行阶段", "归档阶段"]);

function hashIndex(value, size) {
  return [...String(value || "")].reduce((sum, char) => sum + char.charCodeAt(0), 0) % size;
}

function systemColor(system) {
  return activePalette.value[hashIndex(system, activePalette.value.length)];
}

function priorityColor(priority) {
  if (priority === "高优先级") return "#ff7373";
  if (priority === "中优先级") return "#ffd166";
  return "#81b3ff";
}

function riskColor(risk) {
  if (risk === "高") return "#ff7373";
  if (risk === "中") return "#ff9b54";
  return "#4dd59f";
}

function statusColor(status) {
  if (status === "已完成") return "#4dd59f";
  if (status === "执行中") return "#39c5bb";
  if (status === "已终止") return "#ff7373";
  return "#81b3ff";
}

function planStyle(plan, opacity = 0.94) {
  return {
    borderLeft: `4px solid ${systemColor(plan.system)}`,
    boxShadow: `inset 0 0 0 1px ${statusColor(plan.status)}33`,
    background: `linear-gradient(135deg, ${systemColor(plan.system)}22, rgba(11, 29, 44, ${opacity}))`
  };
}
const hoveredPlan = computed(() => displayWorkflows.value.find((item) => item.id === state.hoverPlanId) || displayWorkflows.value[0] || null);
const detailPlan = computed(() => workflows.value.find((item) => item.id === state.detailPlanId) || null);
const compareLeftPlan = computed(() => workflows.value.find((item) => item.id === state.compareLeftId) || null);
const compareRightPlan = computed(() => workflows.value.find((item) => item.id === state.compareRightId) || null);

const overviewStats = computed(() => ({
  total: displayWorkflows.value.length,
  completed: displayWorkflows.value.filter((item) => item.status === "已完成" || item.progress >= 100).length,
  highRisk: displayWorkflows.value.filter((item) => item.risk === "高").length,
  history: workflows.value.filter((item) => item.source === "executed").length
}));

const detailAnnotations = computed(() => annotations.value.filter((item) => item.planId === detailPlan.value?.id));

const completionAssessment = computed(() => {
  const base = detailPlan.value || displayWorkflows.value[0];
  if (!base) return [];
  return [
    { title: "系统参数自动判读", value: base.progress >= 70 ? "判读通过" : "需复核", desc: `当前进度 ${base.progress}% / 风险 ${base.risk}` },
    { title: "人工测试数据录入", value: state.manualInput ? "已录入" : "待录入", desc: state.manualInput || "可手动输入测试数据进行评估" },
    { title: "OCR 手写记录识别", value: state.ocrInput ? "已识别" : "待识别", desc: state.ocrInput || "支持录入手写记录识别结果" },
    { title: "语音录入评估", value: state.voiceInput ? "已录入" : "待录入", desc: state.voiceInput || "支持语音交互录入测试数据" },
    { title: "多媒体记录归档", value: base.progress >= 60 ? "归档中" : "待归档", desc: `当前数据采集情况：${base.dataStatus}` },
    { title: "质量证据上传", value: state.evidenceInput ? "已上传" : "待上传", desc: state.evidenceInput || "支持上传化验结果等质量证据" },
    { title: "证据完整性评估", value: base.dataStatus === "上传完毕" ? "完整" : "需补充", desc: "结合进度、质量证据和采集情况自动评估" }
  ];
});

const progressAssessment = computed(() => {
  const plans = displayWorkflows.value;
  const totalHoursUsed = plans.reduce((sum, item) => sum + item.workHours, 0);
  const peopleCount = new Set(plans.flatMap((item) => item.steps.flatMap((step) => step.assignees))).size;
  return [
    { title: "风险评估", value: `${plans.filter((item) => item.risk === "高").length} 项高风险`, desc: "支持风险闭环情况和风险变化趋势评估" },
    { title: "进度评估", value: `${plans.filter((item) => item.progress >= 100).length} 项完成`, desc: "识别正常、提前、滞后、完成、终止状态并给出预警" },
    { title: "余量评估", value: `${Math.max(0, 100 - Math.round(plans.reduce((sum, item) => sum + item.progress, 0) / Math.max(plans.length, 1)))}%`, desc: "展示计划余量和工作空闲窗口信息" },
    { title: "人员参与评估", value: `${peopleCount} 人参与 / ${totalHoursUsed.toFixed(1)} 人时`, desc: "统计个人参与工作数量、岗位工作量和工时" }
  ];
});

const chartRows = computed(() => {
  const total = Math.max(displayWorkflows.value.length, 1);
  return [
    { title: "已完成", value: displayWorkflows.value.filter((item) => item.progress >= 100).length, color: activePalette.value[0] },
    { title: "执行中", value: displayWorkflows.value.filter((item) => item.progress < 100 && item.status !== "已终止").length, color: activePalette.value[1] },
    { title: "高风险", value: displayWorkflows.value.filter((item) => item.risk === "高").length, color: activePalette.value[3] },
    { title: "历史流程", value: workflows.value.filter((item) => item.source === "executed").length, color: activePalette.value[2] }
  ].map((item) => ({ ...item, percent: Math.max(8, Math.round((item.value / total) * 100)) }));
});

const historicalStats = computed(() => {
  const map = new Map();
  workflows.value.forEach((item) => {
    map.set(item.type, (map.get(item.type) || 0) + 1);
  });
  return [...map.entries()].map(([title, value]) => ({ title, value }));
});

const reviewItems = computed(() => {
  const planReviews = displayWorkflows.value.slice(0, 6).flatMap((plan) => ([
    { id: `daily-${plan.id}`, title: `${plan.title} / 每日完成审核`, owner: "系统工程师", state: reviewState[`daily-${plan.id}`]?.state || "待审核" },
    { id: `node-${plan.id}`, title: `${plan.title} / 关键节点审核`, owner: "相关管理人员", state: reviewState[`node-${plan.id}`]?.state || "待审核" }
  ]));
  const reportReviews = generatedReports.value.map((item) => ({
    id: `report-${item.id}`,
    title: item.title,
    owner: "管理人员",
    state: reviewState[`report-${item.id}`]?.state || (item.pushed ? "待审核" : "待推送")
  }));
  return [...planReviews, ...reportReviews];
});

const compareMetrics = computed(() => {
  const left = compareLeftPlan.value;
  const right = compareRightPlan.value;
  if (!left || !right) return [];
  const leftPeople = new Set(left.steps.flatMap((item) => item.assignees));
  const rightPeople = new Set(right.steps.flatMap((item) => item.assignees));
  const leftEquipment = new Set(left.steps.map((item) => item.equipment));
  const rightEquipment = new Set(right.steps.map((item) => item.equipment));
  const overlapPeople = [...leftPeople].filter((item) => rightPeople.has(item));
  const overlapEquipment = [...leftEquipment].filter((item) => rightEquipment.has(item));
  return [
    { title: "时间对比", value: `${formatDateTime(left.startTime)} vs ${formatDateTime(right.startTime)}`, desc: "可比对开始、结束和窗口长度差异" },
    { title: "人员对比", value: `${leftPeople.size} 人 vs ${rightPeople.size} 人`, desc: `共有人员：${overlapPeople.join("、") || "无"}` },
    { title: "资源对比", value: `${leftEquipment.size} 组资源 vs ${rightEquipment.size} 组资源`, desc: `重叠资源：${overlapEquipment.join("、") || "无"}` },
    { title: "余量对比", value: `${100 - left.progress}% vs ${100 - right.progress}%`, desc: "余量越高，说明仍有调整空间" },
    { title: "冲突对比", value: `${overlapPeople.length + overlapEquipment.length} 项潜在冲突`, desc: "综合时间、人员、资源重叠给出冲突情况" },
    { title: "完成度对比", value: `${left.progress}% vs ${right.progress}%`, desc: left.progress >= right.progress ? "当前左侧流程完成度更高" : "当前右侧流程完成度更高" },
    {
      title: "对比结论与建议",
      value: left.progress >= right.progress ? "左侧流程更稳定" : "右侧流程更稳定",
      desc: overlapPeople.length || overlapEquipment.length
        ? "建议优先消解重叠人员和资源冲突，再对滞后流程补充余量。"
        : "建议将完成度较高的流程作为参考模板，复用其关键节点和资源配置。"
    }
  ];
});

function panTimeline(offset) {
  timelineRef.value?.scrollBy({ left: offset, behavior: "smooth" });
}

function currentStepOrder(plan) {
  if (!plan?.steps?.length) return 0;
  return Math.min(plan.steps.length, Math.max(1, Math.ceil((plan.progress / 100) * plan.steps.length)));
}

function openPlan(plan) {
  state.detailPlanId = plan.id;
  state.detailOpen = true;
  state.compareLeftId = plan.id;
}

function closePlan() {
  state.detailOpen = false;
}

function openCompare() {
  state.compareOpen = true;
  if (!state.compareRightId || state.compareRightId === state.compareLeftId) {
    state.compareRightId = workflows.value.find((item) => item.id !== state.compareLeftId)?.id || state.compareLeftId;
  }
}

function submitAnnotation() {
  if (!detailPlan.value || !state.annotationContent.trim()) {
    showToast("请先输入标注内容");
    return;
  }
  annotations.value.unshift({
    id: createId("annotation"),
    planId: detailPlan.value.id,
    dimension: state.annotationDimension,
    content: state.annotationContent.trim(),
    note: state.annotationNote.trim(),
    status: "待审核"
  });
  state.annotationContent = "";
  state.annotationNote = "";
  showToast("标注已提交审核");
}

function approveAnnotation(id) {
  const target = annotations.value.find((item) => item.id === id);
  if (!target) return;
  target.status = "已发布";
  showToast("标注审核通过并发布");
}

function setReviewState(id, value) {
  reviewState[id] = { state: value };
  showToast(value === "已审核" ? "电子审核已完成" : "已推送远程审核");
}

function generateReport() {
  const titleMap = {
    "single-work": "单项工作完成情况",
    "daily": "单日工作完成情况",
    "single-plan": "单项计划完成情况",
    "time-range": "指定时间范围工作完成情况",
    "stage": "指定阶段工作完成情况",
    "custom": "自定义组合报表",
    "fuel": maskSensitiveText("特燃特气保障情况")
  };
  let detail = state.reportRange;
  if (state.reportCategory === "single-work") {
    if (!state.reportWorkItem) {
      showToast("请先选择工作项目");
      return;
    }
    detail = `工作项目：${state.reportWorkItem}`;
  }
  if (state.reportCategory === "single-plan") {
    const targetPlan = workflows.value.find((item) => item.id === state.reportPlanId);
    if (!targetPlan) {
      showToast("请先选择工作流程");
      return;
    }
    detail = `工作流程：${targetPlan.title}`;
  }
  if (state.reportCategory === "time-range") {
    if (!state.reportStartTime || !state.reportEndTime) {
      showToast("请先选择起始时间和终止时间");
      return;
    }
    detail = `${formatDateTime(state.reportStartTime)} 至 ${formatDateTime(state.reportEndTime)}`;
  }
  if (state.reportCategory === "stage") {
    if (!state.reportStage) {
      showToast("请先选择指定阶段");
      return;
    }
    detail = `阶段：${state.reportStage}`;
  }
  generatedReports.value.unshift({
    id: createId("report"),
    title: `${titleMap[state.reportCategory]}${state.reportFormat}`,
    template: state.reportTemplate,
    range: detail,
    pushed: true
  });
  showToast("工作报表已生成并推送至电子审核模块");
}
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>流程智能评估</h1>
        <div class="muted">围绕流程态势展示、工作完成情况评估、计划进度评估、历史比对、电子审核和报表生成进行综合分析。</div>
      </div>
      <div class="topbar-actions">
        <button class="button" type="button" @click="assistantOpen = true">智能助手</button>
      </div>
    </div>

    <section class="stat-grid">
      <div class="metric"><h3>可见流程</h3><p>当前过滤条件下可查看的流程数量</p><strong>{{ overviewStats.total }}</strong></div>
      <div class="metric"><h3>完成流程</h3><p>已完成或归档的流程数量</p><strong>{{ overviewStats.completed }}</strong></div>
      <div class="metric"><h3>高风险流程</h3><p>当前高风险或需重点关注的流程</p><strong>{{ overviewStats.highRisk }}</strong></div>
      <div class="metric"><h3>历史执行流程</h3><p>可用于历史分析和流程比对的记录</p><strong>{{ overviewStats.history }}</strong></div>
    </section>

    <section class="panel-grid evaluation-main" style="margin-top:18px;">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>流程态势展示</h3>
            <p>支持当日、单项、全部三种视角，并结合时间段、工作阶段、岗位层级和系统颗粒度展示流程态势。</p>
          </div>
          <div class="chip-row">
            <span class="chip active">实时更新</span>
            <span class="chip">图表配色：{{ state.palette }}</span>
          </div>
        </div>

        <div class="tabs">
          <button class="tab" :class="{ active: state.mode === 'today' }" @click="state.mode = 'today'">当日</button>
          <button class="tab" :class="{ active: state.mode === 'single' }" @click="state.mode = 'single'">单项</button>
          <button class="tab" :class="{ active: state.mode === 'all' }" @click="state.mode = 'all'">全部</button>
        </div>

        <div class="filter-grid">
          <div class="field">
            <label>指定时间段</label>
            <select v-model="state.range">
              <option>全部</option>
              <option>当日</option>
              <option>本周</option>
              <option>本月</option>
            </select>
          </div>
          <div class="field">
            <label>工作阶段</label>
            <select v-model="state.phase">
              <option>全部阶段</option>
              <option>筹措阶段</option>
              <option>测试阶段</option>
              <option>保障阶段</option>
              <option>执行阶段</option>
              <option>归档阶段</option>
            </select>
          </div>
          <div class="field">
            <label>岗位层级</label>
            <select v-model="state.role">
              <option value="systemUser">系统内人员</option>
              <option value="systemEngineer">系统工程师</option>
              <option value="manager">管理人员</option>
            </select>
          </div>
          <div class="field">
            <label>系统范围</label>
            <select v-model="state.systemFilter">
              <option v-for="item in systems" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
          <div class="field">
            <label>图表配色</label>
            <select v-model="state.palette">
              <option v-for="item in Object.keys(palettePresets)" :key="item">{{ item }}</option>
            </select>
          </div>
          <div class="field" v-if="state.mode === 'single'">
            <label>单项流程</label>
            <select v-model="state.detailPlanId">
              <option v-for="item in displayWorkflows" :key="item.id" :value="item.id">{{ m(item.title) }}</option>
            </select>
          </div>
          <div class="field">
            <label>视图缩放</label>
            <div class="button-row">
              <button class="ghost" type="button" @click="panTimeline(-260)">左移</button>
              <button class="ghost" type="button" @click="panTimeline(260)">右移</button>
              <button class="ghost" type="button" @click="state.zoom = Math.max(0.8, Number((state.zoom - 0.1).toFixed(1)))">缩小</button>
              <button class="ghost" type="button" @click="state.zoom = Number((state.zoom + 0.1).toFixed(1))">放大</button>
              <button class="ghost" type="button" @click="state.zoom = 1">重置</button>
            </div>
          </div>
        </div>

        <div class="evaluation-legend">
          <span class="tag">系统颜色区分</span>
          <span class="tag">优先级颜色区分</span>
          <span class="tag">风险等级颜色区分</span>
          <span class="tag">状态颜色区分</span>
        </div>

        <div v-if="fallbackToAll" class="notice-card">
          <span>当前筛选条件下没有命中流程，系统已自动回退展示全部流程，避免流程可视化为空白。</span>
          <span class="warning">已回退到全部</span>
        </div>

        <div ref="timelineRef" class="timeline-wrapper">
          <div class="timeline-zoom-layer" :style="{ transform: `scale(${state.zoom})`, transformOrigin: 'top left' }">
            <div class="evaluation-timeline">
              <article
                v-for="plan in displayWorkflows"
                :key="plan.id"
                class="evaluation-flow-card"
                :style="planStyle(plan)"
                @mouseenter="state.hoverPlanId = plan.id"
                @click="openPlan(plan)"
              >
                <div class="panel-head">
                  <div>
                    <strong>{{ m(plan.title) }}</strong>
                    <div class="muted">{{ m(plan.system) }} / {{ m(plan.type) }}</div>
                  </div>
                  <span class="chip" :style="{ color: statusColor(plan.status), borderColor: `${statusColor(plan.status)}66` }">{{ plan.status }}</span>
                </div>
                <div class="chip-row">
                  <span class="chip" :style="{ color: priorityColor(plan.priority), borderColor: `${priorityColor(plan.priority)}66` }">{{ plan.priority }}</span>
                  <span class="chip" :style="{ color: riskColor(plan.risk), borderColor: `${riskColor(plan.risk)}66` }">{{ plan.risk }}风险</span>
                  <span class="chip" :style="{ color: systemColor(plan.system), borderColor: `${systemColor(plan.system)}66` }">{{ plan.phase }}</span>
                </div>
                <div class="progress"><span :style="{ width: `${plan.progress}%`, background: activePalette[0] }" /></div>
                <div class="detail-list">
                  <div class="detail-line"><span>时间线</span><strong>{{ formatDateTime(plan.startTime) }} → {{ formatDateTime(plan.endTime) }}</strong></div>
                  <div class="detail-line"><span>人员 / 设备</span><strong>{{ plan.currentStep?.assignees?.join("、") || plan.owner }} / {{ plan.currentStep?.equipment || "待定设备" }}</strong></div>
                  <div class="detail-line"><span>数据采集</span><strong>{{ plan.dataStatus }}</strong></div>
                </div>
              </article>
            </div>
          </div>
        </div>

        <div class="panel-grid two" style="margin-top:16px;">
          <div class="panel">
            <h3>流程交互详情</h3>
            <div v-if="hoveredPlan" class="rules-list">
              <div class="notice-card"><span>工作内容：{{ m(hoveredPlan.currentStep?.name || hoveredPlan.steps[0]?.name || "待执行") }}</span><span class="accent">悬停详情</span></div>
              <div class="notice-card"><span>人员：{{ hoveredPlan.currentStep?.assignees?.join("、") || hoveredPlan.owner }}</span><span class="accent">执行人员</span></div>
              <div class="notice-card"><span>设备：{{ hoveredPlan.currentStep?.equipment || "待定设备" }}</span><span class="accent">设备</span></div>
              <div class="notice-card"><span>完成情况：{{ hoveredPlan.progress }}% / {{ hoveredPlan.status }}</span><span class="accent">完成情况</span></div>
              <div class="notice-card"><span>数据采集：{{ hoveredPlan.dataStatus }}</span><span class="accent">数据采集</span></div>
            </div>
          </div>
          <div class="panel">
            <h3>流程日历</h3>
            <div class="calendar">
              <div v-for="day in 28" :key="day" class="day" :class="{ highlight: day % 7 === 0, focus: day % 5 === 0 }">
                <strong>{{ day }}</strong>
                <div class="muted">{{ day % 7 === 0 ? "重点节点" : day % 3 === 0 ? "工作日期" : "空余日期" }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-grid two" style="margin-top:16px;">
          <div class="panel">
            <h3>统计图表</h3>
            <div class="rules-list">
              <div v-for="item in chartRows" :key="item.title" class="chart-row">
                <strong>{{ m(item.title) }}</strong>
                <div class="chart-bar"><span :style="{ width: `${item.percent}%`, background: item.color }" /></div>
                <span>{{ item.value }}</span>
              </div>
            </div>
          </div>
          <div class="panel">
            <h3>历史执行统计</h3>
            <div class="rules-list">
              <div v-for="item in historicalStats" :key="item.title" class="notice-card">
                <span>{{ m(item.title) }}</span>
                <span class="accent">{{ item.value }} 条</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>{{ state.assessmentTab === "completion" ? "工作完成情况评估" : "工作计划进度评估" }}</h3>
            <p>右侧模块通过切换栏切换，分别支持完成质量评估和计划进度评估。</p>
          </div>
        </div>
        <div class="tabs">
          <button class="tab" :class="{ active: state.assessmentTab === 'completion' }" @click="state.assessmentTab = 'completion'">工作完成情况评估</button>
          <button class="tab" :class="{ active: state.assessmentTab === 'progress' }" @click="state.assessmentTab = 'progress'">工作计划进度评估</button>
        </div>

        <div v-if="state.assessmentTab === 'completion'" class="rules-list">
          <div class="field">
            <label>人工测试数据</label>
            <input v-model="state.manualInput" placeholder="例如：压力 1.2MPa，结果达标">
          </div>
          <div class="field">
            <label>OCR 识别结果</label>
            <textarea v-model="state.ocrInput" placeholder="录入手写记录 OCR 识别结果"></textarea>
          </div>
          <div class="field">
            <label>语音录入结果</label>
            <input v-model="state.voiceInput" placeholder="录入语音交互转写结果">
          </div>
          <div class="field">
            <label>质量证据 / 化验结果</label>
            <textarea v-model="state.evidenceInput" placeholder="填写化验结果、多媒体记录或质量证据说明"></textarea>
          </div>
          <div v-for="item in completionAssessment" :key="item.title" class="notice-card">
            <div>
              <strong>{{ m(item.title) }}</strong>
              <div class="muted">{{ item.desc }}</div>
            </div>
            <span class="accent">{{ item.value }}</span>
          </div>
        </div>

        <div v-else class="rules-list">
          <div v-for="item in progressAssessment" :key="item.title" class="notice-card">
            <div>
              <strong>{{ m(item.title) }}</strong>
              <div class="muted">{{ item.desc }}</div>
            </div>
            <span class="accent">{{ item.value }}</span>
          </div>
        </div>
      </section>
    </section>

    <section class="panel-grid two" style="margin-top:18px;">
      <section class="panel">
        <h3>相关方电子审核</h3>
        <div class="rules-list">
          <div v-for="item in reviewItems" :key="item.id" class="approval-row">
            <div>
              <strong>{{ m(item.title) }}</strong>
              <div class="muted">审核方：{{ item.owner }}</div>
            </div>
            <div class="approval-state" :class="{ success: item.state === '已审核' }">{{ item.state }}</div>
            <div class="button-row">
              <button class="ghost" type="button" @click="setReviewState(item.id, '已推送')">推送审核</button>
              <button class="button" type="button" @click="setReviewState(item.id, '已审核')">审核通过</button>
            </div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h3>工作报表生成</h3>
        <div class="filter-grid">
          <div class="field">
            <label>报表类型</label>
            <select v-model="state.reportCategory">
              <option value="single-work">单项工作完成情况</option>
              <option value="daily">单日工作完成情况</option>
              <option value="single-plan">单项计划完成情况</option>
              <option value="time-range">指定时间范围工作完成情况</option>
              <option value="stage">指定阶段工作完成情况</option>
              <option value="custom">自定义组合报表</option>
              <option value="fuel">{{ m("特燃特气保障情况") }}</option>
            </select>
          </div>
          <div class="field">
            <label>输出格式</label>
            <select v-model="state.reportFormat">
              <option>报表</option>
              <option>报告</option>
              <option>PPT</option>
            </select>
          </div>
          <div class="field">
            <label>统计范围</label>
            <select v-model="state.reportRange">
              <option>当日</option>
              <option>本周</option>
              <option>本月</option>
              <option>自定义阶段</option>
            </select>
          </div>
          <div class="field">
            <label>模板选择</label>
            <select v-model="state.reportTemplate">
              <option>标准模板</option>
              <option>管理模板</option>
              <option>自定义组合模板</option>
            </select>
          </div>
        </div>
        <div v-if="state.reportCategory === 'single-work'" class="filter-grid" style="margin-top:16px;">
          <div class="field">
            <label>工作项目</label>
            <select v-model="state.reportWorkItem">
              <option v-for="item in workItemOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
        </div>
        <div v-else-if="state.reportCategory === 'single-plan'" class="filter-grid" style="margin-top:16px;">
          <div class="field">
            <label>工作流程</label>
            <select v-model="state.reportPlanId">
              <option v-for="item in workflows" :key="item.id" :value="item.id">{{ m(item.title) }}</option>
            </select>
          </div>
        </div>
        <div v-else-if="state.reportCategory === 'time-range'" class="filter-grid" style="margin-top:16px;">
          <div class="field">
            <label>起始时间</label>
            <input v-model="state.reportStartTime" type="datetime-local">
          </div>
          <div class="field">
            <label>终止时间</label>
            <input v-model="state.reportEndTime" type="datetime-local">
          </div>
        </div>
        <div v-else-if="state.reportCategory === 'stage'" class="filter-grid" style="margin-top:16px;">
          <div class="field">
            <label>指定阶段</label>
            <select v-model="state.reportStage">
              <option v-for="item in stageOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </div>
        </div>
        <div class="button-row" style="margin-top:16px;">
          <button class="button" type="button" @click="generateReport">生成</button>
        </div>
        <div class="rules-list" style="margin-top:16px;">
          <div v-for="item in generatedReports" :key="item.id" class="notice-card">
            <div>
              <strong>{{ m(item.title) }}</strong>
              <div class="muted">{{ item.template }} / {{ item.range }}</div>
            </div>
            <span class="accent">{{ item.pushed ? "已推送审核" : "待推送" }}</span>
          </div>
        </div>
      </section>
    </section>

    <div class="modal-overlay" :class="{ open: state.detailOpen }" @click.self="closePlan">
      <div class="modal-card evaluation-modal" v-if="detailPlan">
        <div class="panel-head">
          <div>
            <h3>{{ m(detailPlan.title) }}</h3>
            <p>{{ m(detailPlan.system) }} / {{ m(detailPlan.type) }}</p>
          </div>
          <div class="button-row">
            <button class="ghost" type="button" @click="openCompare">比对</button>
            <button class="ghost" type="button" @click="closePlan">关闭</button>
          </div>
        </div>

        <div class="notice-card">
          <span>开始：{{ formatDateTime(detailPlan.startTime) }} / 结束：{{ formatDateTime(detailPlan.endTime) }}</span>
          <span class="accent">{{ detailPlan.progress }}%</span>
        </div>

        <div style="margin-top:16px;">
          <div class="detail-line">
            <span>当前流程进度</span>
            <strong>第 {{ currentStepOrder(detailPlan) }} / {{ detailPlan.steps.length }} 步</strong>
          </div>
          <div class="progress"><span :style="{ width: `${detailPlan.progress}%`, background: activePalette[0] }" /></div>
        </div>

        <div class="rules-list" style="margin-top:16px;">
          <div v-for="step in detailPlan.steps" :key="step.id" class="notice-card">
            <div>
              <strong>{{ m(step.name) }}</strong>
              <div class="muted">{{ step.assignees.join("、") }} / {{ step.equipment }} / {{ step.executionDuration }}</div>
            </div>
            <span class="accent">步骤态势</span>
          </div>
        </div>

        <div class="panel-grid two" style="margin-top:16px;">
          <div class="panel">
            <h3>信息标注</h3>
            <div class="field">
              <label>标注维度</label>
              <select v-model="state.annotationDimension">
                <option>流程区间</option>
                <option>进展</option>
                <option>单项工作</option>
                <option>关键注意事项</option>
              </select>
            </div>
            <div class="field">
              <label>标注内容</label>
              <textarea v-model="state.annotationContent" placeholder="填写关键信息或注意事项"></textarea>
            </div>
            <div class="field">
              <label>备注</label>
              <textarea v-model="state.annotationNote" placeholder="补充审核说明"></textarea>
            </div>
            <div class="button-row">
              <button class="button" type="button" @click="submitAnnotation">提交审核</button>
            </div>
          </div>
          <div class="panel">
            <h3>已提交标注</h3>
            <div class="rules-list">
              <div v-for="item in detailAnnotations" :key="item.id" class="notice-card">
                <div>
                  <strong>{{ item.dimension }}</strong>
                  <div class="muted">{{ item.content }}</div>
                  <div class="muted">{{ item.note || "无备注" }}</div>
                </div>
                <div class="button-row">
                  <span class="chip">{{ item.status }}</span>
                  <button v-if="item.status !== '已发布'" class="ghost" type="button" @click="approveAnnotation(item.id)">审核并发布</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.compareOpen }" @click.self="state.compareOpen = false">
      <div class="modal-card compare-modal">
        <div class="panel-head">
          <div>
            <h3>历史流程比对</h3>
            <p>支持任意两个流程左右切换，对时间、人员、资源、余量、冲突和完成度进行对比。</p>
          </div>
          <button class="ghost" type="button" @click="state.compareOpen = false">关闭</button>
        </div>

        <div class="filter-grid">
          <div class="field">
            <label>左侧流程</label>
            <select v-model="state.compareLeftId">
              <option v-for="item in workflows" :key="item.id" :value="item.id">{{ m(item.title) }}</option>
            </select>
          </div>
          <div class="field">
            <label>右侧流程</label>
            <select v-model="state.compareRightId">
              <option v-for="item in workflows" :key="item.id" :value="item.id">{{ m(item.title) }}</option>
            </select>
          </div>
        </div>

        <div class="compare-grid" style="margin-top:16px;">
          <div class="compare-pane compare-left" v-if="compareLeftPlan" :style="planStyle(compareLeftPlan, 0.88)">
            <h3>{{ m(compareLeftPlan.title) }}</h3>
            <div class="rules-list">
              <div v-for="step in compareLeftPlan.steps" :key="step.id" class="notice-card">
                <span>{{ m(step.name) }}</span>
                <span class="accent">{{ step.assignees.join("、") }}</span>
              </div>
            </div>
          </div>
          <div class="compare-pane compare-right" v-if="compareRightPlan" :style="planStyle(compareRightPlan, 0.72)">
            <h3>{{ m(compareRightPlan.title) }}</h3>
            <div class="rules-list">
              <div v-for="step in compareRightPlan.steps" :key="step.id" class="notice-card">
                <span>{{ m(step.name) }}</span>
                <span class="accent">{{ step.assignees.join("、") }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="rules-list" style="margin-top:16px;">
          <div v-for="item in compareMetrics" :key="item.title" class="notice-card">
            <div>
              <strong>{{ m(item.title) }}</strong>
              <div class="muted">{{ item.desc }}</div>
            </div>
            <span class="accent">{{ item.value }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
