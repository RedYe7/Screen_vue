<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const props = defineProps({
  flowId: {
    type: String,
    required: true
  }
});

const {
  currentUser,
  catalog,
  fuelPlanningPacket,
  genericPlanningPackets,
  globalKeyNodes,
  fuelPlanningToday,
  saveGenericFlowCalendar,
  showToast
} = usePlatformState();

const TODAY_ISO = fuelPlanningToday || "2026-04-18";

const gasLabelMap = {
  oxygen: "氧气",
  hydrogen: "氢气",
  nitrogen: "氮气",
  helium: "氦气"
};

const flowPlanColorMap = {
  mission: "#f7ec5d",
  repair: "#ff8be2",
  maintenance: "#83f0c1",
  custom: "#7da1ff"
};
const ganttZoomLevels = [
  { level: 0, label: "季度", days: 90 },
  { level: 1, label: "月", days: 31 },
  { level: 2, label: "旬", days: 10 },
  { level: 3, label: "周", days: 7 },
  { level: 4, label: "三日", days: 3 },
  { level: 5, label: "单日", days: 1 }
];
const ganttBaseRowHeight = 58;
const ganttLaneHeight = 24;
const ganttLaneTopOffset = 22;

const flowConfigMap = {
  mission: {
    title: "任务工作流程自主规划",
    description: "支持系统准备、例行试验、测试工作、加注供气保障等任务工作的日历式规划与人工调整。",
    engineerHint: "系统工程师可查看各气体系统回传的任务流程计划，并统一掌握计划状态。",
    planNames: (gasLabel) => [
      `${gasLabel}系统准备流程`,
      `${gasLabel}例行试验流程`,
      `${gasLabel}测试工作流程`,
      `${gasLabel}加注供气保障流程`,
      `${gasLabel}异常处置流程`,
      `${gasLabel}故障处置流程`
    ]
  },
  repair: {
    title: "装备维修流程自主规划",
    description: "支持维修、改造、调试测试、质量确认点和保障条件协同等工作按日历规划生成。",
    engineerHint: "系统工程师可查看各气体系统的维修与改造计划，以及最近一次调整状态。",
    planNames: (gasLabel) => [
      `${gasLabel}系统设备维修计划`,
      `${gasLabel}系统改造计划`,
      `${gasLabel}系统调试测试计划`,
      `${gasLabel}质量确认点计划`,
      `${gasLabel}多媒体记录采集计划`,
      `${gasLabel}保障条件协调计划`
    ]
  },
  maintenance: {
    title: "日常维护流程自主规划",
    description: "支持日维护、周维护、月维护、标校和预防性检修等维护工作按日历方式编排。",
    engineerHint: "系统工程师可查看各气体系统维护计划的回传情况和已确认版本。",
    planNames: (gasLabel) => [
      `${gasLabel}系统日维护计划`,
      `${gasLabel}系统周维护计划`,
      `${gasLabel}系统月维护计划`,
      `${gasLabel}仪器仪表标校计划`,
      `${gasLabel}预防性检修维护计划`,
      `${gasLabel}维护流程调整计划`
    ]
  },
  custom: {
    title: "自定义工作自主规划",
    description: "支持岗位人员按气体系统快速生成自定义任务、协同、保障与收尾归档计划。",
    engineerHint: "系统工程师可查看各气体系统自定义工作计划的生成与确认情况。",
    planNames: (gasLabel) => [
      `${gasLabel}自定义项目准备计划`,
      `${gasLabel}自定义执行计划`,
      `${gasLabel}自定义协同计划`,
      `${gasLabel}自定义保障计划`,
      `${gasLabel}自定义质量记录计划`,
      `${gasLabel}自定义收尾归档计划`
    ]
  }
};

const holidayMap = {
  "2026-05-01": "劳动节",
  "2026-05-02": "劳动节",
  "2026-05-03": "劳动节",
  "2026-10-01": "国庆",
  "2026-10-02": "国庆",
  "2026-10-03": "国庆"
};

const flowTitleMap = {
  fuel: "特燃特气筹措流程",
  mission: "任务工作流程",
  launch: "发射日工作规划",
  repair: "装备维修流程",
  maintenance: "日常维护流程",
  custom: "自定义工作流程"
};

const flowConstraintDefaults = {
  mission: ["skip-weekends", "personnel-busy", "device-maintenance-window"],
  repair: ["skip-weekends", "skip-holidays", "device-maintenance-window", "personnel-busy"],
  maintenance: ["skip-weekends", "skip-holidays", "device-maintenance-window"],
  custom: ["skip-weekends", "personnel-busy", "key-node-lock"]
};

const state = reactive({
  conflictModalOpen: false,
  clearPlanModalOpen: false,
  smartReorderModalOpen: false,
  conflictRecordModalOpen: false,
  selectedConflictPlanId: "",
  selectedConflictWorkDayId: "",
  selectedConflictDateIso: "",
  workDayModalOpen: false
});

const dragState = reactive({
  active: false,
  planId: "",
  workDayId: "",
  startX: 0,
  deltaX: 0,
  dayWidth: 0,
  moved: false
});
const suppressPlanClick = ref(false);

const conflictModal = reactive({
  planId: "",
  planName: "",
  workDayId: "",
  shiftDays: 0,
  candidate: null,
  conflicts: []
});

const workDayModal = reactive({
  planId: "",
  workDayId: "",
  dateIso: "",
  actionLabel: "",
  timeRange: "",
  personnel: "",
  equipment: "",
  position: ""
});

const keyNodeModal = reactive({
  open: false,
  id: "",
  dateIso: "",
  title: "",
  nodeType: "关键检查",
  description: "",
  blockScheduling: true
});

const smartOptimizeModal = reactive({
  open: false,
  candidatePlans: [],
  optimizedPlans: [],
  conflicts: [],
  optimizationSteps: [],
  remainingConflicts: [],
  activeTab: "conflicts",
  canOptimize: false,
  reason: ""
});

const repairRequestDetail = reactive({
  open: false,
  id: ""
});

const repairRequests = [
  {
    id: "repair-req-oxygen-pump",
    equipmentName: "氧气系统低温泵",
    healthStatus: "轴承温升异常",
    priority: "高",
    startDate: "2026-05-12",
    endDate: "2026-05-16",
    personnel: ["周工", "赵工"],
    equipment: ["维修工装箱", "检测仪表"],
    description: "健康监测系统连续两次上报轴承温升超过阈值，建议安排隔离、检修、复测和质量确认。"
  },
  {
    id: "repair-req-valve",
    equipmentName: "二号供气阀组",
    healthStatus: "阀位反馈漂移",
    priority: "中",
    startDate: "2026-05-18",
    endDate: "2026-05-21",
    personnel: ["陈工", "李工"],
    equipment: ["标校设备", "维护终端"],
    description: "阀位反馈存在轻微漂移，需完成标校、维修执行、复测确认和记录归档。"
  },
  {
    id: "repair-req-control",
    equipmentName: "供气控制柜",
    healthStatus: "通信链路间歇告警",
    priority: "高",
    startDate: "2026-05-20",
    endDate: "2026-05-24",
    personnel: ["周工", "吴工"],
    equipment: ["供气控制柜", "记录终端"],
    description: "健康监测系统提示通信链路间歇告警，需排查接插件、复测通信状态并归档。"
  }
];

const editablePlans = ref([]);
const localConflictRecords = ref([]);
const localPlanStatus = ref("idle");
const calendarDirty = ref(false);
const ganttCenterDate = ref(TODAY_ISO);
const ganttZoomLevel = ref(2);
const ganttInitialized = ref(false);

const isEngineer = computed(() => currentUser.value?.role === "engineer");
const isCommander = computed(() => currentUser.value?.role === "commander");
const activeGasType = computed(() => currentUser.value?.gasType || "oxygen");
const activeGasLabel = computed(() => gasLabelMap[activeGasType.value] || "氧气");
const flowConfig = computed(() => flowConfigMap[props.flowId] || flowConfigMap.custom);
const flowPacket = computed(() => genericPlanningPackets.value?.[props.flowId] || { gasPackets: {} });
const visibleGasPacket = computed(
  () =>
    flowPacket.value.gasPackets?.[activeGasType.value] || {
      calendarPlans: [],
      keyNodes: [],
      conflictRecords: [],
      planStatus: "idle",
      planGeneratedBy: "",
      planConfirmedAt: "",
      lastEditedBy: ""
    }
);
const localKeyNodes = computed(() => visibleGasPacket.value.keyNodes || []);
const globalFlowKeyNodes = computed(() =>
  globalKeyNodes.value.filter((node) => isGlobalKeyNodeApplicable(node, props.flowId, activeGasType.value))
);
const keyNodes = computed(() => [
  ...localKeyNodes.value.map((node) => ({ ...node, sourceType: "local", sourceLabel: "当前流程" })),
  ...globalFlowKeyNodes.value.map((node) => ({ ...node, sourceType: "global", sourceLabel: "全局关键节点", isGlobal: true }))
]);

watch(
  visibleGasPacket,
  (next) => {
    editablePlans.value = (next.calendarPlans || []).map((plan, index) => normalizePlanMeta(plan, index));
    localConflictRecords.value = clone(next.conflictRecords || []);
    localPlanStatus.value = next.planStatus || "idle";
    calendarDirty.value = false;
  },
  { immediate: true, deep: true }
);

watch(
  editablePlans,
  (plans) => {
    if (!plans.length || ganttInitialized.value) return;
    ganttCenterDate.value = plans.reduce(
      (earliest, plan) => (compareIso(plan.startDate, earliest) < 0 ? plan.startDate : earliest),
      plans[0].startDate
    );
    ganttInitialized.value = true;
  },
  { immediate: true, deep: true }
);

const engineerPlanSummaries = computed(() =>
  Object.entries(flowPacket.value.gasPackets || {}).map(([gasType, gasPacket]) => ({
    gasType,
    gasLabel: gasLabelMap[gasType] || gasType,
    planStatus: gasPacket.planStatus || "idle",
    planGeneratedBy: gasPacket.planGeneratedBy || "",
    planConfirmedAt: gasPacket.planConfirmedAt || "",
    lastEditedBy: gasPacket.lastEditedBy || "",
    plans: (gasPacket.calendarPlans || []).map((plan, index) => normalizePlanMeta(plan, index)),
    conflictRecords: gasPacket.conflictRecords || []
  }))
);

const calendarMonths = computed(() => {
  if (!editablePlans.value.length) return buildCalendarMonths(TODAY_ISO, addDays(TODAY_ISO, 45), []);
  const sorted = [...editablePlans.value].sort((left, right) => compareIso(left.startDate, right.startDate));
  const startIso = sorted[0].startDate;
  const endIso = sorted.reduce((latest, plan) => (compareIso(plan.endDate, latest) > 0 ? plan.endDate : latest), startIso);
  return buildCalendarMonths(startIso, endIso, editablePlans.value);
});

const ganttZoomConfig = computed(() => ganttZoomLevels[ganttZoomLevel.value] || ganttZoomLevels[2]);

const ganttVisibleRange = computed(() => {
  const visibleDays = ganttZoomConfig.value.days;
  const center = ganttCenterDate.value || editablePlans.value[0]?.startDate || TODAY_ISO;
  const startDate = addDays(center, -Math.floor((visibleDays - 1) / 2));
  return {
    startDate,
    endDate: addDays(startDate, visibleDays - 1),
    visibleDays
  };
});

const ganttDateColumns = computed(() =>
  Array.from({ length: ganttVisibleRange.value.visibleDays }, (_, index) => {
    const dateIso = addDays(ganttVisibleRange.value.startDate, index);
    const date = toDate(dateIso);
    const nodes = keyNodes.value.filter((node) => node.dateIso === dateIso);
    return {
      dateIso,
      dayLabel: `${date.getMonth() + 1}/${date.getDate()}`,
      weekdayLabel: weekdayLabel((date.getDay() + 6) % 7),
      leftPercent: (index / ganttVisibleRange.value.visibleDays) * 100,
      widthPercent: (1 / ganttVisibleRange.value.visibleDays) * 100,
      isToday: dateIso === TODAY_ISO,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      holidayLabel: holidayMap[dateIso] || "",
      keyNodes: nodes
    };
  })
);

const ganttVisiblePlanRows = computed(() => {
  const { startDate, endDate, visibleDays } = ganttVisibleRange.value;
  return editablePlans.value
    .filter((plan) => compareIso(plan.endDate, startDate) >= 0 && compareIso(plan.startDate, endDate) <= 0)
    .sort((left, right) => compareIso(left.startDate, right.startDate))
    .map((plan) => {
      const visibleStartDate = compareIso(plan.startDate, startDate) > 0 ? plan.startDate : startDate;
      const visibleEndDate = compareIso(plan.endDate, endDate) < 0 ? plan.endDate : endDate;
      const startOffset = diffDays(startDate, visibleStartDate);
      const spanDays = diffDays(visibleStartDate, visibleEndDate) + 1;
      return {
        ...plan,
        visibleStartDate,
        visibleEndDate,
        leftPercent: (startOffset / visibleDays) * 100,
        widthPercent: (spanDays / visibleDays) * 100,
        isClippedStart: compareIso(plan.startDate, startDate) < 0,
        isClippedEnd: compareIso(plan.endDate, endDate) > 0,
        rowHeight: getGanttRowHeight(plan, visibleStartDate, visibleEndDate),
        conflictSummary: buildPlanConflictSummary(plan)
      };
    });
});

const isSingleDayGantt = computed(() => ganttZoomConfig.value.days === 1);

function ganttAxisCellStyle(cell) {
  return {
    left: `${cell.leftPercent}%`,
    width: `${cell.widthPercent}%`
  };
}

const ganttSingleDayWorks = computed(() => {
  const dateIso = ganttVisibleRange.value.startDate;
  return editablePlans.value
    .flatMap((plan) => getPlanWorkDays(plan)
      .filter((workDay) => workDay.dateIso === dateIso)
      .map((workDay) => {
      const summary = buildPlanConflictSummary(plan);
      return {
        id: `${plan.id}-${workDay.id}`,
        planId: plan.id,
        workDayId: workDay.id,
        planName: plan.name,
        dateIso,
        timeRange: workDay.timeRange,
        actionLabel: workDay.actionLabel,
        personnel: formatWorkDayPeople(workDay, plan),
        equipment: formatWorkDayEquipment(workDay, plan),
        position: workDay.position || `${activeGasLabel.value}系统执行岗`,
        status: workDay.status || (localPlanStatus.value === "confirmed" ? "已确认" : "草稿"),
        riskText: summary.compactLabel || "常规风险，按流程执行",
        hasConflict: isWorkDayConflict(plan, workDay)
      };
    }))
    .sort((left, right) => left.timeRange.localeCompare(right.timeRange));
});

const selectedConflictPlan = computed(() =>
  editablePlans.value.find((plan) => plan.id === state.selectedConflictPlanId) || null
);

const selectedConflictPlanRecords = computed(() =>
  selectedConflictPlan.value
    ? getPlanConflictRecordsForModal(
        selectedConflictPlan.value,
        state.selectedConflictDateIso,
        state.selectedConflictWorkDayId
      )
    : []
);

