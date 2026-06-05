<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { usePlatformState } from "../composables/usePlatformState";

const router = useRouter();
const {
  currentUser,
  executedPlans,
  fuelPlanningPacket,
  genericPlanningPackets,
  globalKeyNodes,
  customMonitoringWorks,
  workRuleLibrary,
  workActionOverrides,
  fuelPlanningToday,
  showToast,
  catalog,
  saveExecutedPlan,
  removeExecutedPlan,
  saveFuelGasCalendar,
  saveGenericFlowCalendar,
  saveGlobalKeyNode,
  removeGlobalKeyNode,
  deleteCalendarPlan,
  deleteCalendarWorkDay,
  addMonitoringWork,
  saveWorkRule,
  saveWorkActionOverride
} = usePlatformState();

const TODAY_ISO = fuelPlanningToday || "2026-04-18";
const evidenceStorageKey = "screen-vue-monitoring-work-evidence";
const workProgressStorageKey = "screen-vue-monitoring-work-progress";

const gasLabelMap = {
  all: "全部气体",
  oxygen: "氧气",
  hydrogen: "氢气",
  nitrogen: "氮气",
  helium: "氦气"
};

const flowMetaMap = {
  fuel: {
    title: "特燃特气筹措流程",
    color: "#60e3ff"
  },
  mission: {
    title: "任务工作流程",
    color: "#f7ec5d"
  },
  launch: {
    title: "发射日工作规划",
    color: "#ffb067"
  },
  repair: {
    title: "装备维修流程",
    color: "#ff8be2"
  },
  maintenance: {
    title: "日常维护流程",
    color: "#83f0c1"
  },
  custom: {
    title: "自定义工作流程",
    color: "#7da1ff"
  }
};

const weatherTemplates = [
  "今天天气：台风 | 气象预警：请注意在线供气切换窗口",
  "今天天气：多云 | 气象播报：风速平稳，按常规窗口执行",
  "今天天气：阵风增强 | 气象预警：请关注在线供气切换窗口",
  "今天天气：晴转多云 | 气象播报：适宜执行常规保障任务"
];

const monitorGanttZoomLevels = [
  { level: 0, label: "季度", days: 90, axisUnit: "day" },
  { level: 1, label: "月", days: 31, axisUnit: "day" },
  { level: 2, label: "旬", days: 10, axisUnit: "day" },
  { level: 3, label: "周", days: 7, axisUnit: "day" },
  { level: 4, label: "三日", days: 3, axisUnit: "day" },
  { level: 5, label: "单日", days: 1, axisUnit: "day" }
];
const monitorGanttBaseRowHeight = 58;
const monitorGanttLaneHeight = 24;
const monitorGanttLaneTopOffset = 22;

const state = reactive({
  selectedGas: currentUser.value?.role === "engineer" ? "all" : currentUser.value?.gasType || "oxygen",
  dayModalOpen: false,
  workModalOpen: false,
  historyModalOpen: false,
  planDetailModalOpen: false,
  historyCompareModalOpen: false,
  selectedDayIso: "",
  selectedWorkId: "",
  selectedHistoryId: "",
  selectedPlanDetailId: "",
  selectedCompareHistoryId: "",
  selectedComparePlanId: "",
  comparePlanSearchKeyword: "",
  selectedPersonName: "",
  calendarFilterStartDate: "",
  calendarFilterEndDate: "",
  monitoringSubTab: "calendar",
  assessmentTab: "risk",
  expandedFlowIds: [],
  addWorkModalOpen: false,
  personScheduleModalOpen: false,
  planConflictRecordModalOpen: false,
  selectedConflictPlanId: "",
  selectedConflictDateIso: "",
  selectedConflictWorkDayId: "",
  scheduleKeyNodeModalOpen: false,
  scheduleKeyNodeError: "",
  confirmModalOpen: false,
  confirmModalTitle: "",
  confirmModalMessage: "",
  confirmModalAction: ""
});

const addWorkForm = reactive({
  mode: "library",
  sourceRuleId: "",
  actionLabel: "",
  dateIso: "",
  timeRange: "08:00-10:00",
  planId: "",
  personnelText: "",
  position: "",
  equipmentText: "",
  risksText: "",
  constraintsText: "",
  syncToRuleLibrary: true
});

const monitorConflictModal = reactive({
  open: false,
  planId: "",
  planName: "",
  workDayId: "",
  shiftDays: 0,
  conflicts: []
});

const dragState = reactive({
  pending: false,
  active: false,
  moved: false,
  planId: "",
  workDayId: "",
  startX: 0,
  deltaX: 0,
  dayWidth: 0,
  clickDateIso: "",
  pointerId: null
});

const evidenceStore = ref(readStorage(evidenceStorageKey, {}));
const workProgressStore = ref(readStorage(workProgressStorageKey, {}));
const monitorGanttCenterDate = ref(TODAY_ISO);
const monitorGanttZoomLevel = ref(2);
const monitorGanttRenderKey = ref(0);
const monitorGanttInitialized = ref(false);
const suppressMonitorPlanClick = ref(false);

watch(
  () => currentUser.value,
  (user) => {
    if (!user) return;
    state.selectedGas = user.role === "engineer" ? state.selectedGas || "all" : user.gasType || "oxygen";
  },
  { immediate: true }
);

const gasOptions = computed(() => {
  if (currentUser.value?.role === "engineer") {
    return ["all", "oxygen", "hydrogen", "nitrogen", "helium"];
  }
  return [currentUser.value?.gasType || "oxygen"];
});

function getSelectedGasTypes() {
  return state.selectedGas === "all" ? ["oxygen", "hydrogen", "nitrogen", "helium"] : [state.selectedGas];
}

function getPlanWorkKeys(plan) {
  if (plan.sourceType === "launch") {
    return (plan.scheduleRows || []).map((row) => `${plan.id}-${row.id}`);
  }
  return enumerateDates(plan.startDate, plan.endDate).map((dateIso) => `${plan.id}-${dateIso}`);
}

function getPlanCompletionMeta(plan) {
  const workKeys = getPlanWorkKeys(plan);
  if (!workKeys.length) {
    return {
      totalCount: 0,
      completedCount: 0,
      progress: 0,
      complete: false,
      status: "未开始"
    };
  }

  const progressValues = workKeys.map((key) => workProgressStore.value[key]?.progress || 0);
  const completedCount = progressValues.filter((value) => value >= 100).length;
  const progress = Math.round(progressValues.reduce((sum, value) => sum + value, 0) / workKeys.length);
  const complete = completedCount === workKeys.length;

  return {
    totalCount: workKeys.length,
    completedCount,
    progress,
    complete,
    status: complete ? "已完成" : progress > 0 ? "进行中" : "未开始"
  };
}

function buildNormalizedPlans(gasTypes) {
  const result = [];

  gasTypes.forEach((gasType) => {
    const gasLabel = gasLabelMap[gasType];

    const fuelPacket = fuelPlanningPacket.value?.gasPackets?.[gasType];
    if (fuelPacket?.calendarPlans?.length) {
      fuelPacket.calendarPlans.forEach((plan) => {
        result.push({
          id: `fuel-${gasType}-${plan.id}`,
          flowId: "fuel",
          flowTitle: flowMetaMap.fuel.title,
          gasType,
          gasLabel,
          status: fuelPacket.planStatus || "draft",
          name: plan.name,
          startDate: plan.startDate,
          endDate: plan.endDate,
          color: flowMetaMap.fuel.color,
          sourceType: "calendar",
          sourcePlan: plan
        });
      });
    }

    ["mission", "repair", "maintenance", "custom"].forEach((flowId) => {
      const packet = genericPlanningPackets.value?.[flowId]?.gasPackets?.[gasType];
      if (!packet?.calendarPlans?.length) return;
      packet.calendarPlans.forEach((plan) => {
        result.push({
          id: `${flowId}-${gasType}-${plan.id}`,
          flowId,
          flowTitle: flowMetaMap[flowId].title,
          gasType,
          gasLabel,
          status: packet.planStatus || "draft",
          name: plan.name,
          startDate: plan.startDate,
          endDate: plan.endDate,
          color: flowMetaMap[flowId].color,
          sourceType: "calendar",
          sourcePlan: plan
        });
      });
    });

    const launchPacket = genericPlanningPackets.value?.launch?.gasPackets?.[gasType];
    if (launchPacket?.launchDay && launchPacket?.scheduleRows?.length) {
      result.push({
        id: `launch-${gasType}-${launchPacket.launchDay}`,
        flowId: "launch",
        flowTitle: flowMetaMap.launch.title,
        gasType,
        gasLabel,
        status: launchPacket.planStatus || "confirmed",
        name: `${gasLabel}发射日工作规划`,
        startDate: launchPacket.launchDay,
        endDate: launchPacket.launchDay,
        color: flowMetaMap.launch.color,
        sourceType: "launch",
        weatherNote: launchPacket.weatherNote || "",
        strategyText: launchPacket.strategyText || "",
        rocketModel: launchPacket.rocketModel || "",
        launchTime: launchPacket.launchTime || "",
        scheduleRows: launchPacket.scheduleRows || []
      });
    }
  });

  return result
    .sort((left, right) => compareIso(left.startDate, right.startDate))
    .map((plan) => ({
      ...plan,
      completionMeta: getPlanCompletionMeta(plan)
    }));
}

const normalizedPlans = computed(() => buildNormalizedPlans(getSelectedGasTypes()));

const gasCalendarSnapshots = computed(() =>
  ["oxygen", "hydrogen", "nitrogen", "helium"].map((gasType) => {
    const plans = buildNormalizedPlans([gasType]);
    const allCompleted = plans.length > 0 && plans.every((plan) => plan.completionMeta.complete);
    const historySignature = plans
      .map((plan) => `${plan.id}:${plan.startDate}:${plan.endDate}:${plan.completionMeta.progress}:${plan.completionMeta.completedCount}`)
      .join("|");

    return {
      gasType,
      gasLabel: gasLabelMap[gasType],
      plans,
      totalPlans: plans.length,
      completedPlans: plans.filter((plan) => plan.completionMeta.complete).length,
      allCompleted,
      historySignature,
      dateRange:
        plans.length > 0
          ? `${formatDisplayDate(plans[0].startDate)} - ${formatDisplayDate(
              plans.reduce((latest, plan) => (compareIso(plan.endDate, latest) > 0 ? plan.endDate : latest), plans[0].endDate)
            )}`
          : ""
    };
  })
);

const monitoringHistoryLibrary = computed(() =>
  (executedPlans.value || [])
    .filter(
      (item) =>
        item.kind === "monitoring-calendar-history" &&
        (state.selectedGas === "all" || item.gasType === state.selectedGas)
    )
    .sort((left, right) => String(right.archivedAt || "").localeCompare(String(left.archivedAt || "")))
);

const selectedHistoryEntry = computed(
  () => monitoringHistoryLibrary.value.find((item) => item.id === state.selectedHistoryId) || null
);

const historyCalendarMonths = computed(() => {
  if (!selectedHistoryEntry.value?.plans?.length) return [];

  const normalizedHistoryPlans = selectedHistoryEntry.value.plans.map((plan) => ({
    ...plan,
    gasType: selectedHistoryEntry.value.gasType,
    gasLabel: selectedHistoryEntry.value.gasLabel,
    flowId: "history",
    flowTitle: plan.flowTitle || selectedHistoryEntry.value.title || "历史归档流程",
    status: "completed",
    sourceType: "history"
  }));

  const startIso = normalizedHistoryPlans.reduce(
    (min, item) => (compareIso(item.startDate, min) < 0 ? item.startDate : min),
    normalizedHistoryPlans[0].startDate
  );
  const endIso = normalizedHistoryPlans.reduce(
    (max, item) => (compareIso(item.endDate, max) > 0 ? item.endDate : max),
    normalizedHistoryPlans[0].endDate
  );

  return buildCalendarMonths(startIso, endIso, normalizedHistoryPlans);
});

const monitoringSummary = computed(() => {
  const byFlow = Object.keys(flowMetaMap).map((flowId) => {
    const plans = normalizedPlans.value.filter((plan) => plan.flowId === flowId);
    return {
      flowId,
      title: flowMetaMap[flowId].title,
      count: plans.length
    };
  });

  return {
    totalPlans: normalizedPlans.value.length,
    activeDays: new Set(
      normalizedPlans.value.flatMap((plan) => enumerateDates(plan.startDate, plan.endDate))
    ).size,
    byFlow
  };
});

const monitoringFlowGroups = computed(() =>
  Object.keys(flowMetaMap).map((flowId) => {
    const plans = normalizedPlans.value
      .filter((plan) => plan.flowId === flowId)
      .sort((left, right) => {
        const dateCompare = compareIso(left.startDate, right.startDate);
        if (dateCompare !== 0) return dateCompare;
        return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
      });
    const conflictCount = plans.filter((plan) => buildPlanConflictSummary(plan).hasConflict).length;

    return {
      flowId,
      title: flowMetaMap[flowId].title,
      color: flowMetaMap[flowId].color,
      plans,
      count: plans.length,
      conflictCount,
      completedCount: plans.filter((plan) => plan.completionMeta?.complete).length
    };
  })
);

const monitoringConflictRecords = computed(() => {
  const visibleGasTypes = state.selectedGas === "all" ? ["oxygen", "hydrogen", "nitrogen", "helium"] : [state.selectedGas];
  const records = [];

  visibleGasTypes.forEach((gasType) => {
    const fuelRecords = fuelPlanningPacket.value?.gasPackets?.[gasType]?.conflictRecords || [];
    fuelRecords.forEach((record) => {
      records.push({
        ...record,
        gasType,
        gasLabel: gasLabelMap[gasType],
        sourceLabel: flowMetaMap.fuel.title
      });
    });

    ["mission", "launch", "repair", "maintenance", "custom"].forEach((flowId) => {
      const flowRecords = genericPlanningPackets.value?.[flowId]?.gasPackets?.[gasType]?.conflictRecords || [];
      flowRecords.forEach((record) => {
        records.push({
          ...record,
          gasType,
          gasLabel: gasLabelMap[gasType],
          sourceLabel: flowMetaMap[flowId].title
        });
      });
    });
  });

  return records.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
});

const monitoringKeyNodes = computed(() => {
  const nodes = [];
  getSelectedGasTypes().forEach((gasType) => {
    globalKeyNodes.value
      .filter((node) => isGlobalKeyNodeApplicable(node, "fuel", gasType))
      .forEach((node) => {
        nodes.push({
          ...node,
          gasType,
          gasLabel: gasLabelMap[gasType],
          sourceLabel: "全局关键节点",
          sourceType: "global",
          isGlobal: true
        });
      });

    const fuelNodes = fuelPlanningPacket.value?.gasPackets?.[gasType]?.keyNodes || [];
    fuelNodes.forEach((node) => {
      nodes.push({
        ...node,
        gasType,
        gasLabel: gasLabelMap[gasType],
        sourceLabel: flowMetaMap.fuel.title
      });
    });

    Object.keys(flowMetaMap)
      .filter((flowId) => flowId !== "fuel")
      .forEach((flowId) => {
        globalKeyNodes.value
          .filter((node) => isGlobalKeyNodeApplicable(node, flowId, gasType))
          .forEach((node) => {
            nodes.push({
              ...node,
              gasType,
              gasLabel: gasLabelMap[gasType],
              sourceLabel: "全局关键节点",
              sourceType: "global",
              isGlobal: true
            });
          });
        const flowNodes = genericPlanningPackets.value?.[flowId]?.gasPackets?.[gasType]?.keyNodes || [];
        flowNodes.forEach((node) => {
          nodes.push({
            ...node,
            gasType,
            gasLabel: gasLabelMap[gasType],
            sourceLabel: flowMetaMap[flowId].title
          });
        });
      });
  });
  const unique = new Map();
  nodes.forEach((node) => {
    const key = node.isGlobal ? `global-${node.gasType}-${node.id}` : `${node.sourceLabel}-${node.gasType}-${node.id}`;
    if (!unique.has(key)) unique.set(key, node);
  });
  return [...unique.values()];
});

function isGlobalKeyNodeApplicable(node, flowId, gasType) {
  const flows = Array.isArray(node.scopeFlowIds) && node.scopeFlowIds.length ? node.scopeFlowIds : ["all"];
  const gases = Array.isArray(node.gasTypes) && node.gasTypes.length ? node.gasTypes : ["all"];
  return (flows.includes("all") || flows.includes(flowId)) && (gases.includes("all") || gases.includes(gasType));
}

const monitoringKeyNodesByDate = computed(() =>
  monitoringKeyNodes.value.reduce((lookup, node) => {
    if (!node.dateIso) return lookup;
    lookup[node.dateIso] = [...(lookup[node.dateIso] || []), node];
    return lookup;
  }, {})
);

const selectedPlanDetail = computed(
  () => normalizedPlans.value.find((plan) => plan.id === state.selectedPlanDetailId) || null
);

const selectedPlanDetailWorks = computed(() => {
  const plan = selectedPlanDetail.value;
  if (!plan) return [];

  if (plan.sourceType === "launch") {
    return (plan.scheduleRows || [])
      .map((row, index) => buildLaunchWorkItem(plan, row, index, plan.startDate))
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  }

  const workDays = getPlanWorkDays(plan);
  if (workDays.length) {
    return workDays
      .map((workDay) => buildWorkItemFromWorkDay(plan, workDay))
      .sort(compareDayWorks);
  }

  return enumerateDates(plan.startDate, plan.endDate)
    .map((dateIso) => buildDerivedWorkItem(plan, dateIso))
    .sort((left, right) => `${left.dateIso}-${left.sortKey}`.localeCompare(`${right.dateIso}-${right.sortKey}`));
});

const selectedPlanDetailConflictSummary = computed(() =>
  selectedPlanDetail.value ? buildPlanConflictSummary(selectedPlanDetail.value) : { hasConflict: false, compactLabel: "", title: "" }
);

const selectedPlanDetailConflictDates = computed(() => {
  if (!selectedPlanDetail.value) return new Set();
  const dateSet = new Set();
  getPlanConflictItems(selectedPlanDetail.value).forEach((item) => {
    (item.conflictDates || item.highlightDates || []).forEach((date) => {
      if (!date) return;
      dateSet.add(date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dateSet.add(formatDisplayDate(date));
      }
    });
  });
  return dateSet;
});

const calendarFilterRange = computed(() => {
  const rawStart = state.calendarFilterStartDate;
  const rawEnd = state.calendarFilterEndDate;
  if (!rawStart && !rawEnd) return { start: "", end: "", active: false };
  if (rawStart && rawEnd && compareIso(rawStart, rawEnd) > 0) {
    return { start: rawEnd, end: rawStart, active: true };
  }
  return {
    start: rawStart,
    end: rawEnd,
    active: Boolean(rawStart || rawEnd)
  };
});

const filteredNormalizedPlans = computed(() => {
  const range = calendarFilterRange.value;
  if (!range.active) return normalizedPlans.value;

  return normalizedPlans.value
    .filter((plan) => {
      const afterStart = !range.start || compareIso(plan.endDate, range.start) >= 0;
      const beforeEnd = !range.end || compareIso(plan.startDate, range.end) <= 0;
      return afterStart && beforeEnd;
    })
    .map((plan) => ({
      ...plan,
      originalStartDate: plan.startDate,
      originalEndDate: plan.endDate,
      startDate: range.start && compareIso(plan.startDate, range.start) < 0 ? range.start : plan.startDate,
      endDate: range.end && compareIso(plan.endDate, range.end) > 0 ? range.end : plan.endDate
    }));
});

const filteredCalendarMonths = computed(() => {
  const range = calendarFilterRange.value;
  if (range.start && range.end) {
    return buildCalendarMonths(range.start, range.end, filteredNormalizedPlans.value, monitoringKeyNodesByDate.value);
  }
  if (!filteredNormalizedPlans.value.length) return [];
  const startIso =
    range.start ||
    filteredNormalizedPlans.value.reduce(
      (min, item) => (compareIso(item.startDate, min) < 0 ? item.startDate : min),
      filteredNormalizedPlans.value[0].startDate
    );
  const endIso =
    range.end ||
    filteredNormalizedPlans.value.reduce(
      (max, item) => (compareIso(item.endDate, max) > 0 ? item.endDate : max),
      filteredNormalizedPlans.value[0].endDate
    );
  return buildCalendarMonths(startIso, endIso, filteredNormalizedPlans.value, monitoringKeyNodesByDate.value);
});

const monitorGanttZoomConfig = computed(() => {
  const index = Number(monitorGanttZoomLevel.value);
  return monitorGanttZoomLevels[index] || monitorGanttZoomLevels[2];
});

const scheduleKeyNodeForm = reactive({
  id: "",
  dateIso: TODAY_ISO,
  title: "",
  nodeType: "关键检查",
  description: "",
  blockScheduling: true
});

const monitorGanttVisibleRange = computed(() => {
  const visibleDays = monitorGanttZoomConfig.value.days;
  const center = monitorGanttCenterDate.value || filteredNormalizedPlans.value[0]?.startDate || normalizedPlans.value[0]?.startDate || TODAY_ISO;
  const startDate = addDays(center, -Math.floor((visibleDays - 1) / 2));
  return {
    startDate,
    endDate: addDays(startDate, visibleDays - 1),
    visibleDays
  };
});

const monitorGanttAxisUnit = computed(() => monitorGanttZoomConfig.value.axisUnit);

const monitorGanttDateColumns = computed(() =>
  Array.from({ length: monitorGanttVisibleRange.value.visibleDays }, (_, index) => {
    const dateIso = addDays(monitorGanttVisibleRange.value.startDate, index);
    const date = toDate(dateIso);
    return {
      key: dateIso,
      dateIso,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      subLabel: weekdayLabel((date.getDay() + 6) % 7),
      holidayLabel: getHolidayLabel(dateIso),
      keyNodes: monitoringKeyNodesByDate.value[dateIso] || [],
      isToday: dateIso === TODAY_ISO,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      leftPercent: (index / monitorGanttVisibleRange.value.visibleDays) * 100,
      widthPercent: (1 / monitorGanttVisibleRange.value.visibleDays) * 100
    };
  })
);

const monitorGanttMonthColumns = computed(() => {
  const range = monitorGanttVisibleRange.value;
  const columns = [];
  const cursor = new Date(toDate(range.startDate).getFullYear(), toDate(range.startDate).getMonth(), 1);

  while (compareIso(toIso(cursor.getFullYear(), cursor.getMonth() + 1, 1), range.endDate) <= 0) {
    const monthStart = toIso(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const monthEnd = toIso(cursor.getFullYear(), cursor.getMonth() + 1, getDaysInMonth(cursor.getFullYear(), cursor.getMonth() + 1));
    const visibleStart = compareIso(monthStart, range.startDate) > 0 ? monthStart : range.startDate;
    const visibleEnd = compareIso(monthEnd, range.endDate) < 0 ? monthEnd : range.endDate;
    const daySpan = diffDays(visibleStart, visibleEnd) + 1;
    columns.push({
      key: `${cursor.getFullYear()}-${cursor.getMonth() + 1}`,
      label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      compactLabel: `${cursor.getMonth() + 1}月`,
      startDate: visibleStart,
      endDate: visibleEnd,
      daySpan,
      leftPercent: (diffDays(range.startDate, visibleStart) / range.visibleDays) * 100,
      widthPercent: (daySpan / range.visibleDays) * 100
    });
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return columns;
});

const monitorGanttAxisColumns = computed(() =>
  monitorGanttAxisUnit.value === "month" ? monitorGanttMonthColumns.value : monitorGanttDateColumns.value
);

const monitorGanttVisiblePlanRows = computed(() => {
  const { startDate, endDate, visibleDays } = monitorGanttVisibleRange.value;
  return filteredNormalizedPlans.value
    .filter((plan) => compareIso(plan.endDate, startDate) >= 0 && compareIso(plan.startDate, endDate) <= 0)
    .sort((left, right) => {
      const dateCompare = compareIso(left.startDate, right.startDate);
      if (dateCompare !== 0) return dateCompare;
      return String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
    })
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
        rowHeight: getMonitorGanttRowHeight(plan, visibleStartDate, visibleEndDate),
        conflictSummary: buildPlanConflictSummary(plan)
      };
    });
});

const isSingleDayMonitorGantt = computed(
  () => monitorGanttZoomLevel.value >= monitorGanttZoomLevels.length - 1 || monitorGanttZoomConfig.value.days === 1
);

const monitorGanttSingleDayWorks = computed(() => buildWorksForDate(monitorGanttVisibleRange.value.startDate, filteredNormalizedPlans.value));

const monitorGanttSingleDayTimelineGroups = computed(() => buildWorkTimelineGroups(monitorGanttSingleDayWorks.value));

watch(
  filteredNormalizedPlans,
  (plans) => {
    if (!plans.length || monitorGanttInitialized.value) return;
    monitorGanttCenterDate.value = plans.reduce(
      (earliest, plan) => (compareIso(plan.startDate, earliest) < 0 ? plan.startDate : earliest),
      plans[0].startDate
    );
    monitorGanttInitialized.value = true;
  },
  { immediate: true, deep: true }
);

const selectedCompareHistory = computed(
  () => monitoringHistoryLibrary.value.find((item) => item.id === state.selectedCompareHistoryId) || null
);

const compareCurrentPlans = computed(() => {
  if (!selectedCompareHistory.value) return filteredNormalizedPlans.value;
  return normalizedPlans.value.filter((plan) => plan.gasType === selectedCompareHistory.value.gasType);
});

const compareHistoryPlans = computed(() => {
  const history = selectedCompareHistory.value;
  if (!history?.plans?.length) return [];
  return history.plans.map((plan) => ({
    ...plan,
    gasType: history.gasType,
    gasLabel: history.gasLabel,
    flowTitle: plan.flowTitle || history.title || "历史归档流程",
    completionMeta: plan.completionMeta || createEmptyProgress()
  }));
});

const calendarCompareRows = computed(() => buildCalendarCompareRows(compareCurrentPlans.value, compareHistoryPlans.value));

const calendarCompareSummary = computed(() => {
  const rows = calendarCompareRows.value;
  return {
    added: rows.filter((row) => row.type === "added").length,
    removed: rows.filter((row) => row.type === "removed").length,
    dateChanged: rows.filter((row) => row.type === "dateChanged" || row.type === "dateAndProgressChanged").length,
    progressChanged: rows.filter((row) => row.type === "progressChanged" || row.type === "dateAndProgressChanged").length,
    unchanged: rows.filter((row) => row.type === "unchanged").length
  };
});

