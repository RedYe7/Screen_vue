<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const {
  currentUser,
  fuelPlanningPacket,
  genericPlanningPackets,
  globalKeyNodes,
  fuelPlanningToday,
  saveFuelPlanningPacket,
  markFuelGasReviewed,
  saveFuelReviewDecision,
  saveFuelGasCalendar,
  showToast,
  catalog
} = usePlatformState();

const TODAY_ISO = fuelPlanningToday || "2026-04-18";
const TODAY = toDate(TODAY_ISO);
const START_YEAR = TODAY.getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, index) => START_YEAR + index);

const gasLabelMap = {
  oxygen: "氧气",
  hydrogen: "氢气",
  nitrogen: "氮气",
  helium: "氦气"
};

const gasPlanPrefixMap = {
  oxygen: "液氧",
  hydrogen: "液氢",
  nitrogen: "液氮",
  helium: "氦气"
};

const fuelPlanColor = "#60e3ff";
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

const taskTypeOptions = [
  "单次任务",
  "并行任务",
  "年度任务",
  "临时推迟或应急推迟任务",
  "临时保障任务"
];

const templateOptions = [
  "特燃特气测算报文模板 / v1.0",
  "特燃特气测算报文模板 / v2.0",
  "综合测算报文模板 / v3.0"
];

const systemPreset = {
  taskName: "长征九号单次特燃特气任务",
  taskCode: "ZHFS-2026-0418",
  rocketModel: "长征九号",
  taskType: "单次任务",
  startDate: "2026-04-20",
  endDate: "2026-06-03",
  messageTemplate: templateOptions[1]
};

const holidayMap = {
  "2026-04-05": "清明",
  "2026-05-01": "劳动节",
  "2026-05-02": "劳动节",
  "2026-05-03": "劳动节",
  "2026-06-14": "端午",
  "2026-10-01": "国庆",
  "2026-10-02": "国庆",
  "2026-10-03": "国庆"
};

const engineerForm = reactive({
  taskName: "长征九号单次特燃特气任务",
  taskCode: "TRTQ-2026-0418",
  rocketModel: "长征九号",
  taskType: "单次任务",
  startYear: 2026,
  startMonth: 4,
  startDay: 20,
  endYear: 2026,
  endMonth: 5,
  endDay: 20,
  messageTemplate: templateOptions[0]
});

const editablePlans = ref([]);
const localPlanStatus = ref("idle");
const calendarDirty = ref(false);
const ganttCenterDate = ref(TODAY_ISO);
const ganttZoomLevel = ref(2);
const ganttInitialized = ref(false);
const pendingConflictCandidate = ref(null);
const pendingConflictOriginal = ref(null);
const pendingConflictWasDirty = ref(false);
const pendingConflictPlanStatus = ref("draft");
const conflictModal = reactive({
  open: false,
  planId: "",
  planName: "",
  workDayId: "",
  shiftDays: 0,
  conflicts: []
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

const clearPlanModal = reactive({
  open: false
});

const smartReorderModal = reactive({
  open: false
});

const conflictRecordModal = reactive({
  open: false,
  planId: "",
  workDayId: "",
  dateIso: ""
});

const dispatchConfirmModal = reactive({
  open: false
});

const reviewRejectModal = reactive({
  open: false,
  reason: "",
  error: ""
});

const workDayModal = reactive({
  open: false,
  planId: "",
  workDayId: "",
  dateIso: "",
  actionLabel: "",
  timeRange: "",
  personnel: "",
  equipment: "",
  position: ""
});

const dragState = reactive({
  active: false,
  planId: "",
  workDayId: "",
  startX: 0,
  deltaX: 0,
  dayWidth: 0,
  moved: false,
  pointerId: null
});
const suppressPlanClick = ref(false);

const isEngineer = computed(() => currentUser.value?.role === "engineer");
const isCommander = computed(() => currentUser.value?.role === "commander");
const activeGasType = computed(() => currentUser.value?.gasType || "oxygen");
const activeGasLabel = computed(() => gasLabelMap[activeGasType.value] || "氧气");
const packet = computed(() => fuelPlanningPacket.value);
const packetReady = computed(() => ["measured", "dispatched"].includes(packet.value.status));
const taskInfo = computed(() => packet.value.taskInfo || {});

const visibleGasPacket = computed(
  () => packet.value.gasPackets?.[activeGasType.value] || packet.value.gasPackets?.oxygen || emptyGasPacket()
);

const visibleReportRows = computed(() =>
  (packet.value.reportRows || []).filter((item) => item.gasType === activeGasType.value)
);
const conflictRecords = computed(() => visibleGasPacket.value.conflictRecords || []);
const localKeyNodes = computed(() => visibleGasPacket.value.keyNodes || []);
const globalFlowKeyNodes = computed(() =>
  globalKeyNodes.value.filter((node) => isGlobalKeyNodeApplicable(node, "fuel", activeGasType.value))
);
const keyNodes = computed(() => [
  ...localKeyNodes.value.map((node) => ({ ...node, sourceType: "local", sourceLabel: "当前流程" })),
  ...globalFlowKeyNodes.value.map((node) => ({ ...node, sourceType: "global", sourceLabel: "全局关键节点", isGlobal: true }))
]);

const startYearOptions = computed(() =>
  YEAR_OPTIONS.map((year) => ({
    value: year,
    disabled: false
  }))
);

const startMonthOptions = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      value: month,
      disabled: false
    };
  })
);

const startDayOptions = computed(() => {
  const total = getDaysInMonth(engineerForm.startYear, engineerForm.startMonth);
  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    return {
      value: day,
      disabled: false
    };
  });
});

const minEndIso = computed(() => formStartIso());

const endYearOptions = computed(() =>
  YEAR_OPTIONS.map((year) => ({
    value: year,
    disabled: year < parseIsoParts(minEndIso.value).year
  }))
);

const endMonthOptions = computed(() =>
  Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const monthEnd = toIso(engineerForm.endYear, month, getDaysInMonth(engineerForm.endYear, month));
    return {
      value: month,
      disabled: compareIso(monthEnd, minEndIso.value) < 0
    };
  })
);

const endDayOptions = computed(() => {
  const total = getDaysInMonth(engineerForm.endYear, engineerForm.endMonth);
  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const iso = toIso(engineerForm.endYear, engineerForm.endMonth, day);
    return {
      value: day,
      disabled: compareIso(iso, minEndIso.value) < 0
    };
  });
});

const canDispatch = computed(() => packet.value.reportRows?.length && packet.value.status === "measured");
const canGenerateCalendar = computed(
  () => isCommander.value && packet.value.status === "dispatched" && visibleGasPacket.value.reviewed
);

const engineerPlanSummaries = computed(() =>
  Object.entries(packet.value.gasPackets || {}).map(([gasType, gasPacket]) => ({
    gasType,
    gasLabel: gasLabelMap[gasType],
    reviewed: gasPacket.reviewed,
    reviewedBy: gasPacket.reviewedBy,
    reviewedAt: gasPacket.reviewedAt,
    planStatus: gasPacket.planStatus,
    planConfirmedAt: gasPacket.planConfirmedAt,
    plans: (gasPacket.calendarPlans || []).map((plan) => normalizePlanMeta(plan))
  }))
);

const calendarMonths = computed(() => {
  if (!editablePlans.value.length && !taskInfo.value.startDate) return [];
  const startIso = taskInfo.value.startDate || formStartIso();
  const endIso = taskInfo.value.endDate || formEndIso();
  return buildCalendarMonths(startIso, endIso, editablePlans.value);
});

const ganttZoomConfig = computed(() => ganttZoomLevels[ganttZoomLevel.value] || ganttZoomLevels[2]);

const ganttVisibleRange = computed(() => {
  const visibleDays = ganttZoomConfig.value.days;
  const center = ganttCenterDate.value || editablePlans.value[0]?.startDate || taskInfo.value.startDate || TODAY_ISO;
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
        riskText: buildPlanConflictSummary(plan).compactLabel || "常规风险，按流程执行",
        hasConflict: isWorkDayConflict(plan, workDay)
      };
    }))
    .sort((left, right) => left.timeRange.localeCompare(right.timeRange));
});

const selectedConflictPlan = computed(() =>
  editablePlans.value.find((plan) => plan.id === conflictRecordModal.planId) || null
);

const selectedWorkDayPlan = computed(() =>
  editablePlans.value.find((plan) => plan.id === workDayModal.planId) || null
);

const selectedConflictPlanRecords = computed(() =>
  selectedConflictPlan.value ? getPlanConflictRecordsForModal(selectedConflictPlan.value, conflictRecordModal.dateIso, conflictRecordModal.workDayId) : []
);