const selectedWorkDayPlan = computed(() =>
  editablePlans.value.find((plan) => plan.id === workDayModal.planId) || null
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function currentOperatorName() {
  return currentUser.value?.roleLabel || "指挥人员";
}

function saveGenericPacketPatch(patch) {
  saveGenericFlowCalendar(props.flowId, activeGasType.value, {
    ...visibleGasPacket.value,
    ...patch,
    keyNodes: patch.keyNodes || localKeyNodes.value,
    lastEditedBy: currentOperatorName()
  });
}

function isGlobalKeyNodeApplicable(node, flowId, gasType) {
  const flows = Array.isArray(node.scopeFlowIds) && node.scopeFlowIds.length ? node.scopeFlowIds : ["all"];
  const gases = Array.isArray(node.gasTypes) && node.gasTypes.length ? node.gasTypes : ["all"];
  return (flows.includes("all") || flows.includes(flowId)) && (gases.includes("all") || gases.includes(gasType));
}

function getFlowPlanColor(flowId = props.flowId) {
  return flowPlanColorMap[flowId] || flowPlanColorMap.custom;
}

function toDate(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compareIso(left, right) {
  return toDate(left).getTime() - toDate(right).getTime();
}

function addDays(iso, amount) {
  const date = toDate(iso);
  date.setDate(date.getDate() + amount);
  return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function diffDays(startIso, endIso) {
  const delta = toDate(endIso).getTime() - toDate(startIso).getTime();
  return Math.round(delta / 86400000);
}

function formatDisplayDate(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function weekdayLabel(index) {
  return ["一", "二", "三", "四", "五", "六", "日"][index];
}

function zoomGantt(direction) {
  const next = Math.max(0, Math.min(ganttZoomLevels.length - 1, ganttZoomLevel.value + direction));
  ganttZoomLevel.value = next;
}

function resetGanttView() {
  ganttZoomLevel.value = 2;
  if (editablePlans.value.length) {
    ganttCenterDate.value = editablePlans.value.reduce(
      (earliest, plan) => (compareIso(plan.startDate, earliest) < 0 ? plan.startDate : earliest),
      editablePlans.value[0].startDate
    );
  } else {
    ganttCenterDate.value = TODAY_ISO;
  }
}

function setGanttToday() {
  ganttCenterDate.value = TODAY_ISO;
}

function openGanttWorkDetail(work) {
  showToast(`${work.timeRange} ${work.actionLabel} / ${work.planName}`);
}

function normalizeName(text) {
  return String(text || "").replace(/[计划流程]/g, "");
}

function getFlowPeople(flowId) {
  return (catalog.people || []).filter((person) => person.flowTypes?.includes(flowId));
}

function findWorkItemsByPlanName(planName) {
  const target = normalizeName(planName);
  return (catalog.workItems || []).filter((item) => {
    if (!item.flowTypes?.includes(props.flowId)) return false;
    const itemName = normalizeName(item.name);
    return target.includes(itemName) || itemName.includes(target);
  });
}

function derivePlanResources(planName) {
  const workItems = findWorkItemsByPlanName(planName);
  const assignees = [...new Set(workItems.flatMap((item) => item.defaultAssignees || []))];
  const equipment = [...new Set(workItems.map((item) => item.defaultEquipment).filter(Boolean))];
  const peopleFallback = getFlowPeople(props.flowId)
    .slice(0, 3)
    .map((item) => item.name);

  const constraintIds = [...flowConstraintDefaults[props.flowId] || []];
  if (planName.includes("质量")) constraintIds.push("key-node-lock");
  if (planName.includes("保障") || planName.includes("转运")) constraintIds.push("resource-share-limit");
  if (planName.includes("测试") || planName.includes("试验")) constraintIds.push("personnel-busy");

  return {
    assignees: assignees.length ? assignees : peopleFallback,
    equipment: equipment.length ? equipment : inferFallbackEquipment(planName),
    constraintIds: [...new Set(constraintIds)]
  };
}

function inferFallbackEquipment(planName) {
  if (planName.includes("维修")) return ["维修工装箱", "检测仪表"];
  if (planName.includes("维护")) return ["维护终端", "便携检测仪"];
  if (planName.includes("测试") || planName.includes("试验")) return ["测试终端", "记录终端"];
  if (planName.includes("保障")) return ["保障终端", "供气控制柜"];
  return ["综合保障终端"];
}

function normalizePlanMeta(plan, index = 0) {
  const derived = derivePlanResources(plan.name);
  const normalized = {
    ...clone(plan),
    id: plan.id || `${props.flowId}-${activeGasType.value}-${index + 1}`,
    color: getFlowPlanColor(),
    assignees: Array.isArray(plan.assignees) && plan.assignees.length ? [...plan.assignees] : derived.assignees,
    equipment: Array.isArray(plan.equipment) && plan.equipment.length ? [...plan.equipment] : derived.equipment,
    constraintIds:
      Array.isArray(plan.constraintIds) && plan.constraintIds.length ? [...plan.constraintIds] : derived.constraintIds
  };
  return {
    ...normalized,
    workDays: Array.isArray(plan.workDays) && plan.workDays.length
      ? normalizePlanWorkDays(normalized, plan.workDays)
      : plan.workDays
  };
}

function normalizePlanWorkDays(plan, workDays) {
  return [...(workDays || [])]
    .filter((workDay) => workDay?.dateIso)
    .map((workDay, index) => normalizeWorkDay(plan, workDay, index))
    .sort((left, right) => compareIso(left.dateIso, right.dateIso) || (left.sortKey || 0) - (right.sortKey || 0));
}

function normalizeWorkDay(plan, workDay, index = 0) {
  const fallback = buildDefaultWorkDay(plan, workDay.dateIso || plan.startDate, index);
  return {
    ...fallback,
    ...workDay,
    id: workDay.id || fallback.id,
    personnel: Array.isArray(workDay.personnel) ? [...workDay.personnel] : workDay.personnel || fallback.personnel,
    equipment: Array.isArray(workDay.equipment) ? [...workDay.equipment] : workDay.equipment || fallback.equipment,
    sortKey: Number.isFinite(workDay.sortKey) ? workDay.sortKey : index,
    manualLocked: Boolean(workDay.manualLocked),
    manualLockedAt: workDay.manualLockedAt || "",
    manualLockedReason: workDay.manualLockedReason || ""
  };
}

function buildDefaultWorkDay(plan, dateIso, index = 0) {
  const actions = inferActionList(plan.name);
  const slots = ["08:00-10:00", "10:00-12:00", "14:00-16:00", "16:00-18:00"];
  const dayIndex = Math.max(0, diffDays(plan.startDate, dateIso));
  return {
    id: `${plan.id || "plan"}-work-${dateIso}-${index + 1}`,
    dateIso,
    actionLabel: actions[dayIndex % actions.length] || "任务执行",
    timeRange: slots[dayIndex % slots.length],
    personnel: [...(plan.assignees || [])],
    equipment: [...(plan.equipment || [])],
    position: `${activeGasLabel.value}系统执行岗`,
    status: localPlanStatus.value === "confirmed" ? "已确认" : "草稿",
    sortKey: index,
    manualLocked: false,
    manualLockedAt: "",
    manualLockedReason: ""
  };
}

function getPlanWorkDays(plan) {
  if (Array.isArray(plan.workDays) && plan.workDays.length) return normalizePlanWorkDays(plan, plan.workDays);
  return enumerateDates(plan.startDate, plan.endDate).map((dateIso, index) => buildDefaultWorkDay(plan, dateIso, index));
}

function materializePlanWorkDays(plan) {
  return {
    ...plan,
    workDays: getPlanWorkDays(plan)
  };
}

function recalculatePlanRangeFromWorkDays(plan) {
  const workDays = getPlanWorkDays(plan);
  if (!workDays.length) return plan;
  const dates = workDays.map((item) => item.dateIso).sort(compareIso);
  return {
    ...plan,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    workDays
  };
}

function getPlanWorkDateSet(plan) {
  return new Set(getPlanWorkDays(plan).map((item) => item.dateIso));
}

function formatWorkDayPeople(workDay, plan) {
  const value = workDay?.personnel?.length ? workDay.personnel : plan.assignees;
  return Array.isArray(value) ? value.join("、") : value || "按计划岗位分配";
}

function formatWorkDayEquipment(workDay, plan) {
  const value = workDay?.equipment?.length ? workDay.equipment : plan.equipment;
  return Array.isArray(value) ? value.join("、") : value || "按计划设备资源";
}

function enumerateDates(startIso, endIso) {
  const dates = [];
  let cursor = startIso;
  while (compareIso(cursor, endIso) <= 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function rangesOverlap(left, right) {
  return collectOverlapDates(left, right).length > 0;
}

function collectOverlapDates(left, right) {
  const leftDates = getPlanWorkDateSet(left);
  const rightDates = getPlanWorkDateSet(right);
  return [...leftDates].filter((dateIso) => rightDates.has(dateIso)).sort(compareIso);
}

function buildComparisonPlans(planIdToExclude) {
  const comparisons = [];

  editablePlans.value
    .filter((plan) => plan.id !== planIdToExclude)
    .forEach((plan) => {
      comparisons.push({
        ...normalizePlanMeta(plan),
        sourceLabel: flowConfig.value.title
      });
    });

  const gasType = activeGasType.value;

  (fuelPlanningPacket.value?.gasPackets?.[gasType]?.calendarPlans || []).forEach((plan, index) => {
    comparisons.push({
      ...normalizePlanMeta(plan, index),
      sourceLabel: flowTitleMap.fuel
    });
  });

  Object.entries(genericPlanningPackets.value || {}).forEach(([flowId, packet]) => {
    if (flowId === props.flowId) return;
    (packet.gasPackets?.[gasType]?.calendarPlans || []).forEach((plan, index) => {
      comparisons.push({
        ...normalizePlanMeta(plan, index),
        sourceLabel: flowTitleMap[flowId] || flowId
      });
    });
  });

  const launchPacket = genericPlanningPackets.value?.launch?.gasPackets?.[gasType];
  if (launchPacket?.launchDay && launchPacket?.scheduleRows?.length) {
    comparisons.push({
      id: `launch-${gasType}-${launchPacket.launchDay}`,
      name: `${activeGasLabel.value}发射日工作规划`,
      startDate: launchPacket.launchDay,
      endDate: launchPacket.launchDay,
      assignees: getFlowPeople("launch")
        .slice(0, 3)
        .map((item) => item.name),
      equipment: ["发射日调度终端", "在线供气控制柜"],
      constraintIds: ["personnel-busy", "resource-share-limit", "key-node-lock"],
      sourceLabel: flowTitleMap.launch
    });
  }

  return comparisons;
}

function collectKeyNodesForConflictCheck() {
  const gasType = activeGasType.value;
  const nodes = [];
  globalKeyNodes.value
    .filter((node) => isGlobalKeyNodeApplicable(node, props.flowId, gasType))
    .forEach((node) => {
      nodes.push({ ...node, sourceLabel: "全局关键节点", sourceType: "global", isGlobal: true });
    });
  (fuelPlanningPacket.value?.gasPackets?.[gasType]?.keyNodes || []).forEach((node) => {
    nodes.push({ ...node, sourceLabel: flowTitleMap.fuel });
  });
  Object.entries(genericPlanningPackets.value || {}).forEach(([flowId, packet]) => {
    const sourceLabel = flowTitleMap[flowId] || flowId;
    globalKeyNodes.value
      .filter((node) => isGlobalKeyNodeApplicable(node, flowId, gasType))
      .forEach((node) => {
        nodes.push({ ...node, sourceLabel: "全局关键节点", sourceType: "global", isGlobal: true });
      });
    (packet.gasPackets?.[gasType]?.keyNodes || []).forEach((node) => {
      nodes.push({ ...node, sourceLabel });
    });
  });
  const unique = new Map();
  nodes.forEach((node) => {
    const key = node.isGlobal ? `global-${node.id}` : `${node.sourceLabel}-${node.id}`;
    if (!unique.has(key)) unique.set(key, node);
  });
  return [...unique.values()];
}

function includesAny(text, keywords) {
  const source = String(text || "");
  return keywords.some((keyword) => source.includes(keyword));
}

function inferActionList(planName) {
  if (includesAny(planName, ["生产"])) return ["安全准备", "生产校验", "生产执行", "质量复核"];
  if (includesAny(planName, ["拉运", "转运"])) return ["转运准备", "路线确认", "转运执行", "回场确认"];
  if (includesAny(planName, ["充气", "补气"])) return ["气瓶检查", "充补气执行", "压力复核", "记录归档"];
  if (includesAny(planName, ["供气", "保障"])) return ["资源确认", "供气保障", "在线监测", "收尾确认"];
  if (includesAny(planName, ["维修", "检修"])) return ["安全隔离", "维修执行", "复测确认", "质量记录"];
  if (includesAny(planName, ["维护"])) return ["例行检查", "维护执行", "参数复核", "归档确认"];
  if (includesAny(planName, ["测试", "试验"])) return ["试验准备", "参数加载", "测试执行", "结果归档"];
  if (includesAny(planName, ["质量", "复核", "归档"])) return ["资料复核", "质量确认", "签字归档"];
  return ["安全准备", "协同确认", "任务执行", "复核归档"];
}
function inferPlanWorkName(plan, dateLabel = "") {
  const actions = inferActionList(plan.name);
  const iso = dateLabel ? parseDisplayDateLabel(dateLabel) : "";
  if (!iso || !plan.startDate) return actions[0] || "任务执行";
  const dayIndex = Math.max(0, diffDays(plan.startDate, iso));
  return actions[dayIndex % actions.length] || "任务执行";
}

function parseDisplayDateLabel(label) {
  const parts = String(label || "").match(/\d+/g);
  if (!parts || parts.length < 3) return "";
  return toIso(Number(parts[0]), Number(parts[1]), Number(parts[2]));
}

function describeList(items, fallback = "未明确") {
  const values = [...new Set((items || []).filter(Boolean))];
  return values.length ? values.join("、") : fallback;
}

function getOrderKeyword(planName) {
  const rules = [
    { key: "production", label: "生产", keywords: ["生产"] },
    { key: "prep", label: "准备 / 检查 / 安全确认", keywords: ["准备", "检查", "安全确认"] },
    { key: "repair", label: "维修 / 维护 / 检修", keywords: ["维修", "维护", "检修"] },
    { key: "fill", label: "充气 / 补气", keywords: ["充气", "补气"] },
    { key: "transfer", label: "转运 / 拉运", keywords: ["转运", "拉运"] },
    { key: "execute", label: "执行 / 供气 / 发射日保障", keywords: ["执行", "供气", "保障", "发射日"] },
    { key: "test", label: "测试 / 复测", keywords: ["测试", "试验", "复测"] },
    { key: "quality", label: "质量确认 / 复核 / 归档", keywords: ["质量", "复核", "归档"] }
  ];
  return rules.find((rule) => includesAny(planName, rule.keywords)) || null;
}

function inferSequenceRelation(leftPlan, rightPlan) {
  const left = getOrderKeyword(leftPlan.name);
  const right = getOrderKeyword(rightPlan.name);
  if (!left || !right || left.key === right.key) return null;

  const beforeRules = [
    ["production", "transfer", "生产完成后才能进入转运或拉运窗口，转运依赖介质可用状态。"],
    ["production", "execute", "生产完成后才能进入供气或保障执行窗口。"],
    ["prep", "execute", "准备、检查和安全确认是执行或供气保障的前置条件。"],
    ["repair", "test", "维修、维护或检修后需要通过测试或复测确认状态。"],
    ["repair", "quality", "维修、维护或检修完成后才能进入质量确认或归档。"],
    ["fill", "execute", "充气或补气完成后才能进入供气或在线保障窗口。"],
    ["execute", "quality", "主体执行完成后才能进行质量确认、复核和归档。"],
    ["test", "quality", "测试或复测完成后才能进行质量确认、复核和归档。"]
  ];
  const direct = beforeRules.find(([before, after]) => before === left.key && after === right.key);
  if (direct) return { beforePlan: leftPlan, afterPlan: rightPlan, beforeLabel: left.label, afterLabel: right.label, reason: direct[2] };
  const reverse = beforeRules.find(([before, after]) => before === right.key && after === left.key);
  if (reverse) return { beforePlan: rightPlan, afterPlan: leftPlan, beforeLabel: right.label, afterLabel: left.label, reason: reverse[2] };
  return null;
}

function isSequenceViolated(relation) {
  return relation && compareIso(relation.beforePlan.endDate, relation.afterPlan.startDate) > 0;
}

function buildConflictDetail({
  type,
  reason,
  currentPlan,
  conflictPlan = null,
  dates = [],
  currentPeople = [],
  currentEquipment = [],
  conflictPeople = [],
  conflictEquipment = [],
  suggestion = "",
  sequenceRelation = null
}) {
  const conflictDates = [...new Set((dates || []).filter(Boolean))];
  const primaryDate = conflictDates[0] || formatDisplayDate(currentPlan.startDate);
  const currentWorkName = inferPlanWorkName(currentPlan, primaryDate);
  const conflictWorkName = conflictPlan ? inferPlanWorkName(conflictPlan, primaryDate) : "";
  const dateText = describeList(conflictDates, `${formatDisplayDate(currentPlan.startDate)} - ${formatDisplayDate(currentPlan.endDate)}`);
  const currentPeopleText = describeList(currentPeople.length ? currentPeople : currentPlan.assignees, "当前计划未明确人员");
  const currentEquipmentText = describeList(currentEquipment.length ? currentEquipment : currentPlan.equipment, "当前计划未明确设备");
  const conflictPeopleText = conflictPlan ? describeList(conflictPeople.length ? conflictPeople : conflictPlan.assignees, "冲突计划未明确人员") : "";
  const conflictEquipmentText = conflictPlan ? describeList(conflictEquipment.length ? conflictEquipment : conflictPlan.equipment, "冲突计划未明确设备") : "";
  const expectedOrderText = sequenceRelation
    ? `顺序要求：${sequenceRelation.beforePlan.name} 通常应在 ${sequenceRelation.afterPlan.name} 之前完成，因为${sequenceRelation.reason}`
    : "";
  const sequenceReason = sequenceRelation
    ? `本次调整后，${sequenceRelation.beforePlan.name}结束时间晚于${sequenceRelation.afterPlan.name}开始时间，破坏了“${sequenceRelation.beforeLabel}早于${sequenceRelation.afterLabel}”的前后顺序。`
    : "";
  const detailText = conflictPlan
    ? `当前计划“${currentPlan.name}”在${dateText}安排${currentPeopleText}执行“${currentWorkName}”，使用${currentEquipmentText}；与${conflictPlan.sourceLabel || "关联流程"}“${conflictPlan.name}”中${conflictPeopleText}执行“${conflictWorkName || "任务执行"}”、使用${conflictEquipmentText}发生冲突。冲突原因：${reason}。${sequenceReason}`
    : `当前计划“${currentPlan.name}”在${dateText}安排${currentPeopleText}执行“${currentWorkName}”，使用${currentEquipmentText}。冲突原因：${reason}。${sequenceReason}`;
  const shortText = sequenceRelation
    ? `${sequenceRelation.beforeLabel}应早于${sequenceRelation.afterLabel}`
    : conflictPlan && currentPeople.length
      ? `${describeList(currentPeople)}同窗占用`
      : conflictPlan && currentEquipment.length
        ? `${describeList(currentEquipment)}设备共占`
        : reason;

  return {
    conflictReason: reason,
    conflictType: type,
    currentPlanName: currentPlan.name,
    currentWorkName,
    currentPeople: [...new Set(currentPeople.length ? currentPeople : currentPlan.assignees || [])],
    currentEquipment: [...new Set(currentEquipment.length ? currentEquipment : currentPlan.equipment || [])],
    conflictPlanName: conflictPlan?.name || "",
    conflictWorkName,
    conflictPeople: [...new Set(conflictPeople.length ? conflictPeople : conflictPlan?.assignees || [])],
    conflictEquipment: [...new Set(conflictEquipment.length ? conflictEquipment : conflictPlan?.equipment || [])],
    conflictDates,
    sequenceRelation: sequenceRelation ? `${sequenceRelation.beforePlan.name} -> ${sequenceRelation.afterPlan.name}` : "",
    sequenceReason,
    expectedOrderText,
    detailText,
    shortText,
    suggestion
  };
}

function getConflictReasonFromItem(item) {
  const typeText = `${item.type || ""}${item.message || ""}`;
  if (typeText.includes("人员")) {
    return `${describeList(item.highlightPeople)}在同一日期窗口被两个计划同时占用，无法同时执行两项工作。`;
  }
  if (typeText.includes("设备") || typeText.includes("资源")) {
    return `${describeList(item.highlightEquipment)}在同一日期窗口被两个计划同时占用，存在设备资源共占。`;
  }
  if (typeText.includes("同名") || typeText.includes("工作")) {
    return "两个同名或同类工作在同一日期窗口重复排布，容易造成重复执行、职责边界不清或资源重复占用。";
  }
  if (typeText.includes("节假")) {
    return "计划窗口进入节假日，容易影响人员值守、设备保障和现场协调响应。";
  }
  if (typeText.includes("休息")) {
    return "计划窗口落在双休日，岗位值守、人员到位和保障资源通常低于工作日配置。";
  }
  if (typeText.includes("关键") || typeText.includes("锁定")) {
    return "该计划包含关键节点锁定约束，调整后可能影响前置准备、质量确认或后续补全顺序。";
  }
  return item.message || "计划调整后触发约束校核。";
}

function finalizeConflictDetails(conflicts, candidate, comparisonPlans) {
  return conflicts.map((item) => {
    if (item.detailText) return item;
    const conflictPlan = comparisonPlans.find(
      (plan) => plan.name === item.relatedPlanName || item.key?.includes(plan.id)
    );
    const typeText = `${item.type || ""}${item.message || ""}`;
    const isPeopleConflict = typeText.includes("人员");
    const isEquipmentConflict = typeText.includes("设备");
    return {
      ...item,
      ...buildConflictDetail({
        type: item.type,
        reason: getConflictReasonFromItem(item),
        currentPlan: candidate,
        conflictPlan,
        dates: [...(item.highlightDates || [])],
        currentPeople: isPeopleConflict ? [...(item.highlightPeople || [])] : [...(candidate.assignees || [])],
        conflictPeople: isPeopleConflict ? [...(item.highlightPeople || [])] : [...(conflictPlan?.assignees || [])],
        currentEquipment: isEquipmentConflict ? [...(item.highlightEquipment || [])] : [...(candidate.equipment || [])],
        conflictEquipment: isEquipmentConflict ? [...(item.highlightEquipment || [])] : [...(conflictPlan?.equipment || [])],
        suggestion: item.suggestion || ""
      })
    };
  });
}

function buildConstraintConflicts(candidate, shiftDays) {
  const conflicts = [];
  const planDates = getPlanWorkDays(candidate).map((item) => item.dateIso);
  const dateLabels = planDates.map(formatDisplayDate);
  const weekendDates = planDates.filter((iso) => {
    const weekday = toDate(iso).getDay();
    return weekday === 0 || weekday === 6;
  });
  const holidayDates = planDates.filter((iso) => Boolean(holidayMap[iso]));

  if (candidate.constraintIds.includes("skip-weekends") && weekendDates.length) {
    const dates = weekendDates.map(formatDisplayDate);
    const suggestion = "建议恢复原排期，避免跨入休息日执行。";
    conflicts.push({
      key: `${candidate.id}-weekend`,
      type: "休息日冲突",
      message: `计划“${candidate.name}”调整后占用了双休日窗口：${dates.join("、")}`,
      suggestion,
      relatedFlow: flowConfig.value.title,
      relatedPlanName: candidate.name,
      highlightPeople: [...candidate.assignees],
      highlightEquipment: [],
      highlightDates: dates,
      ...buildConflictDetail({
        type: "休息日冲突",
        reason: "计划窗口落在双休日，岗位值守、人员到位和保障资源通常低于工作日配置。",
        currentPlan: candidate,
        dates,
        currentPeople: [...candidate.assignees],
        suggestion
      })
    });
  }

  if (candidate.constraintIds.includes("skip-holidays") && holidayDates.length) {
    const dates = holidayDates.map(formatDisplayDate);
    const suggestion = "建议错开节假日，避免影响保障条件和值守安排。";
    conflicts.push({
      key: `${candidate.id}-holiday`,
      type: "节假日冲突",
      message: `计划“${candidate.name}”调整后进入节假日窗口：${dates.join("、")}`,
      suggestion,
      relatedFlow: flowConfig.value.title,
      relatedPlanName: candidate.name,
      highlightPeople: [...candidate.assignees],
      highlightEquipment: [],
      highlightDates: dates,
      ...buildConflictDetail({
        type: "节假日冲突",
        reason: "计划窗口进入节假日，容易影响人员值守、设备保障和现场协调响应。",
        currentPlan: candidate,
        dates,
        currentPeople: [...candidate.assignees],
        suggestion
      })
    });
  }

  if (candidate.constraintIds.includes("key-node-lock") && shiftDays !== 0) {
    const suggestion = "建议恢复原位，或由岗位人员确认后保留本次调整。";
    conflicts.push({
      key: `${candidate.id}-node-lock`,
      type: "关键节点锁定冲突",
      message: `计划“${candidate.name}”包含锁定节点，当前位置变更可能影响关键节点顺序。`,
      suggestion,
      relatedFlow: flowConfig.value.title,
      relatedPlanName: candidate.name,
      highlightPeople: [...candidate.assignees],
      highlightEquipment: [...candidate.equipment],
      highlightDates: dateLabels,
      ...buildConflictDetail({
        type: "关键节点锁定冲突",
        reason: "该计划包含关键节点锁定约束，调整后可能影响前置准备、质量确认或后续补全顺序。",
        currentPlan: candidate,
        dates: dateLabels,
        currentPeople: [...candidate.assignees],
        currentEquipment: [...candidate.equipment],
        suggestion
      })
    });
  }

  return conflicts;
}

function buildShiftedWorkDayPlan(plan, workDayId, shiftDays) {
  const workDays = getPlanWorkDays(plan);
  return recalculatePlanRangeFromWorkDays({
    ...plan,
    workDays: workDays.map((workDay) =>
      workDay.id === workDayId
        ? {
            ...workDay,
            dateIso: addDays(workDay.dateIso, shiftDays),
            manualLocked: true,
            manualLockedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
            manualLockedReason: "用户拖拽调整"
          }
        : { ...workDay }
    )
  });
}

function detectShiftConflicts(planId, shiftDays, workDayId = "") {
  const sourcePlan = editablePlans.value.find((plan) => plan.id === planId);
  if (!sourcePlan) return { candidate: null, conflicts: [] };

  const basePlan = normalizePlanMeta(sourcePlan);
  const candidate = normalizePlanMeta(
    workDayId
      ? buildShiftedWorkDayPlan(basePlan, workDayId, shiftDays)
      : {
          ...basePlan,
          startDate: addDays(basePlan.startDate, shiftDays),
          endDate: addDays(basePlan.endDate, shiftDays),
          workDays: Array.isArray(basePlan.workDays)
            ? basePlan.workDays.map((workDay) => ({ ...workDay, dateIso: addDays(workDay.dateIso, shiftDays) }))
            : basePlan.workDays
        }
  );

  const conflicts = [...buildConstraintConflicts(candidate, shiftDays)].map((item) => ({ ...item, workDayId }));

  const comparisonPlans = buildComparisonPlans(planId);

  comparisonPlans.forEach((otherPlan) => {
    const sequenceRelation = inferSequenceRelation(candidate, otherPlan);
    if (isSequenceViolated(sequenceRelation)) {
      const dates = enumerateDates(
        compareIso(sequenceRelation.afterPlan.startDate, sequenceRelation.beforePlan.endDate) < 0
          ? sequenceRelation.afterPlan.startDate
          : sequenceRelation.beforePlan.endDate,
        sequenceRelation.beforePlan.endDate
      ).map(formatDisplayDate);
      const suggestion = "建议恢复原排期，或将后置计划顺延到前置计划完成之后。";
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-sequence`,
        workDayId,
        type: "前置/后置顺序冲突",
        message: `计划“${sequenceRelation.beforePlan.name}”通常应在“${sequenceRelation.afterPlan.name}”之前完成，本次调整后前后顺序被打破。`,
        suggestion,
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: [...new Set([...(candidate.assignees || []), ...(otherPlan.assignees || [])])],
        highlightEquipment: [...new Set([...(candidate.equipment || []), ...(otherPlan.equipment || [])])],
        highlightDates: dates,
        ...buildConflictDetail({
          type: "前置/后置顺序冲突",
          reason: "拖动后破坏了业务常识中的前置/后置依赖关系。",
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates,
          currentPeople: [...(candidate.assignees || [])],
          currentEquipment: [...(candidate.equipment || [])],
          conflictPeople: [...(otherPlan.assignees || [])],
          conflictEquipment: [...(otherPlan.equipment || [])],
          suggestion,
          sequenceRelation
        })
      });
    }

    if (!rangesOverlap(candidate, otherPlan)) return;

    const overlapDates = collectOverlapDates(candidate, otherPlan).map(formatDisplayDate);
    const sharedPeople = candidate.assignees.filter((name) => otherPlan.assignees?.includes(name));
    const sharedEquipment = candidate.equipment.filter((name) => otherPlan.equipment?.includes(name));

    if (candidate.constraintIds.includes("personnel-busy") && sharedPeople.length) {
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-people`,
        workDayId,
        type: "人员冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}“${otherPlan.name}”存在同人同窗冲突。`,
        suggestion: "建议恢复当前调整，或改派其他人员后再保留本次修改。",
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: sharedPeople,
        highlightEquipment: [],
        highlightDates: overlapDates
      });
    }

    if (
      (candidate.constraintIds.includes("device-maintenance-window") ||
        candidate.constraintIds.includes("resource-share-limit")) &&
      sharedEquipment.length
    ) {
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-equipment`,
        workDayId,
        type: "设备冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}“${otherPlan.name}”存在设备共占。`,
        suggestion: "建议错峰执行，或切换备用设备后再继续。",
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: [],
        highlightEquipment: sharedEquipment,
        highlightDates: overlapDates
      });
    }

    if (candidate.name === otherPlan.name) {
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-work`,
        workDayId,
        type: "工作重复冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}存在同名工作重叠。`,
        suggestion: "建议重新排布计划窗口，避免重复执行。",
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: sharedPeople,
        highlightEquipment: sharedEquipment,
        highlightDates: overlapDates
      });
    }
  });

  const unique = new Map();
  finalizeConflictDetails(conflicts, candidate, comparisonPlans).forEach((item) => {
    if (!unique.has(item.key)) unique.set(item.key, item);
  });

  return {
    candidate,
    conflicts: [...unique.values()]
  };
}