const comparePlanDiffMap = computed(() => {
  const map = new Map();
  calendarCompareRows.value.forEach((row) => {
    const diff = {
      type: row.type,
      label: row.type === "unchanged" ? "" : row.typeLabel,
      tone: row.tone,
      title: `${row.name}：${row.typeLabel}。当前：${row.currentDateRange} / ${row.currentProgress === null ? "无" : `${row.currentProgress}%`}；历史：${row.historyDateRange} / ${row.historyProgress === null ? "无" : `${row.historyProgress}%`}`
    };
    map.set(row.key, diff);
  });
  return map;
});

const compareCurrentPlansWithDiff = computed(() =>
  compareCurrentPlans.value.map((plan) => ({
    ...plan,
    compareDiff: comparePlanDiffMap.value.get(buildCompareKey(plan)) || null
  }))
);

const compareHistoryPlansWithDiff = computed(() =>
  compareHistoryPlans.value.map((plan) => ({
    ...plan,
    compareDiff: comparePlanDiffMap.value.get(buildCompareKey(plan)) || null
  }))
);

const compareCurrentSummary = computed(() =>
  summarizeComparePlans(compareCurrentPlans.value, selectedCompareHistory.value?.gasLabel || gasLabelMap[state.selectedGas] || "当前范围")
);

const compareHistorySummary = computed(() => {
  const history = selectedCompareHistory.value;
  if (!history) {
    return {
      gasLabel: "未选择",
      totalPlans: 0,
      completedPlans: 0,
      dateRange: "",
      archivedAt: ""
    };
  }
  return {
    gasLabel: history.gasLabel,
    totalPlans: history.totalPlans || compareHistoryPlans.value.length,
    completedPlans: history.completedPlans || compareHistoryPlans.value.filter((plan) => plan.completionMeta?.complete).length,
    dateRange: history.dateRange || summarizeComparePlans(compareHistoryPlans.value, history.gasLabel).dateRange,
    archivedAt: history.archivedAt || ""
  };
});

const compareCalendarRange = computed(() => {
  const plans = calendarCompareRows.value.flatMap((row) => [row.currentPlan, row.historyPlan]).filter(Boolean);
  if (!plans.length) return { start: TODAY_ISO, end: TODAY_ISO };
  const start = plans.reduce((min, plan) => (compareIso(plan.startDate, min) < 0 ? plan.startDate : min), plans[0].startDate);
  const end = plans.reduce((max, plan) => (compareIso(plan.endDate, max) > 0 ? plan.endDate : max), plans[0].endDate);
  return { start, end };
});

const compareCurrentCalendarMonths = computed(() =>
  buildCalendarMonths(compareCalendarRange.value.start, compareCalendarRange.value.end, compareCurrentPlansWithDiff.value)
);

const compareHistoryCalendarMonths = computed(() =>
  buildCalendarMonths(compareCalendarRange.value.start, compareCalendarRange.value.end, compareHistoryPlansWithDiff.value)
);

const comparePlanOptions = computed(() => {
  const keyword = state.comparePlanSearchKeyword.trim().toLowerCase();
  return compareCurrentPlans.value
    .filter((plan) => {
      if (!keyword) return true;
      return [plan.name, plan.flowTitle, plan.gasLabel, planDateRange(plan)]
        .filter(Boolean)
        .some((text) => String(text).toLowerCase().includes(keyword));
    })
    .sort((left, right) => compareIso(left.startDate, right.startDate) || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN"));
});

const selectedCompareCurrentPlan = computed(() =>
  compareCurrentPlans.value.find((plan) => plan.id === state.selectedComparePlanId) || compareCurrentPlans.value[0] || null
);

const selectedCompareHistoryPlan = computed(() => {
  if (!selectedCompareCurrentPlan.value) return null;
  const key = buildCompareKey(selectedCompareCurrentPlan.value);
  return compareHistoryPlans.value.find((plan) => buildCompareKey(plan) === key) || null;
});

const selectedComparePlanRange = computed(() => {
  const plans = [selectedCompareCurrentPlan.value, selectedCompareHistoryPlan.value].filter(Boolean);
  if (!plans.length) return { startDate: TODAY_ISO, endDate: TODAY_ISO, visibleDays: 1, axisUnit: "day" };
  const startDate = plans.reduce((min, plan) => (compareIso(plan.startDate, min) < 0 ? plan.startDate : min), plans[0].startDate);
  const endDate = plans.reduce((max, plan) => (compareIso(plan.endDate, max) > 0 ? plan.endDate : max), plans[0].endDate);
  const visibleDays = diffDays(startDate, endDate) + 1;
  return {
    startDate,
    endDate,
    visibleDays,
    axisUnit: visibleDays > 90 ? "month" : "day"
  };
});

const comparePlanAxisColumns = computed(() => {
  const range = selectedComparePlanRange.value;
  if (range.axisUnit === "month") {
    const columns = [];
    let cursor = new Date(toDate(range.startDate).getFullYear(), toDate(range.startDate).getMonth(), 1);
    while (compareIso(toIso(cursor.getFullYear(), cursor.getMonth() + 1, 1), range.endDate) <= 0) {
      const monthStart = toIso(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      const monthEnd = toIso(cursor.getFullYear(), cursor.getMonth() + 1, new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate());
      const startDate = compareIso(monthStart, range.startDate) < 0 ? range.startDate : monthStart;
      const endDate = compareIso(monthEnd, range.endDate) > 0 ? range.endDate : monthEnd;
      const daySpan = diffDays(startDate, endDate) + 1;
      columns.push({
        key: `${cursor.getFullYear()}-${cursor.getMonth() + 1}`,
        label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
        subLabel: `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`,
        leftPercent: (diffDays(range.startDate, startDate) / range.visibleDays) * 100,
        widthPercent: (daySpan / range.visibleDays) * 100
      });
      cursor.setMonth(cursor.getMonth() + 1, 1);
    }
    return columns;
  }
  return Array.from({ length: range.visibleDays }, (_, index) => {
    const dateIso = addDays(range.startDate, index);
    const date = toDate(dateIso);
    return {
      key: dateIso,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      subLabel: weekdayLabel((date.getDay() + 6) % 7),
      leftPercent: (index / range.visibleDays) * 100,
      widthPercent: (1 / range.visibleDays) * 100,
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isToday: dateIso === TODAY_ISO
    };
  });
});

function compareWorkDayKey(workDay) {
  return `${workDay.dateIso}__${workDay.actionLabel || "任务执行"}`;
}

function compareWorkDaySignature(workDay) {
  const people = Array.isArray(workDay.personnel) ? workDay.personnel.join("、") : workDay.personnel || "";
  const equipment = Array.isArray(workDay.equipment) ? workDay.equipment.join("、") : workDay.equipment || "";
  return [workDay.timeRange || "", people, equipment, workDay.position || "", workDay.status || ""].join("__");
}

function formatCompareWorkPeople(workDay) {
  return Array.isArray(workDay.personnel) ? workDay.personnel.join("、") : workDay.personnel || "未指定";
}

function formatCompareWorkEquipment(workDay) {
  return Array.isArray(workDay.equipment) ? workDay.equipment.join("、") : workDay.equipment || "未指定";
}

const comparePlanWorkDayDiffMap = computed(() => {
  const map = new Map();
  const currentDays = selectedCompareCurrentPlan.value ? getPlanWorkDays(selectedCompareCurrentPlan.value) : [];
  const historyDays = selectedCompareHistoryPlan.value ? getPlanWorkDays(selectedCompareHistoryPlan.value) : [];
  const currentMap = new Map(currentDays.map((workDay) => [compareWorkDayKey(workDay), workDay]));
  const historyMap = new Map(historyDays.map((workDay) => [compareWorkDayKey(workDay), workDay]));
  const keys = [...new Set([...currentMap.keys(), ...historyMap.keys()])];
  keys.forEach((key) => {
    const current = currentMap.get(key) || null;
    const history = historyMap.get(key) || null;
    let type = "stable";
    if (current && !history) type = "added";
    else if (!current && history) type = "removed";
    else if (current && history && compareWorkDaySignature(current) !== compareWorkDaySignature(history)) type = "changed";
    map.set(key, { type, current, history });
  });
  return map;
});

function buildComparePlanRow(plan, side) {
  if (!plan) return null;
  const range = selectedComparePlanRange.value;
  const visibleStartDate = compareIso(plan.startDate, range.startDate) > 0 ? plan.startDate : range.startDate;
  const visibleEndDate = compareIso(plan.endDate, range.endDate) < 0 ? plan.endDate : range.endDate;
  const rowVisibleDays = Math.max(1, diffDays(visibleStartDate, visibleEndDate) + 1);
  const color = side === "current" ? "#60e3ff" : "#d4a85f";
  const workDays = getPlanWorkDays(plan)
    .filter((workDay) => compareIso(workDay.dateIso, visibleStartDate) >= 0 && compareIso(workDay.dateIso, visibleEndDate) <= 0)
    .map((workDay) => {
      const diff = comparePlanWorkDayDiffMap.value.get(compareWorkDayKey(workDay));
      return {
        ...workDay,
        leftPercent: (diffDays(visibleStartDate, workDay.dateIso) / rowVisibleDays) * 100,
        widthPercent: (1 / rowVisibleDays) * 100,
        diffType: diff?.type || "stable"
      };
    });
  return {
    ...plan,
    side,
    color,
    visibleStartDate,
    visibleEndDate,
    leftPercent: (diffDays(range.startDate, visibleStartDate) / range.visibleDays) * 100,
    widthPercent: (rowVisibleDays / range.visibleDays) * 100,
    dateChanged: selectedCompareCurrentPlan.value && selectedCompareHistoryPlan.value
      ? selectedCompareCurrentPlan.value.startDate !== selectedCompareHistoryPlan.value.startDate ||
        selectedCompareCurrentPlan.value.endDate !== selectedCompareHistoryPlan.value.endDate
      : false,
    workDays
  };
}

const compareCurrentPlanRow = computed(() => buildComparePlanRow(selectedCompareCurrentPlan.value, "current"));
const compareHistoryPlanRow = computed(() => buildComparePlanRow(selectedCompareHistoryPlan.value, "history"));

const comparePlanDiffSummary = computed(() => {
  const values = [...comparePlanWorkDayDiffMap.value.values()];
  return {
    added: values.filter((item) => item.type === "added").length,
    removed: values.filter((item) => item.type === "removed").length,
    changed: values.filter((item) => item.type === "changed").length,
    stable: values.filter((item) => item.type === "stable").length,
    dateChanged: Boolean(compareCurrentPlanRow.value?.dateChanged)
  };
});

const comparePlanDiffRows = computed(() =>
  [...comparePlanWorkDayDiffMap.value.values()]
    .filter((item) => item.type !== "stable")
    .map((item) => {
      const work = item.current || item.history;
      const currentPeople = item.current ? formatCompareWorkPeople(item.current) : "无";
      const historyPeople = item.history ? formatCompareWorkPeople(item.history) : "无";
      const currentEquipment = item.current ? formatCompareWorkEquipment(item.current) : "无";
      const historyEquipment = item.history ? formatCompareWorkEquipment(item.history) : "无";
      return {
        key: `${item.type}-${compareWorkDayKey(work)}`,
        type: item.type,
        typeLabel: item.type === "added" ? "新增" : item.type === "removed" ? "删除" : "变更",
        dateIso: work.dateIso,
        actionLabel: work.actionLabel || "任务执行",
        currentTimeRange: item.current?.timeRange || "无",
        historyTimeRange: item.history?.timeRange || "无",
        currentPeople,
        historyPeople,
        currentEquipment,
        historyEquipment,
        description: item.type === "added"
          ? "当前计划中新增了该工作日。"
          : item.type === "removed"
            ? "历史计划中存在该工作日，当前计划中已移除。"
            : "该工作日的时间段、人员、设备、岗位或状态发生变化。"
      };
    })
    .sort((left, right) => compareIso(left.dateIso, right.dateIso) || left.actionLabel.localeCompare(right.actionLabel, "zh-CN"))
);

const monitoringWorkRuleOptions = computed(() => {
  const merged = [...(catalog.workItems || []), ...(workRuleLibrary.value || [])];
  const seen = new Set();
  return merged.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return item.status !== "停用";
  });
});

const selectedDayPlanOptions = computed(() =>
  normalizedPlans.value.filter((plan) => {
    if (!state.selectedDayIso) return false;
    return compareIso(plan.startDate, state.selectedDayIso) <= 0 && compareIso(plan.endDate, state.selectedDayIso) >= 0;
  })
);

const addWorkPlanOptions = computed(() => {
  const dateIso = addWorkForm.dateIso || state.selectedDayIso;
  if (!dateIso) return [];
  return normalizedPlans.value.filter((plan) => compareIso(plan.startDate, dateIso) <= 0 && compareIso(plan.endDate, dateIso) >= 0);
});

const visibleCustomMonitoringWorks = computed(() =>
  (customMonitoringWorks.value || []).filter((work) => {
    if (state.selectedGas !== "all" && work.gasType && work.gasType !== state.selectedGas) return false;
    return true;
  })
);

const latestWorkActionOverrideMap = computed(() => {
  const map = new Map();
  (workActionOverrides.value || []).forEach((record) => {
    const key = record.workKey || record.workId;
    if (key && !map.has(key)) map.set(key, record);
  });
  return map;
});

const assessmentWorks = computed(() =>
  [
    ...normalizedPlans.value.flatMap((plan) => buildAssessmentWorksForPlan(plan)),
    ...visibleCustomMonitoringWorks.value.map((work) => buildCustomMonitoringWorkItem(work))
  ].sort((left, right) => `${left.dateIso}-${left.sortKey}`.localeCompare(`${right.dateIso}-${right.sortKey}`))
);

const planProgressAssessments = computed(() => normalizedPlans.value.map((plan) => buildPlanProgressAssessment(plan)));

const systemProgressAssessments = computed(() =>
  buildGroupedAssessments(planProgressAssessments.value, "flowId").map((group) => {
    const counts = countBy(group.items, "progressStatus");
    const avgProgress = average(group.items.map((item) => item.actualProgress));
    return {
      key: group.key,
      title: flowMetaMap[group.key]?.title || group.key,
      avgProgress,
      counts,
      totalCount: group.items.length,
      status: getDominantProgressStatus(counts)
    };
  })
);

const overallProgressAssessment = computed(() => {
  const counts = countBy(planProgressAssessments.value, "progressStatus");
  return {
    avgProgress: average(planProgressAssessments.value.map((item) => item.actualProgress)),
    counts,
    totalCount: planProgressAssessments.value.length,
    status: getDominantProgressStatus(counts),
    warningCount: (counts["临期"] || 0) + (counts["超期"] || 0) + (counts["滞后"] || 0)
  };
});

const planRiskAssessments = computed(() => {
  const progressMap = new Map(planProgressAssessments.value.map((item) => [item.planId, item]));
  return normalizedPlans.value.map((plan) =>
    buildPlanRiskAssessment(
      plan,
      assessmentWorks.value.filter((work) => work.planId === plan.id),
      progressMap.get(plan.id)
    )
  );
});

const systemRiskAssessments = computed(() =>
  buildGroupedAssessments(planRiskAssessments.value, "flowId").map((group) => {
    const score = Math.round(average(group.items.map((item) => item.riskScore)));
    const openRiskCount = sum(group.items.map((item) => item.openRiskCount));
    const closedRiskCount = sum(group.items.map((item) => item.closedRiskCount));
    return {
      key: group.key,
      title: flowMetaMap[group.key]?.title || group.key,
      riskScore: score,
      riskLevel: getRiskLevel(score),
      riskTrend: getRiskTrend(score, openRiskCount, closedRiskCount),
      openRiskCount,
      closedRiskCount,
      closureRate: calculateRate(closedRiskCount, openRiskCount + closedRiskCount),
      highRiskCount: group.items.filter((item) => item.riskLevel === "高" || item.riskLevel === "严重").length
    };
  })
);

const overallRiskAssessment = computed(() => {
  const score = Math.round(average(planRiskAssessments.value.map((item) => item.riskScore)));
  const openRiskCount = sum(planRiskAssessments.value.map((item) => item.openRiskCount));
  const closedRiskCount = sum(planRiskAssessments.value.map((item) => item.closedRiskCount));
  return {
    riskScore: score,
    riskLevel: getRiskLevel(score),
    riskTrend: getRiskTrend(score, openRiskCount, closedRiskCount),
    openRiskCount,
    closedRiskCount,
    closureRate: calculateRate(closedRiskCount, openRiskCount + closedRiskCount),
    highRiskCount: planRiskAssessments.value.filter((item) => item.riskLevel === "高" || item.riskLevel === "严重").length
  };
});

const planMarginAssessments = computed(() =>
  normalizedPlans.value.map((plan) =>
    buildPlanMarginAssessment(
      plan,
      assessmentWorks.value.filter((work) => work.planId === plan.id)
    )
  )
);

const freeWorkWindows = computed(() => buildFreeWorkWindows(assessmentWorks.value));

const personParticipationStats = computed(() => buildPersonParticipationStats(assessmentWorks.value));

const selectedPersonStat = computed(() =>
  personParticipationStats.value.find((item) => item.personName === state.selectedPersonName) || null
);

const selectedPersonWorkSchedule = computed(() =>
  assessmentWorks.value
    .filter((work) => workHasPerson(work, state.selectedPersonName))
    .sort((left, right) => `${left.dateIso}-${left.sortKey}`.localeCompare(`${right.dateIso}-${right.sortKey}`))
);

const selectedMonitorConflictPlan = computed(() =>
  normalizedPlans.value.find((plan) => plan.id === state.selectedConflictPlanId) || null
);

const selectedMonitorConflictRecords = computed(() =>
  selectedMonitorConflictPlan.value
    ? getPlanConflictRecords(
        selectedMonitorConflictPlan.value,
        monitoringConflictRecords.value,
        state.selectedConflictDateIso,
        state.selectedConflictWorkDayId
      )
    : []
);

const assessmentSummary = computed(() => ({
  riskLevel: overallRiskAssessment.value.riskLevel,
  progressStatus: overallProgressAssessment.value.status,
  dueSoonCount: overallProgressAssessment.value.counts["临期"] || 0,
  overdueCount: overallProgressAssessment.value.counts["超期"] || 0,
  freeWindowCount: freeWorkWindows.value.filter((item) => item.level === "空闲" || item.level === "可插入").length,
  highLoadPersonCount: personParticipationStats.value.filter((item) => item.workloadLevel === "高").length
}));

function openMonitorPlanConflictRecords(row, workDay = null) {
  const records = getPlanConflictRecords(row, monitoringConflictRecords.value, workDay?.dateIso || "", workDay?.id || "");
  if (!records.length) return;
  state.selectedConflictPlanId = row.id;
  state.selectedConflictDateIso = workDay?.dateIso || "";
  state.selectedConflictWorkDayId = workDay?.id || "";
  state.planConflictRecordModalOpen = true;
}

function closeMonitorPlanConflictRecords() {
  state.planConflictRecordModalOpen = false;
  state.selectedConflictPlanId = "";
  state.selectedConflictDateIso = "";
  state.selectedConflictWorkDayId = "";
}

function getPlanConflictRecords(plan, records = monitoringConflictRecords.value, dateIso = "", workDayId = "") {
  const sourcePlanId = plan.sourcePlan?.id || "";
  const displayDate = dateIso ? formatDisplayDate(dateIso) : "";
  return (records || [])
    .map((record) => {
      const sameGas = !record.gasType || record.gasType === plan.gasType;
      if (!sameGas) return null;
      const recordOwnsPlan =
        record.planId === plan.id ||
        (sourcePlanId && record.planId === sourcePlanId) ||
        record.planName === plan.name;
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

function getPlanConflictItems(plan, records = monitoringConflictRecords.value) {
  return getPlanConflictRecords(plan, records).flatMap((record) => record.conflicts || []);
}

function isPlanMentionedInConflictItem(plan, item) {
  return [item.currentPlanName, item.conflictPlanName, item.relatedPlanName].filter(Boolean).includes(plan.name);
}

function normalizeConflictDate(dateText) {
  if (!dateText) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dateText))) return String(dateText);
  const parts = String(dateText).match(/\d+/g);
  if (!parts || parts.length < 3) return "";
  return toIso(Number(parts[0]), Number(parts[1]), Number(parts[2]));
}