watch(
  packet,
  (next) => {
    const info = next.taskInfo || {};
    if (!info.taskName) return;
    const start = parseIsoParts(info.startDate || TODAY_ISO);
    const end = parseIsoParts(info.endDate || start.iso);
    engineerForm.taskName = info.taskName;
    engineerForm.taskCode = info.taskCode || engineerForm.taskCode;
    engineerForm.rocketModel = info.rocketModel || engineerForm.rocketModel;
    engineerForm.taskType = info.taskType || engineerForm.taskType;
    engineerForm.startYear = start.year;
    engineerForm.startMonth = start.month;
    engineerForm.startDay = start.day;
    engineerForm.endYear = end.year;
    engineerForm.endMonth = end.month;
    engineerForm.endDay = end.day;
    engineerForm.messageTemplate = info.messageTemplate || engineerForm.messageTemplate;
  },
  { immediate: true, deep: true }
);

watch(
  () => visibleGasPacket.value,
  (next) => {
    editablePlans.value = (next.calendarPlans || []).map((plan) => normalizePlanMeta(plan));
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

watch(
  () => [engineerForm.startYear, engineerForm.startMonth, engineerForm.startDay],
  () => {
    ensureValidStartDate();
    ensureValidEndDate();
  }
);

watch(
  () => [engineerForm.endYear, engineerForm.endMonth, engineerForm.endDay],
  () => {
    ensureValidEndDate();
  }
);

onBeforeUnmount(() => {
  detachPointerDrag();
});

function emptyGasPacket() {
  return {
    reviewed: false,
    reviewedBy: "",
    reviewedAt: "",
    calendarPlans: [],
    keyNodes: [],
    conflictRecords: [],
    planStatus: "idle",
    planGeneratedBy: "",
    planConfirmedAt: "",
    lastEditedBy: ""
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function currentOperatorName() {
  return currentUser.value?.roleLabel || "指挥人员";
}

function saveFuelPacketPatch(patch) {
  saveFuelGasCalendar(activeGasType.value, {
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

function toDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseIsoParts(iso) {
  const [year, month, day] = (iso || TODAY_ISO).split("-").map(Number);
  return { year, month, day, iso: toIso(year, month, day) };
}

function formatDisplayDate(iso) {
  if (!iso) return "--";
  const { year, month, day } = parseIsoParts(iso);
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function compareIso(left, right) {
  return toDate(left).getTime() - toDate(right).getTime();
}

function addDays(iso, days) {
  const next = toDate(iso);
  next.setDate(next.getDate() + days);
  return toIso(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

function diffDays(startIso, endIso) {
  return Math.round((toDate(endIso).getTime() - toDate(startIso).getTime()) / 86400000);
}

function enumerateDates(startIso, endIso) {
  const result = [];
  let cursor = startIso;
  while (compareIso(cursor, endIso) <= 0) {
    result.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return result;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function formStartIso() {
  return toIso(engineerForm.startYear, engineerForm.startMonth, engineerForm.startDay);
}

function formEndIso() {
  return toIso(engineerForm.endYear, engineerForm.endMonth, engineerForm.endDay);
}

function ensureValidStartDate() {
  const maxDay = getDaysInMonth(engineerForm.startYear, engineerForm.startMonth);
  if (engineerForm.startDay > maxDay) engineerForm.startDay = maxDay;
  if (engineerForm.startDay < 1) engineerForm.startDay = 1;
}

function ensureValidEndDate() {
  const endYearOption = endYearOptions.value.find((item) => item.value === engineerForm.endYear);
  if (!endYearOption || endYearOption.disabled) {
    engineerForm.endYear = endYearOptions.value.find((item) => !item.disabled)?.value || engineerForm.startYear;
  }

  const monthOption = endMonthOptions.value.find((item) => item.value === engineerForm.endMonth);
  if (!monthOption || monthOption.disabled) {
    engineerForm.endMonth = endMonthOptions.value.find((item) => !item.disabled)?.value || engineerForm.startMonth;
  }

  const dayOption = endDayOptions.value.find((item) => item.value === engineerForm.endDay && !item.disabled);
  if (!dayOption) {
    engineerForm.endDay = endDayOptions.value.find((item) => !item.disabled)?.value || engineerForm.startDay;
  }

  if (compareIso(formEndIso(), formStartIso()) < 0) {
    engineerForm.endYear = engineerForm.startYear;
    engineerForm.endMonth = engineerForm.startMonth;
    engineerForm.endDay = engineerForm.startDay;
  }
}

function buildTaskInfoFromForm() {
  return {
    taskName: engineerForm.taskName,
    taskCode: engineerForm.taskCode,
    rocketModel: engineerForm.rocketModel,
    taskType: engineerForm.taskType,
    startDate: formStartIso(),
    endDate: formEndIso(),
    messageTemplate: engineerForm.messageTemplate
  };
}

function normalizePlanMeta(plan) {
  const constraintIds = Array.isArray(plan.constraintIds) && plan.constraintIds.length
    ? [...plan.constraintIds]
    : inferFuelConstraintIds(plan.name);
  const assignees = Array.isArray(plan.assignees) && plan.assignees.length
    ? [...plan.assignees]
    : inferFuelAssignees(plan.name);
  const equipment = Array.isArray(plan.equipment) && plan.equipment.length
    ? [...plan.equipment]
    : inferFuelEquipment(plan.name);

  return {
    ...plan,
    color: fuelPlanColor,
    constraintIds,
    assignees,
    equipment,
    workDays: Array.isArray(plan.workDays) && plan.workDays.length
      ? normalizePlanWorkDays({ ...plan, constraintIds, assignees, equipment }, plan.workDays)
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
  const dayIndex = Math.max(0, diffDays(plan.startDate, dateIso));
  const slots = ["08:00-10:00", "10:00-12:00", "14:00-16:00", "16:00-18:00"];
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
  if (Array.isArray(plan.workDays) && plan.workDays.length) {
    return normalizePlanWorkDays(plan, plan.workDays);
  }
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

function inferFuelConstraintIds(planName) {
  if (planName.includes("生产")) return ["skip-weekends", "device-maintenance-window", "personnel-busy"];
  if (planName.includes("拉运")) return ["skip-weekends", "resource-share-limit", "personnel-busy"];
  if (planName.includes("转运")) return ["skip-weekends", "device-maintenance-window", "resource-share-limit", "personnel-busy"];
  if (planName.includes("充气") || planName.includes("补气")) return ["skip-weekends", "skip-holidays", "personnel-busy"];
  if (planName.includes("供气车") || planName.includes("保障")) {
    return ["skip-weekends", "resource-share-limit", "personnel-busy", "key-node-lock"];
  }
  return ["skip-weekends"];
}

function inferFuelAssignees(planName) {
  if (planName.includes("生产")) return ["刘工", "孙工"];
  if (planName.includes("拉运")) return ["钱工", "刘工"];
  if (planName.includes("转运")) return ["钱工", "孙工"];
  if (planName.includes("充气") || planName.includes("补气")) return ["吴工", "赵工"];
  if (planName.includes("供气车") || planName.includes("保障")) return ["吴工", "李工"];
  return ["刘工"];
}

function inferFuelEquipment(planName) {
  if (planName.includes("生产")) return ["低温生产装置"];
  if (planName.includes("拉运")) return ["拉运车辆", "调度终端"];
  if (planName.includes("转运")) return ["低温槽车"];
  if (planName.includes("充气") || planName.includes("补气")) return ["充气工位", "压力检测终端"];
  if (planName.includes("供气车") || planName.includes("保障")) return ["供气车辆", "综合保障终端"];
  return ["综合保障终端"];
}

function buildShiftedPlan(plan, shiftDays, rangeStart, rangeEnd) {
  const duration = diffDays(plan.startDate, plan.endDate);
  let nextStart = addDays(plan.startDate, shiftDays);
  let nextEnd = addDays(plan.endDate, shiftDays);

  if (compareIso(nextStart, rangeStart) < 0) {
    nextStart = rangeStart;
    nextEnd = addDays(nextStart, duration);
  }

  if (compareIso(nextEnd, rangeEnd) > 0) {
    nextEnd = rangeEnd;
    nextStart = addDays(nextEnd, -duration);
  }

  const actualShiftDays = diffDays(plan.startDate, nextStart);
  return {
    ...plan,
    startDate: nextStart,
    endDate: nextEnd,
    workDays: Array.isArray(plan.workDays)
      ? plan.workDays.map((workDay) => ({ ...workDay, dateIso: addDays(workDay.dateIso, actualShiftDays) }))
      : plan.workDays
  };
}

function getConstraintName(constraintId) {
  const fallbackMap = {
    "c1": "避开休息日",
    "c2": "前置条件确认",
    "c3": "设备维修占用",
    "c8": "资源共享限制",
    "c9": "避开节假日",
    "c10": "双岗确认"
  };
  return catalog.constraints.find((item) => item.id === constraintId)?.name || fallbackMap[constraintId] || constraintId;
}

function collectOverlapDates(left, right) {
  const leftDates = getPlanWorkDateSet(left);
  const rightDates = getPlanWorkDateSet(right);
  return [...leftDates].filter((dateIso) => rightDates.has(dateIso)).sort(compareIso);
}

function rangesOverlap(left, right) {
  return collectOverlapDates(left, right).length > 0;
}

function collectSystemPlans(excludePlanId) {
  const result = [];
  const localIds = new Set(editablePlans.value.map((item) => item.id));

  editablePlans.value.forEach((plan) => {
    if (plan.id === excludePlanId) return;
    result.push({
      ...normalizePlanMeta(plan),
      sourceLabel: "当前气体计划"
    });
  });

  const savedFuelPlans = packet.value.gasPackets?.[activeGasType.value]?.calendarPlans || [];
  savedFuelPlans.forEach((plan) => {
    if (plan.id === excludePlanId || localIds.has(plan.id)) return;
    result.push({
      ...normalizePlanMeta(plan),
      sourceLabel: "特燃特气筹措流程"
    });
  });

  const flowTitleMap = {
    mission: "任务工作流程",
    launch: "发射日工作规划",
    repair: "装备维修流程",
    maintenance: "日常维护流程",
    custom: "自定义工作流程"
  };

  Object.entries(genericPlanningPackets.value || {}).forEach(([flowId, flowPacket]) => {
    const plans = flowPacket?.gasPackets?.[activeGasType.value]?.calendarPlans || [];
    plans.forEach((plan) => {
      result.push({
        ...normalizePlanMeta(plan),
        sourceLabel: flowTitleMap[flowId] || "其他流程"
      });
    });
  });

  return result;
}

function collectKeyNodesForConflictCheck() {
  const gasType = activeGasType.value;
  const nodes = [];
  globalKeyNodes.value
    .filter((node) => isGlobalKeyNodeApplicable(node, "fuel", gasType))
    .forEach((node) => {
      nodes.push({ ...node, sourceLabel: "全局关键节点", sourceType: "global", isGlobal: true });
    });
  (packet.value.gasPackets?.[gasType]?.keyNodes || keyNodes.value).forEach((node) => {
    if (node.isGlobal) return;
    nodes.push({ ...node, sourceLabel: "特燃特气筹措流程" });
  });
  const flowTitleMap = {
    mission: "任务工作流程",
    launch: "发射日工作规划",
    repair: "装备维修流程",
    maintenance: "日常维护流程",
    custom: "自定义工作流程"
  };
  Object.entries(genericPlanningPackets.value || {}).forEach(([flowId, flowPacket]) => {
    globalKeyNodes.value
      .filter((node) => isGlobalKeyNodeApplicable(node, flowId, gasType))
      .forEach((node) => {
        nodes.push({ ...node, sourceLabel: "全局关键节点", sourceType: "global", isGlobal: true });
      });
    (flowPacket?.gasPackets?.[gasType]?.keyNodes || []).forEach((node) => {
      nodes.push({ ...node, sourceLabel: flowTitleMap[flowId] || "其他流程" });
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
  if (direct) {
    return {
      beforePlan: leftPlan,
      afterPlan: rightPlan,
      beforeLabel: left.label,
      afterLabel: right.label,
      reason: direct[2]
    };
  }

  const reverse = beforeRules.find(([before, after]) => before === right.key && after === left.key);
  if (reverse) {
    return {
      beforePlan: rightPlan,
      afterPlan: leftPlan,
      beforeLabel: right.label,
      afterLabel: left.label,
      reason: reverse[2]
    };
  }

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
  const conflictPeopleText = conflictPlan
    ? describeList(conflictPeople.length ? conflictPeople : conflictPlan.assignees, "冲突计划未明确人员")
    : "";
  const conflictEquipmentText = conflictPlan
    ? describeList(conflictEquipment.length ? conflictEquipment : conflictPlan.equipment, "冲突计划未明确设备")
    : "";
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
    sequenceRelation: sequenceRelation
      ? `${sequenceRelation.beforePlan.name} -> ${sequenceRelation.afterPlan.name}`
      : "",
    sequenceReason,
    expectedOrderText,
    detailText,
    shortText,
    suggestion
  };
}

function buildConstraintConflicts(plan, shiftDays) {
  const conflicts = [];
  const activeConstraintIds = plan.constraintIds || [];
  const planDates = getPlanWorkDays(plan).map((item) => item.dateIso);
  const highlightedDates = planDates.map(formatDisplayDate);
  const weekendDates = planDates.filter((iso) => {
    const weekday = toDate(iso).getDay();
    return weekday === 0 || weekday === 6;
  });
  const holidayDates = planDates.filter((iso) => Boolean(holidayMap[iso]));

  if (weekendDates.length && activeConstraintIds.includes("skip-weekends")) {
    const dates = weekendDates.map(formatDisplayDate);
    conflicts.push({
      key: `${plan.id}-weekend`,
      type: getConstraintName("skip-weekends"),
      message: `计划“${plan.name}”调整后占用了双休日窗口：${dates.join("、")}`,
      suggestion: "接受提醒则恢复原位，忽略则保留调整并记录。",
      relatedFlow: "当前调整计划",
      relatedPlanName: plan.name,
      highlightPeople: [],
      highlightEquipment: [],
      highlightDates: dates,
      ...buildConflictDetail({
        type: getConstraintName("skip-weekends"),
        reason: "计划窗口落在双休日，岗位值守、人员到位和保障资源通常低于工作日配置。",
        currentPlan: plan,
        dates,
        suggestion: "接受提醒则恢复原位，忽略则保留调整并记录。"
      })
    });
  }

  if (holidayDates.length && activeConstraintIds.includes("skip-holidays")) {
    const dates = holidayDates.map(formatDisplayDate);
    conflicts.push({
      key: `${plan.id}-holiday`,
      type: getConstraintName("skip-holidays"),
      message: `计划“${plan.name}”调整后进入节假日窗口：${dates.join("、")}`,
      suggestion: "建议避开节假日，避免影响保障和岗位值守安排。",
      relatedFlow: "当前调整计划",
      relatedPlanName: plan.name,
      highlightPeople: [],
      highlightEquipment: [],
      highlightDates: dates,
      ...buildConflictDetail({
        type: getConstraintName("skip-holidays"),
        reason: "计划窗口进入节假日，容易影响人员值守、设备保障和现场协调响应。",
        currentPlan: plan,
        dates,
        suggestion: "建议避开节假日，避免影响保障和岗位值守安排。"
      })
    });
  }

  if (shiftDays < 0 && activeConstraintIds.includes("key-node-lock")) {
    conflicts.push({
      key: `${plan.id}-node-lock`,
      type: getConstraintName("key-node-lock"),
      message: `计划“${plan.name}”前移后可能影响锁定关键节点和前后补全顺序。`,
      suggestion: "建议恢复原排期，或由岗位人员确认后再保留本次调整。",
      relatedFlow: "当前调整计划",
      relatedPlanName: plan.name,
      highlightPeople: [...(plan.assignees || [])],
      highlightEquipment: [...(plan.equipment || [])],
      highlightDates: highlightedDates,
      ...buildConflictDetail({
        type: getConstraintName("key-node-lock"),
        reason: "该计划包含关键节点锁定约束，前移后可能使前置准备、质量确认或后续补全顺序被打破。",
        currentPlan: plan,
        dates: highlightedDates,
        currentPeople: [...(plan.assignees || [])],
        currentEquipment: [...(plan.equipment || [])],
        suggestion: "建议恢复原排期，或由岗位人员确认后再保留本次调整。"
      })
    });
  }

  if (activeConstraintIds.includes("personnel-busy") && (!plan.assignees || plan.assignees.length < 1)) {
    conflicts.push({
      key: `${plan.id}-staffing`,
      type: getConstraintName("personnel-busy"),
      message: `计划“${plan.name}”当前未分配有效执行人员，无法完成窗口占用校核。`,
      suggestion: "建议先补充执行人员，再保留本次调整。",
      relatedFlow: "当前调整计划",
      relatedPlanName: plan.name,
      highlightPeople: [...(plan.assignees || [])],
      highlightEquipment: [...(plan.equipment || [])],
      highlightDates: highlightedDates,
      ...buildConflictDetail({
        type: getConstraintName("personnel-busy"),
        reason: "当前计划未分配有效执行人员，无法校核具体岗位是否与其他工作同窗占用。",
        currentPlan: plan,
        dates: highlightedDates,
        currentPeople: [...(plan.assignees || [])],
        currentEquipment: [...(plan.equipment || [])],
        suggestion: "建议先补充执行人员，再保留本次调整。"
      })
    });
  }

  return conflicts;
}

function buildShiftedWorkDayPlan(plan, workDayId, shiftDays) {
  const workDays = getPlanWorkDays(plan);
  const nextWorkDays = workDays.map((workDay) =>
    workDay.id === workDayId
      ? {
          ...workDay,
          dateIso: addDays(workDay.dateIso, shiftDays),
          manualLocked: true,
          manualLockedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
          manualLockedReason: "用户拖拽调整"
        }
      : { ...workDay }
  );
  return recalculatePlanRangeFromWorkDays({
    ...plan,
    workDays: nextWorkDays
  });
}

function detectShiftConflicts(planId, shiftDays, workDayId = "") {
  const targetPlan = editablePlans.value.find((item) => item.id === planId);
  if (!targetPlan) return { candidate: null, conflicts: [] };

  const basePlan = normalizePlanMeta(targetPlan);
  const candidate = normalizePlanMeta(
    workDayId
      ? buildShiftedWorkDayPlan(basePlan, workDayId, shiftDays)
      : buildShiftedPlan(basePlan, shiftDays, taskInfo.value.startDate, taskInfo.value.endDate)
  );

  const conflicts = [...buildConstraintConflicts(candidate, shiftDays)].map((item) => ({ ...item, workDayId }));

  collectSystemPlans(planId).forEach((otherPlan) => {
    const sequenceRelation = inferSequenceRelation(candidate, otherPlan);
    if (isSequenceViolated(sequenceRelation)) {
      const dates = enumerateDates(
        compareIso(sequenceRelation.afterPlan.startDate, sequenceRelation.beforePlan.endDate) < 0
          ? sequenceRelation.afterPlan.startDate
          : sequenceRelation.beforePlan.endDate,
        sequenceRelation.beforePlan.endDate
      ).map(formatDisplayDate);
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-sequence`,
        workDayId,
        type: "前置/后置顺序冲突",
        message: `计划“${sequenceRelation.beforePlan.name}”通常应在“${sequenceRelation.afterPlan.name}”之前完成，本次调整后前后顺序被打破。`,
        suggestion: "建议恢复原排期，或将后置计划顺延到前置计划完成之后。",
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
          suggestion: "建议恢复原排期，或将后置计划顺延到前置计划完成之后。",
          sequenceRelation
        })
      });
    }

    if (!rangesOverlap(candidate, otherPlan)) return;

    const overlapDates = collectOverlapDates(candidate, otherPlan).map(formatDisplayDate);
    const sharedPeople = candidate.assignees.filter((name) => otherPlan.assignees.includes(name));
    if (sharedPeople.length) {
      const suggestion = "建议恢复当前调整，或改派其他人员后再保留本次修改。";
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-people`,
        workDayId,
        type: "人员冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}“${otherPlan.name}”存在同人同窗冲突。`,
        suggestion,
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: sharedPeople,
        highlightEquipment: [],
        highlightDates: overlapDates,
        ...buildConflictDetail({
          type: "人员冲突",
          reason: `${describeList(sharedPeople)}在同一日期窗口被两个计划同时占用，无法同时执行两项工作。`,
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates: overlapDates,
          currentPeople: sharedPeople,
          conflictPeople: sharedPeople,
          suggestion
        })
      });
    }

    const sharedEquipment = candidate.equipment.filter((name) => otherPlan.equipment.includes(name));
    if (sharedEquipment.length) {
      const type = candidate.constraintIds.some((item) => ["device-maintenance-window", "resource-share-limit"].includes(item))
        ? getConstraintName(
            candidate.constraintIds.find((item) => ["device-maintenance-window", "resource-share-limit"].includes(item))
          )
        : "设备冲突";
      const suggestion = "建议错峰执行，或切换备用设备后再继续。";
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-equipment`,
        workDayId,
        type,
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}“${otherPlan.name}”存在设备共占。`,
        suggestion,
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: [],
        highlightEquipment: sharedEquipment,
        highlightDates: overlapDates,
        ...buildConflictDetail({
          type,
          reason: `${describeList(sharedEquipment)}在同一日期窗口被两个计划同时占用，存在设备资源共占。`,
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates: overlapDates,
          currentEquipment: sharedEquipment,
          conflictEquipment: sharedEquipment,
          suggestion
        })
      });
    }

    if (candidate.name === otherPlan.name) {
      const suggestion = "建议重新排布窗口，避免重复占用执行时段。";
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-work`,
        workDayId,
        type: "工作冲突",
        message: `计划“${candidate.name}”与${otherPlan.sourceLabel}存在同名工作重叠。`,
        suggestion,
        relatedFlow: otherPlan.sourceLabel,
        relatedPlanName: otherPlan.name,
        highlightPeople: [...sharedPeople],
        highlightEquipment: [...sharedEquipment],
        highlightDates: overlapDates,
        ...buildConflictDetail({
          type: "工作冲突",
          reason: "两个同名工作在同一日期窗口重复排布，容易造成重复执行、职责边界不清或资源重复占用。",
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates: overlapDates,
          currentPeople: [...sharedPeople],
          currentEquipment: [...sharedEquipment],
          conflictPeople: [...sharedPeople],
          conflictEquipment: [...sharedEquipment],
          suggestion
        })
      });
    }
  });

  const unique = new Map();
  conflicts.forEach((item) => {
    if (!unique.has(item.key)) unique.set(item.key, item);
  });

  return {
    candidate,
    conflicts: [...unique.values()]
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

function detectSinglePlanConflicts(candidate, comparisonPlans = collectSystemPlans(candidate.id)) {
  const conflicts = [];
  const candidateWorkDates = getPlanWorkDateSet(candidate);
  collectSchedulingConstraints().keyNodes.forEach((node) => {
    if (candidateWorkDates.has(node.dateIso)) {
      conflicts.push(buildKeyNodeConflictDetail(candidate, node));
    }
  });

  comparisonPlans.forEach((otherPlan) => {
    const sequenceRelation = inferSequenceRelation(candidate, otherPlan);
    if (isSequenceViolated(sequenceRelation)) {
      const dates = [formatDisplayDate(sequenceRelation.afterPlan.startDate), formatDisplayDate(sequenceRelation.beforePlan.endDate)];
      conflicts.push({
        key: `${candidate.id}-${otherPlan.id}-generation-sequence`,
        type: "前置/后置顺序冲突",
        message: `计划“${sequenceRelation.beforePlan.name}”通常应在“${sequenceRelation.afterPlan.name}”之前完成。`,
        suggestion: "建议将后置计划顺延到前置计划完成之后。",
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
          suggestion: "建议将后置计划顺延到前置计划完成之后。",
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
        highlightDates: overlapDates,
        ...buildConflictDetail({
          type: "人员冲突",
          reason: `${describeList(sharedPeople)}在同一日期窗口被两个计划同时占用。`,
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates: overlapDates,
          currentPeople: sharedPeople,
          conflictPeople: sharedPeople,
          suggestion: "建议顺延当前计划或改派其他人员。"
        })
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
        highlightDates: overlapDates,
        ...buildConflictDetail({
          type: "设备冲突",
          reason: `${describeList(sharedEquipment)}在同一日期窗口被两个计划同时占用。`,
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates: overlapDates,
          currentEquipment: sharedEquipment,
          conflictEquipment: sharedEquipment,
          suggestion: "建议错峰执行或切换备用设备。"
        })
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
        highlightDates: overlapDates,
        ...buildConflictDetail({
          type: "工作冲突",
          reason: "两个同名工作在同一日期窗口重复排布。",
          currentPlan: candidate,
          conflictPlan: otherPlan,
          dates: overlapDates,
          currentPeople: sharedPeople,
          currentEquipment: sharedEquipment,
          conflictPeople: sharedPeople,
          conflictEquipment: sharedEquipment,
          suggestion: "建议重新排布窗口，避免重复占用执行时段。"
        })
      });
    }
  });

  const unique = new Map();
  conflicts.forEach((item) => {
    if (!unique.has(item.key)) unique.set(item.key, item);
  });
  return [...unique.values()];
}

function detectCrossFlowConflicts(candidatePlans) {
  return candidatePlans.flatMap((plan) => detectSinglePlanConflicts(plan, collectSystemPlans(plan.id)));
}

function optimizeCandidatePlans(candidatePlans) {
  let optimizedPlans = candidatePlans.map((plan) => normalizePlanMeta(plan));
  const steps = [];
  const constraints = collectSchedulingConstraints();

  optimizedPlans = optimizedPlans.map((plan) => {
    let candidate = normalizePlanMeta(plan);
    let conflicts = detectSinglePlanConflicts(candidate, collectSystemPlans(candidate.id));
    const initialConflictCount = conflicts.length;
    let shiftDays = 0;
    while (conflicts.length && shiftDays < 21) {
      candidate = normalizePlanMeta({
        ...candidate,
        startDate: addDays(candidate.startDate, 1),
        endDate: addDays(candidate.endDate, 1)
      });
      while (enumerateDates(candidate.startDate, candidate.endDate).some((dateIso) => isDateBlocked(dateIso, constraints))) {
        candidate = normalizePlanMeta({
          ...candidate,
          startDate: addDays(candidate.startDate, 1),
          endDate: addDays(candidate.endDate, 1)
        });
        shiftDays += 1;
      }
      shiftDays += 1;
      conflicts = detectSinglePlanConflicts(candidate, collectSystemPlans(candidate.id));
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
  editablePlans.value = plans.map((plan) => normalizePlanMeta(materializePlanWorkDays(normalizePlanMeta(plan))));
  localPlanStatus.value = "draft";
  calendarDirty.value = false;
  saveFuelGasCalendar(activeGasType.value, {
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
  clearPlanModal.open = true;
}

function closeClearPlanModal() {
  clearPlanModal.open = false;
}

function openSmartReorderModal() {
  smartReorderModal.open = true;
}

function closeSmartReorderModal() {
  smartReorderModal.open = false;
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
    relatedFlow: "当前流程",
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
      const nextWorkDay = nextDate
        ? { ...workDay, dateIso: nextDate }
        : { ...workDay };
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
    const nextRecords = appendConflictRecord(plans[0] || editablePlans.value[0], unresolved);
    saveFuelGasCalendar(activeGasType.value, {
      ...visibleGasPacket.value,
      calendarPlans: plans,
      conflictRecords: nextRecords,
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
  const gasPacket = visibleGasPacket.value || emptyGasPacket();
  editablePlans.value = [];
  localPlanStatus.value = "idle";
  calendarDirty.value = false;
  pendingConflictCandidate.value = null;
  pendingConflictOriginal.value = null;
  closeSmartOptimizeModal();
  closeConflictModal();
  saveFuelGasCalendar(activeGasType.value, {
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

function appendConflictRecord(plan, conflicts) {
  return [
    {
      id: `fuel-conflict-${Date.now()}`,
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
    ...conflictRecords.value
  ];
}

function buildPlanConflictSummary(plan, records = conflictRecords.value) {
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

function getPlanConflictRecordsForModal(plan, dateIso = "", workDayId = "", records = conflictRecords.value) {
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
        const dates = [...(item.conflictDates || []), ...(item.highlightDates || [])].map((dateText) => normalizeConflictDate(dateText));
        return dates.includes(dateIso) || (displayDate && [...(item.conflictDates || []), ...(item.highlightDates || [])].includes(displayDate));
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
      result.push({
        ...workDay,
        layoutLane: index,
        laneCount: sorted.length
      });
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
  conflictRecordModal.planId = row.id;
  conflictRecordModal.workDayId = workDay?.id || "";
  conflictRecordModal.dateIso = workDay?.dateIso || "";
  conflictRecordModal.open = true;
}

function closePlanConflictRecords() {
  conflictRecordModal.open = false;
  conflictRecordModal.planId = "";
  conflictRecordModal.workDayId = "";
  conflictRecordModal.dateIso = "";
}

function openWorkDayModal(row, dateIso, workDay = null) {
  if (!isCommander.value || suppressPlanClick.value) return;
  const plan = editablePlans.value.find((item) => item.id === row.id) || row;
  if (!plan || compareIso(dateIso, plan.startDate) < 0 || compareIso(dateIso, plan.endDate) > 0) return;
  const target = workDay || buildDefaultWorkDay(plan, dateIso, getPlanWorkDays(plan).length);
  workDayModal.open = true;
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
  const existing = getPlanWorkDays(row).find((workDay) => workDay.dateIso === dateIso);
  if (existing) return;
  openWorkDayModal(row, dateIso, null);
}

function closeWorkDayModal() {
  workDayModal.open = false;
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

function openConflictModal(planId, planName, shiftDays, conflicts, candidate = null, originalPlan = null, workDayId = "") {
  conflictModal.open = true;
  conflictModal.planId = planId;
  conflictModal.planName = planName;
  conflictModal.workDayId = workDayId;
  conflictModal.shiftDays = shiftDays;
  conflictModal.conflicts = conflicts;
  pendingConflictCandidate.value = candidate ? clone(candidate) : null;
  pendingConflictOriginal.value = originalPlan ? clone(originalPlan) : null;
  pendingConflictWasDirty.value = calendarDirty.value;
  pendingConflictPlanStatus.value = localPlanStatus.value;
}

function closeConflictModal() {
  conflictModal.open = false;
  conflictModal.planId = "";
  conflictModal.planName = "";
  conflictModal.workDayId = "";
  conflictModal.shiftDays = 0;
  conflictModal.conflicts = [];
  pendingConflictCandidate.value = null;
  pendingConflictOriginal.value = null;
}

function previewConflictCandidate(candidate) {
  if (!candidate) return;
  editablePlans.value = editablePlans.value.map((plan) => (plan.id === candidate.id ? clone(candidate) : clone(plan)));
  calendarDirty.value = true;
  localPlanStatus.value = "draft";
}

function acceptConflictReminder() {
  if (pendingConflictOriginal.value) {
    editablePlans.value = editablePlans.value.map((plan) =>
      plan.id === pendingConflictOriginal.value.id ? clone(pendingConflictOriginal.value) : clone(plan)
    );
    calendarDirty.value = pendingConflictWasDirty.value;
    localPlanStatus.value = pendingConflictPlanStatus.value;
  }
  closeConflictModal();
  showToast("已接受冲突提醒，本次拖拽已恢复到调整前位置。");
}

function ignoreConflictAndApply() {
  const { planId, shiftDays, conflicts, workDayId } = conflictModal;
  const result = detectShiftConflicts(planId, shiftDays, workDayId);
  const candidate = pendingConflictCandidate.value || result.candidate;
  if (candidate) {
    const updatedPlans = editablePlans.value.map((plan) => (plan.id === planId ? clone(candidate) : clone(plan)));
    const nextRecords = appendConflictRecord(candidate, conflicts.length ? conflicts : result.conflicts);
    const nextStatus = localPlanStatus.value === "executing" ? localPlanStatus.value : "draft";
    editablePlans.value = clone(updatedPlans);
    calendarDirty.value = true;
    localPlanStatus.value = nextStatus;
    saveFuelGasCalendar(activeGasType.value, {
      ...visibleGasPacket.value,
      calendarPlans: updatedPlans,
      conflictRecords: nextRecords,
      planStatus: nextStatus,
      lastEditedBy: currentUser.value?.roleLabel || "指挥人员"
    });
  }
  closeConflictModal();
  showToast("已忽略冲突提醒并保留当前调整，可点击冲突计划条查看记录。");
}

function applySystemFetch() {
  const start = parseIsoParts(systemPreset.startDate);
  const end = parseIsoParts(systemPreset.endDate);
  engineerForm.taskName = systemPreset.taskName;
  engineerForm.taskCode = systemPreset.taskCode;
  engineerForm.rocketModel = systemPreset.rocketModel;
  engineerForm.taskType = systemPreset.taskType;
  engineerForm.startYear = start.year;
  engineerForm.startMonth = start.month;
  engineerForm.startDay = start.day;
  engineerForm.endYear = end.year;
  engineerForm.endMonth = end.month;
  engineerForm.endDay = end.day;
  engineerForm.messageTemplate = systemPreset.messageTemplate;
  showToast("已从智慧发射场系统获取任务计划信息。");
}

function generateMeasurement() {
  if (!engineerForm.messageTemplate) {
    showToast("请先选择报文模板。");
    return;
  }
  const startIso = formStartIso();
  const endIso = formEndIso();

  if (compareIso(endIso, startIso) < 0) {
    showToast("任务结束时间不能早于任务开始时间。");
    return;
  }

  const taskInfoPayload = buildTaskInfoFromForm();
  const gasBase = {
    oxygen: 120,
    hydrogen: 104,
    nitrogen: 148,
    helium: 88
  };

  const scenarioFactor = {
    单次任务: 1,
    并行任务: 1.32,
    年度任务: 5.4,
    临时推迟或应急推迟任务: 1.15,
    临时保障任务: 0.84
  };

  const rows = Object.entries(gasBase).map(([gasType, baseValue], gasIndex) => {
    const factor = scenarioFactor[engineerForm.taskType] || 1;
    const demand = Math.round(baseValue * factor + gasIndex * 6);
    const production = Math.round(demand * 0.87);
    const guarantee = Math.round(demand * 1.14);
    const stock = Math.round(guarantee * 0.73);
    return {
      id: `${gasType}-${engineerForm.taskType}`,
      gasType,
      gasLabel: gasLabelMap[gasType],
      scene: engineerForm.taskType,
      demand,
      production,
      guarantee,
      stock
    };
  });

  saveFuelPlanningPacket({
    ...packet.value,
    status: "measured",
    lastUpdatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    submittedBy: currentUser.value?.roleLabel || "系统工程师",
    taskInfo: taskInfoPayload,
    reportRows: rows,
    gasPackets: {
      oxygen: emptyGasPacket(),
      hydrogen: emptyGasPacket(),
      nitrogen: emptyGasPacket(),
      helium: emptyGasPacket()
    }
  });

  showToast(`已完成${engineerForm.taskType}的各气体测算，仅生成当前任务类型的数据。`);
}

function dispatchPacket() {
  if (!canDispatch.value) return;
  dispatchConfirmModal.open = true;
}

function closeDispatchConfirmModal() {
  dispatchConfirmModal.open = false;
}

function confirmDispatchPacket() {
  if (!canDispatch.value) return;
  const next = clone(packet.value);
  next.status = "dispatched";
  next.lastUpdatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  Object.keys(next.gasPackets).forEach((gasType) => {
    next.gasPackets[gasType] = {
      ...emptyGasPacket(),
      dispatched: true
    };
  });
  saveFuelPlanningPacket(next);
  closeDispatchConfirmModal();
  showToast("任务下发成功");
}

function confirmReview() {
  if (!isCommander.value) return;
  markFuelGasReviewed(activeGasType.value, currentUser.value?.roleLabel || "指挥人员");
  showToast(`${activeGasLabel.value}系统已完成数据审签确认。`);
}

function openRejectReviewModal() {
  reviewRejectModal.reason = "";
  reviewRejectModal.error = "";
  reviewRejectModal.open = true;
}

function closeRejectReviewModal() {
  reviewRejectModal.open = false;
  reviewRejectModal.error = "";
}

function rejectReview() {
  if (!reviewRejectModal.reason.trim()) {
    reviewRejectModal.error = "请填写驳回理由。";
    return;
  }
  saveFuelReviewDecision(activeGasType.value, {
    status: "rejected",
    reason: reviewRejectModal.reason.trim(),
    reviewedBy: currentUser.value?.roleLabel || "指挥人员"
  });
  closeRejectReviewModal();
  showToast("已驳回任务数据");
}

function updateReportRow(rowId, field, value) {
  const next = clone(packet.value);
  next.reportRows = (next.reportRows || []).map((row) =>
    row.id === rowId ? { ...row, [field]: Number(value) } : row
  );
  saveFuelPlanningPacket(next);
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
    id: keyNodeModal.id || `fuel-key-node-${activeGasType.value}-${Date.now()}`,
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
  saveFuelPacketPatch({ keyNodes: nextNodes });
  closeKeyNodeModal();
  showToast(`已设置 ${formatDisplayDate(nextNode.dateIso)} 关键节点：${nextNode.title}`);
}

function removeKeyNode(nodeId = keyNodeModal.id) {
  if (!nodeId) return;
  saveFuelPacketPatch({ keyNodes: localKeyNodes.value.filter((item) => item.id !== nodeId) });
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

function shiftPlanAvoidingBlockedDates(plan, constraints, rangeEnd, maxShiftDays = 45) {
  let candidate = normalizePlanMeta(plan);
  let shiftedDays = 0;
  while (enumerateDates(candidate.startDate, candidate.endDate).some((dateIso) => isDateBlocked(dateIso, constraints))) {
    if (shiftedDays >= maxShiftDays) {
      return { plan: candidate, shiftedDays, failed: true, reason: "关键节点过多，无法在可用窗口内完成自动避让。" };
    }
    candidate = {
      ...candidate,
      startDate: addDays(candidate.startDate, 1),
      endDate: addDays(candidate.endDate, 1)
    };
    shiftedDays += 1;
  }
  if (rangeEnd && compareIso(candidate.endDate, rangeEnd) > 0) {
    return { plan: candidate, shiftedDays, failed: true, reason: "避让关键节点后超出任务结束时间。" };
  }
  return { plan: candidate, shiftedDays, failed: false, reason: shiftedDays ? `顺延 ${shiftedDays} 天避开关键节点。` : "" };
}

function applyKeyNodeAvoidance(plans, rangeEnd) {
  const constraints = collectSchedulingConstraints();
  const steps = [];
  const adjustedPlans = plans.map((plan) => {
    const result = shiftPlanAvoidingBlockedDates(plan, constraints, rangeEnd);
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
  const failed = steps.find((item) => item.reason?.includes("无法") || item.reason?.includes("超出"));
  return {
    plans: adjustedPlans,
    steps,
    failed,
    ok: !failed,
    reason: failed?.reason || ""
  };
}

function generateCalendarPlan() {
  if (!canGenerateCalendar.value) return;

  const startIso = taskInfo.value.startDate;
  const endIso = taskInfo.value.endDate;
  const prefix = gasPlanPrefixMap[activeGasType.value] || activeGasLabel.value;
  const planNames = [
    `${prefix}低温推进剂生产计划`,
    `${prefix}低温推进剂转运计划`,
    `${prefix}筹措拉运转运计划`,
    `${prefix}筹措转运计划`,
    `${prefix}气瓶充气补气计划`,
    `${prefix}供气车辆用气保障计划`
  ];

  const totalDays = Math.max(diffDays(startIso, endIso) + 1, 18);
  const cursorOffsets = [0, 3, 7, 11, 16, 21];
  const durations = [4, 3, 5, 4, 3, 6];

  const rawPlans = planNames.map((name, index) => {
    const duration = Math.min(durations[index], totalDays - 1);
    const desiredStartOffset = Math.min(cursorOffsets[index], Math.max(0, totalDays - duration - 1));
    const planStart = addDays(startIso, desiredStartOffset);
    let planEnd = addDays(planStart, duration);
    if (compareIso(planEnd, endIso) > 0) {
      planEnd = endIso;
    }
    return normalizePlanMeta({
      id: `${activeGasType.value}-plan-${index + 1}`,
      name,
      color: fuelPlanColor,
      startDate: planStart,
      endDate: planEnd
    });
  });

  const avoidance = applyKeyNodeAvoidance(rawPlans, endIso);
  const plans = avoidance.plans.map((plan) => normalizePlanMeta(plan));
  if (avoidance.failed) {
    showToast(avoidance.failed.reason || "关键节点避让失败，请调整关键节点或任务窗口。");
    return;
  }

  const conflicts = detectCrossFlowConflicts(plans);
  if (conflicts.length) {
    const optimization = optimizeCandidatePlans(plans);
    openSmartOptimizeModal(plans, conflicts, optimization);
    return;
  }

  applyGeneratedPlans(plans, []);
  showToast(`${activeGasLabel.value}日历计划已生成，当前为草稿状态，可继续人工调整。`);
}

function deletePlan(planId) {
  editablePlans.value = editablePlans.value.filter((item) => item.id !== planId);
  calendarDirty.value = true;
  localPlanStatus.value = "draft";
}

function beginPlanDrag(planId, workDayId, event) {
  if (!isCommander.value) return;
  const stripLayer = event.currentTarget.closest(".gantt-row-track") || event.currentTarget.closest(".calendar-strip-layer");
  if (!stripLayer) return;
  if (typeof event.currentTarget.setPointerCapture === "function" && event.pointerId !== undefined) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  dragState.active = true;
  dragState.moved = false;
  dragState.planId = planId;
  dragState.workDayId = workDayId || "";
  dragState.startX = event.clientX;
  dragState.deltaX = 0;
  dragState.dayWidth = stripLayer.clientWidth / (stripLayer.classList.contains("gantt-row-track") ? ganttVisibleRange.value.visibleDays : 7);
  dragState.pointerId = event.pointerId ?? null;
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
  const targetPlan = editablePlans.value.find((item) => item.id === planId);
  if (!targetPlan) return;
  const result = detectShiftConflicts(planId, shiftDays, workDayId);
  if (result.conflicts.length) {
    previewConflictCandidate(result.candidate);
    openConflictModal(planId, targetPlan.name, shiftDays, result.conflicts, result.candidate, targetPlan, workDayId);
    return;
  }
  if (workDayId && result.candidate) {
    editablePlans.value = editablePlans.value.map((plan) => (plan.id === planId ? normalizePlanMeta(result.candidate) : plan));
    calendarDirty.value = true;
    localPlanStatus.value = "draft";
    return;
  }
  shiftPlanByDays(planId, shiftDays);
}

function detachPointerDrag() {
  dragState.active = false;
  dragState.planId = "";
  dragState.workDayId = "";
  dragState.startX = 0;
  dragState.deltaX = 0;
  dragState.dayWidth = 0;
  dragState.moved = false;
  dragState.pointerId = null;
  window.removeEventListener("pointermove", onPlanPointerMove);
  window.removeEventListener("pointerup", onPlanPointerUp);
  window.removeEventListener("pointercancel", onPlanPointerUp);
}

function shiftPlanByDays(planId, shiftDays) {
  const rangeStart = taskInfo.value.startDate;
  const rangeEnd = taskInfo.value.endDate;

  editablePlans.value = editablePlans.value.map((plan) => {
    if (plan.id !== planId) return plan;
    return buildShiftedPlan(normalizePlanMeta(plan), shiftDays, rangeStart, rangeEnd);
  });

  calendarDirty.value = true;
  localPlanStatus.value = "draft";
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

  saveFuelGasCalendar(activeGasType.value, {
    ...visibleGasPacket.value,
    calendarPlans: editablePlans.value,
    planStatus: "confirmed",
    planGeneratedBy: currentUser.value?.roleLabel || "指挥人员",
    planConfirmedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    lastEditedBy: currentUser.value?.roleLabel || "指挥人员"
  });

  localPlanStatus.value = "confirmed";
  calendarDirty.value = false;
  showToast(`${activeGasLabel.value}计划调整已确认，系统工程师现在可以查看该计划。`);
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
  const totalDays = getDaysInMonth(year, month);
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
    const weekStart = weekCells[0].iso;
    const weekEnd = weekCells[6].iso;
    weeks.push({
      id: `${year}-${month}-week-${index / 7}`,
      cells: weekCells,
      strips: buildWeekStrips(plans, weekStart, weekEnd)
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
      segmentStart,
      segmentEnd,
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

function weekdayLabel(dayIndex) {
  return ["一", "二", "三", "四", "五", "六", "日"][dayIndex];
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
    ganttCenterDate.value = taskInfo.value.startDate || TODAY_ISO;
  }
}

function setGanttToday() {
  ganttCenterDate.value = TODAY_ISO;
}

function openGanttWorkDetail(work) {
  showToast(`${work.timeRange} ${work.actionLabel} / ${work.planName}`);
}
</script>

<template>
  <div class="fuel-page-stack">
    <div class="topbar">
      <div>
        <h1>特燃特气筹措工作规划</h1>
        <div class="muted">
          当前身份：{{ currentUser?.roleLabel || "未登录" }}
          <template v-if="!isEngineer"> / 气体类型：{{ activeGasLabel }}</template>
        </div>
      </div>
    </div>

    <template v-if="isEngineer">
      <section class="panel fuel-measure-layout">
        <div class="fuel-input-card">
          <div class="panel-head">
            <div>
              <h3>任务信息输入</h3>
              <div class="muted">填写任务信息，或从智慧发射场系统获取任务计划信息，再选择报文模板进行测算。</div>
            </div>
            <span class="chip active">系统工程师</span>
          </div>

          <div class="fuel-form-grid">
            <label class="field">
              <span>任务名称</span>
              <input v-model="engineerForm.taskName" type="text">
            </label>
            <label class="field">
              <span>任务代号</span>
              <input v-model="engineerForm.taskCode" type="text">
            </label>
            <label class="field">
              <span>HJ 型号</span>
              <input v-model="engineerForm.rocketModel" type="text">
            </label>
            <label class="field">
              <span>任务类型</span>
              <select v-model="engineerForm.taskType">
                <option v-for="item in taskTypeOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>

            <div class="field">
              <span>任务开始时间</span>
              <div class="triple-date-row">
                <select v-model="engineerForm.startYear">
                  <option
                    v-for="item in startYearOptions"
                    :key="`start-year-${item.value}`"
                    :value="item.value"
                  >
                    {{ item.value }}年
                  </option>
                </select>
                <select v-model="engineerForm.startMonth">
                  <option
                    v-for="item in startMonthOptions"
                    :key="`start-month-${item.value}`"
                    :value="item.value"
                  >
                    {{ item.value }}月
                  </option>
                </select>
                <select v-model="engineerForm.startDay">
                  <option
                    v-for="item in startDayOptions"
                    :key="`start-day-${item.value}`"
                    :value="item.value"
                  >
                    {{ item.value }}日
                  </option>
                </select>
              </div>
              <small class="muted">当前日期：{{ formatDisplayDate(TODAY_ISO) }}</small>
            </div>

            <div class="field">
              <span>任务结束时间</span>
              <div class="triple-date-row">
                <select v-model="engineerForm.endYear">
                  <option
                    v-for="item in endYearOptions"
                    :key="`end-year-${item.value}`"
                    :value="item.value"
                    :disabled="item.disabled"
                  >
                    {{ item.value }}年
                  </option>
                </select>
                <select v-model="engineerForm.endMonth">
                  <option
                    v-for="item in endMonthOptions"
                    :key="`end-month-${item.value}`"
                    :value="item.value"
                    :disabled="item.disabled"
                  >
                    {{ item.value }}月
                  </option>
                </select>
                <select v-model="engineerForm.endDay">
                  <option
                    v-for="item in endDayOptions"
                    :key="`end-day-${item.value}`"
                    :value="item.value"
                    :disabled="item.disabled"
                  >
                    {{ item.value }}日
                  </option>
                </select>
              </div>
              <small class="muted">任务结束时间不能早于任务开始时间。</small>
            </div>

            <label class="field">
              <span>报文模板</span>
              <select v-model="engineerForm.messageTemplate">
                <option v-for="item in templateOptions" :key="item" :value="item">{{ item }}</option>
              </select>
            </label>
          </div>

          <div class="button-row" style="margin-top: 16px;">
            <button class="ghost" type="button" @click="applySystemFetch">从智慧发射场系统获取任务计划信息</button>
            <button class="button" type="button" @click="generateMeasurement">点击测算</button>
            <button class="ghost" type="button" :disabled="!canDispatch" @click="dispatchPacket">下发</button>
          </div>
        </div>

        <div class="fuel-result-card">
          <div class="panel-head">
            <div>
              <h3>特燃特气数据测算结果</h3>
              <div class="muted">测算完成后仅生成当前任务类型的各气体报文表格，并按气体系统分别下发给审查员确认。</div>
            </div>
            <span class="chip">{{ packet.status === "dispatched" ? "已下发" : packet.status === "measured" ? "已测算" : "待测算" }}</span>
          </div>

          <table v-if="packet.reportRows.length" class="fuel-report-table">
            <thead>
              <tr>
                <th>气体类型</th>
                <th>任务场景</th>
                <th>需求量</th>
                <th>生产量</th>
                <th>保障量</th>
                <th>库存量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in packet.reportRows" :key="row.id">
                <td>{{ row.gasLabel }}</td>
                <td>{{ row.scene }}</td>
                <td><input class="table-number-input" type="number" :value="row.demand" @change="updateReportRow(row.id, 'demand', $event.target.value)"></td>
                <td><input class="table-number-input" type="number" :value="row.production" @change="updateReportRow(row.id, 'production', $event.target.value)"></td>
                <td><input class="table-number-input" type="number" :value="row.guarantee" @change="updateReportRow(row.id, 'guarantee', $event.target.value)"></td>
                <td><input class="table-number-input" type="number" :value="row.stock" @change="updateReportRow(row.id, 'stock', $event.target.value)"></td>
              </tr>
            </tbody>
          </table>

          <div v-else class="notice-card">
            <span>尚未完成数据测算，请先填写任务信息并点击“测算”。</span>
            <span class="accent">待测算</span>
          </div>

          <div class="review-progress-grid" v-if="packet.reportRows.length">
            <div v-for="summary in engineerPlanSummaries" :key="summary.gasType" class="summary-line">
              <span>{{ summary.gasLabel }}系统</span>
              <strong>
                {{
                  summary.planStatus === "confirmed"
                    ? `已回传计划 / ${summary.planConfirmedAt || "待显示"}`
                    : summary.planStatus === "draft"
                      ? "已生成草稿，待指挥员确认"
                      : summary.reviewed
                        ? `已审查确认 / ${summary.reviewedBy}`
                        : packet.status === "dispatched"
                          ? "已下发待确认"
                          : "未下发"
                }}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section class="panel" v-if="engineerPlanSummaries.some((item) => item.plans.length)">
        <div class="panel-head">
          <div>
            <h3>各气体指挥员回传计划</h3>
            <div class="muted">指挥员完成日历计划调整并确认后，系统工程师可在此查看各气体系统回传的正式计划。</div>
          </div>
        </div>

        <div class="fuel-return-grid">
          <div v-for="summary in engineerPlanSummaries" :key="`return-${summary.gasType}`" class="fuel-return-card">
            <div class="fuel-return-head">
              <strong>{{ summary.gasLabel }}系统</strong>
              <span class="chip" :class="{ active: summary.planStatus === 'confirmed' }">
                {{ summary.planStatus === "confirmed" ? "已确认" : summary.planStatus === "draft" ? "草稿中" : "未生成" }}
              </span>
            </div>

            <div class="summary-line">
              <span>审查确认</span>
              <strong>{{ summary.reviewed ? `${summary.reviewedBy} / ${summary.reviewedAt}` : "未确认" }}</strong>
            </div>
            <div class="summary-line">
              <span>计划确认时间</span>
              <strong>{{ summary.planConfirmedAt || "待指挥员确认后回传" }}</strong>
            </div>

            <div v-if="summary.planStatus === 'confirmed' && summary.plans.length" class="fuel-return-list">
              <div v-for="plan in summary.plans" :key="plan.id" class="fuel-return-item">
                <span class="fuel-return-color" :style="{ background: plan.color }"></span>
                <div>
                  <strong>{{ plan.name }}</strong>
                  <small>{{ formatDisplayDate(plan.startDate) }} - {{ formatDisplayDate(plan.endDate) }}</small>
                </div>
              </div>
            </div>
            <div v-else class="notice-card">
              <span>{{ summary.planStatus === "draft" ? "该气体系统已生成草稿计划，待指挥员确认后回传。" : "该气体系统还没有回传日历计划。" }}</span>
              <span class="warning">{{ summary.planStatus === "draft" ? "草稿中" : "待回传" }}</span>
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="panel fuel-role-summary">
        <div class="panel-head">
          <div>
            <h3>任务信息与测算数据</h3>
            <div class="muted">系统工程师完成测算并下发后，指挥人员和操作人员可查看对应气体的测算数据与任务信息。</div>
          </div>
          <span class="chip active">{{ currentUser?.roleLabel }} / {{ activeGasLabel }}</span>
        </div>

        <div v-if="!packetReady" class="notice-card">
          <span>未完成数据测算，请等待系统工程师完成任务信息录入、测算并下发。</span>
          <span class="warning">未完成数据测算</span>
        </div>

        <template v-else>
          <div class="fuel-task-meta-grid">
            <div class="summary-line"><span>任务名称</span><strong>{{ taskInfo.taskName }}</strong></div>
            <div class="summary-line"><span>任务代号</span><strong>{{ taskInfo.taskCode }}</strong></div>
            <div class="summary-line"><span>HJ 型号</span><strong>{{ taskInfo.rocketModel }}</strong></div>
            <div class="summary-line"><span>任务类型</span><strong>{{ taskInfo.taskType }}</strong></div>
            <div class="summary-line"><span>任务开始时间</span><strong>{{ formatDisplayDate(taskInfo.startDate) }}</strong></div>
            <div class="summary-line"><span>任务结束时间</span><strong>{{ formatDisplayDate(taskInfo.endDate) }}</strong></div>
          </div>

          <table class="fuel-report-table">
            <thead>
              <tr>
                <th>气体类型</th>
                <th>任务场景</th>
                <th>需求量</th>
                <th>生产量</th>
                <th>保障量</th>
                <th>库存量</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleReportRows" :key="row.id">
                <td>{{ row.gasLabel }}</td>
                <td>{{ row.scene }}</td>
                <td>{{ row.demand }}</td>
                <td>{{ row.production }}</td>
                <td>{{ row.guarantee }}</td>
                <td>{{ row.stock }}</td>
              </tr>
            </tbody>
          </table>

          <div class="button-row" style="margin-top: 16px;">
            <button v-if="isCommander && !visibleGasPacket.reviewed" class="ghost" type="button" @click="confirmReview">审查确认</button>
            <button v-if="isCommander && !visibleGasPacket.reviewed" class="danger-ghost" type="button" @click="openRejectReviewModal">驳回</button>
            <button v-if="isCommander" class="button" type="button" :disabled="!canGenerateCalendar" @click="generateCalendarPlan">生成计划</button>
            <button v-if="isCommander && editablePlans.length" class="ghost" type="button" @click="confirmCalendarAdjustments">确认调整</button>
            <button v-if="isCommander && editablePlans.length" class="ghost" type="button" @click="openSmartReorderModal">智能重排</button>
            <button v-if="isCommander && editablePlans.length" class="danger-ghost" type="button" @click="openClearPlanModal">清空计划</button>
            <span class="chip" v-if="visibleGasPacket.reviewStatus === 'rejected'">已驳回：{{ visibleGasPacket.reviewRejectReason }}</span>
            <span class="chip" v-else-if="visibleGasPacket.reviewed">已确认：{{ visibleGasPacket.reviewedBy }} / {{ visibleGasPacket.reviewedAt }}</span>
            <span class="chip" v-else>状态：{{ packet.status === "dispatched" ? "已下发待确认" : "未下发" }}</span>
            <span class="chip" v-if="editablePlans.length" :class="{ active: localPlanStatus === 'confirmed' }">计划状态：{{ localPlanStatus === "confirmed" ? "已确认" : "草稿" }}</span>
          </div>
        </template>
      </section>

      <section class="panel smart-assist-panel">
        <div class="panel-head">
          <div>
            <h3>智能流程辅助管理配置项</h3>
            <div class="muted">可提前设置关键节点，生成计划时自动避让；也可在日历日期上点击编辑关键节点。</div>
          </div>
          <button class="button small" type="button" @click="openKeyNodeModal(taskInfo.startDate || TODAY_ISO)">新增关键节点</button>
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

      <section class="panel" v-if="editablePlans.length">
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
                    <button v-if="isCommander" class="strip-delete" type="button" @click.stop="deletePlan(row.id)">×</button>
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

      <section class="panel" v-else-if="packetReady">
        <div class="notice-card">
          <span>{{ isCommander ? "请先完成审查确认，再点击“生成计划”。" : "当前还没有生成日历计划，请等待对应气体指挥员完成计划编排。" }}</span>
          <span class="accent">待生成</span>
        </div>
      </section>

      <section class="panel" v-if="false && conflictRecords.length">
        <div class="panel-head">
          <div>
            <h3>冲突提醒记录</h3>
            <div class="muted">拖拽时选择忽略的冲突会记录在这里，便于后续复核和人工协调。</div>
          </div>
          <span class="chip">已记录 {{ conflictRecords.length }} 条</span>
        </div>

        <div class="log-list">
          <div v-for="record in conflictRecords" :key="record.id" class="rule-entry">
            <div class="rule-entry-head">
              <div class="rule-entry-title">
                <strong>{{ record.planName }}</strong>
                <span class="rule-entry-subtext">{{ record.createdAt }} · {{ record.dateRange }}</span>
              </div>
              <span class="chip warning">已忽略</span>
            </div>
            <div class="detail-list">
              <div v-for="item in record.conflicts" :key="`${record.id}-${item.type}-${item.message}`" class="notice-card">
                <div class="conflict-detail-block">
                  <strong>{{ item.type }}：{{ item.shortText || item.message }}</strong>
                  <span class="conflict-detail-text">{{ item.detailText || item.message }}</span>
                  <span v-if="item.expectedOrderText" class="conflict-order-text">{{ item.expectedOrderText }}</span>
                </div>
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

    <div class="modal-overlay" :class="{ open: clearPlanModal.open }" @click.self="closeClearPlanModal">
      <div class="modal-card clear-plan-modal">
        <h3>确认清空当前计划？</h3>
        <p class="muted">清空后会移除当前页面已生成的计划条和冲突记录，但会保留关键节点、历史库、规则库和当前输入条件。</p>
        <div class="notice-card">
          <span>{{ activeGasLabel }}系统当前流程计划将被清空。</span>
          <span class="warning">不可撤销</span>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeClearPlanModal">取消</button>
          <button class="danger-ghost" type="button" @click="confirmClearGeneratedPlans">确认清空</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: smartReorderModal.open }" @click.self="closeSmartReorderModal">
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

    <div class="modal-overlay" :class="{ open: workDayModal.open }" @click.self="closeWorkDayModal">
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

    <div class="modal-overlay" :class="{ open: conflictRecordModal.open }" @click.self="closePlanConflictRecords">
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

    <div class="modal-overlay live-conflict-overlay" :class="{ open: conflictModal.open }">
      <div class="modal-card live-conflict-modal">
        <div class="live-conflict-head">
          <div>
            <h3>拖拽冲突提醒</h3>
            <div class="muted">计划“{{ conflictModal.planName }}”调整后检测到冲突。接受提醒则复原，忽略则保留调整并记录。</div>
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
            <span class="muted">{{ item.suggestion }}</span>
          </div>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="acceptConflictReminder">接受提醒并复原</button>
          <button class="button" type="button" @click="ignoreConflictAndApply">忽略提醒并继续调整</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: dispatchConfirmModal.open }" @click.self="closeDispatchConfirmModal">
      <div class="modal-card confirm-dialog">
        <h3>确定下发该任务吗？</h3>
        <p class="muted">下发后各气体系统指挥人员将可以审签并生成任务规划。</p>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeDispatchConfirmModal">取消</button>
          <button class="button" type="button" @click="confirmDispatchPacket">确认下发</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: reviewRejectModal.open }" @click.self="closeRejectReviewModal">
      <div class="modal-card confirm-dialog">
        <h3>驳回任务数据</h3>
        <p class="muted">请输入驳回理由，系统工程师可据此修改后重新下发。</p>
        <label class="field">
          <span>驳回理由</span>
          <textarea v-model="reviewRejectModal.reason" rows="4" placeholder="请输入异常说明或修改意见"></textarea>
          <small v-if="reviewRejectModal.error" class="field-error">{{ reviewRejectModal.error }}</small>
        </label>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeRejectReviewModal">取消</button>
          <button class="danger-ghost" type="button" @click="rejectReview">确认驳回</button>
        </div>
      </div>
    </div>
  </div>
</template>