function appendConflictRecord(plan, conflicts) {
  return [
    {
      id: `generic-conflict-${Date.now()}`,
      planId: plan.id,
      planName: plan.name,
      dateRange: `${formatDisplayDate(plan.startDate)} - ${formatDisplayDate(plan.endDate)}`,
      createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      ignored: true,
      conflicts: conflicts.map((item) => ({
        key: item.key,
        workDayId: item.workDayId || "",
        type: item.type,
        message: item.message,
        suggestion: item.suggestion,
        relatedFlow: item.relatedFlow || "",
        relatedPlanName: item.relatedPlanName || "",
        highlightPeople: [...(item.highlightPeople || [])],
        highlightEquipment: [...(item.highlightEquipment || [])],
        highlightDates: [...(item.highlightDates || [])],
        conflictReason: item.conflictReason || "",
        conflictType: item.conflictType || item.type,
        currentPlanName: item.currentPlanName || plan.name,
        currentWorkName: item.currentWorkName || "",
        currentPeople: [...(item.currentPeople || [])],
        currentEquipment: [...(item.currentEquipment || [])],
        conflictPlanName: item.conflictPlanName || item.relatedPlanName || "",
        conflictWorkName: item.conflictWorkName || "",
        conflictPeople: [...(item.conflictPeople || [])],
        conflictEquipment: [...(item.conflictEquipment || [])],
        conflictDates: [...(item.conflictDates || item.highlightDates || [])],
        sequenceRelation: item.sequenceRelation || "",
        sequenceReason: item.sequenceReason || "",
        expectedOrderText: item.expectedOrderText || "",
        detailText: item.detailText || item.message,
        shortText: item.shortText || item.type
      }))
    },
    ...localConflictRecords.value
  ];
}