function getPlanConflictDates(plan, records = monitoringConflictRecords.value) {
  return [
    ...new Set(
      getPlanConflictItems(plan, records)
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

function buildMonitorGanttConflictSegments(row) {
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

function normalizeMonitorWorkDay(plan, workDay, index = 0) {
  const fallback = buildMonitorDefaultWorkDay(plan, workDay.dateIso || plan.startDate, index);
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

function buildMonitorDefaultWorkDay(plan, dateIso, index = 0) {
  const dayIndex = Math.max(0, diffDays(plan.startDate, dateIso));
  const actions = inferActionList(plan.name);
  const slots = ["08:00-10:00", "10:00-12:00", "14:00-16:00", "16:00-18:00"];
  return {
    id: `${plan.sourcePlan?.id || plan.id}-work-${dateIso}-${index + 1}`,
    dateIso,
    actionLabel: actions[dayIndex % actions.length] || "任务执行",
    timeRange: slots[dayIndex % slots.length],
    personnel: inferPeople(plan, actions[dayIndex % actions.length] || "任务执行").map((item) => item.name),
    equipment: inferEquipment(plan, actions[dayIndex % actions.length] || "任务执行"),
    position: `${plan.gasLabel || ""}系统执行岗`,
    status: plan.status === "confirmed" ? "已确认" : "草稿",
    sortKey: index
  };
}

function getPlanWorkDays(plan) {
  const sourceWorkDays = plan.sourcePlan?.workDays || plan.workDays;
  if (Array.isArray(sourceWorkDays) && sourceWorkDays.length) {
    return sourceWorkDays
      .filter((workDay) => workDay?.dateIso)
      .map((workDay, index) => normalizeMonitorWorkDay(plan, workDay, index))
      .sort((left, right) => compareIso(left.dateIso, right.dateIso) || (left.sortKey || 0) - (right.sortKey || 0));
  }
  if (plan.sourceType === "launch" && Array.isArray(plan.scheduleRows)) {
    return plan.scheduleRows.map((row, index) => {
      const work = buildLaunchWorkItem(plan, row, index, plan.startDate);
      return normalizeMonitorWorkDay(plan, {
        id: work.id,
        dateIso: work.dateIso,
        actionLabel: work.actionLabel,
        timeRange: work.timeRange,
        personnel: work.personnel,
        equipment: work.equipment,
        position: work.position,
        status: work.status,
        sortKey: index
      }, index);
    });
  }
  return enumerateDates(plan.startDate, plan.endDate).map((dateIso, index) => buildMonitorDefaultWorkDay(plan, dateIso, index));
}

function getPlanWorkDateSet(plan) {
  return new Set(getPlanWorkDays(plan).map((item) => item.dateIso));
}

function buildMonitorPlanWorkDaySegments(row) {
  const rowVisibleDays = Math.max(1, diffDays(row.visibleStartDate, row.visibleEndDate) + 1);
  const visibleWorkDays = getPlanWorkDays(row)
    .filter((workDay) => compareIso(workDay.dateIso, row.visibleStartDate) >= 0 && compareIso(workDay.dateIso, row.visibleEndDate) <= 0)
  return assignMonitorWorkDayLayoutLanes(visibleWorkDays).workDays.map((workDay) => ({
      ...workDay,
      leftPercent: (diffDays(row.visibleStartDate, workDay.dateIso) / rowVisibleDays) * 100,
      widthPercent: (1 / rowVisibleDays) * 100,
      topPx: monitorGanttLaneTopOffset + workDay.layoutLane * monitorGanttLaneHeight,
      heightPx: monitorGanttLaneHeight - 4,
      hasConflict: isMonitorWorkDayConflict(row, workDay)
    }));
}

function assignMonitorWorkDayLayoutLanes(workDays) {
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

function getMonitorGanttRowHeight(plan, visibleStartDate, visibleEndDate) {
  const visibleWorkDays = getPlanWorkDays(plan)
    .filter((workDay) => compareIso(workDay.dateIso, visibleStartDate) >= 0 && compareIso(workDay.dateIso, visibleEndDate) <= 0);
  const laneCount = assignMonitorWorkDayLayoutLanes(visibleWorkDays).laneCount;
  return Math.max(monitorGanttBaseRowHeight, 34 + laneCount * monitorGanttLaneHeight);
}

function isMonitorWorkDayConflict(plan, workDay) {
  return getPlanConflictRecords(plan, monitoringConflictRecords.value, workDay.dateIso, workDay.id).length > 0;
}

function buildMonitorWorkDayConflictSegments(row, workDay) {
  return isMonitorWorkDayConflict(row, workDay) ? [{ leftPercent: 0, widthPercent: 100 }] : [];
}

function isWorkConflictDate(work) {
  if (work?.hasConflictDate || work?.hasConflict) return true;
  const plan = normalizedPlans.value.find((item) => item.id === work.planId);
  if (!plan) return false;
  return getPlanConflictDates(plan).includes(work.dateIso);
}

function buildPlanConflictSummary(plan, records = monitoringConflictRecords.value) {
  const matchedRecords = getPlanConflictRecords(plan, records);
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

function buildCompareKey(plan) {
  return [plan.name || "", plan.flowTitle || "", plan.gasType || plan.gasLabel || ""].join("__");
}

function getPlanProgress(plan) {
  return Number(plan?.completionMeta?.progress || 0);
}

function getCompareTypeLabel(type) {
  const labels = {
    added: "新增计划",
    removed: "删除计划",
    dateChanged: "日期调整",
    progressChanged: "进度变化",
    dateAndProgressChanged: "日期与进度变化",
    unchanged: "未变化"
  };
  return labels[type] || "未变化";
}

function getCompareTypeTone(type) {
  if (type === "added") return "added";
  if (type === "removed") return "removed";
  if (type === "dateAndProgressChanged") return "combined";
  if (type === "dateChanged" || type === "dateAndProgressChanged") return "changed";
  if (type === "progressChanged") return "progress";
  return "stable";
}

function buildCalendarCompareRows(currentPlans, historyPlans) {
  const currentMap = new Map((currentPlans || []).map((plan) => [buildCompareKey(plan), plan]));
  const historyMap = new Map((historyPlans || []).map((plan) => [buildCompareKey(plan), plan]));
  const keys = [...new Set([...currentMap.keys(), ...historyMap.keys()])];

  return keys
    .map((key) => {
      const currentPlan = currentMap.get(key) || null;
      const historyPlan = historyMap.get(key) || null;
      let type = "unchanged";

      if (currentPlan && !historyPlan) {
        type = "added";
      } else if (!currentPlan && historyPlan) {
        type = "removed";
      } else if (currentPlan && historyPlan) {
        const dateChanged = currentPlan.startDate !== historyPlan.startDate || currentPlan.endDate !== historyPlan.endDate;
        const progressChanged = getPlanProgress(currentPlan) !== getPlanProgress(historyPlan);
        if (dateChanged && progressChanged) type = "dateAndProgressChanged";
        else if (dateChanged) type = "dateChanged";
        else if (progressChanged) type = "progressChanged";
      }

      const displayPlan = currentPlan || historyPlan;
      return {
        key,
        currentPlan,
        historyPlan,
        type,
        typeLabel: getCompareTypeLabel(type),
        tone: getCompareTypeTone(type),
        name: displayPlan?.name || "未命名计划",
        flowTitle: displayPlan?.flowTitle || "未归类流程",
        gasLabel: displayPlan?.gasLabel || gasLabelMap[displayPlan?.gasType] || "未知气体",
        currentDateRange: currentPlan ? planDateRange(currentPlan) : "无",
        historyDateRange: historyPlan ? planDateRange(historyPlan) : "无",
        currentProgress: currentPlan ? getPlanProgress(currentPlan) : null,
        historyProgress: historyPlan ? getPlanProgress(historyPlan) : null
      };
    })
    .sort((left, right) => {
      const leftPlan = left.currentPlan || left.historyPlan;
      const rightPlan = right.currentPlan || right.historyPlan;
      const dateCompare = compareIso(leftPlan.startDate, rightPlan.startDate);
      if (dateCompare !== 0) return dateCompare;
      return left.name.localeCompare(right.name, "zh-CN");
    });
}

function summarizeComparePlans(plans, gasLabel) {
  if (!plans.length) {
    return {
      gasLabel,
      totalPlans: 0,
      completedPlans: 0,
      dateRange: ""
    };
  }
  const startIso = plans.reduce((min, item) => (compareIso(item.startDate, min) < 0 ? item.startDate : min), plans[0].startDate);
  const endIso = plans.reduce((max, item) => (compareIso(item.endDate, max) > 0 ? item.endDate : max), plans[0].endDate);
  return {
    gasLabel,
    totalPlans: plans.length,
    completedPlans: plans.filter((plan) => plan.completionMeta?.complete || getPlanProgress(plan) >= 100).length,
    dateRange: `${formatDisplayDate(startIso)} - ${formatDisplayDate(endIso)}`
  };
}

function buildAssessmentWorksForPlan(plan) {
  const conflictDates = getPlanConflictDateSet(plan);
  const enrichWork = (work) =>
    applyWorkActionOverride({
      ...work,
      planId: plan.id,
      planName: plan.name,
      flowId: plan.flowId,
      flowTitle: plan.flowTitle,
      gasType: plan.gasType,
      gasLabel: plan.gasLabel,
      conflictCount: getPlanConflictItems(plan).length,
      hasConflictDate: conflictDates.has(work.dateIso) || conflictDates.has(formatDisplayDate(work.dateIso))
    });

  if (plan.sourceType === "launch") {
    return (plan.scheduleRows || []).map((row, index) => enrichWork(buildLaunchWorkItem(plan, row, index, plan.startDate)));
  }
  return enumerateDates(plan.startDate, plan.endDate).map((dateIso) => enrichWork(buildDerivedWorkItem(plan, dateIso)));
}

function buildCustomMonitoringWorkItem(work) {
  const fallbackFlowId = work.flowId || "custom";
  const actionLabel = work.actionLabel || work.name || "临时补充工作";
  const timeRange = work.timeRange || "08:00-10:00";
  return applyWorkActionOverride({
    id: work.id,
    planId: work.planId || "manual-monitoring",
    planName: work.planName || "临时补充工作",
    dateIso: work.dateIso,
    timeRange,
    sortKey: String(timeRange).split("-")[0] || "08:00",
    planTitle: work.planName || "临时补充工作",
    workIndexLabel: work.workIndexLabel || "手动新增",
    actionLabel,
    flowId: fallbackFlowId,
    flowTitle: work.flowTitle || flowMetaMap[fallbackFlowId]?.title || "临时工作",
    gasType: work.gasType || state.selectedGas,
    gasLabel: work.gasLabel || gasLabelMap[work.gasType] || gasLabelMap[state.selectedGas] || "全部气体",
    status: work.status || "draft",
    position: work.position || "待分配岗位",
    personnel: normalizePersonnelList(work.personnel),
    equipment: normalizeEquipmentList(work.equipment),
    constraints: normalizeConstraintList(work.constraints),
    processSteps: work.processSteps || [`确认${actionLabel}的执行条件`, `完成${actionLabel}并同步记录结果`],
    progressMeta: workProgressStore.value[work.id] || createEmptyProgress(),
    risks: normalizeTextList(work.risks),
    weaknesses: work.weaknesses || ["手动新增工作需关注现场资源协调"],
    notices: work.notices || ["执行前复核时间、人员和设备占用情况"],
    tips: work.tips || ["如与既有计划冲突，请优先在监控日历中调整窗口"],
    conflictCount: work.conflictCount || 0,
    hasConflictDate: Boolean(work.hasConflictDate)
  });
}

function normalizeTextList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "")
    .split(/[\n,，、;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePersonnelList(value) {
  if (Array.isArray(value)) {
    return value
      .map((person) => {
        if (typeof person === "string") return { id: person, name: person, post: "执行人员", status: "已分配" };
        return {
          id: person.id || person.name,
          name: person.name || person.label || "待分配",
          post: person.post || person.position || "执行人员",
          status: person.status || "已分配"
        };
      })
      .filter((person) => person.name);
  }
  return normalizeTextList(value).map((name) => ({ id: name, name, post: "执行人员", status: "已分配" }));
}

function normalizeEquipmentList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return normalizeTextList(value);
}

function normalizeConstraintList(value) {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      typeof item === "string"
        ? { id: `manual-constraint-${index}`, name: "制约关系", description: item, effect: "需关注" }
        : {
            id: item.id || `manual-constraint-${index}`,
            name: item.name || "制约关系",
            description: item.description || item.effect || "需关注",
            effect: item.effect || "需关注"
          }
    );
  }
  return normalizeTextList(value).map((item, index) => ({
    id: `manual-constraint-${index}`,
    name: "制约关系",
    description: item,
    effect: "需关注"
  }));
}

function getWorkActionOverride(work) {
  return latestWorkActionOverrideMap.value.get(work.id) || null;
}

function applyWorkActionOverride(work) {
  const override = getWorkActionOverride(work);
  if (!override) return work;
  return {
    ...work,
    actionOverride: override,
    operationStatus: getWorkActionLabel(override.action)
  };
}

function getWorkActionLabel(action) {
  const labels = {
    delay: "已标记推迟",
    cancel: "已标记取消",
    redo: "已标记重做"
  };
  return labels[action] || "";
}

function workHasPerson(work, personName) {
  if (!personName) return false;
  return (work.personnel || []).some((person) => (person.name || person) === personName);
}

function getPlanConflictDateSet(plan) {
  const dateSet = new Set();
  getPlanConflictItems(plan).forEach((item) => {
    (item.conflictDates || item.highlightDates || []).forEach((date) => {
      if (!date) return;
      dateSet.add(date);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dateSet.add(formatDisplayDate(date));
      }
    });
  });
  return dateSet;
}

function buildPlanProgressAssessment(plan) {
  const totalDays = Math.max(1, diffDays(plan.startDate, plan.endDate) + 1);
  const elapsedDays = Math.max(0, Math.min(totalDays, diffDays(plan.startDate, TODAY_ISO) + 1));
  const expectedProgress = Math.round((elapsedDays / totalDays) * 100);
  const actualProgress = getPlanProgress(plan);
  const remainingDays = diffDays(TODAY_ISO, plan.endDate);
  const overdueDays = Math.max(0, diffDays(plan.endDate, TODAY_ISO));
  const progressDelta = actualProgress - expectedProgress;
  let progressStatus = "正常";

  if (actualProgress >= 100) progressStatus = "已完成";
  else if (compareIso(TODAY_ISO, plan.endDate) > 0) progressStatus = "超期";
  else if (remainingDays <= 3) progressStatus = "临期";
  else if (progressDelta < -15) progressStatus = "滞后";
  else if (progressDelta > 15) progressStatus = "提前";

  const warningText =
    progressStatus === "超期"
      ? `已超期 ${overdueDays} 天，需立即复核执行安排。`
      : progressStatus === "临期"
        ? `距离计划结束还有 ${Math.max(0, remainingDays)} 天，请关注收尾工作。`
        : progressStatus === "滞后"
          ? `实际进度低于理论进度 ${Math.abs(progressDelta)}%。`
          : progressStatus === "提前"
            ? `实际进度高于理论进度 ${progressDelta}%。`
            : "进度处于可控范围。";

  return {
    planId: plan.id,
    planName: plan.name,
    flowId: plan.flowId,
    flowTitle: plan.flowTitle,
    gasLabel: plan.gasLabel,
    expectedProgress,
    actualProgress,
    progressDelta,
    progressStatus,
    warningText,
    remainingDays,
    overdueDays
  };
}

function buildPlanRiskAssessment(plan, works, progressAssessment) {
  const conflictCount = getPlanConflictItems(plan).length;
  const riskCount = sum(works.map((work) => (work.risks || []).length));
  const constraintCount = sum(works.map((work) => (work.constraints || []).length));
  const conflictWorkCount = works.filter((work) => work.hasConflictDate).length;
  const criticalOpenCount = works.filter((work) =>
    /安全|质量|确认|复核|关键/.test(work.actionLabel || "") && work.progressMeta?.status !== "已完成"
  ).length;
  const concentratedReasons = buildConcentrationRiskReasons(works);
  let riskScore = riskCount * 8 + constraintCount * 6 + conflictCount * 15 + conflictWorkCount * 8 + criticalOpenCount * 8;

  if (progressAssessment?.progressStatus === "超期") riskScore += 20;
  if (progressAssessment?.progressStatus === "临期") riskScore += 10;
  if (progressAssessment?.progressStatus === "滞后") riskScore += 10;
  riskScore += concentratedReasons.length * 8;
  riskScore = Math.max(0, Math.min(100, riskScore));

  const riskWorks = works.filter(
    (work) => (work.risks || []).length || (work.constraints || []).length || work.hasConflictDate || /安全|质量|确认|复核|关键/.test(work.actionLabel || "")
  );
  const closedRiskCount = riskWorks.filter((work) => work.progressMeta?.status === "已完成" && !work.hasConflictDate).length;
  const openRiskCount = Math.max(0, riskWorks.length - closedRiskCount + conflictCount);
  const reasons = [
    riskCount ? `风险项 ${riskCount} 个` : "",
    constraintCount ? `制约关系 ${constraintCount} 个` : "",
    conflictCount ? `冲突记录 ${conflictCount} 条` : "",
    criticalOpenCount ? `关键工作未完成 ${criticalOpenCount} 项` : "",
    progressAssessment?.progressStatus === "超期" ? "计划已超期未完成" : "",
    progressAssessment?.progressStatus === "临期" ? "计划临近结束" : "",
    progressAssessment?.progressStatus === "滞后" ? "计划进度滞后" : "",
    ...concentratedReasons
  ].filter(Boolean);

  return {
    planId: plan.id,
    planName: plan.name,
    flowId: plan.flowId,
    flowTitle: plan.flowTitle,
    gasLabel: plan.gasLabel,
    riskScore,
    riskLevel: getRiskLevel(riskScore),
    riskTrend: getRiskTrend(riskScore, openRiskCount, closedRiskCount),
    openRiskCount,
    closedRiskCount,
    closureRate: calculateRate(closedRiskCount, openRiskCount + closedRiskCount),
    reasons: reasons.length ? reasons : ["未识别到显著风险"]
  };
}

function buildConcentrationRiskReasons(works) {
  const people = new Map();
  const equipment = new Map();
  works.forEach((work) => {
    (work.personnel || []).forEach((person) => {
      const name = person.name || person;
      people.set(name, (people.get(name) || 0) + 1);
    });
    (work.equipment || []).forEach((item) => equipment.set(item, (equipment.get(item) || 0) + 1));
  });
  const threshold = Math.max(3, Math.ceil(works.length * 0.6));
  return [
    ...[...people.entries()].filter(([, count]) => count >= threshold).map(([name]) => `${name}参与集中度较高`),
    ...[...equipment.entries()].filter(([, count]) => count >= threshold).map(([name]) => `${name}设备占用集中`)
  ].slice(0, 3);
}

function buildPlanMarginAssessment(plan, works) {
  const totalWorkCount = works.length;
  const completedWorkCount = works.filter((work) => work.progressMeta?.status === "已完成").length;
  const remainingWorkCount = Math.max(0, totalWorkCount - completedWorkCount);
  const remainingDays = diffDays(TODAY_ISO, plan.endDate);
  const workPerDay = remainingWorkCount / Math.max(1, remainingDays + 1);
  let marginLevel = "充足";
  if (remainingDays < 0 || workPerDay > 2) marginLevel = "不足";
  else if (remainingDays <= 3 || workPerDay > 1) marginLevel = "紧张";

  return {
    planId: plan.id,
    planName: plan.name,
    flowTitle: plan.flowTitle,
    gasLabel: plan.gasLabel,
    remainingDays,
    remainingWorkCount,
    totalWorkCount,
    completedWorkCount,
    marginLevel,
    marginText:
      marginLevel === "不足"
        ? "剩余窗口不足，建议调整资源或压缩非关键工作。"
        : marginLevel === "紧张"
          ? "剩余窗口偏紧，建议优先保障关键节点。"
          : "余量充足，可按计划推进。"
  };
}

function buildFreeWorkWindows(works) {
  const dayCounts = new Map();
  works.forEach((work) => dayCounts.set(work.dateIso, (dayCounts.get(work.dateIso) || 0) + 1));
  const days = Array.from({ length: 14 }, (_, index) => addDays(TODAY_ISO, index));
  const avg = average(days.map((dateIso) => dayCounts.get(dateIso) || 0));
  return days.map((dateIso) => {
    const workCount = dayCounts.get(dateIso) || 0;
    let level = "可插入";
    if (workCount === 0) level = "空闲";
    else if (workCount > Math.max(2, avg * 1.5)) level = "高负荷";
    return {
      dateIso,
      dateLabel: formatDisplayDate(dateIso),
      workCount,
      level,
      suggestion:
        level === "空闲"
          ? "可作为新增工作或补偿调整窗口。"
          : level === "可插入"
            ? "负荷低于均值，可插入轻量工作。"
            : "当天负荷偏高，不建议继续叠加任务。"
    };
  });
}

function buildPersonParticipationStats(works) {
  const stats = new Map();
  works.forEach((work) => {
    const hours = parseTimeRangeHours(work.timeRange);
    (work.personnel || []).forEach((person) => {
      const personName = person.name || person;
      if (!stats.has(personName)) {
        stats.set(personName, {
          personName,
          workIds: new Set(),
          planIds: new Set(),
          posts: new Set(),
          totalHours: 0,
          conflictWorkCount: 0
        });
      }
      const item = stats.get(personName);
      item.workIds.add(work.id);
      item.planIds.add(work.planId);
      item.posts.add(work.position);
      item.totalHours += hours;
      if (work.hasConflictDate) item.conflictWorkCount += 1;
    });
  });

  return [...stats.values()]
    .map((item) => {
      const workCount = item.workIds.size;
      const totalHours = Math.round(item.totalHours * 10) / 10;
      const workloadLevel = workCount >= 8 || totalHours >= 24 ? "高" : workCount <= 2 ? "低" : "正常";
      return {
        personName: item.personName,
        workCount,
        planCount: item.planIds.size,
        postCount: item.posts.size,
        totalHours,
        conflictWorkCount: item.conflictWorkCount,
        workloadLevel
      };
    })
    .sort((left, right) => right.totalHours - left.totalHours || right.workCount - left.workCount);
}

function parseTimeRangeHours(timeRange) {
  const [start, end] = String(timeRange || "08:00-10:00").split("-");
  const toMinutes = (value) => {
    const [hour, minute] = String(value || "00:00").split(":").map(Number);
    return (hour || 0) * 60 + (minute || 0);
  };
  return Math.max(0, (toMinutes(end) - toMinutes(start)) / 60);
}

function getRiskLevel(score) {
  if (score >= 80) return "严重";
  if (score >= 60) return "高";
  if (score >= 35) return "中";
  return "低";
}

function getRiskTrend(score, openRiskCount, closedRiskCount) {
  if (score >= 60 || openRiskCount > closedRiskCount) return "上升";
  if (closedRiskCount > openRiskCount && score < 35) return "下降";
  return "平稳";
}

function getDominantProgressStatus(counts) {
  const order = ["超期", "临期", "滞后", "正常", "提前", "已完成"];
  return order.find((status) => counts[status]) || "正常";
}

function buildGroupedAssessments(items, keyName) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item[keyName] || "unknown";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });
  return [...groups.entries()].map(([key, groupedItems]) => ({ key, items: groupedItems }));
}

function countBy(items, keyName) {
  return items.reduce((acc, item) => {
    const key = item[keyName] || "未知";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function average(values) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return Math.round(sum(valid) / valid.length);
}

function calculateRate(value, total) {
  if (!total) return 100;
  return Math.round((value / total) * 100);
}

function riskTone(level) {
  if (level === "严重") return "danger";
  if (level === "高") return "warning";
  if (level === "中") return "info";
  return "success";
}

function progressTone(status) {
  if (status === "超期") return "danger";
  if (status === "临期") return "orange";
  if (status === "滞后") return "warning";
  if (status === "提前" || status === "已完成") return "success";
  return "info";
}

function marginTone(level) {
  if (level === "不足") return "danger";
  if (level === "紧张") return "warning";
  return "success";
}

function workloadTone(level) {
  if (level === "高") return "warning";
  if (level === "低") return "info";
  return "success";
}

function windowTone(level) {
  if (level === "高负荷") return "warning";
  if (level === "空闲") return "success";
  return "info";
}

const calendarMonths = computed(() => {
  if (!normalizedPlans.value.length) return [];
  const startIso = normalizedPlans.value.reduce((min, item) => (compareIso(item.startDate, min) < 0 ? item.startDate : min), normalizedPlans.value[0].startDate);
  const endIso = normalizedPlans.value.reduce((max, item) => (compareIso(item.endDate, max) > 0 ? item.endDate : max), normalizedPlans.value[0].endDate);
  return buildCalendarMonths(startIso, endIso, normalizedPlans.value, monitoringKeyNodesByDate.value);
});

const selectedDayWorks = computed(() => {
  if (!state.selectedDayIso) return [];
  return buildWorksForDate(state.selectedDayIso, normalizedPlans.value);
});

function buildWorksForDate(dateIso, plans = normalizedPlans.value) {
  if (!dateIso) return [];
  const works = [];

  plans.forEach((plan) => {
    if (plan.sourceType === "launch") {
      if (compareIso(plan.startDate, dateIso) > 0 || compareIso(plan.endDate, dateIso) < 0) return;
      plan.scheduleRows.forEach((row, index) => {
        works.push(buildLaunchWorkItem(plan, row, index, dateIso));
      });
      return;
    }
    const workDays = getPlanWorkDays(plan).filter((workDay) => workDay.dateIso === dateIso);
    if (workDays.length) {
      workDays.forEach((workDay) => works.push(buildWorkItemFromWorkDay(plan, workDay)));
      return;
    }
    if (!plan.sourcePlan?.workDays && compareIso(plan.startDate, dateIso) <= 0 && compareIso(plan.endDate, dateIso) >= 0) {
      works.push(buildDerivedWorkItem(plan, dateIso));
    }
  });

  visibleCustomMonitoringWorks.value
    .filter((work) => work.dateIso === dateIso)
    .forEach((work) => works.push(buildCustomMonitoringWorkItem(work)));

  return works
    .map((work) => normalizeDayWorkItem(applyWorkActionOverride(work)))
    .sort(compareDayWorks);
}

function buildWorkItemFromWorkDay(plan, workDay) {
  const action = workDay.actionLabel || "任务执行";
  const timeRange = normalizeTimeRange(workDay.timeRange || "08:00-10:00");
  const workId = `${plan.id}-${workDay.id}`;
  const people = Array.isArray(workDay.personnel)
    ? normalizePersonnelList(workDay.personnel).map((person) => ({
        ...person,
        post: person.post || workDay.position || `${plan.gasLabel}系统执行岗`
      }))
    : inferPeople(plan, action);
  const equipment = Array.isArray(workDay.equipment) ? normalizeEquipmentList(workDay.equipment) : inferEquipment(plan, action);
  const riskSet = inferRiskSet(plan, action);
  const constraints = inferConstraints(plan, action, equipment);
  return {
    id: workId,
    planId: plan.id,
    workDayId: workDay.id,
    planName: plan.name,
    planTitle: plan.name,
    workIndexLabel: workDay.workIndexLabel || `第${Math.max(1, diffDays(plan.startDate, workDay.dateIso) + 1)}项工作`,
    flowId: plan.flowId,
    flowTitle: plan.flowTitle,
    gasType: plan.gasType,
    gasLabel: plan.gasLabel,
    dateIso: workDay.dateIso,
    timeRange,
    sortKey: getTimeRangeStartLabel(timeRange),
    startMinutes: getTimeRangeStartMinutes(timeRange),
    actionLabel: action,
    personnel: people,
    equipment,
    position: workDay.position || people[0]?.post || `${plan.gasLabel}系统执行岗`,
    status: workDay.status || plan.completionMeta?.status || "未开始",
    progress: plan.completionMeta?.progress || 0,
    risks: riskSet.risks,
    constraints,
    processSteps: inferProcessSteps(plan, action),
    progressMeta: workProgressStore.value[workId] || createEmptyProgress(),
    weaknesses: riskSet.weaknesses,
    notices: riskSet.notices,
    tips: riskSet.tips,
    hasConflict: isMonitorWorkDayConflict(plan, workDay),
    hasConflictDate: isMonitorWorkDayConflict(plan, workDay)
  };
}

function normalizeTimeRange(timeRange) {
  const text = String(timeRange || "08:00-10:00").trim();
  const parts = text
    .replace(/[—–至到~～]/g, "-")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  const start = normalizeClockLabel(parts[0] || "08:00");
  const end = normalizeClockLabel(parts[1] || start);
  return `${start}-${end}`;
}

function normalizeClockLabel(value) {
  const match = String(value || "").replace("：", ":").match(/(\d{1,2})(?::(\d{1,2}))?/);
  if (!match) return "08:00";
  const hours = Math.max(0, Math.min(24, Number(match[1]) || 0));
  const minutes = Math.max(0, Math.min(59, Number(match[2] || 0) || 0));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getTimeRangeStartLabel(timeRange) {
  return normalizeTimeRange(timeRange).split("-")[0] || "08:00";
}

function getTimeRangeEndLabel(timeRange) {
  return normalizeTimeRange(timeRange).split("-")[1] || getTimeRangeStartLabel(timeRange);
}

function getTimeRangeStartMinutes(timeRange) {
  const [hours, minutes] = getTimeRangeStartLabel(timeRange).split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 8) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function getTimeRangeEndMinutes(timeRange) {
  const [hours, minutes] = getTimeRangeEndLabel(timeRange).split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 8) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function normalizeDayWorkItem(work) {
  const timeRange = normalizeTimeRange(work.timeRange || "08:00-10:00");
  const actionLabel = work.actionLabel || "任务执行";
  const flowId = work.flowId || "custom";
  const gasType = work.gasType || (state.selectedGas === "all" ? "" : state.selectedGas);
  const risks = normalizeTextList(work.risks);
  const weaknesses = normalizeTextList(work.weaknesses);
  const notices = normalizeTextList(work.notices);
  const tips = normalizeTextList(work.tips);
  const processSteps = normalizeTextList(work.processSteps);

  return {
    ...work,
    timeRange,
    sortKey: getTimeRangeStartLabel(timeRange),
    startMinutes: getTimeRangeStartMinutes(timeRange),
    planTitle: work.planTitle || work.planName || "临时补充工作",
    workIndexLabel: work.workIndexLabel || "当日工作",
    actionLabel,
    flowId,
    flowTitle: work.flowTitle || flowMetaMap[flowId]?.title || "临时工作",
    gasType,
    gasLabel: work.gasLabel || gasLabelMap[gasType] || gasLabelMap[state.selectedGas] || "全部气体",
    position: work.position || "待分配岗位",
    personnel: normalizePersonnelList(work.personnel),
    equipment: normalizeEquipmentList(work.equipment),
    constraints: normalizeConstraintList(work.constraints),
    processSteps: processSteps.length ? processSteps : [`确认${actionLabel}的执行条件`, `完成${actionLabel}并同步记录结果`],
    progressMeta: work.progressMeta || workProgressStore.value[work.id] || createEmptyProgress(),
    risks: risks.length ? risks : ["常规风险，按流程执行"],
    weaknesses: weaknesses.length ? weaknesses : ["当前工作需关注现场交接和资源协同"],
    notices: notices.length ? notices : ["执行前复核时间、人员和设备占用情况"],
    tips: tips.length ? tips : ["如与既有计划冲突，请优先在监控日历中调整窗口"],
    operationStatus: work.operationStatus || "",
    hasConflictDate: Boolean(work.hasConflictDate || work.hasConflict || isWorkConflictDate(work))
  };
}

function compareDayWorks(left, right) {
  return (
    (left.startMinutes || 0) - (right.startMinutes || 0) ||
    getTimeRangeEndMinutes(left.timeRange) - getTimeRangeEndMinutes(right.timeRange) ||
    String(left.planTitle || "").localeCompare(String(right.planTitle || ""), "zh-CN") ||
    String(left.actionLabel || "").localeCompare(String(right.actionLabel || ""), "zh-CN") ||
    String(left.id || "").localeCompare(String(right.id || ""))
  );
}

function buildWorkTimelineGroups(works) {
  const groups = new Map();

  works.forEach((work) => {
    const normalized = normalizeDayWorkItem(work);
    const key = `${normalized.startMinutes}-${normalized.timeRange}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        sortKey: normalized.sortKey,
        startMinutes: normalized.startMinutes,
        timeRange: normalized.timeRange,
        works: []
      });
    }
    groups.get(key).works.push(normalized);
  });

  return [...groups.values()]
    .map((group) => ({
      ...group,
      works: [...group.works].sort(compareDayWorks)
    }))
    .sort((left, right) => left.startMinutes - right.startMinutes || left.timeRange.localeCompare(right.timeRange));
}

const selectedDayTimelineGroups = computed(() => buildWorkTimelineGroups(selectedDayWorks.value));

const selectedDayScaleTicks = computed(() => {
  const startMinutes = 6 * 60;
  const endMinutes = 24 * 60;
  const tickMinutes = [6 * 60, 12 * 60, 18 * 60, 24 * 60];

  return tickMinutes.map((minutes, index) => ({
    label: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:00`,
    top: `${((minutes - startMinutes) / (endMinutes - startMinutes)) * 100}%`,
    isEnd: index === tickMinutes.length - 1
  }));
});

const selectedDayWeather = computed(() => buildWeatherInfo(state.selectedDayIso || TODAY_ISO));

const selectedWork = computed(() => selectedDayWorks.value.find((item) => item.id === state.selectedWorkId) || null);

const selectedWorkEvidence = computed(() => {
  if (!selectedWork.value) return {};
  return evidenceStore.value[selectedWork.value.id] || createEmptyEvidence();
});

const selectedWorkProgress = computed(() => {
  if (!selectedWork.value) return createEmptyProgress();
  return workProgressStore.value[selectedWork.value.id] || createEmptyProgress();
});

function buildHistoryCalendarEntry(snapshot, archivedAt) {
  const historyId = `monitoring-calendar-history-${snapshot.gasType}`;
  return {
    id: historyId,
    kind: "monitoring-calendar-history",
    category: "历史日历",
    gasType: snapshot.gasType,
    gasLabel: snapshot.gasLabel,
    title: `${snapshot.gasLabel}系统流程动态监控历史日历`,
    system: `${snapshot.gasLabel}系统`,
    owner: "系统工程师",
    status: "已归档",
    type: "历史日历",
    risk: "低",
    date: snapshot.plans.at(-1)?.endDate || "",
    startTime: `${snapshot.plans[0]?.startDate || TODAY_ISO}T08:00`,
    endTime: `${snapshot.plans.at(-1)?.endDate || TODAY_ISO}T18:00`,
    archivedAt,
    totalPlans: snapshot.totalPlans,
    completedPlans: snapshot.completedPlans,
    dateRange: snapshot.dateRange,
    historySignature: snapshot.historySignature,
    taskCode: `HIS-${snapshot.gasType.toUpperCase()}-${String((snapshot.plans[0]?.startDate || "2026-01-01")).slice(0, 4)}`,
    tags: ["历史日历", snapshot.gasLabel, "流程动态监控"],
    plans: snapshot.plans.map((plan) => ({
      id: plan.id,
      flowTitle: plan.flowTitle,
      name: plan.name,
      startDate: plan.startDate,
      endDate: plan.endDate,
      color: plan.color,
      completionMeta: plan.completionMeta
    }))
  };
}

function buildHistoryPlanEntries(snapshot, archivedAt) {
  const historyId = `monitoring-calendar-history-${snapshot.gasType}`;
  return snapshot.plans.map((plan, index) => ({
    id: `${historyId}-plan-${plan.id}`,
    parentHistoryId: historyId,
    sourcePlanId: plan.id,
    kind: "monitoring-plan-history",
    category: "工作计划",
    gasType: snapshot.gasType,
    gasLabel: snapshot.gasLabel,
    title: plan.name,
    planTitle: plan.name,
    flowTitle: plan.flowTitle,
    system: `${snapshot.gasLabel}系统`,
    owner: `${snapshot.gasLabel}系统指挥员`,
    status: "已完成",
    type: plan.flowTitle,
    risk: "低",
    date: plan.endDate,
    startTime: `${plan.startDate}T08:00`,
    endTime: `${plan.endDate}T18:00`,
    archivedAt,
    dateRange: `${formatDisplayDate(plan.startDate)} - ${formatDisplayDate(plan.endDate)}`,
    taskCode: `PLAN-${snapshot.gasType.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
    tags: ["历史工作计划", snapshot.gasLabel, plan.flowTitle],
    completionMeta: plan.completionMeta
  }));
}

function buildHistoryWorkEntries(snapshot, archivedAt) {
  const historyId = `monitoring-calendar-history-${snapshot.gasType}`;
  const workEntries = [];

  snapshot.plans.forEach((plan, planIndex) => {
    if (plan.sourceType === "launch") {
      (plan.scheduleRows || []).forEach((row, rowIndex) => {
        const work = buildLaunchWorkItem(plan, row, rowIndex, plan.startDate);
        workEntries.push({
          id: `${historyId}-work-${work.id}`,
          parentHistoryId: historyId,
          sourcePlanId: plan.id,
          sourceWorkId: work.id,
          kind: "monitoring-work-history",
          category: "工作",
          gasType: snapshot.gasType,
          gasLabel: snapshot.gasLabel,
          title: `${work.planTitle} - ${work.actionLabel}`,
          planTitle: work.planTitle,
          flowTitle: work.flowTitle,
          system: `${snapshot.gasLabel}系统`,
          owner: work.personnel?.[0]?.name || `${snapshot.gasLabel}岗位人员`,
          personnel: (work.personnel || []).map((item) => item.name),
          status: "已完成",
          type: work.flowTitle,
          risk: work.risks?.[0] || "常规风险",
          date: work.dateIso,
          startTime: `${work.dateIso}T${(work.timeRange || "08:00-10:00").split("-")[0]}`,
          endTime: `${work.dateIso}T${(work.timeRange || "08:00-10:00").split("-")[1]}`,
          archivedAt,
          dateRange: `${formatDisplayDate(work.dateIso)} ${work.timeRange}`,
          taskCode: `WORK-${snapshot.gasType.toUpperCase()}-${String(planIndex + 1).padStart(2, "0")}-${String(rowIndex + 1).padStart(2, "0")}`,
          tags: ["历史工作", snapshot.gasLabel, work.actionLabel, work.flowTitle]
        });
      });
      return;
    }

    enumerateDates(plan.startDate, plan.endDate).forEach((dateIso, dateIndex) => {
      const work = buildDerivedWorkItem(plan, dateIso);
      workEntries.push({
        id: `${historyId}-work-${work.id}`,
        parentHistoryId: historyId,
        sourcePlanId: plan.id,
        sourceWorkId: work.id,
        kind: "monitoring-work-history",
        category: "工作",
        gasType: snapshot.gasType,
        gasLabel: snapshot.gasLabel,
        title: `${work.planTitle} - ${work.actionLabel}`,
        planTitle: work.planTitle,
        flowTitle: work.flowTitle,
        system: `${snapshot.gasLabel}系统`,
        owner: work.personnel?.[0]?.name || `${snapshot.gasLabel}岗位人员`,
        personnel: (work.personnel || []).map((item) => item.name),
        status: "已完成",
        type: work.flowTitle,
        risk: work.risks?.[0] || "常规风险",
        date: work.dateIso,
        startTime: `${work.dateIso}T${(work.timeRange || "08:00-10:00").split("-")[0]}`,
        endTime: `${work.dateIso}T${(work.timeRange || "08:00-10:00").split("-")[1]}`,
        archivedAt,
        dateRange: `${formatDisplayDate(work.dateIso)} ${work.timeRange}`,
        taskCode: `WORK-${snapshot.gasType.toUpperCase()}-${String(planIndex + 1).padStart(2, "0")}-${String(dateIndex + 1).padStart(2, "0")}`,
        tags: ["历史工作", snapshot.gasLabel, work.actionLabel, work.flowTitle]
      });
    });
  });

  return workEntries;
}

function buildHistoryArchiveEntries(snapshot, archivedAt) {
  return [
    buildHistoryCalendarEntry(snapshot, archivedAt),
    ...buildHistoryPlanEntries(snapshot, archivedAt),
    ...buildHistoryWorkEntries(snapshot, archivedAt)
  ];
}

function clearHistoryArchiveEntries(gasType) {
  const historyId = `monitoring-calendar-history-${gasType}`;
  (executedPlans.value || [])
    .filter((item) => item.id === historyId || item.parentHistoryId === historyId)
    .forEach((item) => removeExecutedPlan(item.id));
}

watch(
  gasCalendarSnapshots,
  (snapshots) => {
    snapshots.forEach((snapshot) => {
      const historyId = `monitoring-calendar-history-${snapshot.gasType}`;
      const existing = (executedPlans.value || []).find((item) => item.id === historyId);

      if (snapshot.allCompleted) {
        if (!existing || existing.historySignature !== snapshot.historySignature) {
          const archivedAt = existing?.archivedAt || new Date().toLocaleString("zh-CN", { hour12: false });
          buildHistoryArchiveEntries(snapshot, archivedAt).forEach((entry) => {
            saveExecutedPlan(entry);
          });
        }
        return;
      }

      if (existing) {
        clearHistoryArchiveEntries(snapshot.gasType);
      }
    });
  },
  { immediate: true, deep: true }
);

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function persistEvidence() {
  writeStorage(evidenceStorageKey, evidenceStore.value);
}

function createEmptyEvidence() {
  return {
    signature: { uploaded: false, fileName: "", updatedAt: "" },
    report: { uploaded: false, fileName: "", updatedAt: "" },
    media: { uploaded: false, fileName: "", updatedAt: "" }
  };
}

function createEmptyProgress() {
  return {
    progress: 0,
    status: "未开始",
    updatedAt: ""
  };
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

function diffDays(startIso, endIso) {
  return Math.round((toDate(endIso).getTime() - toDate(startIso).getTime()) / 86400000);
}

function addDays(iso, days) {
  const next = toDate(iso);
  next.setDate(next.getDate() + days);
  return toIso(next.getFullYear(), next.getMonth() + 1, next.getDate());
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

function formatDisplayDate(iso) {
  const date = toDate(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function weekdayLabel(dayIndex) {
  return ["一", "二", "三", "四", "五", "六", "日"][dayIndex];
}

function buildCalendarMonths(startIso, endIso, plans, keyNodeLookup = {}) {
  const months = [];
  const start = toDate(startIso);
  const end = toDate(endIso);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    months.push(buildSingleMonth(cursor.getFullYear(), cursor.getMonth() + 1, plans, keyNodeLookup));
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return months;
}

function buildSingleMonth(year, month, plans, keyNodeLookup = {}) {
  const first = new Date(year, month - 1, 1);
  const totalDays = getDaysInMonth(year, month);
  const leading = (first.getDay() + 6) % 7;
  const cells = [];

  for (let index = leading; index > 0; index -= 1) {
    const date = new Date(year, month - 1, 1 - index);
    const iso = toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
    cells.push(buildCell(date, iso, true, keyNodeLookup));
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const iso = toIso(year, month, day);
    cells.push(buildCell(new Date(year, month - 1, day), iso, false, keyNodeLookup));
  }

  while (cells.length % 7 !== 0) {
    const date = new Date(year, month - 1, totalDays + (cells.length % 7));
    const iso = toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
    cells.push(buildCell(date, iso, true, keyNodeLookup));
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
    title: `${year}年${month}月监控计划`,
    weeks
  };
}

function buildCell(date, iso, outside, keyNodeLookup = {}) {
  const weekday = date.getDay();
  return {
    iso,
    day: date.getDate(),
    outside,
    isWeekend: weekday === 0 || weekday === 6,
    isToday: iso === TODAY_ISO,
    holidayLabel: getHolidayLabel(iso),
    keyNodes: keyNodeLookup[iso] || []
  };
}

function getHolidayLabel(iso) {
  const holidayMap = {
    "2026-05-01": "劳动节",
    "2026-05-02": "劳动节",
    "2026-05-03": "劳动节",
    "2026-10-01": "国庆",
    "2026-10-02": "国庆",
    "2026-10-03": "国庆"
  };
  return holidayMap[iso] || "";
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
    background: strip.completionMeta?.complete ? "linear-gradient(135deg, #69788f 0%, #465465 100%)" : strip.color,
    opacity: strip.completionMeta?.complete ? 0.72 : 1
  };
}

function planDragStyle(stripId, baseStyle) {
  if (!(dragState.active && dragState.planId === stripId)) return baseStyle;
  return {
    ...baseStyle,
    transform: `translateX(${dragState.deltaX}px)`,
    zIndex: 8
  };
}

function getConstraintName(constraintId) {
  return catalog.constraints.find((item) => item.id === constraintId)?.name || constraintId;
}

function rangesOverlap(left, right) {
  return collectOverlapDates(left, right).length > 0;
}

function collectOverlapDates(left, right) {
  const leftDates = getPlanWorkDateSet(left);
  const rightDates = getPlanWorkDateSet(right);
  return [...leftDates].filter((dateIso) => rightDates.has(dateIso)).sort(compareIso);
}

function includesAny(text, keywords) {
  const source = String(text || "");
  return keywords.some((keyword) => source.includes(keyword));
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

function monitorWorkDayDragStyle(planId, workDayId, baseStyle) {
  if (!(dragState.active && dragState.planId === planId && dragState.workDayId === workDayId)) return baseStyle;
  return {
    ...baseStyle,
    transform: `translateX(${dragState.deltaX}px)`,
    zIndex: 8
  };
}

function getConflictReasonFromItem(item) {
  const typeText = `${item.type || ""}${item.message || ""}`;
  if (typeText.includes("人员")) return `${describeList(item.highlightPeople)}在同一日期窗口被两个计划同时占用，无法同时执行两项工作。`;
  if (typeText.includes("设备") || typeText.includes("资源")) return `${describeList(item.highlightEquipment)}在同一日期窗口被两个计划同时占用，存在设备资源共占。`;
  if (typeText.includes("同名") || typeText.includes("工作")) return "两个同名或同类工作在同一日期窗口重复排布，容易造成重复执行、职责边界不清或资源重复占用。";
  if (typeText.includes("节假") || typeText.includes("休息")) return "计划窗口进入休息日或节假日，容易影响人员值守、设备保障和现场协调响应。";
  if (typeText.includes("关键") || typeText.includes("质量") || typeText.includes("前置")) return "该计划包含关键节点、质量确认或前置条件约束，调整后可能影响前后顺序。";
  return item.message || "计划调整后触发约束校核。";
}

function finalizeConflictDetails(conflicts, candidate, comparisonPlans) {
  return conflicts.map((item) => {
    if (item.detailText) return item;
    const conflictPlan = comparisonPlans.find(
      (plan) => plan.name === item.relatedPlanName || item.key?.includes(plan.id)
    );
    const isPeopleConflict = `${item.type || ""}${item.message || ""}`.includes("人员");
    const isEquipmentConflict = `${item.type || ""}${item.message || ""}`.includes("设备");
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

function buildMonitoringSourceLabel(plan) {
  return state.selectedGas === "all" ? `${plan.gasLabel} / ${plan.flowTitle}` : plan.flowTitle;
}

function normalizeMonitoringPlanMeta(plan) {
  const sourcePlan = plan.sourcePlan || {};
  const inferredEquipment = inferEquipment(plan, "任务执行");
  const inferredConstraints = inferConstraints(plan, "任务执行", inferredEquipment).map((item) => item.id);
  return {
    ...plan,
    sourceLabel: buildMonitoringSourceLabel(plan),
    assignees: Array.isArray(sourcePlan.assignees) && sourcePlan.assignees.length
      ? [...sourcePlan.assignees]
      : inferPeople(plan, "任务执行").map((item) => item.name),
    equipment: Array.isArray(sourcePlan.equipment) && sourcePlan.equipment.length
      ? [...sourcePlan.equipment]
      : inferredEquipment,
    constraintIds: Array.isArray(sourcePlan.constraintIds) && sourcePlan.constraintIds.length
      ? [...sourcePlan.constraintIds]
      : inferredConstraints
  };
}

function buildMonitoringConstraintConflicts(plan, shiftDays) {
  const conflicts = [];
  const activeConstraintIds = plan.constraintIds || [];
  const planDates = getPlanWorkDays(plan).map((item) => item.dateIso);
  const highlightedDates = planDates.map(formatDisplayDate);
  const restDates = planDates.filter((iso) => {
    const weekday = toDate(iso).getDay();
    return weekday === 0 || weekday === 6 || Boolean(getHolidayLabel(iso));
  });

  if (restDates.length && activeConstraintIds.some((item) => ["c1", "c9"].includes(item))) {
    conflicts.push({
      key: `${plan.id}-rest`,
      type: getConstraintName(activeConstraintIds.find((item) => ["c1", "c9"].includes(item))),
      message: `计划“${plan.name}”调整后占用了休息日窗口：${restDates.map(formatDisplayDate).join("、")}`,
      suggestion: "接受提醒则恢复原位，忽略则保留调整并记录。",
      relatedFlow: plan.sourceLabel,
      relatedPlanName: plan.name,
      highlightPeople: [],
      highlightEquipment: [],
      highlightDates: restDates.map(formatDisplayDate)
    });
  }

  if (shiftDays < 0 && activeConstraintIds.includes("c5")) {
    conflicts.push({
      key: `${plan.id}-quality`,
      type: getConstraintName("c5"),
      message: `计划“${plan.name}”前移后可能打破质量确认点顺序。`,
      suggestion: "建议保留当前窗口，或补充复核节点后再调整。",
      relatedFlow: plan.sourceLabel,
      relatedPlanName: plan.name,
      highlightPeople: [...(plan.assignees || [])],
      highlightEquipment: [...(plan.equipment || [])],
      highlightDates: highlightedDates
    });
  }

  if (shiftDays < 0 && activeConstraintIds.includes("c2")) {
    conflicts.push({
      key: `${plan.id}-predecessor`,
      type: getConstraintName("c2"),
      message: `计划“${plan.name}”前移后需要重新确认前置条件是否已完成。`,
      suggestion: "建议恢复原排期，或补齐前置条件确认后再继续。",
      relatedFlow: plan.sourceLabel,
      relatedPlanName: plan.name,
      highlightPeople: [...(plan.assignees || [])],
      highlightEquipment: [],
      highlightDates: highlightedDates
    });
  }

  if (shiftDays > 0 && activeConstraintIds.includes("c6")) {
    conflicts.push({
      key: `${plan.id}-window`,
      type: getConstraintName("c6"),
      message: `计划“${plan.name}”后移后可能侵入任务窗口或影响后续维护动作。`,
      suggestion: "建议保持原位，确保维护和检修窗口不被压缩。",
      relatedFlow: plan.sourceLabel,
      relatedPlanName: plan.name,
      highlightPeople: [...(plan.assignees || [])],
      highlightEquipment: [...(plan.equipment || [])],
      highlightDates: highlightedDates
    });
  }

  if (activeConstraintIds.includes("c10") && (!plan.assignees || plan.assignees.length < 2)) {
    conflicts.push({
      key: `${plan.id}-double-check`,
      type: getConstraintName("c10"),
      message: `计划“${plan.name}”需要双岗确认，但当前分配人员不足。`,
      suggestion: "建议补充第二执行岗位后再保留本次调整。",
      relatedFlow: plan.sourceLabel,
      relatedPlanName: plan.name,
      highlightPeople: [...(plan.assignees || [])],
      highlightEquipment: [...(plan.equipment || [])],
      highlightDates: highlightedDates
    });
  }

  return conflicts;
}

function buildShiftedMonitoringWorkDayPlan(plan, workDayId, shiftDays) {
  const workDays = getPlanWorkDays(plan).map((workDay) =>
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
  const dates = workDays.map((item) => item.dateIso).sort(compareIso);
  return {
    ...plan,
    startDate: dates[0] || plan.startDate,
    endDate: dates[dates.length - 1] || plan.endDate,
    workDays
  };
}

function detectMonitoringShiftConflicts(planId, shiftDays, workDayId = "") {
  const targetPlan = normalizedPlans.value.find((plan) => plan.id === planId);
  if (!targetPlan) return { candidate: null, conflicts: [] };

  const normalizedTarget = normalizeMonitoringPlanMeta(targetPlan);
  const candidate = workDayId
    ? buildShiftedMonitoringWorkDayPlan(normalizedTarget, workDayId, shiftDays)
    : {
        ...normalizedTarget,
        startDate: addDays(normalizedTarget.startDate, shiftDays),
        endDate: addDays(normalizedTarget.endDate, shiftDays),
        workDays: getPlanWorkDays(normalizedTarget).map((workDay) => ({ ...workDay, dateIso: addDays(workDay.dateIso, shiftDays) }))
      };

  const conflicts = [...buildMonitoringConstraintConflicts(candidate, shiftDays)].map((item) => ({ ...item, workDayId }));

  const comparisonPlans = normalizedPlans.value
    .filter((plan) => plan.id !== planId)
    .map((plan) => normalizeMonitoringPlanMeta(plan));

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
      const sharedPeople = candidate.assignees.filter((name) => otherPlan.assignees.includes(name));
      if (sharedPeople.length) {
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

      const sharedEquipment = candidate.equipment.filter((name) => otherPlan.equipment.includes(name));
      if (sharedEquipment.length) {
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
          type: "工作冲突",
          message: `计划“${candidate.name}”与${otherPlan.sourceLabel}存在同名工作重叠。`,
          suggestion: "建议重新排布窗口，避免重复占用执行时段。",
          relatedFlow: otherPlan.sourceLabel,
          relatedPlanName: otherPlan.name,
          highlightPeople: [...sharedPeople],
          highlightEquipment: [...sharedEquipment],
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

function openMonitorConflictModal(planId, planName, shiftDays, conflicts, workDayId = "") {
  monitorConflictModal.open = true;
  monitorConflictModal.planId = planId;
  monitorConflictModal.planName = planName;
  monitorConflictModal.workDayId = workDayId;
  monitorConflictModal.shiftDays = shiftDays;
  monitorConflictModal.conflicts = conflicts;
}

function closeMonitorConflictModal() {
  monitorConflictModal.open = false;
  monitorConflictModal.planId = "";
  monitorConflictModal.planName = "";
  monitorConflictModal.workDayId = "";
  monitorConflictModal.shiftDays = 0;
  monitorConflictModal.conflicts = [];
}

function appendMonitoringConflictRecord(plan, conflicts) {
  return {
    id: `monitor-conflict-${Date.now()}`,
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
  };
}

function acceptMonitoringConflictReminder() {
  closeMonitorConflictModal();
  showToast("已接受冲突提醒，本次拖拽未生效。");
}

function ignoreMonitoringConflictAndApply() {
  const { planId, shiftDays, conflicts, workDayId } = monitorConflictModal;
  const result = detectMonitoringShiftConflicts(planId, shiftDays, workDayId);
  if (!result.candidate) {
    closeMonitorConflictModal();
    return;
  }

  const targetPlan = normalizedPlans.value.find((plan) => plan.id === planId);
  const conflictEntry = appendMonitoringConflictRecord(result.candidate, conflicts.length ? conflicts : result.conflicts);

  if (targetPlan?.sourceType === "calendar") {
    const sourcePlans = targetPlan.flowId === "fuel"
      ? [...(fuelPlanningPacket.value?.gasPackets?.[targetPlan.gasType]?.calendarPlans || [])]
      : [...(genericPlanningPackets.value?.[targetPlan.flowId]?.gasPackets?.[targetPlan.gasType]?.calendarPlans || [])];

    const updatedPlans = sourcePlans.map((plan) =>
      plan.id === targetPlan.sourcePlan.id
        ? {
            ...plan,
            startDate: result.candidate.startDate,
            endDate: result.candidate.endDate,
            workDays: (result.candidate.workDays || []).map(({ id, dateIso, actionLabel, timeRange, personnel, equipment, position, status, sortKey }) => ({
              id,
              dateIso,
              actionLabel,
              timeRange,
              personnel,
              equipment,
              position,
              status,
              sortKey
            })),
            assignees: [...(result.candidate.assignees || [])],
            equipment: [...(result.candidate.equipment || [])],
            constraintIds: [...(result.candidate.constraintIds || [])]
          }
        : plan
    );

    if (targetPlan.flowId === "fuel") {
      const gasPacket = fuelPlanningPacket.value?.gasPackets?.[targetPlan.gasType] || {};
      saveFuelGasCalendar(targetPlan.gasType, {
        ...gasPacket,
        calendarPlans: updatedPlans,
        conflictRecords: [conflictEntry, ...(gasPacket.conflictRecords || [])],
        planStatus: gasPacket.planStatus === "executing" ? gasPacket.planStatus : "draft",
        lastEditedBy: currentUser.value?.roleLabel || "岗位人员"
      });
    } else {
      const flowPacket = genericPlanningPackets.value?.[targetPlan.flowId]?.gasPackets?.[targetPlan.gasType] || {};
      saveGenericFlowCalendar(targetPlan.flowId, targetPlan.gasType, {
        ...flowPacket,
        calendarPlans: updatedPlans,
        conflictRecords: [conflictEntry, ...(flowPacket.conflictRecords || [])],
        planStatus: flowPacket.planStatus === "executing" ? flowPacket.planStatus : "draft",
        lastEditedBy: currentUser.value?.roleLabel || "岗位人员"
      });
    }
  } else if (targetPlan?.sourceType === "launch") {
    const flowPacket = genericPlanningPackets.value?.launch?.gasPackets?.[targetPlan.gasType] || {};
    saveGenericFlowCalendar("launch", targetPlan.gasType, {
      ...flowPacket,
      launchDay: result.candidate.startDate,
      conflictRecords: [conflictEntry, ...(flowPacket.conflictRecords || [])],
      planStatus: flowPacket.planStatus === "executing" ? flowPacket.planStatus : "draft",
      lastEditedBy: currentUser.value?.roleLabel || "岗位人员"
    });
  }

  closeMonitorConflictModal();
  showToast("已忽略冲突提醒并保留调整，冲突记录已同步到流程动态监控。");
}

function buildWeatherInfo(dateIso) {
  const date = toDate(dateIso);
  const index = (date.getDate() + date.getMonth()) % weatherTemplates.length;
  return weatherTemplates[index];
}

function inferActionList(planName) {
  if (planName.includes("生产")) return ["安全准备", "生产校验", "生产执行", "质量复核"];
  if (planName.includes("转运")) return ["转运准备", "路线确认", "转运执行", "回场确认"];
  if (planName.includes("维修")) return ["安全准备", "故障定位", "开始维修", "复测确认"];
  if (planName.includes("维护")) return ["例行检查", "维护执行", "参数复核", "归档确认"];
  if (planName.includes("供气")) return ["安全准备", "回路检查", "在线保障", "数据记录"];
  if (planName.includes("保障")) return ["资源确认", "窗口核对", "任务执行", "收尾确认"];
  if (planName.includes("试验") || planName.includes("测试")) return ["试验准备", "参数加载", "任务执行", "结果归档"];
  return ["安全准备", "协同确认", "任务执行", "复核归档"];
}

function safeIncludes(text, keyword) {
  return String(text || "").includes(keyword);
}

function findMatchingWorkItems(plan, action) {
  const items = catalog.workItems || [];
  const planName = String(plan.name || "");

  const exactMatches = items.filter((item) =>
    item.flowTypes?.includes(plan.flowId) &&
    safeIncludes(item.name, planName) &&
    safeIncludes(item.name, action)
  );

  if (exactMatches.length) return exactMatches;

  const samePlanMatches = items.filter((item) =>
    item.flowTypes?.includes(plan.flowId) &&
    safeIncludes(item.name, planName)
  );

  if (samePlanMatches.length) return samePlanMatches;

  const actionMatches = items.filter((item) =>
    item.flowTypes?.includes(plan.flowId) &&
    safeIncludes(item.name, action)
  );

  if (actionMatches.length) return actionMatches;

  return items.filter((item) => item.flowTypes?.includes(plan.flowId));
}

function findPeopleByNames(names, flowId) {
  const resolved = names
    .map((name) => catalog.people.find((person) => person.name === name))
    .filter(Boolean);

  if (resolved.length) return resolved;

  const byFlow = catalog.people.filter((person) => person.flowTypes?.includes(flowId));
  return byFlow.slice(0, 3);
}

function inferPeople(plan, action) {
  const matchedItems = findMatchingWorkItems(plan, action);
  const assigneeNames = [...new Set(matchedItems.flatMap((item) => item.defaultAssignees || []))];
  return findPeopleByNames(assigneeNames, plan.flowId);
}

function inferEquipment(plan, action) {
  const matchedItems = findMatchingWorkItems(plan, action);
  const equipment = [...new Set(matchedItems.map((item) => item.defaultEquipment).filter(Boolean))];
  if (equipment.length) return equipment;

  if (plan.name.includes("生产")) return ["低温生产装置", "参数采集终端"];
  if (plan.name.includes("转运")) return ["槽车联锁单元", "转运阀组"];
  if (plan.name.includes("维修")) return ["维修工装箱", "检测仪表"];
  if (plan.name.includes("维护")) return ["维护检查表", "便携检测仪"];
  if (plan.name.includes("供气")) return ["在线供气控制柜", "供气回路监测终端"];
  return ["综合保障终端", "现场记录设备"];
}

function inferConstraints(plan, action, equipmentList) {
  const constraintPool = catalog.constraints.filter((constraint) => constraint.flowTypes?.includes(plan.flowId));
  const selected = [];

  function pushConstraint(id) {
    const item = constraintPool.find((constraint) => constraint.id === id);
    if (item && !selected.some((entry) => entry.id === item.id)) selected.push(item);
  }

  if (plan.flowId !== "launch") pushConstraint("c1");
  if (plan.flowId === "fuel") pushConstraint("c2");
  if (plan.flowId === "mission" || plan.flowId === "fuel") pushConstraint("c3");
  if (plan.flowId === "launch") pushConstraint("c4");
  if (plan.flowId === "repair") pushConstraint("c5");
  if (plan.flowId === "maintenance") pushConstraint("c6");
  if (plan.flowId === "custom") pushConstraint("c7");
  if (equipmentList.length) pushConstraint("c8");
  if (plan.name.includes("补气") || plan.name.includes("转运") || plan.name.includes("维护")) pushConstraint("c9");
  if (action.includes("安全准备") || action.includes("任务执行") || action.includes("在线保障") || action.includes("补气")) pushConstraint("c10");

  return selected.map((constraint) => ({
    id: constraint.id,
    name: constraint.name,
    description: constraint.description,
    effect: constraint.effect
  }));
}

function inferRiskSet(plan, action) {
  return {
    risks: [`${plan.gasLabel}系统在${action}阶段需重点关注时间冲突`, `${plan.flowTitle} 与其他流程存在资源共享风险`],
    weaknesses: ["现场交接窗口短，容易出现确认遗漏", "跨岗位协同时信息传递可能滞后"],
    notices: ["执行前再次核对任务窗口与责任岗位", "关键动作执行后及时上传过程证据"],
    tips: ["专家建议先完成安全准备，再执行主体动作", "若发现设备状态波动，优先启动双岗复核"]
  };
}

function inferProcessSteps(plan, action) {
  if (action.includes("安全准备")) {
    return ["确认作业窗口和工作许可状态", "检查现场安全条件并完成双岗确认"];
  }
  if (action.includes("生产")) {
    return ["核对生产参数和物料状态", "启动生产流程并记录关键参数"];
  }
  if (action.includes("维修")) {
    return ["执行故障隔离和停机确认", "按维修方案完成检修并复测"];
  }
  if (action.includes("转运")) {
    return ["确认转运路线、接口和车辆状态", "执行转运操作并回传过程记录"];
  }
  if (action.includes("在线保障") || action.includes("供气")) {
    return ["检查在线供气回路和联锁状态", "按保障策略执行供气并实时监测"];
  }
  if (action.includes("任务执行")) {
    return ["核对任务执行条件和岗位分工", "按计划完成主体操作并归档记录"];
  }
  if (action.includes("复核") || action.includes("归档")) {
    return ["复核关键数据、签字和质量证据", "完成资料整理并提交归档"];
  }
  return [`核对 ${plan.planTitle || plan.name} 的执行前置条件`, `完成 ${action} 并同步记录执行结果`];
}

function getWorkTypeTag(work) {
  const action = String(work.actionLabel || "");
  const flow = String(work.flowTitle || "");

  if (action.includes("安全")) return { label: "安全准备", tone: "safety" };
  if (action.includes("维修")) return { label: "维修作业", tone: "repair" };
  if (action.includes("转运")) return { label: "转运执行", tone: "transfer" };
  if (action.includes("试验") || action.includes("测试")) return { label: "测试试验", tone: "test" };
  if (action.includes("供气") || action.includes("保障")) return { label: "保障任务", tone: "support" };
  if (action.includes("归档") || action.includes("复核")) return { label: "归档复核", tone: "review" };
  if (action.includes("生产")) return { label: "生产作业", tone: "production" };
  if (flow.includes("发射日")) return { label: "发射日任务", tone: "launch" };
  return { label: "常规工作", tone: "default" };
}

function getWorkStatusIconClass(progressMeta) {
  const status = progressMeta?.status || "未开始";
  if (status === "已完成") return "done";
  if (status === "进行中") return "active";
  return "idle";
}

function buildDerivedWorkItem(plan, dateIso) {
  const dayIndex = diffDays(plan.startDate, dateIso);
  const actions = inferActionList(plan.name);
  const action = actions[dayIndex % actions.length];
  const timeSlots = [
    { start: "08:00", end: "10:00" },
    { start: "10:00", end: "12:00" },
    { start: "14:00", end: "16:00" },
    { start: "16:00", end: "18:00" }
  ];
  const slot = timeSlots[dayIndex % timeSlots.length];
  const riskSet = inferRiskSet(plan, action);
  const personnel = inferPeople(plan, action);
  const equipment = inferEquipment(plan, action);
  const constraints = inferConstraints(plan, action, equipment);

  return {
    id: `${plan.id}-${dateIso}`,
    planId: plan.id,
    dateIso,
    timeRange: `${slot.start}-${slot.end}`,
    sortKey: slot.start,
    planTitle: plan.name,
    workIndexLabel: `第${dayIndex + 1}项工作`,
    actionLabel: action,
    flowId: plan.flowId,
    flowTitle: plan.flowTitle,
    gasLabel: plan.gasLabel,
    status: plan.status,
    position: `${plan.gasLabel}系统${action.includes("维修") ? "维修岗" : "安全岗"}`,
    personnel,
    equipment,
    constraints,
    processSteps: inferProcessSteps(plan, action),
    progressMeta: workProgressStore.value[`${plan.id}-${dateIso}`] || createEmptyProgress(),
    ...riskSet
  };
}

function buildLaunchWorkItem(plan, row, index, dateIso) {
  const riskSet = inferRiskSet(plan, row.action);
  const personnel = inferPeople(plan, row.action);
  const equipment = inferEquipment(plan, row.action);
  const constraints = inferConstraints(plan, row.action, equipment);
  return {
    id: `${plan.id}-${row.id}`,
    planId: plan.id,
    dateIso,
    timeRange: row.timeRange,
    sortKey: row.timeRange.split("-")[0],
    planTitle: row.title,
    workIndexLabel: row.post,
    actionLabel: row.action,
    flowId: plan.flowId,
    flowTitle: plan.flowTitle,
    gasLabel: plan.gasLabel,
    status: plan.status,
    position: `${plan.gasLabel}系统${row.post}`,
    personnel,
    equipment,
    constraints,
    processSteps: inferProcessSteps(plan, row.action),
    progressMeta: workProgressStore.value[`${plan.id}-${row.id}`] || createEmptyProgress(),
    ...riskSet
  };
}

function openDayModal(dateIso) {
  state.selectedDayIso = dateIso;
  state.selectedWorkId = "";
  state.dayModalOpen = true;
}

function openWorkModal(workId) {
  state.selectedWorkId = workId;
  state.workModalOpen = true;
}

function isFlowExpanded(flowId) {
  return state.expandedFlowIds.includes(flowId);
}

function toggleFlowGroup(flowId) {
  state.expandedFlowIds = isFlowExpanded(flowId)
    ? state.expandedFlowIds.filter((id) => id !== flowId)
    : [...state.expandedFlowIds, flowId];
}

function openPlanDetail(planId) {
  state.selectedPlanDetailId = planId;
  state.planDetailModalOpen = true;
}

function closePlanDetail() {
  state.planDetailModalOpen = false;
  state.selectedPlanDetailId = "";
}

function resetCalendarFilter() {
  state.calendarFilterStartDate = "";
  state.calendarFilterEndDate = "";
}

function getDefaultMonitorGanttCenterDate() {
  if (filteredNormalizedPlans.value.length) {
    return filteredNormalizedPlans.value.reduce(
      (earliest, plan) => (compareIso(plan.startDate, earliest) < 0 ? plan.startDate : earliest),
      filteredNormalizedPlans.value[0].startDate
    );
  }
  return normalizedPlans.value[0]?.startDate || TODAY_ISO;
}

function ensureMonitorGanttCenterDate() {
  if (!monitorGanttCenterDate.value || Number.isNaN(toDate(monitorGanttCenterDate.value).getTime())) {
    monitorGanttCenterDate.value = getDefaultMonitorGanttCenterDate();
  }
}

function refreshMonitorGanttView() {
  monitorGanttRenderKey.value += 1;
}

function resetMonitorGanttInteractionState() {
  detachPointerDrag();
  suppressMonitorPlanClick.value = false;
}

function resetMonitoringInteractionState() {
  detachPointerDrag();
  suppressMonitorPlanClick.value = false;
}

function switchMonitoringSubTab(tab) {
  resetMonitoringInteractionState();
  state.monitoringSubTab = tab;
}

function goToFlowPlanning() {
  router.push("/planning");
}

function openScheduleKeyNodeModal(dateIso = monitorGanttVisibleRange.value.startDate, node = null) {
  const target = node || null;
  scheduleKeyNodeForm.id = target?.id || "";
  scheduleKeyNodeForm.dateIso = target?.dateIso || dateIso || TODAY_ISO;
  scheduleKeyNodeForm.title = target?.title || "";
  scheduleKeyNodeForm.nodeType = target?.nodeType || "关键检查";
  scheduleKeyNodeForm.description = target?.description || "";
  scheduleKeyNodeForm.blockScheduling = target?.blockScheduling ?? true;
  state.scheduleKeyNodeError = "";
  state.scheduleKeyNodeModalOpen = true;
}

function closeScheduleKeyNodeModal() {
  state.scheduleKeyNodeModalOpen = false;
  state.scheduleKeyNodeError = "";
}

function saveScheduleKeyNode() {
  if (!scheduleKeyNodeForm.dateIso || !scheduleKeyNodeForm.title.trim()) {
    state.scheduleKeyNodeError = "请填写关键节点名称和日期。";
    return;
  }
  saveGlobalKeyNode({
    id: scheduleKeyNodeForm.id || `schedule-key-node-${Date.now()}`,
    dateIso: scheduleKeyNodeForm.dateIso,
    title: scheduleKeyNodeForm.title.trim(),
    nodeType: scheduleKeyNodeForm.nodeType,
    description: scheduleKeyNodeForm.description.trim(),
    blockScheduling: scheduleKeyNodeForm.blockScheduling,
    scopeFlowIds: ["all"],
    gasTypes: state.selectedGas === "all" ? ["all"] : [state.selectedGas]
  });
  closeScheduleKeyNodeModal();
  showToast("节点保存成功");
}

function removeScheduleKeyNode() {
  if (!scheduleKeyNodeForm.id) return;
  removeGlobalKeyNode(scheduleKeyNodeForm.id);
  closeScheduleKeyNodeModal();
  showToast("节点已删除");
}

function openConfirmModal(action, title, message) {
  state.confirmModalAction = action;
  state.confirmModalTitle = title;
  state.confirmModalMessage = message;
  state.confirmModalOpen = true;
}

function closeConfirmModal() {
  state.confirmModalOpen = false;
  state.confirmModalAction = "";
  state.confirmModalTitle = "";
  state.confirmModalMessage = "";
}

function confirmPendingAction() {
  const action = state.confirmModalAction;
  closeConfirmModal();
  if (action === "delete-plan" && selectedPlanDetail.value) {
    deleteSchedulePlan(selectedPlanDetail.value);
  }
}

function getMonitorGanttDateFromPointer(event) {
  const axis = event.currentTarget?.querySelector?.(".monitor-gantt-axis") || event.currentTarget;
  if (isSingleDayMonitorGantt.value || !event.currentTarget?.querySelector?.(".monitor-gantt-axis")) {
    return monitorGanttVisibleRange.value.startDate;
  }
  const rect = axis?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0) return monitorGanttCenterDate.value || TODAY_ISO;
  const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const ratio = relativeX / rect.width;
  const dayOffset = Math.max(
    0,
    Math.min(
      monitorGanttVisibleRange.value.visibleDays - 1,
      Math.floor(ratio * monitorGanttVisibleRange.value.visibleDays)
    )
  );
  return addDays(monitorGanttVisibleRange.value.startDate, dayOffset);
}

function setMonitorGanttZoomLevel(nextLevel, centerDate = "") {
  const numericLevel = Number(nextLevel);
  const clampedLevel = Math.max(
    0,
    Math.min(monitorGanttZoomLevels.length - 1, Number.isFinite(numericLevel) ? numericLevel : 2)
  );
  monitorGanttCenterDate.value = centerDate || monitorGanttCenterDate.value || getDefaultMonitorGanttCenterDate();
  monitorGanttZoomLevel.value = clampedLevel;
  ensureMonitorGanttCenterDate();
  refreshMonitorGanttView();
}

function zoomMonitorGanttAroundDate(direction, focusDate) {
  resetMonitorGanttInteractionState();
  const oldLevel = Number.isFinite(Number(monitorGanttZoomLevel.value)) ? Number(monitorGanttZoomLevel.value) : 2;
  const nextLevel = Math.max(0, Math.min(monitorGanttZoomLevels.length - 1, oldLevel + direction));
  monitorGanttCenterDate.value = focusDate || monitorGanttCenterDate.value || getDefaultMonitorGanttCenterDate();
  monitorGanttZoomLevel.value = nextLevel;
  refreshMonitorGanttView();
}

function zoomMonitorGantt(direction) {
  resetMonitorGanttInteractionState();
  const oldLevel = Number.isFinite(Number(monitorGanttZoomLevel.value)) ? Number(monitorGanttZoomLevel.value) : 2;
  const next = Math.max(0, Math.min(monitorGanttZoomLevels.length - 1, oldLevel + direction));
  monitorGanttZoomLevel.value = next;
  if (!monitorGanttCenterDate.value) {
    monitorGanttCenterDate.value = getDefaultMonitorGanttCenterDate();
  }
  ensureMonitorGanttCenterDate();
  refreshMonitorGanttView();
}

function handleMonitorGanttWheelZoom(event) {
  if (event.target?.closest?.(".monitor-gantt-toolbar")) return;
  if (!event.ctrlKey || dragState.active) return;
  event.preventDefault();
  event.stopPropagation();
  const focusDate = getMonitorGanttDateFromPointer(event);
  if (focusDate) {
    monitorGanttCenterDate.value = focusDate;
  }
  zoomMonitorGantt(event.deltaY < 0 ? 1 : -1);
}

function setMonitorGanttToday() {
  resetMonitorGanttInteractionState();
  monitorGanttCenterDate.value = TODAY_ISO;
  refreshMonitorGanttView();
}

function resetMonitorGanttView() {
  resetMonitorGanttInteractionState();
  monitorGanttZoomLevel.value = 2;
  monitorGanttCenterDate.value = getDefaultMonitorGanttCenterDate();
  refreshMonitorGanttView();
}

function monitorGanttAxisCellStyle(column) {
  return {
    left: `${column.leftPercent}%`,
    width: `${column.widthPercent}%`
  };
}

function monitorGanttPlanStyle(row) {
  return {
    left: `${row.leftPercent}%`,
    width: `${row.widthPercent}%`,
    opacity: row.completionMeta?.complete ? 0.78 : 1
  };
}

function openMonitorGanttWork(work) {
  state.selectedDayIso = work.dateIso;
  openWorkModal(work.id);
}

function openMonitorGanttAddWork() {
  state.selectedDayIso = monitorGanttVisibleRange.value.startDate;
  openAddWorkModal();
}

function openHistoryCompareModal() {
  state.historyCompareModalOpen = true;
  if (!state.selectedCompareHistoryId && monitoringHistoryLibrary.value.length) {
    state.selectedCompareHistoryId = monitoringHistoryLibrary.value[0].id;
  }
  if (!state.selectedComparePlanId && compareCurrentPlans.value.length) {
    state.selectedComparePlanId = compareCurrentPlans.value[0].id;
  }
}

function closeHistoryCompareModal() {
  state.historyCompareModalOpen = false;
}

function selectCompareHistory(historyId) {
  state.selectedCompareHistoryId = historyId;
  if (!compareCurrentPlans.value.some((plan) => plan.id === state.selectedComparePlanId)) {
    state.selectedComparePlanId = compareCurrentPlans.value[0]?.id || "";
  }
}

function closeDayModal() {
  state.dayModalOpen = false;
  state.selectedDayIso = "";
  state.selectedWorkId = "";
}

function closeWorkModal() {
  state.workModalOpen = false;
}

function resetAddWorkForm(dateIso = state.selectedDayIso) {
  const defaultPlan = selectedDayPlanOptions.value[0] || null;
  addWorkForm.mode = "library";
  addWorkForm.sourceRuleId = "";
  addWorkForm.actionLabel = "";
  addWorkForm.dateIso = dateIso || TODAY_ISO;
  addWorkForm.timeRange = "08:00-10:00";
  addWorkForm.planId = defaultPlan?.id || "";
  addWorkForm.personnelText = "";
  addWorkForm.position = defaultPlan ? `${defaultPlan.gasLabel}系统执行岗` : "临时执行岗";
  addWorkForm.equipmentText = "";
  addWorkForm.risksText = "";
  addWorkForm.constraintsText = "";
  addWorkForm.syncToRuleLibrary = true;
}

function openAddWorkModal() {
  resetAddWorkForm(state.selectedDayIso);
  state.addWorkModalOpen = true;
}

function closeAddWorkModal() {
  state.addWorkModalOpen = false;
}

function applyWorkRuleToForm() {
  const rule = monitoringWorkRuleOptions.value.find((item) => item.id === addWorkForm.sourceRuleId);
  if (!rule) return;
  addWorkForm.actionLabel = rule.name || "";
  addWorkForm.personnelText = (rule.defaultAssignees || []).join("、");
  addWorkForm.equipmentText = rule.defaultEquipment || "";
  addWorkForm.risksText = rule.description || "";
  addWorkForm.constraintsText = rule.predecessor && rule.predecessor !== "无" ? `前置：${rule.predecessor}` : "";
  addWorkForm.position = rule.category || addWorkForm.position || "执行岗";
}

function applyPlanToAddWorkForm() {
  const plan = normalizedPlans.value.find((item) => item.id === addWorkForm.planId);
  if (!plan) return;
  addWorkForm.position = addWorkForm.position || `${plan.gasLabel}系统执行岗`;
}

function saveAddedDayWork() {
  if (!addWorkForm.dateIso) {
    showToast("请先选择工作日期");
    return;
  }
  if (!addWorkForm.actionLabel.trim()) {
    showToast("请填写工作名称");
    return;
  }

  const plan = normalizedPlans.value.find((item) => item.id === addWorkForm.planId);
  const flowId = plan?.flowId || "custom";
  const gasType = plan?.gasType || (state.selectedGas === "all" ? "oxygen" : state.selectedGas);
  const personnel = normalizePersonnelList(addWorkForm.personnelText);
  const equipment = normalizeEquipmentList(addWorkForm.equipmentText);
  const risks = normalizeTextList(addWorkForm.risksText);
  const constraints = normalizeConstraintList(addWorkForm.constraintsText);
  const work = addMonitoringWork({
    id: `manual-work-${Date.now()}`,
    source: addWorkForm.mode === "library" ? "library" : "manual",
    sourceRuleId: addWorkForm.sourceRuleId,
    dateIso: addWorkForm.dateIso,
    timeRange: addWorkForm.timeRange || "08:00-10:00",
    planId: plan?.id || "manual-monitoring",
    planName: plan?.name || "临时补充工作",
    flowId,
    flowTitle: plan?.flowTitle || flowMetaMap[flowId]?.title || "临时工作",
    gasType,
    gasLabel: plan?.gasLabel || gasLabelMap[gasType] || "氧气",
    actionLabel: addWorkForm.actionLabel.trim(),
    position: addWorkForm.position || `${gasLabelMap[gasType] || "气体"}系统执行岗`,
    personnel,
    equipment,
    risks: risks.length ? risks : ["手动新增工作，请关注执行窗口和资源占用"],
    constraints,
    status: "draft"
  });

  if (addWorkForm.mode === "manual" && addWorkForm.syncToRuleLibrary) {
    saveWorkRule({
      id: `manual-rule-${Date.now()}`,
      name: addWorkForm.actionLabel.trim(),
      duration: `${parseTimeRangeHours(addWorkForm.timeRange || "08:00-10:00")}小时`,
      predecessor: constraints[0]?.description || "无",
      description: risks.join("；") || "由流程动态监控手动新增工作同步生成。",
      staffing: personnel.map((person) => person.name).join("、") || "待分配",
      evidence: "过程记录、签字表、电子报表",
      responsiblePerson: personnel[0]?.name || currentUser.value?.roleLabel || "岗位人员",
      defaultAssignees: personnel.map((person) => person.name),
      defaultEquipment: equipment.join("、"),
      status: "启用",
      version: "v1.0",
      flowTypes: [flowId]
    });
  }

  state.selectedDayIso = work.dateIso;
  closeAddWorkModal();
  showToast(addWorkForm.mode === "manual" && addWorkForm.syncToRuleLibrary ? "已新增工作，并同步加入工作规则管理库" : "已新增当天工作");
}

function openPersonSchedule(personName) {
  state.selectedPersonName = personName;
  state.personScheduleModalOpen = true;
}

function closePersonSchedule() {
  state.personScheduleModalOpen = false;
  state.selectedPersonName = "";
}

function markDayWorkAction(work, action) {
  saveWorkActionOverride({
    workKey: work.id,
    planId: work.planId,
    dateIso: work.dateIso,
    action,
    reason: `${work.actionLabel}由岗位人员标记为${getWorkActionLabel(action).replace("已标记", "")}`
  });
  showToast(getWorkActionLabel(action));
}

function openHistoryCalendar(item) {
  state.selectedHistoryId = item.id;
  state.historyModalOpen = true;
}

function closeHistoryCalendar() {
  state.historyModalOpen = false;
  state.selectedHistoryId = "";
}

function beginPlanDrag(strip, weekStartIso, event, workDay = null) {
  const stripLayer = event.currentTarget.closest(".monitor-gantt-row-track") || event.currentTarget.closest(".calendar-strip-layer");
  if (!stripLayer) return;
  const isGanttTrack = stripLayer.classList.contains("monitor-gantt-row-track");
  const trackRect = stripLayer.getBoundingClientRect();
  const barRect = event.currentTarget.getBoundingClientRect();
  const relativeX = Math.max(0, Math.min(barRect.width, event.clientX - barRect.left));
  const unitWidth = barRect.width / Math.max(strip.span || diffDays(strip.visibleStartDate || strip.startDate, strip.visibleEndDate || strip.endDate) + 1, 1);
  const localOffset = Math.max(
    0,
    Math.min(
      (strip.span || diffDays(strip.visibleStartDate || strip.startDate, strip.visibleEndDate || strip.endDate) + 1) - 1,
      Math.floor(relativeX / Math.max(unitWidth, 1))
    )
  );
  const trackRelativeX = Math.max(0, Math.min(trackRect.width, event.clientX - trackRect.left));
  const ganttOffset = Math.floor(trackRelativeX / Math.max(trackRect.width / monitorGanttVisibleRange.value.visibleDays, 1));

  dragState.pending = true;
  dragState.active = false;
  dragState.moved = false;
  dragState.planId = strip.id;
  dragState.workDayId = workDay?.id || "";
  dragState.startX = event.clientX;
  dragState.deltaX = 0;
  dragState.dayWidth = isGanttTrack ? stripLayer.clientWidth / monitorGanttVisibleRange.value.visibleDays : stripLayer.clientWidth / 7;
  dragState.clickDateIso = workDay?.dateIso || (
    isGanttTrack
      ? addDays(monitorGanttVisibleRange.value.startDate, Math.max(0, Math.min(monitorGanttVisibleRange.value.visibleDays - 1, ganttOffset)))
      : addDays(weekStartIso, strip.startCol + localOffset)
  );
  dragState.pointerId = event.pointerId ?? null;

  window.addEventListener("pointermove", onPlanPointerMove);
  window.addEventListener("pointerup", onPlanPointerUp);
  window.addEventListener("pointercancel", onPlanPointerUp);
  event.stopPropagation();
}

function openPlanStripDayDetail(strip, weekStartIso, event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const unitWidth = rect.width / Math.max(strip.span, 1);
  const localOffset = Math.max(0, Math.min(strip.span - 1, Math.floor(relativeX / Math.max(unitWidth, 1))));
  const targetDateIso = addDays(weekStartIso, strip.startCol + localOffset);
  openDayModal(targetDateIso);
}

function onPlanPointerMove(event) {
  if (!dragState.pending && !dragState.active) return;
  dragState.deltaX = event.clientX - dragState.startX;
  if (Math.abs(dragState.deltaX) > 6) {
    dragState.active = true;
    dragState.moved = true;
  }
}

function onPlanPointerUp() {
  if (!dragState.pending && !dragState.active) return;

  const shiftDays = Math.round(dragState.deltaX / Math.max(dragState.dayWidth, 1));
  const clickDateIso = dragState.clickDateIso;
  const moved = dragState.moved;
  const planId = dragState.planId;
  const workDayId = dragState.workDayId;

  detachPointerDrag();
  if (moved) {
    suppressMonitorPlanClick.value = true;
    window.setTimeout(() => {
      suppressMonitorPlanClick.value = false;
    }, 0);
  }

  if (moved && shiftDays !== 0) {
    const result = detectMonitoringShiftConflicts(planId, shiftDays, workDayId);
    if (result.conflicts.length) {
      openMonitorConflictModal(planId, result.candidate?.name || "", shiftDays, result.conflicts, workDayId);
      return;
    }
    shiftMonitoringPlanByDays(planId, shiftDays, result.candidate);
    return;
  }

  if (clickDateIso && !workDayId) {
    showMonitorGanttSingleDay(clickDateIso);
  }
}

function detachPointerDrag() {
  dragState.pending = false;
  dragState.active = false;
  dragState.moved = false;
  dragState.planId = "";
  dragState.workDayId = "";
  dragState.startX = 0;
  dragState.deltaX = 0;
  dragState.dayWidth = 0;
  dragState.clickDateIso = "";
  dragState.pointerId = null;
  suppressMonitorPlanClick.value = false;
  window.removeEventListener("pointermove", onPlanPointerMove);
  window.removeEventListener("pointerup", onPlanPointerUp);
  window.removeEventListener("pointercancel", onPlanPointerUp);
}

function shiftMonitoringPlanByDays(planId, shiftDays, candidatePlan = null) {
  const targetPlan = normalizedPlans.value.find((plan) => plan.id === planId);
  if (!targetPlan || shiftDays === 0) return;

  if (targetPlan.sourceType === "calendar") {
    const duration = diffDays(targetPlan.startDate, targetPlan.endDate);
    const nextPlans = targetPlan.flowId === "fuel"
      ? [...(fuelPlanningPacket.value?.gasPackets?.[targetPlan.gasType]?.calendarPlans || [])]
      : [...(genericPlanningPackets.value?.[targetPlan.flowId]?.gasPackets?.[targetPlan.gasType]?.calendarPlans || [])];

    const updatedPlans = nextPlans.map((plan) => {
      if (plan.id !== targetPlan.sourcePlan.id) return plan;
      const nextStart = addDays(plan.startDate, shiftDays);
      const nextEnd = addDays(nextStart, duration);
      return {
        ...plan,
        startDate: candidatePlan?.startDate || nextStart,
        endDate: candidatePlan?.endDate || nextEnd,
        workDays: candidatePlan?.workDays
          ? candidatePlan.workDays.map(({ id, dateIso, actionLabel, timeRange, personnel, equipment, position, status, sortKey }) => ({
              id,
              dateIso,
              actionLabel,
              timeRange,
              personnel,
              equipment,
              position,
              status,
              sortKey
            }))
          : Array.isArray(plan.workDays)
            ? plan.workDays.map((workDay) => ({ ...workDay, dateIso: addDays(workDay.dateIso, shiftDays) }))
            : plan.workDays
      };
    });

    if (targetPlan.flowId === "fuel") {
      const gasPacket = fuelPlanningPacket.value?.gasPackets?.[targetPlan.gasType] || {};
      saveFuelGasCalendar(targetPlan.gasType, {
        ...gasPacket,
        calendarPlans: updatedPlans,
        planStatus: gasPacket.planStatus === "executing" ? gasPacket.planStatus : "draft",
        lastEditedBy: currentUser.value?.roleLabel || "岗位人员"
      });
    } else {
      const flowPacket = genericPlanningPackets.value?.[targetPlan.flowId]?.gasPackets?.[targetPlan.gasType] || {};
      saveGenericFlowCalendar(targetPlan.flowId, targetPlan.gasType, {
        ...flowPacket,
        calendarPlans: updatedPlans,
        planStatus: flowPacket.planStatus === "executing" ? flowPacket.planStatus : "draft",
        lastEditedBy: currentUser.value?.roleLabel || "岗位人员"
      });
    }

    showToast(`已调整 ${targetPlan.name} 的计划时间`);
    return;
  }

  if (targetPlan.sourceType === "launch") {
    const flowPacket = genericPlanningPackets.value?.launch?.gasPackets?.[targetPlan.gasType] || {};
    saveGenericFlowCalendar("launch", targetPlan.gasType, {
      ...flowPacket,
      launchDay: addDays(targetPlan.startDate, shiftDays),
      planStatus: flowPacket.planStatus === "executing" ? flowPacket.planStatus : "draft",
      lastEditedBy: currentUser.value?.roleLabel || "岗位人员"
    });
    showToast(`已调整 ${targetPlan.name} 的发射日安排`);
  }
}

function persistMonitoringCalendarPlan(targetPlan, nextPlans, extraPatch = {}) {
  if (!targetPlan) return;
  if (targetPlan.flowId === "fuel") {
    const gasPacket = fuelPlanningPacket.value?.gasPackets?.[targetPlan.gasType] || {};
    saveFuelGasCalendar(targetPlan.gasType, {
      ...gasPacket,
      calendarPlans: nextPlans,
      planStatus: gasPacket.planStatus === "executing" ? gasPacket.planStatus : "draft",
      lastEditedBy: currentUser.value?.roleLabel || "岗位人员",
      ...extraPatch
    });
    return;
  }
  const flowPacket = genericPlanningPackets.value?.[targetPlan.flowId]?.gasPackets?.[targetPlan.gasType] || {};
  saveGenericFlowCalendar(targetPlan.flowId, targetPlan.gasType, {
    ...flowPacket,
    calendarPlans: nextPlans,
    planStatus: flowPacket.planStatus === "executing" ? flowPacket.planStatus : "draft",
    lastEditedBy: currentUser.value?.roleLabel || "岗位人员",
    ...extraPatch
  });
}

function deleteSchedulePlan(plan) {
  if (!plan) return;
  deleteCalendarPlan(plan.flowId, plan.gasType, plan.sourcePlan?.id || plan.id);
  closePlanDetail();
  showToast("计划已删除");
}

function requestDeleteSelectedPlan() {
  openConfirmModal("delete-plan", "确认删除计划？", "删除后该计划条及关联冲突记录将从日程规划中移除。");
}

function deleteScheduleWorkDay(row, workDay) {
  if (!row || !workDay) return;
  deleteCalendarWorkDay(row.flowId, row.gasType, row.sourcePlan?.id || row.id, workDay.id);
  showToast("工作项已删除");
}

function toggleScheduleWorkLock(row, workDay) {
  if (!row || !workDay || row.sourceType !== "calendar") return;
  const sourcePlans = row.flowId === "fuel"
    ? [...(fuelPlanningPacket.value?.gasPackets?.[row.gasType]?.calendarPlans || [])]
    : [...(genericPlanningPackets.value?.[row.flowId]?.gasPackets?.[row.gasType]?.calendarPlans || [])];
  const updatedPlans = sourcePlans.map((plan) => {
    if (plan.id !== row.sourcePlan.id) return plan;
    const workDays = getPlanWorkDays(row).map((item) =>
      item.id === workDay.id
        ? {
            ...item,
            manualLocked: !item.manualLocked,
            manualLockedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
            manualLockedReason: !item.manualLocked ? "用户锁定" : ""
          }
        : item
    );
    return { ...plan, workDays };
  });
  persistMonitoringCalendarPlan(row, updatedPlans);
  showToast(workDay.manualLocked ? "已取消锁定" : "已锁定该工作");
}

function findReorderDate(plan, workDay, occupiedDates) {
  const candidates = [0, 1, 2, 3, 4, 5, -1, -2, 6, 7].map((offset) => addDays(workDay.dateIso, offset));
  return candidates.find((dateIso) => {
    const key = `${plan.gasType}-${dateIso}`;
    const blocked = (monitoringKeyNodesByDate.value[dateIso] || []).some((node) => node.blockScheduling);
    if (blocked || occupiedDates.has(key)) return false;
    return true;
  });
}

function optimizeScheduleReorder() {
  const changedByPlan = new Map();
  const unresolved = [];
  const occupiedDates = new Set();

  normalizedPlans.value.forEach((plan) => {
    getPlanWorkDays(plan).forEach((workDay) => {
      if (workDay.manualLocked) {
        occupiedDates.add(`${plan.gasType}-${workDay.dateIso}`);
      }
    });
  });

  normalizedPlans.value
    .filter((plan) => plan.sourceType === "calendar")
    .forEach((plan) => {
      const workDays = getPlanWorkDays(plan).map((workDay) => {
        if (workDay.manualLocked) return { ...workDay };
        const nextDate = findReorderDate(plan, workDay, occupiedDates);
        if (!nextDate) {
          unresolved.push({ plan, workDay });
          return { ...workDay };
        }
        occupiedDates.add(`${plan.gasType}-${nextDate}`);
        return { ...workDay, dateIso: nextDate };
      });
      changedByPlan.set(plan.id, { plan, workDays });
    });

  changedByPlan.forEach(({ plan, workDays }) => {
    const sourcePlans = plan.flowId === "fuel"
      ? [...(fuelPlanningPacket.value?.gasPackets?.[plan.gasType]?.calendarPlans || [])]
      : [...(genericPlanningPackets.value?.[plan.flowId]?.gasPackets?.[plan.gasType]?.calendarPlans || [])];
    const updatedPlans = sourcePlans.map((sourcePlan) =>
      sourcePlan.id === plan.sourcePlan.id
        ? {
            ...sourcePlan,
            workDays,
            startDate: workDays.map((item) => item.dateIso).sort(compareIso)[0] || sourcePlan.startDate,
            endDate: workDays.map((item) => item.dateIso).sort(compareIso).at(-1) || sourcePlan.endDate
          }
        : sourcePlan
    );
    persistMonitoringCalendarPlan(plan, updatedPlans);
  });

  showToast(unresolved.length ? "部分工作无法自动重排，已保留原日期" : "已完成智能重排");
}

window.addEventListener("blur", resetMonitorGanttInteractionState);

onBeforeUnmount(() => {
  window.removeEventListener("blur", resetMonitorGanttInteractionState);
  detachPointerDrag();
});

function setGasFilter(gasType) {
  state.selectedGas = gasType;
  closePlanDetail();
  state.selectedCompareHistoryId = "";
}

function showMonitorGanttSingleDay(dateIso) {
  if (!dateIso) return;
  resetMonitorGanttInteractionState();
  monitorGanttCenterDate.value = dateIso;
  monitorGanttZoomLevel.value = monitorGanttZoomLevels.length - 1;
  state.dayModalOpen = false;
  state.selectedDayIso = dateIso;
  state.selectedWorkId = "";
  refreshMonitorGanttView();
}

function handleMonitorWorkDayClick(row, workDay) {
  if (dragState.active) return;
  if (suppressMonitorPlanClick.value) return;
  if (workDay?.hasConflict || getPlanConflictRecords(row, monitoringConflictRecords.value, workDay?.dateIso || "", workDay?.id || "").length) {
    openMonitorPlanConflictRecords(row, workDay);
    return;
  }
  showMonitorGanttSingleDay(workDay.dateIso);
}

function openMonitorGanttDateDetail(dateIso) {
  if (!dateIso || monitorGanttAxisUnit.value !== "day") return;
  showMonitorGanttSingleDay(dateIso);
}

function openMonitorGanttTrackDay(event) {
  if (dragState.active || monitorGanttAxisUnit.value !== "day") return;
  if (suppressMonitorPlanClick.value) return;
  if (event.target?.closest?.(".monitor-gantt-work-day-segment")) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const relativeX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  const unitWidth = rect.width / Math.max(monitorGanttVisibleRange.value.visibleDays, 1);
  const dayOffset = Math.max(0, Math.min(monitorGanttVisibleRange.value.visibleDays - 1, Math.floor(relativeX / Math.max(unitWidth, 1))));
  showMonitorGanttSingleDay(addDays(monitorGanttVisibleRange.value.startDate, dayOffset));
}

function getEvidenceEntry(workId, key) {
  const workEvidence = evidenceStore.value[workId] || createEmptyEvidence();
  return workEvidence[key];
}

function persistWorkProgress() {
  writeStorage(workProgressStorageKey, workProgressStore.value);
}

function progressStatusLabel(progress) {
  if (progress >= 100) return "已完成";
  if (progress > 0) return "进行中";
  return "未开始";
}

function planStripLabel(plan) {
  const completion = plan.completionMeta || { completedCount: 0, totalCount: 0, progress: 0 };
  if (!completion.totalCount) return plan.name;
  return `${plan.name} ${completion.completedCount}/${completion.totalCount} · ${completion.progress}%`;
}

function planDateRange(plan) {
  if (!plan) return "";
  return `${formatDisplayDate(plan.startDate)} - ${formatDisplayDate(plan.endDate)}`;
}

function planStatusLabel(status) {
  const labels = {
    idle: "未生成",
    draft: "草稿中",
    confirmed: "已确认",
    executing: "执行中",
    completed: "已完成"
  };
  return labels[status] || status || "未开始";
}

function getPlanConflictCount(plan) {
  return getPlanConflictItems(plan).length;
}

function isPlanDetailConflictDate(dateIso) {
  if (!dateIso) return false;
  return selectedPlanDetailConflictDates.value.has(dateIso) || selectedPlanDetailConflictDates.value.has(formatDisplayDate(dateIso));
}

function formatWorkPersonnel(work) {
  const names = (work.personnel || []).map((person) => person.name || person).filter(Boolean);
  return names.length ? names.join("、") : "待分配";
}

function formatWorkEquipment(work) {
  return (work.equipment || []).filter(Boolean).join("、") || "待分配";
}

function formatWorkRiskSummary(work) {
  const risk = (work.risks || [])[0];
  const constraint = (work.constraints || [])[0];
  if (risk && constraint) return `${risk}；${constraint.name || "制约关系"}：${constraint.description || constraint.effect || "需关注"}`;
  if (risk) return risk;
  if (constraint) return `${constraint.name || "制约关系"}：${constraint.description || constraint.effect || "需关注"}`;
  return "常规风险，按流程执行";
}

function updateWorkProgress(workId, nextProgress) {
  const previous = workProgressStore.value[workId] || createEmptyProgress();
  const normalized = Math.max(0, Math.min(100, nextProgress));
  workProgressStore.value = {
    ...workProgressStore.value,
    [workId]: {
      progress: normalized,
      status: progressStatusLabel(normalized),
      updatedAt: new Date().toLocaleString("zh-CN", { hour12: false })
    }
  };
  persistWorkProgress();

  const targetPlan = normalizedPlans.value.find((plan) => getPlanWorkKeys(plan).includes(workId));
  if (!targetPlan) return;

  const completion = getPlanCompletionMeta(targetPlan);
  if (previous.progress < 100 && completion.complete) {
    showToast(`计划“${targetPlan.name}”已全部完成，日历条带已转为灰色。`);
  }

  const gasSnapshot = gasCalendarSnapshots.value.find((item) => item.gasType === targetPlan.gasType);
  if (previous.progress < 100 && gasSnapshot?.allCompleted) {
    showToast(`${targetPlan.gasLabel}系统当前整张监控日历已全部执行完成，已自动归档到历史库。`);
  }
}

function suggestedWorkProgress(workId) {
  const evidence = evidenceStore.value[workId] || createEmptyEvidence();
  const uploadedCount = Object.values(evidence).filter((item) => item?.uploaded).length;
  if (uploadedCount >= 3) return 100;
  if (uploadedCount === 2) return 75;
  if (uploadedCount === 1) return 45;
  return workProgressStore.value[workId]?.progress || 0;
}

function setWorkProgressFromInput(workId, value) {
  updateWorkProgress(workId, Number(value));
}

function adjustWorkProgress(workId, delta) {
  const current = workProgressStore.value[workId] || createEmptyProgress();
  updateWorkProgress(workId, current.progress + delta);
}

function markWorkCompleted(workId) {
  updateWorkProgress(workId, 100);
  showToast("该工作已标记为完成");
}

function progressWidth(progress) {
  return `${Math.max(0, Math.min(100, progress || 0))}%`;
}

function handleEvidenceUpload(event, workId, key) {
  const [file] = event.target.files || [];
  if (!file) return;
  const next = {
    ...(evidenceStore.value[workId] || createEmptyEvidence())
  };
  next[key] = {
    uploaded: true,
    fileName: file.name,
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false })
  };
  evidenceStore.value = {
    ...evidenceStore.value,
    [workId]: next
  };
  persistEvidence();
  showToast(`已上传 ${file.name}`);
  event.target.value = "";
}
</script>

<template>
  <div class="fuel-page-stack">
    <div class="topbar">
      <div>
        <h1>日程规划</h1>
        <div class="muted">按气体系统汇总展示从特燃特气筹措到装备维修等全部规划流程，并支持按天查看工作安排、冲突记录和工作详情。</div>
      </div>
    </div>

    <div class="monitoring-subnav">
      <button
        class="monitoring-subtab"
        :class="{ active: state.monitoringSubTab === 'scope' }"
        type="button"
        @click.stop.prevent="switchMonitoringSubTab('scope')"
      >
        <strong>监控范围</strong>
        <span>当前计划 {{ monitoringSummary.totalPlans }} 项</span>
      </button>
      <button
        class="monitoring-subtab"
        :class="{ active: state.monitoringSubTab === 'assessment' }"
        type="button"
        @click.stop.prevent="switchMonitoringSubTab('assessment')"
      >
        <strong>计划执行评估</strong>
        <span>总体风险 {{ overallRiskAssessment.riskLevel }}</span>
      </button>
      <button
        class="monitoring-subtab"
        :class="{ active: state.monitoringSubTab === 'calendar' }"
        type="button"
        @click.stop.prevent="switchMonitoringSubTab('calendar')"
      >
        <strong>日程规划</strong>
        <span>冲突 {{ monitoringConflictRecords.length }} 条</span>
      </button>
    </div>

    <section v-if="state.monitoringSubTab === 'scope'" class="panel">
      <div class="panel-head">
        <div>
          <h3>监控范围</h3>
          <div class="muted">大日历与流程自主规划页保持同一套跨天条带样式，双击某天可查看当天全部工作安排。</div>
        </div>
        <span class="chip active">当前计划 {{ monitoringSummary.totalPlans }} 项</span>
      </div>

      <div class="button-row" style="margin-top: 12px;">
        <button
          v-for="gasType in gasOptions"
          :key="gasType"
          class="tab"
          :class="{ active: state.selectedGas === gasType }"
          type="button"
          @click.stop.prevent="setGasFilter(gasType)"
        >
          {{ gasLabelMap[gasType] }}
        </button>
      </div>

      <div class="planning-summary-grid" style="margin-top: 16px;">
        <div class="summary-line">
          <span>当前气体范围</span>
          <strong>{{ gasLabelMap[state.selectedGas] }}</strong>
        </div>
        <div class="summary-line">
          <span>覆盖工作日</span>
          <strong>{{ monitoringSummary.activeDays }} 天</strong>
        </div>
        <div class="summary-line">
          <span>流程总数</span>
          <strong>{{ monitoringSummary.totalPlans }} 项</strong>
        </div>
      </div>

      <div class="monitor-flow-count-grid">
        <div
          v-for="item in monitoringFlowGroups"
          :key="item.flowId"
          class="monitor-flow-count-card"
          :class="{ expanded: isFlowExpanded(item.flowId) }"
          :style="{ '--flow-color': item.color }"
        >
        <button class="monitor-flow-card-head" type="button" @click.stop.prevent="toggleFlowGroup(item.flowId)">
            <span class="monitor-flow-title">
              <strong>{{ item.title }}</strong>
              <span>{{ item.count }} 项</span>
            </span>
            <span class="monitor-flow-card-meta">
              <span v-if="item.conflictCount" class="monitor-flow-conflict-chip">冲突 {{ item.conflictCount }}</span>
              <span class="monitor-flow-toggle">{{ isFlowExpanded(item.flowId) ? "收起" : "展开" }}</span>
            </span>
          </button>

          <div v-if="isFlowExpanded(item.flowId)" class="monitor-flow-plan-list">
            <button
              v-for="plan in item.plans"
              :key="plan.id"
              class="monitor-flow-plan-item"
              type="button"
              @click.stop.prevent="openPlanDetail(plan.id)"
            >
              <span class="monitor-flow-plan-main">
                <strong>{{ plan.name }}</strong>
                <span>{{ plan.gasLabel }} · {{ planDateRange(plan) }}</span>
              </span>
              <span class="monitor-flow-plan-side">
                <span class="chip" :class="{ active: plan.status === 'confirmed' || plan.status === 'executing' }">
                  {{ planStatusLabel(plan.status) }}
                </span>
                <span class="monitor-flow-progress">{{ plan.completionMeta?.progress || 0 }}%</span>
                <span v-if="buildPlanConflictSummary(plan).hasConflict" class="monitor-flow-conflict-chip">
                  冲突 {{ getPlanConflictCount(plan) }}
                </span>
              </span>
            </button>
            <div v-if="!item.plans.length" class="monitor-flow-empty">暂无计划</div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="state.monitoringSubTab === 'assessment'" class="panel assessment-panel">
      <div class="panel-head">
        <div>
          <h3>计划执行评估</h3>
          <div class="muted">基于当前工作完成情况，评估风险闭环、计划进度、余量窗口和人员参与负荷。</div>
        </div>
        <span class="chip active">评估计划 {{ normalizedPlans.length }} 项</span>
      </div>

      <div class="assessment-summary-grid">
        <div class="summary-line">
          <span>总体风险</span>
          <strong>{{ overallRiskAssessment.riskLevel }}</strong>
          <small>{{ overallRiskAssessment.riskScore }} 分 · {{ overallRiskAssessment.riskTrend }}</small>
        </div>
        <div class="summary-line">
          <span>总体进度</span>
          <strong>{{ assessmentSummary.progressStatus }}</strong>
          <small>平均 {{ overallProgressAssessment.avgProgress }}%</small>
        </div>
        <div class="summary-line">
          <span>临期计划</span>
          <strong>{{ assessmentSummary.dueSoonCount }} 项</strong>
          <small>3 天内到期未完成</small>
        </div>
        <div class="summary-line">
          <span>超期计划</span>
          <strong>{{ assessmentSummary.overdueCount }} 项</strong>
          <small>超过结束日期未完成</small>
        </div>
        <div class="summary-line">
          <span>空闲窗口</span>
          <strong>{{ assessmentSummary.freeWindowCount }} 天</strong>
          <small>未来 14 天可调配窗口</small>
        </div>
        <div class="summary-line">
          <span>高负荷人员</span>
          <strong>{{ assessmentSummary.highLoadPersonCount }} 人</strong>
          <small>按工作数与人时统计</small>
        </div>
      </div>

      <div class="button-row assessment-tabs">
        <button class="tab" :class="{ active: state.assessmentTab === 'risk' }" type="button" @click.stop.prevent="state.assessmentTab = 'risk'">风险评估</button>
        <button class="tab" :class="{ active: state.assessmentTab === 'progress' }" type="button" @click.stop.prevent="state.assessmentTab = 'progress'">进度评估</button>
        <button class="tab" :class="{ active: state.assessmentTab === 'margin' }" type="button" @click.stop.prevent="state.assessmentTab = 'margin'">余量评估</button>
        <button class="tab" :class="{ active: state.assessmentTab === 'people' }" type="button" @click.stop.prevent="state.assessmentTab = 'people'">人员参与</button>
      </div>

      <div v-if="!normalizedPlans.length" class="notice-card" style="margin-top: 16px;">
        <span>当前还没有可评估的监控计划。</span>
        <span class="warning">无数据</span>
      </div>

      <div v-else class="assessment-body">
        <template v-if="state.assessmentTab === 'risk'">
          <div class="assessment-overview-row">
            <div class="assessment-focus-card">
              <span>风险闭环率</span>
              <strong>{{ overallRiskAssessment.closureRate }}%</strong>
              <small>未闭环 {{ overallRiskAssessment.openRiskCount }} / 已闭环 {{ overallRiskAssessment.closedRiskCount }}</small>
            </div>
            <div
              v-for="item in systemRiskAssessments"
              :key="item.key"
              class="assessment-focus-card"
            >
              <span>{{ item.title }}</span>
              <strong>{{ item.riskLevel }}</strong>
              <small>{{ item.riskScore }} 分 · 高风险 {{ item.highRiskCount }} 项</small>
            </div>
          </div>
          <div class="assessment-list">
            <div v-for="item in planRiskAssessments" :key="item.planId" class="assessment-row">
              <div>
                <strong>{{ item.planName }}</strong>
                <span>{{ item.flowTitle }} · {{ item.gasLabel }} · 闭环率 {{ item.closureRate }}%</span>
                <small>{{ item.reasons.slice(0, 3).join("；") }}</small>
              </div>
              <span class="assessment-pill" :class="riskTone(item.riskLevel)">{{ item.riskLevel }} · {{ item.riskTrend }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="state.assessmentTab === 'progress'">
          <div class="assessment-stat-strip">
            <span class="assessment-pill success">完成 {{ overallProgressAssessment.counts["已完成"] || 0 }}</span>
            <span class="assessment-pill success">提前 {{ overallProgressAssessment.counts["提前"] || 0 }}</span>
            <span class="assessment-pill info">正常 {{ overallProgressAssessment.counts["正常"] || 0 }}</span>
            <span class="assessment-pill warning">滞后 {{ overallProgressAssessment.counts["滞后"] || 0 }}</span>
            <span class="assessment-pill orange">临期 {{ overallProgressAssessment.counts["临期"] || 0 }}</span>
            <span class="assessment-pill danger">超期 {{ overallProgressAssessment.counts["超期"] || 0 }}</span>
          </div>
          <div class="assessment-list">
            <div v-for="item in planProgressAssessments" :key="item.planId" class="assessment-row">
              <div>
                <strong>{{ item.planName }}</strong>
                <span>{{ item.flowTitle }} · 理论 {{ item.expectedProgress }}% / 实际 {{ item.actualProgress }}%</span>
                <small>{{ item.warningText }}</small>
              </div>
              <span class="assessment-pill" :class="progressTone(item.progressStatus)">{{ item.progressStatus }}</span>
            </div>
          </div>
        </template>

        <template v-else-if="state.assessmentTab === 'margin'">
          <div class="assessment-split">
            <div class="assessment-list">
              <div v-for="item in planMarginAssessments" :key="item.planId" class="assessment-row">
                <div>
                  <strong>{{ item.planName }}</strong>
                  <span>{{ item.flowTitle }} · 剩余工作 {{ item.remainingWorkCount }}/{{ item.totalWorkCount }} 项</span>
                  <small>{{ item.marginText }}</small>
                </div>
                <span class="assessment-pill" :class="marginTone(item.marginLevel)">{{ item.marginLevel }}</span>
              </div>
            </div>
            <div class="assessment-window-list">
              <div v-for="item in freeWorkWindows" :key="item.dateIso" class="assessment-window-card">
                <div>
                  <strong>{{ item.dateLabel }}</strong>
                  <span>{{ item.workCount }} 项工作</span>
                </div>
                <span class="assessment-pill" :class="windowTone(item.level)">{{ item.level }}</span>
                <small>{{ item.suggestion }}</small>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="assessment-list">
            <div
              v-for="item in personParticipationStats"
              :key="item.personName"
              class="assessment-row person assessment-row-clickable"
              @click.stop.prevent="openPersonSchedule(item.personName)"
            >
              <div>
                <strong>{{ item.personName }}</strong>
                <span>工作 {{ item.workCount }} 项 · 计划 {{ item.planCount }} 项 · 岗位 {{ item.postCount }} 类</span>
                <small>总人时 {{ item.totalHours }}h · 冲突参与 {{ item.conflictWorkCount }} 次</small>
              </div>
              <div class="assessment-row-actions">
                <span class="assessment-pill" :class="workloadTone(item.workloadLevel)">{{ item.workloadLevel }}</span>
                <button class="ghost small" type="button" @click.stop.prevent="openPersonSchedule(item.personName)">查看规划</button>
              </div>
            </div>
            <div v-if="!personParticipationStats.length" class="notice-card">
              <span>当前暂无可统计的人员参与记录。</span>
              <span class="warning">无人员</span>
            </div>
          </div>
        </template>
      </div>
    </section>

    <section v-if="state.monitoringSubTab === 'calendar'" class="panel">
      <div class="panel-head">
        <div>
          <h3>日程规划</h3>
          <div class="muted">点击日历上的某一天，可查看当天工作卡片；跨天流程按条带方式连续展示。</div>
        </div>
        <div class="calendar-filter-toolbar">
          <button class="button small" type="button" @click.stop.prevent="openScheduleKeyNodeModal(monitorGanttVisibleRange.startDate)">新增关键节点</button>
          <button class="ghost small" type="button" @click.stop.prevent="goToFlowPlanning">流程规划</button>
          <button class="ghost small" type="button" @click.stop.prevent="optimizeScheduleReorder">优化/重排</button>
          <label>
            <span>开始</span>
            <input v-model="state.calendarFilterStartDate" type="date">
          </label>
          <label>
            <span>结束</span>
            <input v-model="state.calendarFilterEndDate" type="date">
          </label>
          <button class="ghost small" type="button" @click.stop.prevent="resetCalendarFilter">重置时间</button>
          <button class="button small" type="button" @click.stop.prevent="openHistoryCompareModal">历史比对</button>
        </div>
      </div>

      <div v-if="calendarFilterRange.active" class="calendar-filter-hint">
        当前仅展示
        <strong>{{ calendarFilterRange.start ? formatDisplayDate(calendarFilterRange.start) : "最早计划" }}</strong>
        至
        <strong>{{ calendarFilterRange.end ? formatDisplayDate(calendarFilterRange.end) : "最晚计划" }}</strong>
        范围内的规划条带。
      </div>

      <div
        v-if="filteredNormalizedPlans.length || isSingleDayMonitorGantt"
        :key="`monitor-gantt-shell-${monitorGanttRenderKey}-${monitorGanttZoomLevel}`"
        class="monitor-gantt-shell"
        @wheel="handleMonitorGanttWheelZoom"
      >
        <div class="monitor-gantt-toolbar">
          <label>
            <span>中心日期</span>
            <input v-model="monitorGanttCenterDate" type="date">
          </label>
          <button
            class="ghost small"
            type="button"
            :disabled="monitorGanttZoomLevel >= monitorGanttZoomLevels.length - 1"
            @click.stop.prevent="zoomMonitorGantt(1)"
          >
            放大
          </button>
          <button
            class="ghost small"
            type="button"
            :disabled="monitorGanttZoomLevel <= 0"
            @click.stop.prevent="zoomMonitorGantt(-1)"
          >
            缩小
          </button>
          <button class="ghost small" type="button" @click.stop.prevent="setMonitorGanttToday">今日</button>
          <button class="ghost small" type="button" @click.stop.prevent="resetMonitorGanttView">重置视图</button>
          <span class="chip active">
            {{ monitorGanttZoomConfig.label }}视图 /
            {{ monitorGanttAxisUnit === "month" ? "月份轴" : `${monitorGanttZoomConfig.days} 天` }}
          </span>
          <span class="monitor-gantt-zoom-hint">Ctrl + 滚轮缩放，光标所在日期为中心</span>
        </div>

        <div
          v-if="!isSingleDayMonitorGantt"
          class="monitor-gantt-planner"
          :style="{ '--monitor-gantt-min-width': monitorGanttAxisUnit === 'day' ? `${Math.max(760, monitorGanttVisibleRange.visibleDays * 76)}px` : '960px' }"
        >
          <div class="monitor-gantt-axis" :class="monitorGanttAxisUnit">
            <template v-if="monitorGanttAxisUnit === 'month'">
              <div
                v-for="column in monitorGanttAxisColumns"
                :key="column.key"
                class="monitor-gantt-axis-cell monitor-gantt-month-cell"
                :style="monitorGanttAxisCellStyle(column)"
              >
                <strong>{{ column.label }}</strong>
                <span>{{ formatDisplayDate(column.startDate) }} - {{ formatDisplayDate(column.endDate) }}</span>
              </div>
            </template>
            <template v-else>
              <button
                v-for="column in monitorGanttAxisColumns"
                :key="column.key"
                type="button"
                class="monitor-gantt-axis-cell"
                :class="{ today: column.isToday, weekend: column.isWeekend, holiday: Boolean(column.holidayLabel), 'has-key-node': column.keyNodes.length }"
                :style="monitorGanttAxisCellStyle(column)"
                @click.stop.prevent="openMonitorGanttDateDetail(column.dateIso)"
                @dblclick.stop.prevent="openScheduleKeyNodeModal(column.dateIso)"
              >
                <strong>{{ column.label }}</strong>
                <span>{{ column.subLabel }}</span>
                <small v-if="column.holidayLabel">{{ column.holidayLabel }}</small>
                <em v-if="column.keyNodes.length">{{ column.keyNodes[0].isGlobal ? "全局" : "关键" }}</em>
              </button>
            </template>
          </div>

          <div class="monitor-gantt-body">
              <div v-for="row in monitorGanttVisiblePlanRows" :key="row.id" class="monitor-gantt-row" :style="{ minHeight: `${row.rowHeight}px` }">
              <div class="monitor-gantt-row-track" :style="{ minHeight: `${row.rowHeight}px` }" @click="openMonitorGanttTrackDay">
                <span
                  v-for="column in monitorGanttAxisColumns"
                  :key="`${row.id}-${column.key}`"
                  class="monitor-gantt-track-cell"
                  :class="{ today: column.isToday, weekend: column.isWeekend }"
                  :style="monitorGanttAxisCellStyle(column)"
                  aria-hidden="true"
                ></span>
                <div
                  class="monitor-gantt-plan-range-bg"
                  :class="{
                    'completed-plan-strip': row.completionMeta?.complete,
                    'has-conflict': row.conflictSummary.hasConflict,
                    'clipped-start': row.isClippedStart,
                    'clipped-end': row.isClippedEnd
                  }"
                  :style="monitorGanttPlanStyle(row)"
                  :title="row.conflictSummary.title || row.name"
                >
                  <button
                    v-for="workDay in buildMonitorPlanWorkDaySegments(row)"
                    :key="workDay.id"
                    class="monitor-gantt-work-day-segment"
                    :class="{ dragging: dragState.active && dragState.workDayId === workDay.id, conflict: workDay.hasConflict, locked: workDay.manualLocked }"
                    :style="monitorWorkDayDragStyle(row.id, workDay.id, { left: `${workDay.leftPercent}%`, width: `${workDay.widthPercent}%`, top: `${workDay.topPx}px`, height: `${workDay.heightPx}px`, background: row.color })"
                    type="button"
                    :title="`${row.name} / ${workDay.actionLabel} / ${formatDisplayDate(workDay.dateIso)}`"
                    @pointerdown="beginPlanDrag(row, monitorGanttVisibleRange.startDate, $event, workDay)"
                    @pointerup.stop
                    @click.stop="handleMonitorWorkDayClick(row, workDay)"
                  >
                    <i
                      v-for="segment in buildMonitorWorkDayConflictSegments(row, workDay)"
                      :key="`${workDay.id}-monitor-conflict-${segment.leftPercent}`"
                      class="monitor-gantt-conflict-segment"
                      :style="{ left: `${segment.leftPercent}%`, width: `${segment.widthPercent}%` }"
                    ></i>
                    <span class="work-segment-title">{{ workDay.actionLabel || planStripLabel(row) }}</span>
                    <span class="work-segment-lock" role="button" tabindex="0" @pointerdown.stop @click.stop.prevent="toggleScheduleWorkLock(row, workDay)">
                      {{ workDay.manualLocked ? "锁" : "锁定" }}
                    </span>
                    <span class="work-segment-delete" role="button" tabindex="0" @pointerdown.stop @click.stop.prevent="deleteScheduleWorkDay(row, workDay)">×</span>
                  </button>
                  <button class="plan-strip-label monitor-gantt-range-label" type="button" @click.stop.prevent="openPlanDetail(row.id)">
                    {{ state.selectedGas === "all" ? `${row.gasLabel} · ${planStripLabel(row)}` : planStripLabel(row) }}
                  </button>
                </div>
              </div>
            </div>
            <div v-if="!monitorGanttVisiblePlanRows.length" class="notice-card">
              <span>当前甘特视窗内没有可展示的规划条带。</span>
              <span class="warning">无计划</span>
            </div>
          </div>
        </div>

        <div v-else class="monitor-gantt-single-day">
          <div class="monitor-gantt-single-head">
            <div>
              <h3>{{ formatDisplayDate(monitorGanttVisibleRange.startDate) }}</h3>
              <div class="muted">单日视图展示当天全部工作；点击工作卡片可查看具体内容。</div>
            </div>
            <div class="monitoring-day-head-actions">
              <div class="monitoring-weather-chip">{{ buildWeatherInfo(monitorGanttVisibleRange.startDate) }}</div>
              <button class="button small" type="button" @click.stop.prevent="openMonitorGanttAddWork">新增工作</button>
            </div>
          </div>

          <div v-if="monitorGanttSingleDayTimelineGroups.length" class="monitor-day-timeline-shell">
            <div class="monitor-day-scale">
              <div
                v-for="tick in selectedDayScaleTicks"
                :key="`gantt-${tick.label}`"
                class="monitor-day-scale-tick"
                :class="{ 'is-end': tick.isEnd }"
                :style="{ top: tick.top }"
              >
                <span class="monitor-day-scale-label">{{ tick.label }}</span>
                <span class="monitor-day-scale-line"></span>
              </div>
            </div>

            <div class="monitor-day-timeline">
              <div
                v-for="group in monitorGanttSingleDayTimelineGroups"
                :key="`gantt-${group.key}`"
                class="monitor-day-timeline-item"
              >
                <div class="monitor-day-axis">
                  <div class="monitor-day-axis-time">
                    <span class="monitor-day-axis-start">{{ getTimeRangeStartLabel(group.timeRange) }}</span>
                    <span class="monitor-day-axis-end">{{ getTimeRangeEndLabel(group.timeRange) }}</span>
                  </div>
                  <div
                    class="monitor-day-axis-dot"
                    :class="{
                      done: group.works.every((work) => work.progressMeta.status === '已完成'),
                      active: group.works.some((work) => work.progressMeta.status === '进行中')
                    }"
                  ></div>
                </div>

                <div class="monitor-day-group">
                  <div
                    v-for="work in group.works"
                    :key="`gantt-${work.id}`"
                    class="monitor-day-timeline-card monitor-gantt-work-card"
                    :class="{ conflict: isWorkConflictDate(work) }"
                    @click.stop.prevent="openMonitorGanttWork(work)"
                  >
                    <div class="monitor-day-card-head">
                      <div class="monitor-day-card-title-block">
                        <div class="monitor-day-card-tag-row">
                          <span class="monitor-day-type-tag" :class="`is-${getWorkTypeTag(work).tone}`">
                            {{ getWorkTypeTag(work).label }}
                          </span>
                        </div>
                        <strong class="monitor-day-card-title">{{ work.actionLabel }}</strong>
                        <div class="monitor-day-card-subtitle">{{ work.planTitle }}</div>
                      </div>
                      <div class="monitor-day-card-status">
                        <span class="monitor-day-status-icon" :class="`is-${getWorkStatusIconClass(work.progressMeta)}`" aria-hidden="true"></span>
                        <span class="chip">{{ work.workIndexLabel }}</span>
                        <span class="chip" :class="{ active: work.progressMeta.status === '已完成' }">{{ work.progressMeta.status }}</span>
                        <span v-if="isWorkConflictDate(work)" class="chip warning">冲突日期</span>
                        <span v-if="work.operationStatus" class="chip work-action-chip">{{ work.operationStatus }}</span>
                      </div>
                    </div>

                    <div class="monitor-day-card-meta">
                      <span>{{ work.flowTitle }}</span>
                      <span>{{ work.gasLabel }}</span>
                      <span>{{ work.position }}</span>
                    </div>

                    <div class="monitor-day-progress" @click.stop>
                      <div class="monitor-day-progress-head">
                        <span class="monitor-day-progress-label">进度</span>
                        <strong>{{ work.progressMeta.progress }}%</strong>
                      </div>
                      <div class="monitor-day-progress-bar">
                        <span :style="{ width: progressWidth(work.progressMeta.progress) }"></span>
                      </div>
                      <input
                        class="progress-range-input"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        :value="work.progressMeta.progress"
                        @input="setWorkProgressFromInput(work.id, $event.target.value)"
                      >
                      <div class="button-row monitor-day-progress-actions">
                        <button class="ghost small" type="button" @click.stop.prevent="adjustWorkProgress(work.id, -25)">-25%</button>
                        <button class="ghost small" type="button" @click.stop.prevent="adjustWorkProgress(work.id, 25)">+25%</button>
                        <button class="button small" type="button" @click.stop.prevent="markWorkCompleted(work.id)">完成</button>
                      </div>
                    </div>

                    <div class="button-row monitor-day-work-actions" @click.stop>
                      <button class="ghost small action-delay" type="button" @click.stop.prevent="markDayWorkAction(work, 'delay')">推迟</button>
                      <button class="ghost small action-cancel" type="button" @click.stop.prevent="markDayWorkAction(work, 'cancel')">取消</button>
                      <button class="ghost small action-redo" type="button" @click.stop.prevent="markDayWorkAction(work, 'redo')">重做</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="notice-card" style="margin-top: 16px;">
            <span>这一天暂时没有已生成的工作安排。</span>
            <span class="warning">空闲</span>
          </div>
        </div>
      </div>

      <div v-else class="notice-card" style="margin-top: 16px;">
        <span>{{ calendarFilterRange.active ? "当前时间段内没有可展示的规划。" : "当前还没有可进入动态监控的大日历流程，请先在流程自主规划页生成对应计划。" }}</span>
        <span class="accent">{{ calendarFilterRange.active ? "无匹配" : "待生成" }}</span>
      </div>
    </section>

    <section class="panel" v-if="false && state.monitoringSubTab === 'calendar' && monitoringConflictRecords.length">
      <div class="panel-head">
        <div>
          <h3>冲突提醒记录</h3>
          <div class="muted">流程动态监控中的拖拽调整如果被忽略提醒，相关冲突会统一沉淀在这里，便于系统工程师和岗位人员复核。</div>
        </div>
        <span class="chip">已记录 {{ monitoringConflictRecords.length }} 条</span>
      </div>

      <div class="log-list">
        <div v-for="record in monitoringConflictRecords" :key="`${record.sourceLabel}-${record.id}`" class="rule-entry">
          <div class="rule-entry-head">
            <div class="rule-entry-title">
              <strong>{{ record.gasLabel }} / {{ record.planName }}</strong>
              <span class="rule-entry-subtext">{{ record.sourceLabel }} · {{ record.createdAt }} · {{ record.dateRange }}</span>
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

    <div class="modal-overlay" :class="{ open: state.scheduleKeyNodeModalOpen }" @click.self="closeScheduleKeyNodeModal">
      <div class="modal-card key-node-modal">
        <div class="panel-head">
          <div>
            <h3>新增关键节点</h3>
            <div class="muted">关键节点会参与日程规划的冲突提示和优化重排。</div>
          </div>
          <span class="chip warning">日程规划</span>
        </div>
        <div class="config-grid" style="margin-top: 14px;">
          <label class="field">
            <span>日期</span>
            <input v-model="scheduleKeyNodeForm.dateIso" type="date">
            <small v-if="state.scheduleKeyNodeError && !scheduleKeyNodeForm.dateIso" class="field-error">请选择关键节点日期</small>
          </label>
          <label class="field">
            <span>关键节点名称</span>
            <input v-model="scheduleKeyNodeForm.title" placeholder="例如：整体大检查">
            <small v-if="state.scheduleKeyNodeError && !scheduleKeyNodeForm.title.trim()" class="field-error">请填写关键节点名称</small>
          </label>
          <label class="field">
            <span>节点类型</span>
            <select v-model="scheduleKeyNodeForm.nodeType">
              <option>关键检查</option>
              <option>质量确认</option>
              <option>外部保障</option>
              <option>禁排窗口</option>
              <option>其他</option>
            </select>
          </label>
          <label class="field wide">
            <span>说明</span>
            <textarea v-model="scheduleKeyNodeForm.description" rows="3" placeholder="说明关键节点约束和注意事项"></textarea>
          </label>
          <label class="check-row wide">
            <input v-model="scheduleKeyNodeForm.blockScheduling" type="checkbox">
            <span>阻止自动排程，优化重排时必须避让该日期</span>
          </label>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeScheduleKeyNodeModal">取消</button>
          <button v-if="scheduleKeyNodeForm.id" class="danger-ghost" type="button" @click="removeScheduleKeyNode">删除</button>
          <button class="button" type="button" @click="saveScheduleKeyNode">保存关键节点</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.confirmModalOpen }" @click.self="closeConfirmModal">
      <div class="modal-card confirm-dialog">
        <h3>{{ state.confirmModalTitle }}</h3>
        <p class="muted">{{ state.confirmModalMessage }}</p>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeConfirmModal">取消</button>
          <button class="danger-ghost" type="button" @click="confirmPendingAction">确认删除</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay live-conflict-overlay" :class="{ open: monitorConflictModal.open }">
      <div class="modal-card live-conflict-modal">
        <div class="live-conflict-head">
          <div>
            <h3>拖拽冲突提醒</h3>
            <div class="muted">计划“{{ monitorConflictModal.planName }}”调整后检测到冲突。接受提醒则复原，忽略则保留调整并同步写入流程动态监控。</div>
          </div>
          <span class="chip warning">冲突 {{ monitorConflictModal.conflicts.length }} 项</span>
        </div>

        <div class="log-list">
          <div v-for="item in monitorConflictModal.conflicts" :key="item.key" class="notice-card">
            <div class="conflict-detail-block">
              <strong>{{ item.type }}：{{ item.shortText || item.message }}</strong>
              <span class="conflict-detail-text">{{ item.detailText || item.message }}</span>
              <span v-if="item.expectedOrderText" class="conflict-order-text">{{ item.expectedOrderText }}</span>
            </div>
            <span class="muted">{{ item.suggestion }}</span>
          </div>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click.stop.prevent="acceptMonitoringConflictReminder">接受提醒并复原</button>
          <button class="button" type="button" @click.stop.prevent="ignoreMonitoringConflictAndApply">忽略提醒并继续调整</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.planConflictRecordModalOpen }" @click.self="closeMonitorPlanConflictRecords">
      <div class="modal-card plan-conflict-record-modal">
        <div class="panel-head">
          <div>
            <h3>冲突提醒记录</h3>
            <div class="muted">
              {{ selectedMonitorConflictPlan?.name || "当前计划" }}
              <template v-if="state.selectedConflictDateIso"> / {{ formatDisplayDate(state.selectedConflictDateIso) }}</template>
            </div>
          </div>
          <span class="chip warning">{{ selectedMonitorConflictRecords.length }} 条</span>
        </div>
        <div v-if="selectedMonitorConflictRecords.length" class="plan-conflict-record-list">
          <div v-for="record in selectedMonitorConflictRecords" :key="record.id" class="plan-conflict-record-card">
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
          <span>该工作日暂无已记录冲突。</span>
          <span class="accent">无记录</span>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="button" type="button" @click.stop.prevent="closeMonitorPlanConflictRecords">关闭</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.historyCompareModalOpen }" @click.self="closeHistoryCompareModal">
      <div class="modal-card monitoring-compare-modal">
        <div class="panel-head">
          <div>
            <h3>历史日历比对</h3>
            <div class="muted">先选择当前计划和历史日历，在同一时间轴下对比该计划的当前版本与历史版本。</div>
          </div>
          <span class="chip">历史库 {{ monitoringHistoryLibrary.length }} 项</span>
        </div>

        <div v-if="monitoringHistoryLibrary.length" class="calendar-compare-layout">
          <aside class="calendar-compare-history-list">
            <button
              v-for="item in monitoringHistoryLibrary"
              :key="item.id"
              type="button"
              class="calendar-compare-history-item"
              :class="{ active: state.selectedCompareHistoryId === item.id }"
              @click.stop.prevent="selectCompareHistory(item.id)"
            >
              <strong>{{ item.title }}</strong>
              <span>{{ item.gasLabel }} · {{ item.dateRange || "暂无日期" }}</span>
              <span>{{ item.archivedAt }}</span>
            </button>
          </aside>

          <section class="calendar-compare-content compare-plan-content">
            <div class="compare-plan-selector">
              <label>
                <span>当前计划</span>
                <select v-model="state.selectedComparePlanId">
                  <option v-for="plan in comparePlanOptions" :key="plan.id" :value="plan.id">
                    {{ plan.name }} / {{ plan.flowTitle }} / {{ plan.gasLabel }} / {{ planDateRange(plan) }}
                  </option>
                </select>
              </label>
              <label>
                <span>计划检索</span>
                <input v-model="state.comparePlanSearchKeyword" type="text" placeholder="按计划、流程、气体检索" />
              </label>
            </div>

            <div class="compare-plan-summary">
              <div class="summary-line">
                <span>当前计划</span>
                <strong>{{ selectedCompareCurrentPlan?.name || "未选择计划" }}</strong>
                <small>{{ selectedCompareCurrentPlan ? `${selectedCompareCurrentPlan.flowTitle} · ${selectedCompareCurrentPlan.gasLabel} · ${planDateRange(selectedCompareCurrentPlan)}` : "请选择当前计划" }}</small>
              </div>
              <div class="summary-line">
                <span>历史计划</span>
                <strong>{{ selectedCompareHistoryPlan?.name || "未找到对应计划" }}</strong>
                <small>{{ selectedCompareHistoryPlan ? `${selectedCompareHistoryPlan.flowTitle} · ${selectedCompareHistoryPlan.gasLabel} · ${planDateRange(selectedCompareHistoryPlan)}` : (selectedCompareHistory ? selectedCompareHistory.archivedAt : "未选择历史日历") }}</small>
              </div>
              <div class="summary-line">
                <span>日期范围</span>
                <strong>{{ comparePlanDiffSummary.dateRangeChanged ? "日期范围调整" : "日期范围一致" }}</strong>
                <small>{{ formatDisplayDate(selectedComparePlanRange.start) }} - {{ formatDisplayDate(selectedComparePlanRange.end) }}</small>
              </div>
            </div>

            <div class="calendar-compare-stats">
              <span class="compare-tag added">新增 {{ comparePlanDiffSummary.added }}</span>
              <span class="compare-tag removed">删除 {{ comparePlanDiffSummary.removed }}</span>
              <span class="compare-tag changed">变更 {{ comparePlanDiffSummary.changed }}</span>
              <span class="compare-tag stable">未变化 {{ comparePlanDiffSummary.unchanged }}</span>
              <span class="compare-tag progress">工作日 {{ comparePlanDiffSummary.total }}</span>
            </div>

            <div v-if="selectedCompareCurrentPlan" class="compare-plan-gantt">
              <div class="compare-plan-axis">
                <span
                  v-for="column in comparePlanAxisColumns"
                  :key="column.key"
                  class="compare-plan-axis-cell"
                  :class="{ today: column.isToday, weekend: column.isWeekend, month: selectedComparePlanRange.axisUnit === 'month' }"
                  :style="{ left: `${column.leftPercent}%`, width: `${column.widthPercent}%` }"
                >
                  <strong>{{ column.label }}</strong>
                  <small>{{ column.subLabel }}</small>
                </span>
              </div>

              <div class="compare-plan-row current">
                <div class="compare-plan-row-label">
                  <strong>当前计划</strong>
                  <span>{{ selectedCompareCurrentPlan.name }}</span>
                </div>
                <div class="compare-plan-track">
                  <span
                    v-for="column in comparePlanAxisColumns"
                    :key="`current-track-${column.key}`"
                    class="compare-plan-track-cell"
                    :class="{ today: column.isToday, weekend: column.isWeekend }"
                    :style="{ left: `${column.leftPercent}%`, width: `${column.widthPercent}%` }"
                  ></span>
                  <div
                    v-if="compareCurrentPlanRow"
                    class="compare-plan-range-bg current"
                    :class="{ dateChanged: compareCurrentPlanRow.dateChanged }"
                    :style="{ left: `${compareCurrentPlanRow.leftPercent}%`, width: `${compareCurrentPlanRow.widthPercent}%` }"
                  >
                    <span class="compare-plan-range-title">{{ compareCurrentPlanRow.name }}</span>
                    <button
                      v-for="workDay in compareCurrentPlanRow.workDays"
                      :key="workDay.id"
                      type="button"
                      class="compare-plan-work-day"
                      :class="[workDay.diffType, { current: true }]"
                      :style="{ left: `${workDay.leftPercent}%`, width: `${workDay.widthPercent}%`, background: compareCurrentPlanRow.color }"
                      :title="`${workDay.dateIso} ${workDay.actionLabel} ${workDay.timeRange}`"
                    >
                      <span>{{ workDay.actionLabel }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="compare-plan-row history">
                <div class="compare-plan-row-label">
                  <strong>历史计划</strong>
                  <span>{{ selectedCompareHistoryPlan?.name || "缺失" }}</span>
                </div>
                <div class="compare-plan-track">
                  <span
                    v-for="column in comparePlanAxisColumns"
                    :key="`history-track-${column.key}`"
                    class="compare-plan-track-cell"
                    :class="{ today: column.isToday, weekend: column.isWeekend }"
                    :style="{ left: `${column.leftPercent}%`, width: `${column.widthPercent}%` }"
                  ></span>
                  <div
                    v-if="compareHistoryPlanRow"
                    class="compare-plan-range-bg history"
                    :class="{ dateChanged: compareHistoryPlanRow.dateChanged }"
                    :style="{ left: `${compareHistoryPlanRow.leftPercent}%`, width: `${compareHistoryPlanRow.widthPercent}%` }"
                  >
                    <span class="compare-plan-range-title">{{ compareHistoryPlanRow.name }}</span>
                    <button
                      v-for="workDay in compareHistoryPlanRow.workDays"
                      :key="workDay.id"
                      type="button"
                      class="compare-plan-work-day history"
                      :class="workDay.diffType"
                      :style="{ left: `${workDay.leftPercent}%`, width: `${workDay.widthPercent}%` }"
                      :title="`${workDay.dateIso} ${workDay.actionLabel} ${workDay.timeRange}`"
                    >
                      <span>{{ workDay.actionLabel }}</span>
                    </button>
                  </div>
                  <div v-else class="compare-plan-missing">
                    该历史日历中未找到对应计划
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="notice-card">
              <span>当前没有可用于比对的计划，请调整气体或时间筛选后再试。</span>
              <span class="warning">暂无计划</span>
            </div>

            <div class="compare-plan-diff-list">
              <div
                v-for="row in comparePlanDiffRows"
                :key="row.key"
                class="compare-plan-diff-row"
                :class="row.type"
              >
                <span class="compare-tag" :class="row.type">{{ row.typeLabel }}</span>
                <strong>{{ row.actionLabel }}</strong>
                <span>{{ row.dateIso }}</span>
                <span>当前：{{ row.currentTimeRange }} / {{ row.currentPeople }} / {{ row.currentEquipment }}</span>
                <span>历史：{{ row.historyTimeRange }} / {{ row.historyPeople }} / {{ row.historyEquipment }}</span>
              </div>
              <div v-if="!comparePlanDiffRows.length" class="notice-card">
                <span>当前所选计划与历史计划暂无工作日差异。</span>
                <span class="success">一致</span>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="notice-card" style="margin-top: 16px;">
          <span>历史库中暂无可比对的历史日历，请在动态监控执行完成归档后再进行比对。</span>
          <span class="warning">暂无历史</span>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click.stop.prevent="closeHistoryCompareModal">关闭</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.planDetailModalOpen }" @click.self="closePlanDetail">
      <div class="modal-card monitoring-plan-detail-modal">
        <template v-if="selectedPlanDetail">
          <div class="panel-head">
            <div>
              <h3>{{ selectedPlanDetail.name }}</h3>
              <div class="muted">所属流程：{{ selectedPlanDetail.flowTitle }} · {{ selectedPlanDetail.gasLabel }}</div>
            </div>
            <span class="chip" :class="{ active: selectedPlanDetail.status === 'confirmed' || selectedPlanDetail.status === 'executing' }">
              {{ planStatusLabel(selectedPlanDetail.status) }}
            </span>
          </div>

          <div class="plan-detail-meta-grid">
            <div class="summary-line">
              <span>日期范围</span>
              <strong>{{ planDateRange(selectedPlanDetail) }}</strong>
            </div>
            <div class="summary-line">
              <span>完成进度</span>
              <strong>{{ selectedPlanDetail.completionMeta?.progress || 0 }}%</strong>
            </div>
            <div class="summary-line">
              <span>组成工作</span>
              <strong>{{ selectedPlanDetailWorks.length }} 项</strong>
            </div>
          </div>

          <div v-if="selectedPlanDetailConflictSummary.hasConflict" class="plan-detail-conflict">
            <div class="plan-detail-conflict-head">
              <strong>冲突摘要</strong>
              <span class="monitor-flow-conflict-chip">已忽略冲突</span>
            </div>
            <div class="conflict-detail-text">{{ selectedPlanDetailConflictSummary.compactLabel }}</div>
            <pre>{{ selectedPlanDetailConflictSummary.title }}</pre>
          </div>

          <div class="plan-detail-section-head">
            <h3>组成工作 {{ selectedPlanDetailWorks.length }} 项</h3>
            <div class="muted">由动态监控页现有工作推导逻辑生成，和当天工作详情时间轴保持一致。</div>
          </div>

          <div class="plan-detail-work-list">
            <div
              v-for="(work, index) in selectedPlanDetailWorks"
              :key="work.id"
              class="plan-detail-work-item"
              :class="{
                conflict: isPlanDetailConflictDate(work.dateIso),
                done: work.progressMeta.status === '已完成',
                active: work.progressMeta.status === '进行中',
                idle: work.progressMeta.status !== '已完成' && work.progressMeta.status !== '进行中'
              }"
            >
              <div class="plan-detail-timeline-node">{{ index + 1 }}</div>
              <div class="plan-detail-work-card">
                <div class="plan-detail-work-head">
                  <div>
                    <strong>{{ work.actionLabel }}</strong>
                    <span>{{ formatDisplayDate(work.dateIso) }} · {{ work.timeRange }}</span>
                  </div>
                  <div class="button-row">
                    <span v-if="isPlanDetailConflictDate(work.dateIso)" class="chip warning">冲突日期</span>
                    <span class="chip" :class="{ active: work.progressMeta.status === '已完成' }">{{ work.progressMeta.status }}</span>
                  </div>
                </div>
                <div class="plan-detail-work-meta">
                  <span>序号：{{ work.workIndexLabel }}</span>
                  <span>人员：{{ formatWorkPersonnel(work) }}</span>
                  <span>岗位：{{ work.position }}</span>
                  <span>设备：{{ formatWorkEquipment(work) }}</span>
                </div>
                <div class="plan-detail-work-risk">{{ formatWorkRiskSummary(work) }}</div>
              </div>
            </div>
          </div>
        </template>

        <div v-else class="notice-card">
          <span>当前计划已不在监控范围内。</span>
          <span class="warning">无数据</span>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button v-if="selectedPlanDetail" class="danger-ghost" type="button" @click.stop.prevent="requestDeleteSelectedPlan">删除计划</button>
          <button class="ghost" type="button" @click.stop.prevent="closePlanDetail">关闭</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.dayModalOpen }" @click.self="closeDayModal">
      <div class="modal-card monitoring-day-modal">
        <div class="panel-head">
          <div>
            <h3>{{ state.selectedDayIso ? formatDisplayDate(state.selectedDayIso) : "当天工作安排" }}</h3>
            <div class="muted">点击日历日期或计划条后，可在这里查看该天全部工作；计划条拖动后会同步调整计划日期。</div>
          </div>
          <div class="monitoring-day-head-actions">
            <div class="monitoring-weather-chip">{{ selectedDayWeather }}</div>
            <button class="button small" type="button" @click.stop.prevent="openAddWorkModal">新增工作</button>
          </div>
        </div>

        <div v-if="selectedDayTimelineGroups.length" class="monitor-day-timeline-shell">
          <div class="monitor-day-scale">
            <div
              v-for="tick in selectedDayScaleTicks"
              :key="tick.label"
              class="monitor-day-scale-tick"
              :class="{ 'is-end': tick.isEnd }"
              :style="{ top: tick.top }"
            >
              <span class="monitor-day-scale-label">{{ tick.label }}</span>
              <span class="monitor-day-scale-line"></span>
            </div>
          </div>

          <div class="monitor-day-timeline">
            <div
              v-for="group in selectedDayTimelineGroups"
              :key="group.key"
              class="monitor-day-timeline-item"
            >
              <div class="monitor-day-axis">
                <div class="monitor-day-axis-time">
                  <span class="monitor-day-axis-start">{{ getTimeRangeStartLabel(group.timeRange) }}</span>
                  <span class="monitor-day-axis-end">{{ getTimeRangeEndLabel(group.timeRange) }}</span>
                </div>
                <div
                  class="monitor-day-axis-dot"
                  :class="{
                    done: group.works.every((work) => work.progressMeta.status === '已完成'),
                    active: group.works.some((work) => work.progressMeta.status === '进行中')
                  }"
                ></div>
              </div>

              <div class="monitor-day-group">
                <div
                  v-for="work in group.works"
                  :key="work.id"
                  class="monitor-day-timeline-card"
                  @click.stop.prevent="openWorkModal(work.id)"
                >
                  <div class="monitor-day-card-head">
                    <div class="monitor-day-card-title-block">
                      <div class="monitor-day-card-tag-row">
                        <span
                          class="monitor-day-type-tag"
                          :class="`is-${getWorkTypeTag(work).tone}`"
                        >
                          {{ getWorkTypeTag(work).label }}
                        </span>
                      </div>
                      <strong class="monitor-day-card-title">{{ work.actionLabel }}</strong>
                      <div class="monitor-day-card-subtitle">{{ work.planTitle }}</div>
                    </div>
                    <div class="monitor-day-card-status">
                      <span
                        class="monitor-day-status-icon"
                        :class="`is-${getWorkStatusIconClass(work.progressMeta)}`"
                        aria-hidden="true"
                      ></span>
                      <span class="chip">{{ work.workIndexLabel }}</span>
                      <span class="chip" :class="{ active: work.progressMeta.status === '已完成' }">{{ work.progressMeta.status }}</span>
                      <span v-if="work.operationStatus" class="chip work-action-chip">{{ work.operationStatus }}</span>
                    </div>
                  </div>

                  <div class="monitor-day-card-meta">
                    <span>{{ work.flowTitle }}</span>
                    <span>{{ work.position }}</span>
                  </div>

                  <div class="monitor-day-progress" @click.stop>
                    <div class="monitor-day-progress-head">
                      <span class="monitor-day-progress-label">进度</span>
                      <strong>{{ work.progressMeta.progress }}%</strong>
                    </div>
                      <div class="monitor-day-progress-bar">
                        <span :style="{ width: progressWidth(work.progressMeta.progress) }"></span>
                      </div>
                      <input
                        class="progress-range-input"
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        :value="work.progressMeta.progress"
                        @input="setWorkProgressFromInput(work.id, $event.target.value)"
                      >
                      <div class="button-row monitor-day-progress-actions">
                        <button class="ghost small" type="button" @click.stop.prevent="adjustWorkProgress(work.id, -25)">-25%</button>
                      <button class="ghost small" type="button" @click.stop.prevent="adjustWorkProgress(work.id, 25)">+25%</button>
                      <button class="button small" type="button" @click.stop.prevent="markWorkCompleted(work.id)">完成</button>
                    </div>
                  </div>

                  <div class="button-row monitor-day-work-actions" @click.stop>
                    <button class="ghost small action-delay" type="button" @click.stop.prevent="markDayWorkAction(work, 'delay')">推迟</button>
                    <button class="ghost small action-cancel" type="button" @click.stop.prevent="markDayWorkAction(work, 'cancel')">取消</button>
                    <button class="ghost small action-redo" type="button" @click.stop.prevent="markDayWorkAction(work, 'redo')">重做</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="notice-card" style="margin-top: 16px;">
          <span>这一天暂时没有已生成的工作安排。</span>
          <span class="warning">空闲</span>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click.stop.prevent="closeDayModal">关闭</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.addWorkModalOpen }" @click.self="closeAddWorkModal">
      <div class="modal-card monitoring-add-work-modal">
        <div class="panel-head">
          <div>
            <h3>新增当日工作</h3>
            <div class="muted">可从工作项目管理库选择已有工作，也可手动填写并同步加入工作规则管理库。</div>
          </div>
          <span class="chip active">{{ formatDisplayDate(addWorkForm.dateIso) }}</span>
        </div>

        <div class="button-row add-work-source-tabs">
          <button class="tab" :class="{ active: addWorkForm.mode === 'library' }" type="button" @click.stop.prevent="addWorkForm.mode = 'library'">从工作项目管理库添加</button>
          <button class="tab" :class="{ active: addWorkForm.mode === 'manual' }" type="button" @click.stop.prevent="addWorkForm.mode = 'manual'">直接填写工作内容</button>
        </div>

        <div class="config-grid add-work-form-grid">
          <label v-if="addWorkForm.mode === 'library'">
            <span>工作项目</span>
            <select v-model="addWorkForm.sourceRuleId" @change="applyWorkRuleToForm">
              <option value="">请选择工作项目</option>
              <option v-for="item in monitoringWorkRuleOptions" :key="item.id" :value="item.id">{{ item.name }}</option>
            </select>
          </label>
          <label>
            <span>工作名称</span>
            <input v-model="addWorkForm.actionLabel" type="text" placeholder="例如：整体大检查">
          </label>
          <label>
            <span>日期</span>
            <input v-model="addWorkForm.dateIso" type="date">
          </label>
          <label>
            <span>时间段</span>
            <input v-model="addWorkForm.timeRange" type="text" placeholder="08:00-10:00">
          </label>
          <label>
            <span>所属计划</span>
            <select v-model="addWorkForm.planId" @change="applyPlanToAddWorkForm">
              <option value="">临时补充工作</option>
              <option v-for="plan in addWorkPlanOptions" :key="plan.id" :value="plan.id">
                {{ plan.name }} / {{ plan.flowTitle }} / {{ plan.gasLabel }}
              </option>
            </select>
          </label>
          <label>
            <span>岗位</span>
            <input v-model="addWorkForm.position" type="text" placeholder="例如：氧气系统安全岗">
          </label>
          <label>
            <span>人员</span>
            <input v-model="addWorkForm.personnelText" type="text" placeholder="多人用顿号或逗号分隔">
          </label>
          <label>
            <span>设备</span>
            <input v-model="addWorkForm.equipmentText" type="text" placeholder="多个设备用顿号或逗号分隔">
          </label>
          <label class="wide">
            <span>风险说明</span>
            <textarea v-model="addWorkForm.risksText" rows="3" placeholder="可填写一个或多个风险点"></textarea>
          </label>
          <label class="wide">
            <span>制约关系</span>
            <textarea v-model="addWorkForm.constraintsText" rows="3" placeholder="可填写前置条件、窗口约束或资源制约"></textarea>
          </label>
          <label v-if="addWorkForm.mode === 'manual'" class="checkbox-line wide">
            <input v-model="addWorkForm.syncToRuleLibrary" type="checkbox">
            <span>保存后同步加入工作规则管理库</span>
          </label>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click.stop.prevent="closeAddWorkModal">取消</button>
          <button class="button" type="button" @click.stop.prevent="saveAddedDayWork">保存工作</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.personScheduleModalOpen }" @click.self="closePersonSchedule">
      <div class="modal-card person-schedule-modal">
        <div class="panel-head">
          <div>
            <h3>{{ state.selectedPersonName || "人员" }}工作规划</h3>
            <div class="muted">按日期和时间段汇总该人员参与的全部工作安排。</div>
          </div>
          <span v-if="selectedPersonStat" class="assessment-pill" :class="workloadTone(selectedPersonStat.workloadLevel)">
            {{ selectedPersonStat.workloadLevel }}
          </span>
        </div>

        <div v-if="selectedPersonStat" class="person-schedule-summary">
          <div class="summary-line"><span>参与计划</span><strong>{{ selectedPersonStat.planCount }} 项</strong></div>
          <div class="summary-line"><span>工作总数</span><strong>{{ selectedPersonStat.workCount }} 项</strong></div>
          <div class="summary-line"><span>总人时</span><strong>{{ selectedPersonStat.totalHours }}h</strong></div>
          <div class="summary-line"><span>冲突工作</span><strong>{{ selectedPersonStat.conflictWorkCount }} 次</strong></div>
        </div>

        <div v-if="selectedPersonWorkSchedule.length" class="person-schedule-table-wrap">
          <table class="person-schedule-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>时间段</th>
                <th>工作内容</th>
                <th>所属计划</th>
                <th>所属流程</th>
                <th>气体类型</th>
                <th>岗位</th>
                <th>设备</th>
                <th>状态</th>
                <th>风险/冲突</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="work in selectedPersonWorkSchedule" :key="work.id">
                <td>{{ formatDisplayDate(work.dateIso) }}</td>
                <td>{{ work.timeRange }}</td>
                <td>{{ work.actionLabel }}</td>
                <td>{{ work.planName || work.planTitle }}</td>
                <td>{{ work.flowTitle }}</td>
                <td>{{ work.gasLabel }}</td>
                <td>{{ work.position }}</td>
                <td>{{ formatWorkEquipment(work) }}</td>
                <td>
                  <span class="chip" :class="{ active: work.progressMeta?.status === '已完成' }">
                    {{ work.operationStatus || work.progressMeta?.status || "未开始" }}
                  </span>
                </td>
                <td>{{ work.hasConflictDate ? "命中冲突日期；" : "" }}{{ formatWorkRiskSummary(work) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="notice-card" style="margin-top: 16px;">
          <span>当前没有匹配到该人员的工作规划。</span>
          <span class="warning">无记录</span>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click.stop.prevent="closePersonSchedule">关闭</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.workModalOpen }" @click.self="closeWorkModal">
      <div class="modal-card monitoring-work-modal">
        <template v-if="selectedWork">
          <div class="work-sheet">
            <div class="work-sheet-header">
              <div class="work-sheet-badge">{{ selectedWork.flowTitle }}</div>
              <h2>{{ selectedWork.planTitle }} - {{ selectedWork.actionLabel }}</h2>
              <div class="work-sheet-subtitle">本页由系统根据当天工作安排自动生成，可用于岗位执行、过程留档和质量证据上传。</div>
              <div class="work-sheet-meta">
                <div class="work-sheet-meta-pill is-date">
                  <span class="work-sheet-meta-icon calendar" aria-hidden="true"></span>
                  <span>{{ formatDisplayDate(selectedWork.dateIso) }}</span>
                </div>
                <div class="work-sheet-meta-pill is-position">
                  <span class="work-sheet-meta-icon position" aria-hidden="true"></span>
                  <span>{{ selectedWork.position }}</span>
                </div>
                <div class="work-sheet-meta-pill is-time">
                  <span class="work-sheet-meta-icon time" aria-hidden="true"></span>
                  <span>{{ selectedWork.timeRange }}</span>
                </div>
              </div>
            </div>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">一、工作流程</div>
              <div class="work-sheet-list">
                <div
                  v-for="(item, index) in selectedWork.processSteps"
                  :key="`${selectedWork.id}-step-${index}`"
                  class="work-sheet-list-item work-sheet-list-item-numbered"
                >
                  <strong>{{ index + 1 }}.</strong>
                  <span>{{ item }}</span>
                </div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">二、工作风险</div>
              <div class="work-sheet-list">
                <div v-for="item in selectedWork.risks" :key="item" class="work-sheet-list-item">{{ item }}</div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">三、制约关系</div>
              <div class="work-sheet-list">
                <div v-for="constraint in selectedWork.constraints" :key="constraint.id" class="work-sheet-list-item">
                  <strong>{{ constraint.name }}</strong>
                  <span>{{ constraint.description }}（{{ constraint.effect }}）</span>
                </div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">四、人员安排</div>
              <div class="work-sheet-list">
                <div v-for="person in selectedWork.personnel" :key="person.id" class="work-sheet-status-row">
                  <span>{{ person.name }} / {{ person.post }}</span>
                  <span class="work-sheet-status work-sheet-status-ok">{{ person.status }}</span>
                </div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">五、设备安排</div>
              <div class="work-sheet-list">
                <div v-for="equipment in selectedWork.equipment" :key="equipment" class="work-sheet-status-row">
                  <span>{{ equipment }}</span>
                  <span class="work-sheet-status work-sheet-status-ok">已分配</span>
                </div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">六、薄弱环节</div>
              <div class="work-sheet-list">
                <div v-for="item in selectedWork.weaknesses" :key="item" class="work-sheet-list-item">{{ item }}</div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">七、注意事项</div>
              <div class="work-sheet-list">
                <div v-for="item in selectedWork.notices" :key="item" class="work-sheet-list-item">{{ item }}</div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">八、专家提示</div>
              <div class="work-sheet-list">
                <div v-for="item in selectedWork.tips" :key="item" class="work-sheet-list-item">{{ item }}</div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">九、工作进度</div>
              <div class="monitoring-work-progress-card work-sheet-progress-card">
                <div class="monitoring-work-progress-head">
                  <span class="chip" :class="{ active: selectedWorkProgress.status === '已完成' }">{{ selectedWorkProgress.status }}</span>
                  <strong>{{ selectedWorkProgress.progress }}%</strong>
                </div>
                <div class="monitor-day-progress-bar large">
                  <span :style="{ width: progressWidth(selectedWorkProgress.progress) }"></span>
                </div>
                <div class="progress-slider-row">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="selectedWorkProgress.progress"
                    @input="setWorkProgressFromInput(selectedWork.id, $event.target.value)"
                  >
                  <input
                    class="progress-number-input"
                    type="number"
                    min="0"
                    max="100"
                    :value="selectedWorkProgress.progress"
                    @change="setWorkProgressFromInput(selectedWork.id, $event.target.value)"
                  >
                </div>
                <div class="muted">系统根据已上传材料建议完成度：{{ suggestedWorkProgress(selectedWork.id) }}%。可拖动滑块手动调整。</div>
                <div class="button-row">
                  <button class="ghost" type="button" @click.stop.prevent="adjustWorkProgress(selectedWork.id, -25)">回退 25%</button>
                  <button class="ghost" type="button" @click.stop.prevent="adjustWorkProgress(selectedWork.id, 25)">录入 +25%</button>
                  <button class="button" type="button" @click.stop.prevent="markWorkCompleted(selectedWork.id)">标记完成</button>
                </div>
                <div class="muted" v-if="selectedWorkProgress.updatedAt">最近更新：{{ selectedWorkProgress.updatedAt }}</div>
              </div>
            </section>

            <section class="work-sheet-section">
              <div class="work-sheet-section-title">十、文件上传</div>
              <div class="monitoring-upload-list">
              <div class="monitoring-upload-row">
                <div>
                  <strong>1、签字表</strong>
                  <div class="muted" v-if="getEvidenceEntry(selectedWork.id, 'signature').fileName">
                    {{ getEvidenceEntry(selectedWork.id, "signature").fileName }}
                  </div>
                </div>
                <div class="button-row">
                  <span class="chip" :class="{ active: getEvidenceEntry(selectedWork.id, 'signature').uploaded }">
                    {{ getEvidenceEntry(selectedWork.id, "signature").uploaded ? "已上传" : "未上传" }}
                  </span>
                  <label class="ghost">
                    <input class="hidden" type="file" @change="handleEvidenceUpload($event, selectedWork.id, 'signature')">
                    上传
                  </label>
                </div>
              </div>

              <div class="monitoring-upload-row">
                <div>
                  <strong>2、电子报表</strong>
                  <div class="muted" v-if="getEvidenceEntry(selectedWork.id, 'report').fileName">
                    {{ getEvidenceEntry(selectedWork.id, "report").fileName }}
                  </div>
                </div>
                <div class="button-row">
                  <span class="chip" :class="{ active: getEvidenceEntry(selectedWork.id, 'report').uploaded }">
                    {{ getEvidenceEntry(selectedWork.id, "report").uploaded ? "已上传" : "未上传" }}
                  </span>
                  <label class="ghost">
                    <input class="hidden" type="file" @change="handleEvidenceUpload($event, selectedWork.id, 'report')">
                    上传
                  </label>
                </div>
              </div>

              <div class="monitoring-upload-row">
                <div>
                  <strong>3、多媒体记录</strong>
                  <div class="muted" v-if="getEvidenceEntry(selectedWork.id, 'media').fileName">
                    {{ getEvidenceEntry(selectedWork.id, "media").fileName }}
                  </div>
                </div>
                <div class="button-row">
                  <span class="chip" :class="{ active: getEvidenceEntry(selectedWork.id, 'media').uploaded }">
                    {{ getEvidenceEntry(selectedWork.id, "media").uploaded ? "已上传" : "未上传" }}
                  </span>
                  <label class="ghost">
                    <input class="hidden" type="file" @change="handleEvidenceUpload($event, selectedWork.id, 'media')">
                    上传
                  </label>
                </div>
              </div>
            </div>
            </section>
          </div>
        </template>

        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click.stop.prevent="closeWorkModal">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>