function buildPlanConflictSummary(plan, records = localConflictRecords.value) {
  return buildDetailedPlanConflictSummary(plan, records);
}

function buildDetailedPlanConflictSummary(plan, records = localConflictRecords.value) {
  const matchedRecords = getPlanConflictRecordsForModal(plan, records);

  if (!matchedRecords.length) {
    return {
      hasConflict: false,
      compactLabel: "",
      title: ""
    };
  }

  const conflictItems = matchedRecords.flatMap((record) => record.conflicts || []);
  const dateLabels = [
    ...new Set(conflictItems.flatMap((item) => item.conflictDates || item.highlightDates || []).filter(Boolean))
  ];
  const workLabels = [
    ...new Set(
      conflictItems
        .map((item) => item.shortText || item.conflictPlanName || item.relatedPlanName || item.type)
        .filter((label) => label && label !== plan.name)
    )
  ];
  const primaryDates = dateLabels.length ? dateLabels : matchedRecords.map((record) => record.dateRange).filter(Boolean);
  const dateText = primaryDates.slice(0, 2).join("、") + (primaryDates.length > 2 ? `等${primaryDates.length}天` : "");
  const workText = workLabels.slice(0, 1).join("") || conflictItems[0]?.shortText || conflictItems[0]?.type || "冲突工作";
  const detailLines = conflictItems
    .slice(0, 3)
    .map((item) => item.detailText || item.message)
    .filter(Boolean);
  const expectedLines = conflictItems.map((item) => item.expectedOrderText).filter(Boolean);

  return {
    hasConflict: true,
    compactLabel: [dateText, workText].filter(Boolean).join(" · "),
    title: [
      `冲突标识：已忽略冲突`,
      dateText ? `冲突日期：${primaryDates.join("、")}` : "",
      workText ? `冲突说明：${workLabels.join("、") || workText}` : "",
      detailLines.length ? `详细介绍：${detailLines.join("；")}` : "",
      expectedLines.length ? expectedLines.join("；") : ""
    ]
      .filter(Boolean)
      .join("\n")
  };
}

function getPlanConflictRecordsForModal(plan, dateIso = "", workDayId = "", records = localConflictRecords.value) {
  if (!plan) return [];
  if (Array.isArray(dateIso)) {
    records = dateIso;
    dateIso = "";
    workDayId = "";
  }
  const displayDate = dateIso ? formatDisplayDate(dateIso) : "";
  return (records || [])
    .map((record) => {
      const recordOwnsPlan = record.planId === plan.id || record.planName === plan.name;
      const conflicts = (record.conflicts || []).filter((item) => {
        const planMatched = recordOwnsPlan || isPlanMentionedInConflictItem(plan, item);
        if (!planMatched) return false;
        if (workDayId && item.workDayId && item.workDayId !== workDayId) return false;
        if (!dateIso) return true;
        const rawDates = [...(item.conflictDates || []), ...(item.highlightDates || [])];
        const dates = rawDates.map((dateText) => normalizeConflictDate(dateText));
        return dates.includes(dateIso) || rawDates.includes(displayDate);
      });
      return conflicts.length ? { ...record, conflicts } : null;
    })
    .filter(Boolean);
}

function isPlanMentionedInConflictItem(plan, item) {
  return [item.currentPlanName, item.conflictPlanName, item.relatedPlanName].filter(Boolean).includes(plan.name);
}

function normalizeConflictDate(dateText) {
  if (!dateText) return "";
  const normalized = String(dateText).trim();
  const chineseMatch = normalized.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (chineseMatch) return toIso(Number(chineseMatch[1]), Number(chineseMatch[2]), Number(chineseMatch[3]));
  const parts = normalized.replace(/\//g, "-").split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return "";
  return toIso(parts[0], parts[1], parts[2]);
}

function getPlanConflictDates(plan) {
  return [
    ...new Set(
      getPlanConflictRecordsForModal(plan)
        .flatMap((record) => record.conflicts || [])
        .flatMap((item) => item.conflictDates || item.highlightDates || [])
        .map((dateText) => normalizeConflictDate(dateText))
        .filter(Boolean)
    )
  ];
}

function mergeConflictDateRanges(dateList) {
  const sorted = [...new Set(dateList)].sort(compareIso);
  const ranges = [];
  sorted.forEach((dateIso) => {
    const latest = ranges[ranges.length - 1];
    if (latest && diffDays(latest.endDate, dateIso) === 1) {
      latest.endDate = dateIso;
      return;
    }
    ranges.push({ startDate: dateIso, endDate: dateIso });
  });
  return ranges;
}

function buildGanttConflictSegments(row) {
  const rowVisibleDays = Math.max(1, diffDays(row.visibleStartDate, row.visibleEndDate) + 1);
  return mergeConflictDateRanges(getPlanConflictDates(row))
    .map((range) => {
      const segmentStart = compareIso(range.startDate, row.visibleStartDate) > 0 ? range.startDate : row.visibleStartDate;
      const segmentEnd = compareIso(range.endDate, row.visibleEndDate) < 0 ? range.endDate : row.visibleEndDate;
      if (compareIso(segmentEnd, segmentStart) < 0) return null;
      return {
        dateIso: segmentStart,
        endDate: segmentEnd,
        leftPercent: (diffDays(row.visibleStartDate, segmentStart) / rowVisibleDays) * 100,
        widthPercent: ((diffDays(segmentStart, segmentEnd) + 1) / rowVisibleDays) * 100
      };
    })
    .filter(Boolean);
}

function buildPlanWorkDaySegments(row) {
  const rowVisibleDays = Math.max(1, diffDays(row.visibleStartDate, row.visibleEndDate) + 1);
  const visibleWorkDays = getPlanWorkDays(row)
    .filter((workDay) => compareIso(workDay.dateIso, row.visibleStartDate) >= 0 && compareIso(workDay.dateIso, row.visibleEndDate) <= 0)
  return assignWorkDayLayoutLanes(visibleWorkDays).workDays.map((workDay) => ({
      ...workDay,
      leftPercent: (diffDays(row.visibleStartDate, workDay.dateIso) / rowVisibleDays) * 100,
      widthPercent: (1 / rowVisibleDays) * 100,
      topPx: ganttLaneTopOffset + workDay.layoutLane * ganttLaneHeight,
      heightPx: ganttLaneHeight - 4,
      hasConflict: isWorkDayConflict(row, workDay)
    }));
}

function assignWorkDayLayoutLanes(workDays) {
  const groups = new Map();
  workDays.forEach((workDay) => {
    if (!groups.has(workDay.dateIso)) groups.set(workDay.dateIso, []);
    groups.get(workDay.dateIso).push(workDay);
  });
  let laneCount = 1;
  const result = [];
  [...groups.entries()].sort(([left], [right]) => compareIso(left, right)).forEach(([, items]) => {
    const sorted = [...items].sort((left, right) =>
      String(left.timeRange || "").localeCompare(String(right.timeRange || "")) || (left.sortKey || 0) - (right.sortKey || 0)
    );
    laneCount = Math.max(laneCount, sorted.length);
    sorted.forEach((workDay, index) => {
      result.push({ ...workDay, layoutLane: index, laneCount: sorted.length });
    });
  });
  return { workDays: result, laneCount };
}

function getGanttRowHeight(plan, visibleStartDate, visibleEndDate) {
  const visibleWorkDays = getPlanWorkDays(plan)
    .filter((workDay) => compareIso(workDay.dateIso, visibleStartDate) >= 0 && compareIso(workDay.dateIso, visibleEndDate) <= 0);
  const laneCount = assignWorkDayLayoutLanes(visibleWorkDays).laneCount;
  return Math.max(ganttBaseRowHeight, 34 + laneCount * ganttLaneHeight);
}

function isWorkDayConflict(plan, workDay) {
  return getPlanConflictRecordsForModal(plan, workDay.dateIso, workDay.id).length > 0;
}

function buildWorkDayConflictSegments(row, workDay) {
  return isWorkDayConflict(row, workDay) ? [{ leftPercent: 0, widthPercent: 100 }] : [];
}

function openPlanConflictRecords(row, workDay = null) {
  if (suppressPlanClick.value || !row?.conflictSummary?.hasConflict) return;
  const records = getPlanConflictRecordsForModal(row, workDay?.dateIso || "", workDay?.id || "");
  if (!records.length) return;
  state.selectedConflictPlanId = row.id;
  state.selectedConflictWorkDayId = workDay?.id || "";
  state.selectedConflictDateIso = workDay?.dateIso || "";
  state.conflictRecordModalOpen = true;
}

function closePlanConflictRecords() {
  state.conflictRecordModalOpen = false;
  state.selectedConflictPlanId = "";
  state.selectedConflictWorkDayId = "";
  state.selectedConflictDateIso = "";
}

function openWorkDayModal(row, dateIso, workDay = null) {
  if (!isCommander.value || suppressPlanClick.value) return;
  const plan = editablePlans.value.find((item) => item.id === row.id) || row;
  if (!plan || compareIso(dateIso, plan.startDate) < 0 || compareIso(dateIso, plan.endDate) > 0) return;
  const target = workDay || buildDefaultWorkDay(plan, dateIso, getPlanWorkDays(plan).length);
  state.workDayModalOpen = true;
  workDayModal.planId = plan.id;
  workDayModal.workDayId = workDay?.id || "";
  workDayModal.dateIso = dateIso;
  workDayModal.actionLabel = target.actionLabel || "任务执行";
  workDayModal.timeRange = target.timeRange || "08:00-10:00";
  workDayModal.personnel = formatWorkDayPeople(target, plan);
  workDayModal.equipment = formatWorkDayEquipment(target, plan);
  workDayModal.position = target.position || `${activeGasLabel.value}系统执行岗`;
}

function openEmptyWorkDayModal(row, event) {
  if (!isCommander.value || suppressPlanClick.value) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = Math.min(0.999, Math.max(0, (event.clientX - rect.left) / Math.max(rect.width, 1)));
  const rowVisibleDays = Math.max(1, diffDays(row.visibleStartDate, row.visibleEndDate) + 1);
  const dateIso = addDays(row.visibleStartDate, Math.floor(ratio * rowVisibleDays));
  if (getPlanWorkDays(row).some((workDay) => workDay.dateIso === dateIso)) return;
  openWorkDayModal(row, dateIso, null);
}

function closeWorkDayModal() {
  state.workDayModalOpen = false;
  workDayModal.planId = "";
  workDayModal.workDayId = "";
  workDayModal.dateIso = "";
}

function saveWorkDayFromModal() {
  const plan = editablePlans.value.find((item) => item.id === workDayModal.planId);
  if (!plan) return;
  const workDays = getPlanWorkDays(plan).filter((item) => item.id !== workDayModal.workDayId);
  workDays.push({
    id: workDayModal.workDayId || `${plan.id}-work-${workDayModal.dateIso}-${Date.now()}`,
    dateIso: workDayModal.dateIso,
    actionLabel: workDayModal.actionLabel || "任务执行",
    timeRange: workDayModal.timeRange || "08:00-10:00",
    personnel: workDayModal.personnel.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
    equipment: workDayModal.equipment.split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
    position: workDayModal.position || `${activeGasLabel.value}系统执行岗`,
    status: localPlanStatus.value === "confirmed" ? "已确认" : "草稿",
    sortKey: workDays.length,
    manualLocked: true,
    manualLockedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    manualLockedReason: workDayModal.workDayId ? "用户编辑工作日" : "用户恢复/新增工作日"
  });
  const nextPlan = recalculatePlanRangeFromWorkDays({ ...plan, workDays });
  editablePlans.value = editablePlans.value.map((item) => (item.id === plan.id ? normalizePlanMeta(nextPlan) : item));
  calendarDirty.value = true;
  localPlanStatus.value = "draft";
  closeWorkDayModal();
  showToast("已更新该计划的离散工作日。");
}

function removeWorkDayFromModal() {
  const plan = editablePlans.value.find((item) => item.id === workDayModal.planId);
  if (!plan || !workDayModal.workDayId) return;
  const workDays = getPlanWorkDays(plan);
  if (workDays.length <= 1) {
    showToast("至少保留一个工作日；如需全部移除，请使用清空计划。");
    return;
  }
  const nextPlan = recalculatePlanRangeFromWorkDays({
    ...plan,
    workDays: workDays.filter((item) => item.id !== workDayModal.workDayId)
  });
  editablePlans.value = editablePlans.value.map((item) => (item.id === plan.id ? normalizePlanMeta(nextPlan) : item));
  calendarDirty.value = true;
  localPlanStatus.value = "draft";
  closeWorkDayModal();
  showToast("已将该日期设为空档。");
}

function openConflictModal(planId, planName, shiftDays, candidate, conflicts, workDayId = "") {
  state.conflictModalOpen = true;
  conflictModal.planId = planId;
  conflictModal.planName = planName;
  conflictModal.workDayId = workDayId;
  conflictModal.shiftDays = shiftDays;
  conflictModal.candidate = candidate;
  conflictModal.conflicts = conflicts;
}

function closeConflictModal() {
  state.conflictModalOpen = false;
  conflictModal.planId = "";
  conflictModal.planName = "";
  conflictModal.workDayId = "";
  conflictModal.shiftDays = 0;
  conflictModal.candidate = null;
  conflictModal.conflicts = [];
}

function openKeyNodeModal(dateIso, node = null) {
  if (!isCommander.value) return;
  if (node?.isGlobal) {
    showToast("全局关键节点请在流程自主规划总入口统一管理。");
    return;
  }
  const target = node || localKeyNodes.value.find((item) => item.dateIso === dateIso);
  keyNodeModal.open = true;
  keyNodeModal.id = target?.id || "";
  keyNodeModal.dateIso = dateIso;
  keyNodeModal.title = target?.title || "";
  keyNodeModal.nodeType = target?.nodeType || "关键检查";
  keyNodeModal.description = target?.description || "";
  keyNodeModal.blockScheduling = target?.blockScheduling ?? true;
}

function closeKeyNodeModal() {
  keyNodeModal.open = false;
  keyNodeModal.id = "";
  keyNodeModal.dateIso = "";
  keyNodeModal.title = "";
  keyNodeModal.nodeType = "关键检查";
  keyNodeModal.description = "";
  keyNodeModal.blockScheduling = true;
}

function saveKeyNode() {
  if (!keyNodeModal.dateIso || !keyNodeModal.title.trim()) {
    showToast("请填写关键节点名称。");
    return;
  }
  const nextNode = {
    id: keyNodeModal.id || `${props.flowId}-key-node-${activeGasType.value}-${Date.now()}`,
    dateIso: keyNodeModal.dateIso,
    title: keyNodeModal.title.trim(),
    nodeType: keyNodeModal.nodeType,
    description: keyNodeModal.description.trim(),
    blockScheduling: keyNodeModal.blockScheduling,
    createdAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    createdBy: currentOperatorName()
  };
  const nextNodes = [
    nextNode,
    ...localKeyNodes.value.filter((item) => item.id !== nextNode.id && !(item.dateIso === nextNode.dateIso && item.title === nextNode.title))
  ];
  saveGenericPacketPatch({ keyNodes: nextNodes });
  closeKeyNodeModal();
  showToast(`已设置 ${formatDisplayDate(nextNode.dateIso)} 关键节点：${nextNode.title}`);
}

function removeKeyNode(nodeId = keyNodeModal.id) {
  if (!nodeId) return;
  saveGenericPacketPatch({ keyNodes: localKeyNodes.value.filter((item) => item.id !== nodeId) });
  closeKeyNodeModal();
  showToast("已删除关键节点。");
}

function collectSchedulingConstraints() {
  const allKeyNodes = collectKeyNodesForConflictCheck();
  return {
    keyNodes: allKeyNodes,
    blockedDates: allKeyNodes.filter((item) => item.blockScheduling).map((item) => item.dateIso)
  };
}

function isDateBlocked(dateIso, constraints = collectSchedulingConstraints()) {
  return constraints.blockedDates.includes(dateIso);
}

function shiftPlanAvoidingBlockedDates(plan, constraints, maxShiftDays = 45) {
  let candidate = normalizePlanMeta(plan);
  let shiftedDays = 0;
  while (enumerateDates(candidate.startDate, candidate.endDate).some((dateIso) => isDateBlocked(dateIso, constraints))) {
    if (shiftedDays >= maxShiftDays) {
      return { plan: candidate, shiftedDays, failed: true, reason: "关键节点过多，无法在可用窗口内完成自动避让。" };
    }
    candidate = normalizePlanMeta({
      ...candidate,
      startDate: addDays(candidate.startDate, 1),
      endDate: addDays(candidate.endDate, 1)
    });
    shiftedDays += 1;
  }
  return { plan: candidate, shiftedDays, failed: false, reason: shiftedDays ? `顺延 ${shiftedDays} 天避开关键节点。` : "" };
}

function applyKeyNodeAvoidance(plans) {
  const constraints = collectSchedulingConstraints();
  const steps = [];
  const adjustedPlans = plans.map((plan) => {
    const result = shiftPlanAvoidingBlockedDates(plan, constraints);
    if (result.shiftedDays || result.failed) {
      steps.push({
        planName: plan.name,
        beforeRange: `${formatDisplayDate(plan.startDate)} - ${formatDisplayDate(plan.endDate)}`,
        afterRange: `${formatDisplayDate(result.plan.startDate)} - ${formatDisplayDate(result.plan.endDate)}`,
        reason: result.reason
      });
    }
    return result.plan;
  });
  const failed = steps.find((item) => item.reason?.includes("无法"));
  return {
    plans: adjustedPlans,
    steps,
    failed,
    ok: !failed,
    reason: failed?.reason || ""
  };
}

function buildKeyNodeConflictDetail(plan, node) {
  const dateText = formatDisplayDate(node.dateIso);
  return {
    key: `${plan.id}-${node.id}-key-node`,
    type: "关键节点冲突",
    message: `计划“${plan.name}”覆盖${dateText}关键节点“${node.title}”。`,
    suggestion: node.blockScheduling ? "建议顺延或提前计划，避开该关键节点日期。" : "该关键节点仅提示关注，可由岗位人员确认是否保留。",
    relatedFlow: node.sourceLabel || "智能流程辅助管理",
    relatedPlanName: node.title,
    highlightPeople: [...(plan.assignees || [])],
    highlightEquipment: [...(plan.equipment || [])],
    highlightDates: [dateText],
    conflictReason: node.blockScheduling ? "该日期被设置为阻止自动排程的关键流程日。" : "该日期存在关键节点，需要人工关注。",
    conflictType: "关键节点冲突",
    currentPlanName: plan.name,
    currentWorkName: inferPlanWorkName(plan, dateText),
    currentPeople: [...(plan.assignees || [])],
    currentEquipment: [...(plan.equipment || [])],
    conflictPlanName: node.title,
    conflictWorkName: node.nodeType,
    conflictPeople: [],
    conflictEquipment: [],
    conflictDates: [dateText],
    sequenceRelation: "",
    sequenceReason: "",
    expectedOrderText: node.blockScheduling ? `关键节点“${node.title}”要求${dateText}不安排自动生成工作。` : "",
    detailText: `当前计划“${plan.name}”在${dateText}安排“${inferPlanWorkName(plan, dateText)}”，该日期已设置关键节点“${node.title}”（${node.nodeType}）。冲突原因：${node.blockScheduling ? "关键节点阻止自动排程" : "关键节点需要提示关注"}。`,
    shortText: `${dateText}关键节点占用`
  };
}

function detectSinglePlanConflicts(candidate, comparisonPlans = buildComparisonPlans(candidate.id)) {
  const conflicts = [];
  collectSchedulingConstraints().keyNodes.forEach((node) => {
    if (compareIso(candidate.startDate, node.dateIso) <= 0 && compareIso(candidate.endDate, node.dateIso) >= 0) {
      conflicts.push(buildKeyNodeConflictDetail(candidate, node));
    }
  });
  comparisonPlans.forEach((otherPlan) => {
    const sequenceRelation = inferSequenceRelation(candidate, otherPlan);
    if (isSequenceViolated(sequenceRelation)) {
      const dates = collectOverlapDates(sequenceRelation.beforePlan, sequenceRelation.afterPlan).map(formatDisplayDate);
      const suggestion = "建议按业务前后顺序重新排布窗口，优先保证前置计划完成后再安排后续工作。";
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-generation-sequence`,
        type: "前置/后置顺序冲突",
        message: `计划“${sequenceRelation.beforePlan.name}”通常应早于“${sequenceRelation.afterPlan.name}”，当前候选排期破坏了前后顺序。`,
        suggestion,
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: [...new Set([...(candidate.assignees || []), ...(otherPlan.assignees || [])])],
        highlightEquipment: [...new Set([...(candidate.equipment || []), ...(otherPlan.equipment || [])])],
        highlightDates: dates,
        ...buildConflictDetail({
          type: "前置/后置顺序冲突",
          reason: "生成计划时破坏了业务常识中的前置/后置依赖关系。",
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates,
          currentPeople: [...(candidate.assignees || [])],
          currentEquipment: [...(candidate.equipment || [])],
          conflictPeople: [...(otherPlan.assignees || [])],
          conflictEquipment: [...(otherPlan.equipment || [])],
          suggestion,
          sequenceRelation
        })
      });
    }

    if (!rangesOverlap(candidate, otherPlan)) return;
    const overlapDates = collectOverlapDates(candidate, otherPlan).map(formatDisplayDate);
    const sharedPeople = candidate.assignees.filter((name) => otherPlan.assignees.includes(name));
    const sharedEquipment = candidate.equipment.filter((name) => otherPlan.equipment.includes(name));
    if (sharedPeople.length) {
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-generation-people`,
        type: "人员冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}“${otherPlan.name}”存在人员同窗占用。`,
        suggestion: "建议顺延当前计划或改派其他人员。",
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: sharedPeople,
        highlightEquipment: [],
        highlightDates: overlapDates
      });
    }
    if (sharedEquipment.length) {
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-generation-equipment`,
        type: "设备冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}“${otherPlan.name}”存在设备共占。`,
        suggestion: "建议错峰执行或切换备用设备。",
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: [],
        highlightEquipment: sharedEquipment,
        highlightDates: overlapDates
      });
    }
    if (candidate.name === otherPlan.name) {
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-generation-work`,
        type: "工作冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}存在同名工作重叠。`,
        suggestion: "建议重新排布窗口，避免重复占用执行时段。",
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: sharedPeople,
        highlightEquipment: sharedEquipment,
        highlightDates: overlapDates
      });
    }
  });
  const unique = new Map();
  finalizeConflictDetails(conflicts, candidate, comparisonPlans).forEach((item) => {
    if (!unique.has(item.key)) unique.set(item.key, item);
  });
  return [...unique.values()];
}

function detectCrossFlowConflicts(candidatePlans) {
  return candidatePlans.flatMap((plan) => detectSinglePlanConflicts(plan, buildComparisonPlans(plan.id)));
}

function optimizeCandidatePlans(candidatePlans) {
  const constraints = collectSchedulingConstraints();
  const steps = [];
  const optimizedPlans = candidatePlans.map((plan) => {
    let candidate = normalizePlanMeta(plan);
    let conflicts = detectSinglePlanConflicts(candidate, buildComparisonPlans(candidate.id));
    const initialConflictCount = conflicts.length;
    let shiftDays = 0;
    while (conflicts.length && shiftDays < 21) {
      candidate = normalizePlanMeta({ ...candidate, startDate: addDays(candidate.startDate, 1), endDate: addDays(candidate.endDate, 1) });
      while (enumerateDates(candidate.startDate, candidate.endDate).some((dateIso) => isDateBlocked(dateIso, constraints))) {
        candidate = normalizePlanMeta({ ...candidate, startDate: addDays(candidate.startDate, 1), endDate: addDays(candidate.endDate, 1) });
        shiftDays += 1;
      }
      shiftDays += 1;
      conflicts = detectSinglePlanConflicts(candidate, buildComparisonPlans(candidate.id));
    }
    if (shiftDays) {
      steps.push({
        planName: plan.name,
        beforeRange: `${formatDisplayDate(plan.startDate)} - ${formatDisplayDate(plan.endDate)}`,
        afterRange: `${formatDisplayDate(candidate.startDate)} - ${formatDisplayDate(candidate.endDate)}`,
        shiftDays,
        reason: conflicts.length ? "尝试顺延后仍存在冲突。" : "顺延避开关键节点、人员或设备占用。",
        resolvedConflictCount: Math.max(0, initialConflictCount - conflicts.length),
        remainingConflictCount: conflicts.length
      });
    }
    return candidate;
  });
  const finalConflicts = detectCrossFlowConflicts(optimizedPlans);
  return {
    optimizedPlans,
    optimizationSteps: steps,
    canOptimize: finalConflicts.length === 0,
    remainingConflicts: finalConflicts,
    reason: finalConflicts.length ? "连续顺延 21 天后仍存在人员、设备或关键节点冲突。" : "已生成可执行的自动优化方案。"
  };
}

function openSmartOptimizeModal(candidatePlans, conflicts, optimizationResult) {
  smartOptimizeModal.open = true;
  smartOptimizeModal.candidatePlans = clone(candidatePlans);
  smartOptimizeModal.optimizedPlans = clone(optimizationResult.optimizedPlans || []);
  smartOptimizeModal.conflicts = clone(conflicts);
  smartOptimizeModal.optimizationSteps = clone(optimizationResult.optimizationSteps || []);
  smartOptimizeModal.remainingConflicts = clone(optimizationResult.remainingConflicts || []);
  smartOptimizeModal.activeTab = conflicts.length
    ? "conflicts"
    : smartOptimizeModal.optimizationSteps.length
      ? "plans"
      : "conflicts";
  smartOptimizeModal.canOptimize = optimizationResult.canOptimize;
  smartOptimizeModal.reason = optimizationResult.reason || "";
}

function closeSmartOptimizeModal() {
  smartOptimizeModal.open = false;
  smartOptimizeModal.candidatePlans = [];
  smartOptimizeModal.optimizedPlans = [];
  smartOptimizeModal.conflicts = [];
  smartOptimizeModal.optimizationSteps = [];
  smartOptimizeModal.remainingConflicts = [];
  smartOptimizeModal.activeTab = "conflicts";
  smartOptimizeModal.canOptimize = false;
  smartOptimizeModal.reason = "";
}

function applyGeneratedPlans(plans, records = []) {
  editablePlans.value = plans.map((plan, index) => normalizePlanMeta(materializePlanWorkDays(normalizePlanMeta(plan, index)), index));
  localConflictRecords.value = clone(records);
  localPlanStatus.value = "draft";
  calendarDirty.value = false;
  saveGenericFlowCalendar(props.flowId, activeGasType.value, {
    ...visibleGasPacket.value,
    calendarPlans: editablePlans.value,
    conflictRecords: records,
    planStatus: "draft",
    planGeneratedBy: currentOperatorName(),
    planConfirmedAt: "",
    lastEditedBy: currentOperatorName()
  });
}

function acceptSmartOptimization() {
  if (!smartOptimizeModal.optimizedPlans.length) {
    showToast("当前没有可保存的优化计划。");
    return;
  }
  if (!smartOptimizeModal.canOptimize) {
    showToast(smartOptimizeModal.reason || "当前优化后仍有冲突，不能作为无冲突计划直接生成。");
    return;
  }
  applyGeneratedPlans(smartOptimizeModal.optimizedPlans, []);
  closeSmartOptimizeModal();
  showToast("已接受智能优化建议并生成优化后的日历计划。");
}

function applyFeasibleOptimizationWithConflicts() {
  if (!smartOptimizeModal.optimizedPlans.length) {
    showToast("当前没有可应用的优化计划。");
    return;
  }
  const remaining = smartOptimizeModal.remainingConflicts.length
    ? smartOptimizeModal.remainingConflicts
    : smartOptimizeModal.conflicts;
  const records = remaining.length
    ? appendConflictRecord(smartOptimizeModal.optimizedPlans[0] || smartOptimizeModal.candidatePlans[0], remaining)
    : [];
  applyGeneratedPlans(smartOptimizeModal.optimizedPlans, records);
  closeSmartOptimizeModal();
  showToast("已应用可行优化，剩余冲突已记录。");
}

function keepOriginalPlansWithConflicts() {
  const records = smartOptimizeModal.conflicts.length
    ? appendConflictRecord(smartOptimizeModal.candidatePlans[0], smartOptimizeModal.conflicts)
    : [];
  applyGeneratedPlans(smartOptimizeModal.candidatePlans, records);
  closeSmartOptimizeModal();
  showToast("已保留原计划并记录冲突信息。");
}

function cancelSmartGeneration() {
  closeSmartOptimizeModal();
  showToast("已取消本次计划生成。");
}

function openClearPlanModal() {
  state.clearPlanModalOpen = true;
}

function closeClearPlanModal() {
  state.clearPlanModalOpen = false;
}

function openSmartReorderModal() {
  state.smartReorderModalOpen = true;
}

function closeSmartReorderModal() {
  state.smartReorderModalOpen = false;
}

function collectLockedWorkDays(plans) {
  return plans.flatMap((plan) =>
    getPlanWorkDays(plan)
      .filter((workDay) => workDay.manualLocked)
      .map((workDay) => ({ planId: plan.id, planName: plan.name, assignees: plan.assignees || [], equipment: plan.equipment || [], workDay }))
  );
}

function hasWorkDayResourceConflict(plan, workDay, dateIso, occupiedItems) {
  return occupiedItems.some((item) => {
    if (item.workDay.id === workDay.id && item.planId === plan.id) return false;
    if (item.workDay.dateIso !== dateIso) return false;
    if (item.planId === plan.id) return true;
    const sharedPeople = (plan.assignees || []).some((name) => (item.assignees || []).includes(name));
    const sharedEquipment = (plan.equipment || []).some((name) => (item.equipment || []).includes(name));
    return sharedPeople || sharedEquipment;
  });
}

function findSmartReorderDate(plan, workDay, occupiedItems, constraints) {
  const offsets = [0, ...Array.from({ length: 21 }, (_, index) => index + 1), ...Array.from({ length: 7 }, (_, index) => -(index + 1))];
  return offsets
    .map((offset) => addDays(workDay.dateIso, offset))
    .find((dateIso) => !isDateBlocked(dateIso, constraints) && !hasWorkDayResourceConflict(plan, workDay, dateIso, occupiedItems));
}

function buildSmartReorderConflict(plan, workDay) {
  const dateText = formatDisplayDate(workDay.dateIso);
  return {
    key: `${plan.id}-${workDay.id}-smart-reorder`,
    workDayId: workDay.id,
    type: "智能重排未解决冲突",
    message: `工作“${workDay.actionLabel}”暂未找到可自动重排窗口。`,
    suggestion: "建议人工调整该工作日期、改派人员或更换备用设备。",
    relatedFlow: flowConfig.value.title,
    relatedPlanName: plan.name,
    highlightPeople: [...(plan.assignees || [])],
    highlightEquipment: [...(plan.equipment || [])],
    highlightDates: [dateText],
    conflictDates: [dateText],
    currentPlanName: plan.name,
    currentWorkName: workDay.actionLabel,
    detailText: `当前计划“${plan.name}”的“${workDay.actionLabel}”在${dateText}未能自动避开关键节点、锁定工作或资源占用，已保留原日期并记录冲突。`,
    shortText: "重排未解决"
  };
}

function rebuildUnlockedWorkDays(plans, constraints = collectSchedulingConstraints()) {
  const occupiedItems = collectLockedWorkDays(plans);
  const unresolved = [];
  const nextPlans = plans.map((plan) => {
    const nextWorkDays = getPlanWorkDays(plan).map((workDay) => {
      if (workDay.manualLocked) return { ...workDay };
      const nextDate = findSmartReorderDate(plan, workDay, occupiedItems, constraints);
      const nextWorkDay = nextDate ? { ...workDay, dateIso: nextDate } : { ...workDay };
      occupiedItems.push({
        planId: plan.id,
        planName: plan.name,
        assignees: plan.assignees || [],
        equipment: plan.equipment || [],
        workDay: nextWorkDay
      });
      if (!nextDate) unresolved.push(buildSmartReorderConflict(plan, workDay));
      return nextWorkDay;
    });
    return normalizePlanMeta(recalculatePlanRangeFromWorkDays({ ...plan, workDays: nextWorkDays }));
  });
  return { plans: nextPlans, unresolved };
}

function confirmSmartReorder() {
  const { plans, unresolved } = rebuildUnlockedWorkDays(editablePlans.value.map((plan) => normalizePlanMeta(plan)));
  editablePlans.value = plans;
  localPlanStatus.value = "draft";
  calendarDirty.value = true;
  if (unresolved.length) {
    localConflictRecords.value = appendConflictRecord(plans[0] || editablePlans.value[0], unresolved);
    saveGenericFlowCalendar(props.flowId, activeGasType.value, {
      ...visibleGasPacket.value,
      calendarPlans: plans,
      conflictRecords: localConflictRecords.value,
      planStatus: "draft",
      lastEditedBy: currentOperatorName()
    });
    showToast("部分工作无法自动重排，已保留并记录冲突。");
  } else {
    showToast("已完成智能重排，人工调整工作保持不变。");
  }
  closeSmartReorderModal();
}

function confirmClearGeneratedPlans() {
  const gasPacket = visibleGasPacket.value || {};
  editablePlans.value = [];
  localConflictRecords.value = [];
  localPlanStatus.value = "idle";
  calendarDirty.value = false;
  closeSmartOptimizeModal();
  closeConflictModal();
  saveGenericFlowCalendar(props.flowId, activeGasType.value, {
    ...gasPacket,
    calendarPlans: [],
    conflictRecords: [],
    planStatus: "idle",
    planGeneratedBy: "",
    planConfirmedAt: "",
    lastEditedBy: currentOperatorName(),
    keyNodes: gasPacket.keyNodes || []
  });
  closeClearPlanModal();
  showToast("已清空当前生成计划");
}

function conflictSortRank(item) {
  const text = `${item.conflictType || ""}${item.type || ""}${item.message || ""}`;
  if (text.includes("关键节点")) return 1;
  if (text.includes("前置") || text.includes("后置") || text.includes("顺序")) return 2;
  if (text.includes("人员")) return 3;
  if (text.includes("设备")) return 4;
  if (text.includes("工作")) return 5;
  return 9;
}

function sortedSmartConflicts() {
  return [...smartOptimizeModal.conflicts].sort((left, right) => conflictSortRank(left) - conflictSortRank(right));
}

function smartConflictDates(item) {
  return [...new Set([...(item.conflictDates || []), ...(item.highlightDates || [])].filter(Boolean))];
}

function hasFeasibleOptimization() {
  return smartOptimizeModal.optimizedPlans.length > 0 && smartOptimizeModal.optimizationSteps.some((step) => step.shiftDays > 0);
}

function generateCalendarPlan() {
  if (!isCommander.value) return;
  const baseStart = addDays(TODAY_ISO, 2);
  const cursorOffsets = [0, 3, 7, 11, 16, 21];
  const durations = [4, 3, 5, 4, 3, 6];

  const rawPlans = flowConfig.value.planNames(activeGasLabel.value).map((name, index) =>
    ({
      id: `${props.flowId}-${activeGasType.value}-${index + 1}`,
      name,
      color: getFlowPlanColor(),
      startDate: addDays(baseStart, cursorOffsets[index]),
      endDate: addDays(addDays(baseStart, cursorOffsets[index]), durations[index])
    })
  );

  const avoidance = applyKeyNodeAvoidance(rawPlans);
  if (avoidance.failed) {
    showToast(avoidance.failed.reason || avoidance.reason || "关键节点占用过多，当前计划无法自动排程。");
    return;
  }

  const plans = avoidance.plans.map((plan, index) => normalizePlanMeta(plan, index));
  const conflicts = detectCrossFlowConflicts(plans);
  if (conflicts.length) {
    const optimization = optimizeCandidatePlans(plans);
    openSmartOptimizeModal(plans, conflicts, optimization);
    return;
  }

  applyGeneratedPlans(plans, []);
  showToast(`${flowConfig.value.title}已生成草稿计划，可继续拖拽调整。`);
}

const selectedRepairRequest = computed(() =>
  repairRequests.find((item) => item.id === repairRequestDetail.id) || null
);

function openRepairRequestDetail(request) {
  repairRequestDetail.id = request.id;
  repairRequestDetail.open = true;
}

function closeRepairRequestDetail() {
  repairRequestDetail.open = false;
  repairRequestDetail.id = "";
}

function generateRepairPlanFromRequest(request) {
  if (!request || props.flowId !== "repair" || !isCommander.value) return;
  const actionNames = ["安全隔离", "维修执行", "复测确认", "质量记录"];
  const plan = normalizePlanMeta({
    id: `repair-${activeGasType.value}-${request.id}`,
    name: `${activeGasLabel.value}系统${request.equipmentName}维修计划`,
    color: getFlowPlanColor(),
    startDate: request.startDate,
    endDate: request.endDate,
    assignees: [...request.personnel],
    equipment: [...request.equipment],
    constraintIds: ["skip-weekends", "device-maintenance-window", "personnel-busy"],
    workDays: actionNames.map((actionLabel, index) => ({
      id: `${request.id}-work-${index + 1}`,
      dateIso: addDays(request.startDate, Math.min(index, diffDays(request.startDate, request.endDate))),
      actionLabel,
      timeRange: `${String(8 + index).padStart(2, "0")}:00-${String(9 + index).padStart(2, "0")}:00`,
      personnel: [...request.personnel],
      equipment: [...request.equipment],
      position: `${activeGasLabel.value}系统维修岗`,
      status: "草稿",
      sortKey: index,
      manualLocked: false
    }))
  });
  const nextPlans = [plan, ...editablePlans.value.filter((item) => item.id !== plan.id)];
  const conflicts = detectCrossFlowConflicts(nextPlans);
  applyGeneratedPlans(nextPlans, conflicts.length ? appendConflictRecord(plan, conflicts) : localConflictRecords.value);
  closeRepairRequestDetail();
  showToast("日历计划生成成功");
}

function beginPlanDrag(planId, workDayId, event) {
  if (!isCommander.value) return;
  const stripLayer = event.currentTarget.closest(".gantt-row-track") || event.currentTarget.closest(".calendar-strip-layer");
  if (!stripLayer) return;
  dragState.active = true;
  dragState.planId = planId;
  dragState.workDayId = workDayId || "";
  dragState.startX = event.clientX;
  dragState.deltaX = 0;
  dragState.moved = false;
  dragState.dayWidth = stripLayer.clientWidth / (stripLayer.classList.contains("gantt-row-track") ? ganttVisibleRange.value.visibleDays : 7);
  window.addEventListener("pointermove", onPlanPointerMove);
  window.addEventListener("pointerup", onPlanPointerUp);
  window.addEventListener("pointercancel", onPlanPointerUp);
  event.preventDefault();
  event.stopPropagation();
}

function onPlanPointerMove(event) {
  if (!dragState.active) return;
  dragState.deltaX = event.clientX - dragState.startX;
  if (Math.abs(dragState.deltaX) > 4) {
    dragState.moved = true;
  }
}

function onPlanPointerUp() {
  if (!dragState.active) return;
  const shiftDays = Math.round(dragState.deltaX / Math.max(dragState.dayWidth, 1));
  const planId = dragState.planId;
  const workDayId = dragState.workDayId;
  const moved = dragState.moved;
  if (moved) {
    suppressPlanClick.value = true;
    window.setTimeout(() => {
      suppressPlanClick.value = false;
    }, 0);
  }
  detachPointerDrag();
  if (!moved || shiftDays === 0) return;

  const targetPlan = editablePlans.value.find((plan) => plan.id === planId);
  if (!targetPlan) return;

  const result = detectShiftConflicts(planId, shiftDays, workDayId);
  if (result.conflicts.length) {
    openConflictModal(planId, targetPlan.name, shiftDays, result.candidate, result.conflicts, workDayId);
    return;
  }

  applyShiftCandidate(result.candidate);
}

function detachPointerDrag() {
  dragState.active = false;
  dragState.planId = "";
  dragState.workDayId = "";
  dragState.startX = 0;
  dragState.deltaX = 0;
  dragState.dayWidth = 0;
  dragState.moved = false;
  window.removeEventListener("pointermove", onPlanPointerMove);
  window.removeEventListener("pointerup", onPlanPointerUp);
  window.removeEventListener("pointercancel", onPlanPointerUp);
}

function applyShiftCandidate(candidate) {
  if (!candidate) return;
  editablePlans.value = editablePlans.value.map((plan) =>
    plan.id === candidate.id ? normalizePlanMeta(candidate) : normalizePlanMeta(plan)
  );
  localPlanStatus.value = "draft";
  calendarDirty.value = true;
}

function acceptConflictReminder() {
  closeConflictModal();
  showToast("已接受冲突提醒，本次拖拽未生效。");
}

function ignoreConflictAndApply() {
  const { candidate, conflicts } = conflictModal;
  if (candidate) {
    applyShiftCandidate(candidate);
    localConflictRecords.value = appendConflictRecord(candidate, conflicts);
  }
  closeConflictModal();
  showToast("已忽略冲突提醒并保留当前调整，可点击冲突计划条查看记录。");
}

function deletePlan(planId) {
  editablePlans.value = editablePlans.value.filter((plan) => plan.id !== planId);
  localPlanStatus.value = "draft";
  calendarDirty.value = true;
  showToast("已删除该计划条。");
}

function workDayDragStyle(planId, workDayId, baseStyle) {
  if (!(dragState.active && dragState.planId === planId && dragState.workDayId === workDayId)) return baseStyle;
  return {
    ...baseStyle,
    transform: `translateX(${dragState.deltaX}px)`,
    zIndex: 6,
    boxShadow: "0 10px 22px rgba(57, 144, 241, 0.28)"
  };
}

function confirmCalendarAdjustments() {
  if (!editablePlans.value.length) {
    showToast("当前没有可确认的计划。");
    return;
  }

  saveGenericFlowCalendar(props.flowId, activeGasType.value, {
    ...visibleGasPacket.value,
    calendarPlans: editablePlans.value.map((plan, index) => normalizePlanMeta(plan, index)),
    conflictRecords: localConflictRecords.value,
    planStatus: "confirmed",
    planGeneratedBy: visibleGasPacket.value.planGeneratedBy || currentUser.value?.roleLabel || "指挥人员",
    planConfirmedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    lastEditedBy: currentUser.value?.roleLabel || "指挥人员"
  });

  localPlanStatus.value = "confirmed";
  calendarDirty.value = false;
  showToast("计划已确认调整，已同步到系统工程师视图和各气体系统监控页。");
}

function buildCalendarMonths(startIso, endIso, plans) {
  const start = toDate(startIso);
  const end = toDate(endIso);
  const months = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    months.push(buildSingleMonth(cursor.getFullYear(), cursor.getMonth() + 1, plans));
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return months;
}

function buildSingleMonth(year, month, plans) {
  const first = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells = [];

  for (let index = leading; index > 0; index -= 1) {
    const date = new Date(year, month - 1, 1 - index);
    const iso = toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
    cells.push(buildCell(date, iso, true));
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const iso = toIso(year, month, day);
    cells.push(buildCell(new Date(year, month - 1, day), iso, false));
  }

  while (cells.length % 7 !== 0) {
    const date = new Date(year, month - 1, totalDays + (cells.length % 7));
    const iso = toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
    cells.push(buildCell(date, iso, true));
  }

  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    const weekCells = cells.slice(index, index + 7);
    const weekStartIso = weekCells[0].iso;
    const weekEndIso = weekCells[6].iso;
    weeks.push({
      id: `${year}-${month}-week-${index / 7}`,
      cells: weekCells,
      strips: buildWeekStrips(plans, weekStartIso, weekEndIso)
    });
  }

  return {
    key: `${year}-${month}`,
    title: `${year}年${month}月安排`,
    weeks
  };
}

function buildCell(date, iso, outside) {
  const weekday = date.getDay();
  return {
    iso,
    day: date.getDate(),
    outside,
    isWeekend: weekday === 0 || weekday === 6,
    isToday: iso === TODAY_ISO,
    holidayLabel: holidayMap[iso] || "",
    keyNodes: keyNodes.value.filter((item) => item.dateIso === iso)
  };
}

function buildWeekStrips(plans, weekStartIso, weekEndIso) {
  const overlapping = plans
    .filter((plan) => compareIso(plan.endDate, weekStartIso) >= 0 && compareIso(plan.startDate, weekEndIso) <= 0)
    .sort((left, right) => compareIso(left.startDate, right.startDate));

  const lanes = [];
  return overlapping.map((plan) => {
    const segmentStart = compareIso(plan.startDate, weekStartIso) > 0 ? plan.startDate : weekStartIso;
    const segmentEnd = compareIso(plan.endDate, weekEndIso) < 0 ? plan.endDate : weekEndIso;
    const startCol = diffDays(weekStartIso, segmentStart);
    const endCol = diffDays(weekStartIso, segmentEnd);
    let laneIndex = 0;

    while (laneIndex < lanes.length && startCol <= lanes[laneIndex]) {
      laneIndex += 1;
    }
    lanes[laneIndex] = endCol;

    return {
      ...plan,
      startCol,
      span: endCol - startCol + 1,
      laneIndex
    };
  });
}

function stripStyle(strip) {
  return {
    left: `calc(${strip.startCol} * (100% / 7) + 6px)`,
    width: `calc(${strip.span} * (100% / 7) - 12px)`,
    top: `${strip.laneIndex * 30 + 4}px`,
    background: strip.color
  };
}

onBeforeUnmount(() => {
  detachPointerDrag();
});
</script>

<template>
  <div class="fuel-page-stack">
    <div class="topbar">
      <div>
        <h1>{{ flowConfig.title }}</h1>
        <div class="muted">
          当前身份：{{ currentUser?.roleLabel || "未登录" }}
          <template v-if="!isEngineer"> / 气体类型：{{ activeGasLabel }}</template>
        </div>
      </div>
    </div>

    <template v-if="isEngineer">
      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>{{ flowConfig.title }}总览</h3>
            <div class="muted">{{ flowConfig.engineerHint }}</div>
          </div>
        </div>

        <div class="fuel-return-grid">
          <div v-for="summary in engineerPlanSummaries" :key="summary.gasType" class="fuel-return-card">
            <div class="fuel-return-head">
              <strong>{{ summary.gasLabel }}系统</strong>
              <span class="chip" :class="{ active: summary.planStatus === 'confirmed' }">
                {{ summary.planStatus === "confirmed" ? "已确认" : summary.planStatus === "draft" ? "草稿中" : "未生成" }}
              </span>
            </div>

            <div class="summary-line">
              <span>生成人员</span>
              <strong>{{ summary.planGeneratedBy || "待生成" }}</strong>
            </div>
            <div class="summary-line">
              <span>确认时间</span>
              <strong>{{ summary.planConfirmedAt || "待确认" }}</strong>
            </div>
            <div class="summary-line">
              <span>最近调整</span>
              <strong>{{ summary.lastEditedBy || "暂无" }}</strong>
            </div>
            <div class="summary-line">
              <span>冲突记录</span>
              <strong>{{ summary.conflictRecords.length }} 条</strong>
            </div>

            <div v-if="summary.plans.length" class="fuel-return-list">
              <div v-for="plan in summary.plans" :key="plan.id" class="fuel-return-item">
                <span class="fuel-return-color" :style="{ background: plan.color }"></span>
                <div>
                  <strong>{{ plan.name }}</strong>
                  <small>{{ formatDisplayDate(plan.startDate) }} - {{ formatDisplayDate(plan.endDate) }}</small>
                </div>
              </div>
            </div>
            <div v-else class="notice-card">
              <span>当前该气体系统还没有生成日历计划。</span>
              <span class="warning">待生成</span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="panel fuel-role-summary">
        <div class="panel-head">
          <div>
            <h3>{{ flowConfig.title }}</h3>
            <div class="muted">{{ flowConfig.description }}</div>
          </div>
          <span class="chip active">{{ currentUser?.roleLabel }} / {{ activeGasLabel }}</span>
        </div>

        <div class="button-row" style="margin-top: 8px;">
          <button class="button" type="button" @click="generateCalendarPlan">生成计划</button>
          <button v-if="editablePlans.length" class="ghost" type="button" @click="confirmCalendarAdjustments">确认调整</button>
          <button v-if="editablePlans.length" class="ghost" type="button" @click="openSmartReorderModal">智能重排</button>
          <button v-if="editablePlans.length" class="danger-ghost" type="button" @click="openClearPlanModal">清空计划</button>
          <span v-if="editablePlans.length" class="chip" :class="{ active: localPlanStatus === 'confirmed' }">
            计划状态：{{ localPlanStatus === "confirmed" ? "已确认" : "草稿" }}
          </span>
          <span v-if="calendarDirty" class="chip">存在未确认的手动调整</span>
        </div>
      </section>

      <section v-if="props.flowId === 'repair'" class="panel">
        <div class="panel-head">
          <div>
            <h3>装备维修需求</h3>
            <div class="muted">展示健康监测系统传入的装备维修请求，可查看详情并一键生成维修日历计划。</div>
          </div>
          <span class="chip active">{{ repairRequests.length }} 条需求</span>
        </div>
        <table class="fuel-report-table">
          <thead>
            <tr>
              <th>装备</th>
              <th>健康状态 / 故障</th>
              <th>建议窗口</th>
              <th>优先级</th>
              <th>人员</th>
              <th>设备</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="request in repairRequests" :key="request.id">
              <td>{{ request.equipmentName }}</td>
              <td>{{ request.healthStatus }}</td>
              <td>{{ formatDisplayDate(request.startDate) }} - {{ formatDisplayDate(request.endDate) }}</td>
              <td><span class="chip" :class="{ warning: request.priority === '高' }">{{ request.priority }}</span></td>
              <td>{{ request.personnel.join("、") }}</td>
              <td>{{ request.equipment.join("、") }}</td>
              <td>
                <div class="button-row">
                  <button class="ghost small" type="button" @click="openRepairRequestDetail(request)">查看详情</button>
                  <button class="button small" type="button" @click="generateRepairPlanFromRequest(request)">生成计划</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="panel smart-assist-panel">
        <div class="panel-head">
          <div>
            <h3>智能流程辅助管理配置项</h3>
            <div class="muted">可提前设置关键节点，生成计划时自动避让；也可在日历日期上点击编辑关键节点。</div>
          </div>
          <button class="button small" type="button" @click="openKeyNodeModal(TODAY_ISO)">新增关键节点</button>
        </div>
        <div v-if="keyNodes.length" class="key-node-list">
          <button
            v-for="node in keyNodes"
            :key="node.id"
            class="key-node-list-item"
            type="button"
            @click="openKeyNodeModal(node.dateIso, node)"
          >
            <strong>{{ node.title }}</strong>
            <span>{{ formatDisplayDate(node.dateIso) }} · {{ node.nodeType }} · {{ node.blockScheduling ? "阻止自动排程" : "提示关注" }}</span>
          </button>
        </div>
        <div v-else class="notice-card" style="margin-top: 12px;">
          <span>暂无关键节点。可先新增“整体大检查”等禁排窗口，再生成计划。</span>
          <span class="accent">可配置</span>
        </div>
      </section>

      <section v-if="editablePlans.length" class="panel">
        <div class="panel-head">
          <div>
            <h3>{{ activeGasLabel }}日历计划</h3>
            <div class="muted">当前仅调整展示样式：甘特图缩放只改变可见日期范围，不改变计划数据和冲突规则。</div>
          </div>
          <div class="gantt-toolbar">
            <label>
              <span>中心日期</span>
              <input v-model="ganttCenterDate" type="date">
            </label>
            <button class="ghost small" type="button" :disabled="ganttZoomLevel >= ganttZoomLevels.length - 1" @click="zoomGantt(1)">放大</button>
            <button class="ghost small" type="button" :disabled="ganttZoomLevel <= 0" @click="zoomGantt(-1)">缩小</button>
            <button class="ghost small" type="button" @click="setGanttToday">今日</button>
            <button class="ghost small" type="button" @click="resetGanttView">重置视图</button>
            <span class="chip active">{{ ganttZoomConfig.label }}视图 / {{ ganttZoomConfig.days }} 天</span>
          </div>
        </div>

        <div class="gantt-planner" :style="{ '--gantt-min-width': `${Math.max(760, ganttVisibleRange.visibleDays * 76)}px` }">
          <template v-if="!isSingleDayGantt">
            <div class="gantt-date-axis">
              <button
                v-for="cell in ganttDateColumns"
                :key="cell.dateIso"
                class="gantt-date-cell"
                :class="{ today: cell.isToday, weekend: cell.isWeekend, holiday: Boolean(cell.holidayLabel), 'has-key-node': cell.keyNodes.length }"
                :style="ganttAxisCellStyle(cell)"
                type="button"
                @click="openKeyNodeModal(cell.dateIso)"
              >
                <strong>{{ cell.dayLabel }}</strong>
                <span>{{ cell.weekdayLabel }}</span>
                <small v-if="cell.holidayLabel">{{ cell.holidayLabel }}</small>
                <em
                  v-for="node in cell.keyNodes.slice(0, 2)"
                  :key="node.id"
                  class="gantt-key-node"
                  :class="{ blocking: node.blockScheduling }"
                  @click.stop="openKeyNodeModal(cell.dateIso, node)"
                >
                  {{ node.isGlobal ? "全局" : "关键" }}
                </em>
              </button>
            </div>

            <div class="gantt-body">
              <div v-for="row in ganttVisiblePlanRows" :key="row.id" class="gantt-row" :style="{ minHeight: `${row.rowHeight}px` }">
                <div class="gantt-row-track" :style="{ minHeight: `${row.rowHeight}px` }">
                  <span
                    v-for="cell in ganttDateColumns"
                    :key="`${row.id}-${cell.dateIso}`"
                    class="gantt-track-cell"
                    :class="{ today: cell.isToday, weekend: cell.isWeekend }"
                    :style="ganttAxisCellStyle(cell)"
                  ></span>
                  <div
                    class="gantt-plan-range-bg"
                    :class="{
                      'has-conflict': row.conflictSummary.hasConflict,
                      'clipped-start': row.isClippedStart,
                      'clipped-end': row.isClippedEnd
                    }"
                    :style="{ left: `${row.leftPercent}%`, width: `${row.widthPercent}%` }"
                    :title="row.conflictSummary.title || row.name"
                    @click.stop="openEmptyWorkDayModal(row, $event)"
                  >
                    <button
                      v-for="workDay in buildPlanWorkDaySegments(row)"
                      :key="workDay.id"
                      class="gantt-work-day-segment"
                      :class="{ dragging: dragState.active && dragState.workDayId === workDay.id, conflict: workDay.hasConflict, locked: workDay.manualLocked }"
                      :style="workDayDragStyle(row.id, workDay.id, { left: `${workDay.leftPercent}%`, width: `${workDay.widthPercent}%`, top: `${workDay.topPx}px`, height: `${workDay.heightPx}px`, background: row.color })"
                      type="button"
                      :title="`${row.name} / ${workDay.actionLabel} / ${formatDisplayDate(workDay.dateIso)}`"
                      @pointerdown="beginPlanDrag(row.id, workDay.id, $event)"
                      @click.stop="workDay.hasConflict ? openPlanConflictRecords(row, workDay) : openWorkDayModal(row, workDay.dateIso, workDay)"
                    >
                      <i
                        v-for="segment in buildWorkDayConflictSegments(row, workDay)"
                        :key="`${workDay.id}-conflict-${segment.leftPercent}`"
                        class="gantt-conflict-segment"
                        :style="{ left: `${segment.leftPercent}%`, width: `${segment.widthPercent}%` }"
                      ></i>
                      <span>{{ workDay.actionLabel || row.name }}</span>
                    </button>
                    <span class="gantt-range-label">{{ row.name }}</span>
                    <button class="strip-delete" type="button" @click.stop="deletePlan(row.id)">×</button>
                  </div>
                </div>
              </div>
              <div v-if="!ganttVisiblePlanRows.length" class="notice-card">
                <span>当前缩放范围内没有计划条。</span>
                <span class="warning">无计划</span>
              </div>
            </div>
          </template>

          <div v-else class="gantt-single-day">
            <div class="notice-card" v-if="ganttDateColumns[0]?.keyNodes.length">
              <span>当天关键节点：{{ ganttDateColumns[0].keyNodes.map((node) => `${node.isGlobal ? "全局" : "当前"}·${node.title}`).join("、") }}</span>
              <span class="warning">需关注</span>
            </div>
            <button
              v-for="work in ganttSingleDayWorks"
              :key="work.id"
              class="gantt-single-work-card"
              :class="{ conflict: work.hasConflict }"
              type="button"
              @click="openGanttWorkDetail(work)"
            >
              <div>
                <strong>{{ work.timeRange }} · {{ work.actionLabel }}</strong>
                <span>{{ work.planName }} / {{ work.position }}</span>
              </div>
              <small>人员：{{ work.personnel }} / 设备：{{ work.equipment }} / 状态：{{ work.status }}</small>
              <em>{{ work.riskText }}</em>
            </button>
            <div v-if="!ganttSingleDayWorks.length" class="notice-card">
              <span>当天没有匹配的计划工作。</span>
              <span class="warning">空闲</span>
            </div>
          </div>
        </div>
      </section>

      <section v-else class="panel">
        <div class="notice-card">
          <span>点击“生成计划”即可直接生成当前气体系统的日历计划。</span>
          <span class="accent">待生成</span>
        </div>
      </section>

      <section v-if="false && localConflictRecords.length" class="panel">
        <div class="panel-head">
          <div>
            <h3>冲突提醒记录</h3>
            <div class="muted">忽略冲突提醒后，相关记录会先保留在当前规划页，确认调整后同步给系统工程师和监控页。</div>
          </div>
          <span class="chip">已记录 {{ localConflictRecords.length }} 条</span>
        </div>

        <div class="log-list">
          <div v-for="record in localConflictRecords" :key="record.id" class="rule-entry">
            <div class="rule-entry-head">
              <div class="rule-entry-title">
                <strong>{{ record.planName }}</strong>
                <span class="rule-entry-subtext">{{ record.createdAt }} 路 {{ record.dateRange }}</span>
              </div>
              <span class="chip warning">待同步</span>
            </div>

            <div class="detail-list">
              <div v-for="item in record.conflicts" :key="`${record.id}-${item.key || item.type}-${item.message}`" class="notice-card">
                <div class="conflict-detail-block">
                  <strong>{{ item.type }}：{{ item.shortText || item.message }}</strong>
                  <span class="conflict-detail-text">{{ item.detailText || item.message }}</span>
                  <span v-if="item.expectedOrderText" class="conflict-order-text">{{ item.expectedOrderText }}</span>
                </div>
                <span class="muted">
                  {{ item.relatedFlow ? `关联流程：${item.relatedFlow}` : "当前流程" }}
                  <template v-if="item.highlightPeople?.length"> ｜ 人员：{{ item.highlightPeople.join("、") }}</template>
                  <template v-if="item.highlightEquipment?.length"> ｜ 设备：{{ item.highlightEquipment.join("、") }}</template>
                  <template v-if="item.highlightDates?.length"> ｜ 日期：{{ item.highlightDates.join("、") }}</template>
                </span>
                <span class="muted">{{ item.suggestion }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <div class="modal-overlay" :class="{ open: keyNodeModal.open }" @click.self="closeKeyNodeModal">
      <div class="modal-card key-node-modal">
        <div class="panel-head">
          <div>
            <h3>关键节点设置</h3>
            <div class="muted">{{ keyNodeModal.dateIso ? formatDisplayDate(keyNodeModal.dateIso) : "选择日期" }} 的关键流程日配置。</div>
          </div>
          <span class="chip warning">智能避让</span>
        </div>
        <div class="config-grid" style="margin-top: 14px;">
          <label class="field">
            <span>关键节点名称</span>
            <input v-model="keyNodeModal.title" placeholder="例如：整体大检查">
          </label>
          <label class="field">
            <span>节点类型</span>
            <select v-model="keyNodeModal.nodeType">
              <option>关键检查</option>
              <option>质量确认</option>
              <option>外部保障</option>
              <option>禁排窗口</option>
              <option>其他</option>
            </select>
          </label>
          <label class="field">
            <span>说明</span>
            <textarea v-model="keyNodeModal.description" rows="3" placeholder="说明关键节点约束和注意事项"></textarea>
          </label>
          <label class="check-row">
            <input v-model="keyNodeModal.blockScheduling" type="checkbox">
            <span>阻止自动排程，生成计划时必须避让该日期</span>
          </label>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeKeyNodeModal">取消</button>
          <button v-if="keyNodeModal.id" class="danger-btn" type="button" @click="removeKeyNode()">删除</button>
          <button class="button" type="button" @click="saveKeyNode">保存关键节点</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: repairRequestDetail.open }" @click.self="closeRepairRequestDetail">
      <div class="modal-card key-node-modal">
        <template v-if="selectedRepairRequest">
          <div class="panel-head">
            <div>
              <h3>{{ selectedRepairRequest.equipmentName }}维修需求</h3>
              <div class="muted">{{ selectedRepairRequest.healthStatus }} · {{ selectedRepairRequest.priority }}优先级</div>
            </div>
            <span class="chip warning">健康监测传入</span>
          </div>
          <div class="detail-list" style="margin-top: 14px;">
            <div class="notice-card">
              <span>建议窗口：{{ formatDisplayDate(selectedRepairRequest.startDate) }} - {{ formatDisplayDate(selectedRepairRequest.endDate) }}</span>
              <span class="accent">排程依据</span>
            </div>
            <div class="notice-card">
              <span>所需人员：{{ selectedRepairRequest.personnel.join("、") }}</span>
              <span class="accent">人员</span>
            </div>
            <div class="notice-card">
              <span>所需设备：{{ selectedRepairRequest.equipment.join("、") }}</span>
              <span class="accent">设备</span>
            </div>
            <div class="notice-card">
              <span>{{ selectedRepairRequest.description }}</span>
              <span class="warning">说明</span>
            </div>
          </div>
          <div class="button-row" style="margin-top: 18px;">
            <button class="ghost" type="button" @click="closeRepairRequestDetail">关闭</button>
            <button class="button" type="button" @click="generateRepairPlanFromRequest(selectedRepairRequest)">生成计划</button>
          </div>
        </template>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.clearPlanModalOpen }" @click.self="closeClearPlanModal">
      <div class="modal-card clear-plan-modal">
        <h3>确认清空当前计划？</h3>
        <p class="muted">清空后会移除当前页面已生成的计划条和冲突记录，但会保留关键节点、历史库、规则库和当前输入条件。</p>
        <div class="notice-card">
          <span>{{ activeGasLabel }}系统{{ flowConfig.title }}将被清空。</span>
          <span class="warning">不可撤销</span>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeClearPlanModal">取消</button>
          <button class="danger-ghost" type="button" @click="confirmClearGeneratedPlans">确认清空</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.smartReorderModalOpen }" @click.self="closeSmartReorderModal">
      <div class="modal-card smart-reorder-modal">
        <h3>确认智能重排？</h3>
        <p class="muted">系统将保留已人工调整的工作日不动，仅重排其他未锁定工作，尽量避开关键节点、人员、设备和顺序冲突。</p>
        <div class="notice-card">
          <span>已锁定工作 {{ collectLockedWorkDays(editablePlans).length }} 项，其余工作将参与自动重排。</span>
          <span class="accent">智能重排</span>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeSmartReorderModal">取消</button>
          <button class="button" type="button" @click="confirmSmartReorder">开始重排</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.workDayModalOpen }" @click.self="closeWorkDayModal">
      <div class="modal-card work-day-edit-modal">
        <div class="panel-head">
          <div>
            <h3>{{ workDayModal.workDayId ? "编辑工作日" : "恢复 / 新增工作日" }}</h3>
            <div class="muted">{{ formatDisplayDate(workDayModal.dateIso) }} · {{ selectedWorkDayPlan?.name || "当前计划" }}</div>
          </div>
          <span class="chip">离散工作日</span>
        </div>
        <div class="filter-grid">
          <label>
            工作名称
            <input v-model="workDayModal.actionLabel" type="text" placeholder="请输入工作名称" />
          </label>
          <label>
            时间段
            <input v-model="workDayModal.timeRange" type="text" placeholder="08:00-10:00" />
          </label>
          <label>
            人员
            <input v-model="workDayModal.personnel" type="text" placeholder="多人用顿号分隔" />
          </label>
          <label>
            设备
            <input v-model="workDayModal.equipment" type="text" placeholder="多个设备用顿号分隔" />
          </label>
          <label class="wide">
            岗位
            <input v-model="workDayModal.position" type="text" placeholder="请输入岗位" />
          </label>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeWorkDayModal">取消</button>
          <button v-if="workDayModal.workDayId" class="danger-ghost" type="button" @click="removeWorkDayFromModal">设为空档</button>
          <button class="button" type="button" @click="saveWorkDayFromModal">保存</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.conflictRecordModalOpen }" @click.self="closePlanConflictRecords">
      <div class="modal-card plan-conflict-record-modal">
        <div class="panel-head">
          <div>
            <h3>冲突提醒记录</h3>
            <div class="muted">
              {{ selectedConflictPlan?.name || "当前计划" }}
              <template v-if="selectedConflictPlan">
                / {{ formatDisplayDate(selectedConflictPlan.startDate) }} - {{ formatDisplayDate(selectedConflictPlan.endDate) }}
              </template>
            </div>
          </div>
          <span class="chip warning">{{ selectedConflictPlanRecords.length }} 条</span>
        </div>

        <div v-if="selectedConflictPlanRecords.length" class="plan-conflict-record-list">
          <div v-for="record in selectedConflictPlanRecords" :key="record.id" class="plan-conflict-record-card">
            <div class="rule-entry-head">
              <div class="rule-entry-title">
                <strong>{{ record.planName }}</strong>
                <span class="rule-entry-subtext">{{ record.createdAt }} · {{ record.dateRange }}</span>
              </div>
              <span class="chip warning">已忽略</span>
            </div>
            <div class="detail-list">
              <div v-for="item in record.conflicts" :key="`${record.id}-${item.key || item.type}-${item.message}`" class="notice-card">
                <div class="conflict-detail-block">
                  <strong>{{ item.conflictType || item.type }}：{{ item.shortText || item.message }}</strong>
                  <span class="conflict-detail-text">{{ item.detailText || item.message }}</span>
                  <span v-if="item.expectedOrderText" class="conflict-order-text">{{ item.expectedOrderText }}</span>
                </div>
                <span class="muted">
                  <template v-if="item.conflictDates?.length || item.highlightDates?.length">
                    冲突日期：{{ [...new Set([...(item.conflictDates || []), ...(item.highlightDates || [])])].join("、") }}
                  </template>
                  <template v-if="item.relatedFlow"> ｜ 关联流程：{{ item.relatedFlow }}</template>
                  <template v-if="item.relatedPlanName || item.conflictPlanName"> ｜ 关联计划：{{ item.relatedPlanName || item.conflictPlanName }}</template>
                </span>
                <span class="muted">{{ item.suggestion }}</span>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="notice-card">
          <span>该计划暂无已记录冲突。</span>
          <span class="accent">无记录</span>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="button" type="button" @click="closePlanConflictRecords">关闭</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay live-conflict-overlay" :class="{ open: smartOptimizeModal.open }">
      <div class="modal-card live-conflict-modal smart-optimize-modal">
        <div class="live-conflict-head">
          <div>
            <h3>智能冲突优化建议</h3>
            <div class="muted">{{ smartOptimizeModal.reason || "生成计划时检测到跨流程冲突，系统已尝试自动优化。" }}</div>
          </div>
          <div class="button-row">
            <span class="chip warning">冲突 {{ smartOptimizeModal.conflicts.length }} 项</span>
            <span class="chip" :class="{ active: smartOptimizeModal.canOptimize }">
              {{ smartOptimizeModal.canOptimize ? "可自动优化" : "仍需人工确认" }}
            </span>
          </div>
        </div>

        <div class="smart-optimize-tabs">
          <button
            type="button"
            class="smart-optimize-tab"
            :class="{ active: smartOptimizeModal.activeTab === 'conflicts' }"
            @click="smartOptimizeModal.activeTab = 'conflicts'"
          >
            冲突清单 {{ smartOptimizeModal.conflicts.length }} 项
          </button>
          <button
            type="button"
            class="smart-optimize-tab"
            :class="{ active: smartOptimizeModal.activeTab === 'plans' }"
            @click="smartOptimizeModal.activeTab = 'plans'"
          >
            智能优化方案 {{ smartOptimizeModal.optimizationSteps.length }} 项
          </button>
        </div>

        <div class="smart-optimize-tab-panel">
          <section v-if="smartOptimizeModal.activeTab === 'conflicts'" class="smart-optimize-section conflict">
            <div class="smart-optimize-section-head">
              <strong>冲突清单</strong>
              <span class="chip warning">{{ smartOptimizeModal.conflicts.length }} 项</span>
            </div>
            <div v-if="smartOptimizeModal.conflicts.length" class="log-list">
              <div v-for="item in sortedSmartConflicts()" :key="item.key" class="notice-card smart-conflict-card">
                <div class="conflict-detail-block">
                  <strong>{{ item.conflictType || item.type }}：{{ item.shortText || item.message }}</strong>
                  <span class="conflict-detail-text">{{ item.detailText || item.message }}</span>
                  <span v-if="smartConflictDates(item).length" class="muted">冲突日期：{{ smartConflictDates(item).join("、") }}</span>
                  <span class="muted">
                    <template v-if="item.relatedFlow">关联流程：{{ item.relatedFlow }}</template>
                    <template v-if="item.relatedPlanName"> ｜ 关联计划：{{ item.relatedPlanName }}</template>
                  </span>
                </div>
                <span class="muted">{{ item.suggestion }}</span>
              </div>
            </div>
            <div v-else class="notice-card smart-conflict-card empty">
              <div class="conflict-detail-block">
                <strong>当前没有冲突项。</strong>
              </div>
            </div>
          </section>

          <section v-else class="smart-optimize-section plan">
            <div class="smart-optimize-section-head">
              <strong>智能优化方案</strong>
              <span class="chip">{{ smartOptimizeModal.optimizationSteps.length }} 项</span>
            </div>
            <div v-if="smartOptimizeModal.optimizationSteps.length" class="log-list">
              <div v-for="step in smartOptimizeModal.optimizationSteps" :key="`${step.planName}-${step.afterRange}`" class="notice-card smart-plan-card">
                <div class="conflict-detail-block">
                  <strong>{{ step.planName }}</strong>
                  <span class="conflict-detail-text">优化前：{{ step.beforeRange }}；优化后：{{ step.afterRange }}。</span>
                  <span class="muted">调整 {{ step.shiftDays }} 天 ｜ 已解决 {{ step.resolvedConflictCount }} 项 ｜ 剩余 {{ step.remainingConflictCount }} 项</span>
                </div>
                <span class="muted">{{ step.reason }}</span>
              </div>
            </div>
            <div v-else class="notice-card smart-plan-card empty">
              <div class="conflict-detail-block">
                <strong>当前无法自动形成无冲突方案</strong>
                <span class="conflict-detail-text">请岗位人员手动调整，或保留原计划并记录冲突。</span>
              </div>
            </div>
          </section>
        </div>

        <div v-if="!smartOptimizeModal.canOptimize" class="notice-card smart-execute-note">
          <span>{{ smartOptimizeModal.reason || "优化后仍存在冲突，接受优化并生成按钮已禁用。" }}</span>
          <span class="warning">需确认</span>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="cancelSmartGeneration">取消生成</button>
          <button class="ghost" type="button" @click="keepOriginalPlansWithConflicts">保留原计划并记录冲突</button>
          <button
            v-if="!smartOptimizeModal.canOptimize && hasFeasibleOptimization()"
            class="ghost"
            type="button"
            @click="applyFeasibleOptimizationWithConflicts"
          >
            应用可行优化并记录剩余冲突
          </button>
          <button class="button" type="button" :disabled="!smartOptimizeModal.canOptimize" @click="acceptSmartOptimization">接受优化并生成</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay live-conflict-overlay" :class="{ open: state.conflictModalOpen }">
      <div class="modal-card live-conflict-modal">
        <div class="live-conflict-head">
          <div>
            <h3>拖拽冲突提醒</h3>
            <div class="muted">计划“{{ conflictModal.planName }}”调整后检测到冲突。接受提醒则恢复，忽略则保留调整并记录到当前规划页。</div>
          </div>
          <span class="chip warning">冲突 {{ conflictModal.conflicts.length }} 项</span>
        </div>

        <div class="log-list">
          <div v-for="item in conflictModal.conflicts" :key="item.key" class="notice-card">
            <div class="conflict-detail-block">
              <strong>{{ item.type }}：{{ item.shortText || item.message }}</strong>
              <span class="conflict-detail-text">{{ item.detailText || item.message }}</span>
              <span v-if="item.expectedOrderText" class="conflict-order-text">{{ item.expectedOrderText }}</span>
            </div>
            <span class="muted">
              <template v-if="item.relatedFlow">关联流程：{{ item.relatedFlow }}</template>
              <template v-if="item.highlightPeople?.length"> ｜ 人员：{{ item.highlightPeople.join("、") }}</template>
              <template v-if="item.highlightEquipment?.length"> ｜ 设备：{{ item.highlightEquipment.join("、") }}</template>
              <template v-if="item.highlightDates?.length"> ｜ 日期：{{ item.highlightDates.join("、") }}</template>
            </span>
            <span class="muted">{{ item.suggestion }}</span>
          </div>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="acceptConflictReminder">接受提醒并复原</button>
          <button class="button" type="button" @click="ignoreConflictAndApply">忽略提醒并继续调整</button>
        </div>
      </div>
    </div>
  </div>
</template>



