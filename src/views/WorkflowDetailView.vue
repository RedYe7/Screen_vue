<script setup>
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getWorkflowDefinition } from "../data/workflowConfigs";
import { usePlatformState } from "../composables/usePlatformState";

const workflowLibraryStorageKey = "screen-vue-workflow-library";

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function readWorkflowLibrary() {
  try {
    return JSON.parse(localStorage.getItem(workflowLibraryStorageKey) || "[]");
  } catch {
    return [];
  }
}

function writeWorkflowLibrary(value) {
  localStorage.setItem(workflowLibraryStorageKey, JSON.stringify(value));
}

const route = useRoute();
const router = useRouter();
const {
  catalog,
  assistantOpen,
  showToast: rawShowToast,
  listExecutedPlans,
  saveExecutedPlan,
  removeExecutedPlan,
  saveMonitoringPlan,
  keyTimeNodes
} = usePlatformState();

function maskSensitiveText(value) {
  if (value == null) return "";
  let text = String(value);
  text = text.replace(/智慧发射场系统/g, "ZHFSCXT");
  text = text.replace(/加注供气系统/g, "JZGQXT");
  text = text.replace(/加注供气/g, "JZGQ");
  text = text.replace(/发射日/g, "FSR");
  text = text.replace(/发射场/g, "FS场");
  text = text.replace(/特燃特气/g, "TKTQ");
  text = text.replace(/长征([一二三四五六七八九十百千万0-9A-Za-z]+)号/g, "CZ$1号");
  text = text.replace(/氦气/g, "HQ");
  text = text.replace(/火箭/g, "HJ");
  text = text.replace(/推进剂/g, "TJ");
  text = text.replace(/特气/g, "TQ");
  text = text.replace(/供气/g, "GQ");
  text = text.replace(/发射/g, "FS");
  text = text.replace(/加注/g, "JZ");
  return text;
}

function showToast(message) {
  rawShowToast(maskSensitiveText(message));
}

const genericRequirements = [
  ["系统隔离与权限", "各加注供气系统拥有独立流程规划空间；系统工程师及管理人员可跨系统查看。"],
  ["工作 / 人员 / 设备规划", "所有专项流程同时具备工作规划、人员规划和设备规划信息。"],
  ["多种生成方式", "支持全自主生成、按模板生成、按以往计划生成和手动生成。"],
  ["任务计划输入", "支持从智慧发射场系统获取任务计划信息，作为流程规划输入。"],
  ["约束与关键节点", "支持制约关系、限制因素、时间范围、优先级、关键节点补全和锁定。"],
  ["冲突识别与优化", "自动识别时间、人员、设备和工作冲突，并给出优化建议。"],
  ["草稿 / 审核 / 执行", "支持保存草稿、提交审核、生效执行、执行中动态调整和终止。"],
  ["可视化编制与导出", "支持工作项目拖拽、事件/规则/逻辑元件编排，以及表格、图片、PDF 导出。"]
];

const equipmentProfiles = {
  fuel: ["低温槽车 2 台", "气体转运车 1 台", "供气车 3 台", "库区储罐 2 组"],
  mission: ["试验台 2 套", "加注设备 1 套", "供气设备 2 套", "记录终端 3 台"],
  launch: ["在线供气设备 2 套", "应急供气设备 1 套", "岗位通信终端 8 台", "监控终端 4 台"],
  repair: ["维修工装 4 套", "检测仪器 3 台", "质量记录终端 2 台", "试车设备 1 套"],
  maintenance: ["维护工装 3 套", "标校设备 2 台", "巡检终端 4 台", "健康监测终端 2 台"],
  custom: ["自定义设备池", "通用记录终端", "任务关联设备", "扩展保障设备"]
};

const existingPlanConflicts = {
  fuel: ["低温推进剂转运与二号槽车维护窗口存在设备冲突", "供气车辆保障与并行任务存在人员占用冲突"],
  mission: ["测试工作与并行任务设备共享存在冲突", "关键试验岗位与例行试验存在人时重叠"],
  launch: ["应急供气策略与常规供气切换窗口存在时间重叠", "发射前安全确认与岗位重排存在关键节点冲突"],
  repair: ["调试测试与质量确认点存在检修窗口冲突", "维修工装与并行检修任务存在资源冲突"],
  maintenance: ["月维护与标校计划存在设备占用冲突", "任务窗口前维护活动存在时间压缩冲突"],
  custom: ["自定义流程存在规则冲突，请复核前置关系与资源约束"]
};

const fuelDemandItems = [
  "单次任务特燃特气需求量", "单次任务特燃特气保障量", "单次任务特燃特气生产量",
  "并行任务特燃特气需求量", "并行任务特燃特气保障量", "并行任务特燃特气生产量",
  "年度任务特燃特气需求量", "年度任务特燃特气保障量", "年度任务特燃特气生产量",
  "任务临时推迟或应急推迟需求量", "任务临时推迟或应急推迟保障量", "任务临时推迟或应急推迟生产量",
  "临时保障需求需求量", "临时保障需求保障量", "临时保障需求生产量"
];

const fuelPlanButtons = [
  "低温推进剂生产计划",
  "低温推进剂转运计划",
  "筹措拉运转运计划",
  "筹措转运计划",
  "气瓶充气补气计划",
  "各类供气车辆用气保障计划"
];

const fuelPlanStepMap = {
  "低温推进剂生产计划": ["任务计划导入", "需求量计算", "保障量确认", "生产量测算", "低温推进剂生产", "电子审签", "执行归档"],
  "低温推进剂转运计划": ["任务计划导入", "保障量确认", "低温推进剂转运", "质量证据采集", "电子审签", "执行归档"],
  "筹措拉运转运计划": ["任务计划导入", "保障量确认", "筹措拉运转运", "质量证据采集", "电子审签", "执行归档"],
  "筹措转运计划": ["任务计划导入", "保障量确认", "筹措转运计划", "电子审签", "执行归档"],
  "气瓶充气补气计划": ["任务计划导入", "筹措转运计划", "气瓶充气补气", "电子审签", "执行归档"],
  "各类供气车辆用气保障计划": ["任务计划导入", "气瓶充气补气", "供气车辆保障", "质量证据采集", "电子审签", "执行归档"]
};

const missionPlanButtons = [
  "生成系统准备流程",
  "生成例行试验流程",
  "生成测试工作流程",
  "生成加注供气保障流程",
  "生成单次任务准备测试流程",
  "生成并行任务准备测试流程",
  "生成任务测试计划",
  "标注任务关键点",
  "补充异常 / 应急处置流程",
  "生成故障处置流程"
];

const launchPlanButtons = [
  "生成当日定岗和工作安排",
  "生成发射日关键节点和流程",
  "生成常规在线供气保障策略",
  "生成应急在线供气保障策略",
  "生成发射日应急处置工作计划"
];

const repairPlanButtons = [
  "生成维修改造及调试测试计划",
  "生成质量确认点清单",
  "生成保障条件辅助信息"
];

const maintenancePlanButtons = [
  "生成日维护计划",
  "生成周维护计划",
  "生成月维护计划",
  "生成仪器仪表标校计划",
  "生成预防性检修维护计划",
  "生成维护流程调整方案"
];

const specialPlanStepMap = {
  mission: {
    "生成系统准备流程": ["任务计划导入", "系统准备", "电子审签", "执行归档"],
    "生成例行试验流程": ["任务计划导入", "例行试验", "电子审签", "执行归档"],
    "生成测试工作流程": ["任务计划导入", "系统准备", "测试工作", "电子审签", "执行归档"],
    "生成加注供气保障流程": ["任务计划导入", "加注供气保障", "电子审签", "执行归档"],
    "生成单次任务准备测试流程": ["任务计划导入", "单次任务准备测试", "测试工作", "电子审签", "执行归档"],
    "生成并行任务准备测试流程": ["任务计划导入", "并行任务准备测试", "测试工作", "加注供气保障", "电子审签", "执行归档"],
    "生成任务测试计划": ["任务计划导入", "系统准备", "测试工作", "关键点标注", "电子审签", "执行归档"],
    "标注任务关键点": ["关键点标注"],
    "补充异常 / 应急处置流程": ["异常流程补充", "应急处置流程"],
    "生成故障处置流程": ["故障处置流程", "执行归档"]
  },
  launch: {
    "生成当日定岗和工作安排": ["任务计划导入", "岗位定岗生成", "电子审签", "执行归档"],
    "生成发射日关键节点和流程": ["任务计划导入", "关键节点生成", "电子审签", "执行归档"],
    "生成常规在线供气保障策略": ["任务计划导入", "常规在线供气保障策略", "电子审签", "执行归档"],
    "生成应急在线供气保障策略": ["任务计划导入", "应急在线供气保障策略", "电子审签", "执行归档"],
    "生成发射日应急处置工作计划": ["任务计划导入", "发射日应急处置计划", "应急处置流程", "电子审签", "执行归档"]
  },
  repair: {
    "生成维修改造及调试测试计划": ["维修改造分解", "调试测试", "电子审签", "执行归档"],
    "生成质量确认点清单": ["质量确认点", "质量证据采集", "电子审签"],
    "生成保障条件辅助信息": ["保障条件沟通", "电子审签"]
  },
  maintenance: {
    "生成日维护计划": ["日维护排布", "电子审签", "执行归档"],
    "生成周维护计划": ["周维护排布", "电子审签", "执行归档"],
    "生成月维护计划": ["月维护排布", "电子审签", "执行归档"],
    "生成仪器仪表标校计划": ["仪器仪表标校", "电子审签", "执行归档"],
    "生成预防性检修维护计划": ["预防性检修维护", "电子审签", "执行归档"],
    "生成维护流程调整方案": ["维护流程调整", "电子审签", "执行归档"]
  }
};

const visualModules = ["事件可视化模块", "规则可视化模块", "逻辑可视化模块", "并行分支模块"];
const generationModeOptions = [
  { value: "auto", label: "全自主生成" },
  { value: "template", label: "按模板生成" },
  { value: "history", label: "按以往计划生成" },
  { value: "manual", label: "手动生成" }
];

const definition = computed(() => getWorkflowDefinition(String(route.params.flowId)));
watch(definition, (value) => {
  if (!value) router.replace("/planning");
}, { immediate: true });

const flow = computed(() => definition.value?.id || "fuel");
const allWorkItems = computed(() => catalog.workItems);
const selectableWorkItems = computed(() => allWorkItems.value.filter((item) => item.status === "启用"));
const flowItems = computed(() => selectableWorkItems.value.filter((item) => item.flowTypes.includes(flow.value)));
const flowPeople = computed(() => catalog.people.filter((item) => item.flowTypes.includes(flow.value) && item.status !== "停用"));
const flowConstraints = computed(() => catalog.constraints.filter((item) => item.flowTypes.includes(flow.value) && item.status === "启用"));
const flowTemplates = computed(() => catalog.flowTemplates.filter((item) => item.flowType === flow.value && item.status === "启用"));
const planningInputs = ref([]);

const genericOpen = ref(false);
const specificOpen = ref(false);
const pickerOpen = ref(false);
const fuelSignOpen = ref(false);
const selectedStepId = ref("");
const workflowCanvasNodes = ref([]);
const canvasViewportRef = ref(null);
const workflowLibrary = ref(readWorkflowLibrary());
const currentLibraryWorkflowId = ref("");
const integrationItems = ref([]);
const visualCanvasNodes = ref([]);
const fuelPlanOutputs = ref([]);
const fuelDemandGenerated = ref(false);
const fuelDataSigned = ref(false);
const fuelDispatchStatus = ref("当前状态：未生成，未完成电子审签和数据下发。");
const missionOutputs = ref([]);
const missionKeyPoints = ref([]);
const missionEmergencyNotes = ref([]);
const launchOutputs = ref([]);
const launchRoster = ref([]);
const launchStrategies = ref([]);
const repairOutputs = ref([]);
const repairQualityPoints = ref([]);
const repairSupportNotes = ref([]);
const maintenanceOutputs = ref([]);
const maintenanceCalendar = ref([]);
const maintenanceAdjustments = ref([]);
const selectedFuelPlanName = ref(fuelPlanButtons[0] || "");
const liveConflictPopup = reactive({
  open: false,
  items: []
});
const generationConflictModal = reactive({
  open: false,
  planLabel: "",
  conflicts: [],
  removableStepIds: [],
  outputGroup: ""
});
const generationConflictFeedbackModal = reactive({
  open: false,
  planLabel: "",
  conflicts: [],
  outputGroup: ""
});

const planState = reactive({
  id: "",
  status: "draft",
  generationMode: "template",
  startTime: "",
  endTime: "",
  range: "2026-03-24 08:00 鑷?2026-03-26 20:00",
  priority: "高优先级",
  limits: "",
  keyNodeInput: "",
  keyNodes: [],
  lockWorkInput: "",
  selectedConstraintIds: [],
  selectedKeyNodeIds: [],
  selectedLockWorkIds: [],
  fetched: false,
  currentTemplateId: "",
  conflicts: [],
  unresolved: []
});

const dragState = reactive({
  type: "",
  itemId: "",
  sourceSlotIndex: -1
});
const pointerState = reactive({
  nodeId: "",
  startClientX: 0,
  startClientY: 0,
  startNodeX: 0,
  startNodeY: 0
});
const nextNodePicker = reactive({
  open: false,
  afterNodeId: "",
  keyword: "",
  x: 0,
  y: 0
});

const activeTemplate = computed(() => flowTemplates.value.find((item) => item.id === planState.currentTemplateId) || flowTemplates.value[0]);
const equipmentSummary = computed(() => equipmentProfiles[flow.value] || equipmentProfiles.custom);
const workPlanSummary = computed(() => flowItems.value.slice(0, 4));
const currentWorkflowLibrary = computed(() => workflowLibrary.value.filter((item) => item.flowId === flow.value));
const templateConstraintOptions = computed(() => [{ id: "none", name: "无" }, ...flowConstraints.value]);
const templateKeyNodeOptions = computed(() => [{ id: "none", label: "无" }, ...keyTimeNodes.value]);
const templateLockOptions = computed(() => {
  const canvasSteps = getAllCanvasSteps();
  const options = canvasSteps.length
    ? canvasSteps.map((step) => ({ id: step.id, label: step.name }))
    : selectableWorkItems.value.map((item) => ({ id: item.id, label: item.name }));
  return [{ id: "none", label: "无" }, ...options];
});
const planStatusLabel = computed(() => ({
  draft: "当前状态：草稿",
  review: "当前状态：待审核",
  active: "当前状态：已生效待执行",
  executing: "当前状态：已执行",
  terminated: "当前状态：已终止"
}[planState.status]));
const generationModeLabel = computed(() => generationModeOptions.find((item) => item.value === planState.generationMode)?.label || "按模板生成");
const currentTaskName = computed(() => planningInputs.value.find((item) => item.label === "任务名称")?.value || definition.value?.shortTitle || "当前任务");
const templateCanvasZoom = ref(1);
const templateCanvasMetrics = computed(() => {
  const nodeWidth = 264;
  const nodeHeight = 188;
  const paddingX = 120;
  const paddingY = 110;
  const maxX = workflowCanvasNodes.value.length ? Math.max(...workflowCanvasNodes.value.map((node) => node.x)) : 0;
  const maxY = workflowCanvasNodes.value.length ? Math.max(...workflowCanvasNodes.value.map((node) => node.y)) : 0;
  const width = Math.max(1680, maxX + nodeWidth + paddingX);
  const height = Math.max(980, maxY + nodeHeight + paddingY);
  return { nodeWidth, nodeHeight, paddingX, paddingY, width, height };
});
const templateCanvasStyle = computed(() => ({
  width: `${templateCanvasMetrics.value.width}px`,
  height: `${templateCanvasMetrics.value.height}px`,
  transform: `scale(${templateCanvasZoom.value})`
}));
const templateCanvasLinks = computed(() =>
  workflowCanvasNodes.value.slice(0, -1).map((node, index) => {
    const next = workflowCanvasNodes.value[index + 1];
    const startX = node.x + templateCanvasMetrics.value.nodeWidth;
    const startY = node.y + templateCanvasMetrics.value.nodeHeight / 2;
    const endX = next.x;
    const endY = next.y + templateCanvasMetrics.value.nodeHeight / 2;
    const middleX = (startX + endX) / 2;
    const middleY = (startY + endY) / 2;
    return {
      id: `${node.id}-${next.id}`,
      fromNodeId: node.id,
      toNodeId: next.id,
      midpointX: middleX,
      midpointY: middleY,
      d: `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`
    };
  })
);
const filteredNextNodeItems = computed(() => {
  const keyword = nextNodePicker.keyword.trim().toLowerCase();
  return selectableWorkItems.value.filter((item) => {
    if (!keyword) return true;
    return item.name.toLowerCase().includes(keyword);
  }).slice(0, 10);
});
const fuelDemandEntries = computed(() => fuelDemandItems.map((item, index) => ({
  title: item,
  status: fuelDemandGenerated.value ? `已生成数据项 ${index + 1}` : "待生成"
})));

watch([definition, flowTemplates, flowConstraints, flowItems, keyTimeNodes], ([currentDef, templates, constraints, items, nodes]) => {
  if (!currentDef || !templates.length) return;
  planningInputs.value = currentDef.inputs.map((item) => {
    const options = item.options?.map((option) => maskSensitiveText(option));
    const fallbackValue = item.value || (options?.[0] || "");
    return {
      ...item,
      options,
      value: maskSensitiveText(fallbackValue)
    };
  });
  currentLibraryWorkflowId.value = "";
  planState.id = createPlanId();
  planState.status = "draft";
  planState.startTime = toDatetimeLocal(new Date());
  planState.endTime = "";
  planState.currentTemplateId = templates[0].id;
  planState.selectedConstraintIds = ["none"];
  planState.limits = "无";
  planState.selectedKeyNodeIds = ["none"];
  planState.keyNodeInput = "无";
  planState.keyNodes = [];
  planState.selectedLockWorkIds = ["none"];
  planState.lockWorkInput = "无";
  selectedFuelPlanName.value = fuelPlanButtons[0] || "";
  renderTemplate(templates[0].id);
  renderIntegration("system");
  recalcConflicts();
}, { immediate: true });

watch(() => planState.currentTemplateId, (value) => {
  if (value) renderTemplate(value);
});

watch(() => planState.startTime, () => {
  refreshPlanTiming();
});

onBeforeUnmount(() => {
  stopNodeDrag();
});

function closeLiveConflictPopup() {
  liveConflictPopup.open = false;
  liveConflictPopup.items = [];
}

function openLiveConflictPopup(items) {
  liveConflictPopup.open = true;
  liveConflictPopup.items = items.slice(0, 3);
}

function updateOutputStatus(group, name, status) {
  if (!group || !name) return;
  const mapping = {
    fuel: fuelPlanOutputs,
    mission: missionOutputs,
    launch: launchOutputs,
    repair: repairOutputs,
    maintenance: maintenanceOutputs
  };
  const target = mapping[group];
  if (!target) return;
  const existing = target.value.find((item) => item.name === name);
  if (existing) {
    existing.status = status;
    return;
  }
  target.value.unshift({ name, status });
}

function closeGenerationConflictModal() {
  generationConflictModal.open = false;
  generationConflictModal.planLabel = "";
  generationConflictModal.conflicts = [];
  generationConflictModal.removableStepIds = [];
  generationConflictModal.outputGroup = "";
}

function closeGenerationConflictFeedbackModal() {
  generationConflictFeedbackModal.open = false;
  generationConflictFeedbackModal.planLabel = "";
  generationConflictFeedbackModal.conflicts = [];
  generationConflictFeedbackModal.outputGroup = "";
}

function isStepNonAdjustable(step) {
  if (!step) return true;
  return step.locked
    || step.name.includes("关键时间节点")
    || step.name.includes("电子审签")
    || step.name.includes("执行归档")
    || step.name.includes("任务计划导入");
}

function collectLibraryPlanConflicts(steps = getAllCanvasSteps()) {
  const libraryPlans = workflowLibrary.value.filter((item) => item.id !== currentLibraryWorkflowId.value);
  const conflicts = [];
  libraryPlans.forEach((plan) => {
    const planSteps = plan.nodes || [];
    planSteps.forEach((libraryStep) => {
      steps.forEach((currentStep) => {
        if (currentStep.name === libraryStep.name) {
          conflicts.push({
            key: `work-${currentStep.id}-${plan.id}-${libraryStep.name}`,
            type: "工作重复",
            message: `工作项“${currentStep.name}”与库内计划“${plan.name}”重复。`,
            planName: plan.name,
            stepId: currentStep.id,
            stepName: currentStep.name,
            removable: !isStepNonAdjustable(currentStep),
            suggestion: "确认后自动删除当前计划中的重复工作项。"
          });
        }
        if (currentStep.assignees.some((person) => (libraryStep.assignees || []).includes(person))) {
          conflicts.push({
            key: `staff-${currentStep.id}-${plan.id}-${currentStep.name}`,
            type: "人员冲突",
            message: `工作项“${currentStep.name}”与库内计划“${plan.name}”存在执行人员冲突。`,
            planName: plan.name,
            stepId: currentStep.id,
            stepName: currentStep.name,
            removable: !isStepNonAdjustable(currentStep),
            replacementPeople: flowPeople.value.map((item) => item.name).filter((name) => !currentStep.assignees.includes(name)),
            suggestion: "确认后自动改派当前步骤执行人员。"
          });
        }
        if (currentStep.equipment && libraryStep.equipment && currentStep.equipment === libraryStep.equipment) {
          conflicts.push({
            key: `equipment-${currentStep.id}-${plan.id}-${currentStep.equipment}`,
            type: "设备冲突",
            message: `工作项“${currentStep.name}”与库内计划“${plan.name}”存在设备冲突。`,
            planName: plan.name,
            stepId: currentStep.id,
            stepName: currentStep.name,
            removable: !isStepNonAdjustable(currentStep),
            suggestion: "确认后自动切换为备用设备窗口。"
          });
        }
      });
    });
  });

  const unique = [];
  const seen = new Set();
  conflicts.forEach((item) => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    unique.push(item);
  });
  return unique;
}

function openGenerationConflictModal(planLabel, conflicts, outputGroup = "") {
  generationConflictModal.open = true;
  generationConflictModal.planLabel = planLabel;
  generationConflictModal.conflicts = conflicts;
  generationConflictModal.removableStepIds = [...new Set(conflicts.filter((item) => item.removable).map((item) => item.stepId))];
  generationConflictModal.outputGroup = outputGroup;
  updateOutputStatus(outputGroup, planLabel, "待冲突确认");
}

function openGenerationConflictFeedbackModal(planLabel, conflicts, outputGroup = "") {
  generationConflictFeedbackModal.open = true;
  generationConflictFeedbackModal.planLabel = planLabel;
  generationConflictFeedbackModal.conflicts = conflicts;
  generationConflictFeedbackModal.outputGroup = outputGroup;
  updateOutputStatus(outputGroup, planLabel, "冲突待处理");
}

function finalizeGeneratedPlan(planLabel, outputGroup = "") {
  const conflicts = collectLibraryPlanConflicts();
  if (conflicts.length) {
    openGenerationConflictModal(planLabel, conflicts, outputGroup);
    return false;
  }
  recalcConflicts();
  saveCurrentWorkflowToLibrary(planLabel);
  updateOutputStatus(outputGroup, planLabel, "草稿");
  showToast(`已生成 ${planLabel} 并同步到当前流程`);
  return true;
}

function confirmGenerationConflictAdjustment() {
  const planLabel = generationConflictModal.planLabel;
  const outputGroup = generationConflictModal.outputGroup;
  const removableIds = new Set(generationConflictModal.removableStepIds);
  const pendingConflicts = generationConflictModal.conflicts;
  workflowCanvasNodes.value = workflowCanvasNodes.value.filter((step) => !removableIds.has(step.id));

  pendingConflicts.forEach((item, index) => {
    const step = workflowCanvasNodes.value.find((node) => node.id === item.stepId);
    if (!step) return;
    if (item.type === "人员冲突") {
      const replacement = item.replacementPeople?.[0] || flowPeople.value[(index + 1) % Math.max(flowPeople.value.length, 1)]?.name;
      if (replacement) step.assignees = [replacement];
    }
    if (item.type === "设备冲突") {
      step.equipment = `${step.equipment} / 备用设备窗口`;
    }
  });

  closeGenerationConflictModal();
  const unresolved = collectLibraryPlanConflicts();
  recalcConflicts();
  if (unresolved.length) {
    openGenerationConflictFeedbackModal(planLabel, unresolved, outputGroup);
    showToast("部分冲突无法自动调整，已反馈给岗位人员");
    return;
  }
  saveCurrentWorkflowToLibrary(planLabel || "流程生成");
  updateOutputStatus(outputGroup, planLabel, "草稿");
  showToast("已根据确认结果自动调整当前工作计划，已消除与库内计划的重复和冲突");
}

function saveCurrentWorkflowToLibrary(label = "流程草稿") {
  if (!workflowCanvasNodes.value.length) return;
  const entryId = currentLibraryWorkflowId.value || `${flow.value}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  currentLibraryWorkflowId.value = entryId;
  const entry = {
    id: entryId,
    flowId: flow.value,
    name: `${currentTaskName.value} / ${activeTemplate.value?.name || label}`,
    updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    status: planState.status,
    generationMode: planState.generationMode,
    templateId: planState.currentTemplateId,
    startTime: planState.startTime,
    endTime: planState.endTime,
    inputs: cloneValue(planningInputs.value),
    nodes: cloneValue(workflowCanvasNodes.value)
  };
  const next = [...workflowLibrary.value];
  const index = next.findIndex((item) => item.id === entryId);
  if (index >= 0) next[index] = entry;
  else next.unshift(entry);
  workflowLibrary.value = next;
  writeWorkflowLibrary(next);
}

function openWorkflowFromLibrary(entry) {
  currentLibraryWorkflowId.value = entry.id;
  planState.currentTemplateId = entry.templateId || planState.currentTemplateId;
  planState.generationMode = entry.generationMode || planState.generationMode;
  planState.status = entry.status || "draft";
  planState.startTime = entry.startTime || planState.startTime;
  planState.endTime = entry.endTime || planState.endTime;
  planningInputs.value = cloneValue(entry.inputs || planningInputs.value);
  workflowCanvasNodes.value = cloneValue(entry.nodes || []);
  selectedStepId.value = "";
  closeNextNodePicker();
  recalcConflicts();
  showToast(`已从流程库打开“${entry.name}”，可继续修改`);
}

function saveDraftWorkflow() {
  planState.status = "draft";
  saveCurrentWorkflowToLibrary("流程草稿");
  showToast("当前专项流程已保存到流程库并标记为草稿");
}

function createPlanId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDatetimeLocal(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDisplayTime(value) {
  if (!value) return "待生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDurationMinutes(value) {
  const text = String(value || "").trim();
  if (!text) return 30;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(灏忔椂|h|H)/);
  if (hourMatch) return Math.max(15, Math.round(Number(hourMatch[1]) * 60));
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(分钟|min|MIN)/);
  if (minuteMatch) return Math.max(15, Math.round(Number(minuteMatch[1])));
  const dayMatch = text.match(/(\d+(?:\.\d+)?)\s*(天|d|D)/);
  if (dayMatch) return Math.max(60, Math.round(Number(dayMatch[1]) * 24 * 60));
  if (text.includes("自动补全")) return 45;
  if (text.includes("待定")) return 30;
  const numberMatch = text.match(/\d+(?:\.\d+)?/);
  return numberMatch ? Math.max(15, Math.round(Number(numberMatch[0]) * 60)) : 30;
}

function refreshPlanTiming() {
  if (!planState.startTime) {
    planState.endTime = "";
    return;
  }
  const totalMinutes = getAllCanvasSteps().reduce((sum, step) => sum + parseDurationMinutes(step.executionDuration), 0);
  const start = new Date(planState.startTime);
  if (Number.isNaN(start.getTime())) {
    planState.endTime = "";
    return;
  }
  const end = new Date(start.getTime() + totalMinutes * 60 * 1000);
  planState.endTime = totalMinutes ? toDatetimeLocal(end) : toDatetimeLocal(start);
}

function guessEquipment(name) {
  const dict = {
    "任务计划导入": "任务接口终端",
    "需求量计算": "规则引擎计算节点",
    "保障量确认": "保障测算终端",
    "生产量测算": "生产测算终端",
    "低温推进剂生产": "低温推进剂生产线",
    "低温推进剂转运": "低温槽车",
    "供气车辆保障": "供气车",
    "例行试验": "试验台",
    "岗位定岗生成": "定岗排布终端",
    "关键节点生成": "流程引擎",
    "维修改造分解": "维修工装",
    "日维护排布": "巡检终端",
    "工作项目选择": "自定义编排终端"
  };
  return dict[name] || equipmentSummary.value[0];
}

function resolveStepPeople(item) {
  if (item.assignees?.length) return [...item.assignees];
  if (item.defaultAssignees?.length) return [...item.defaultAssignees];
  const count = Math.max(1, Math.min(flowPeople.value.length, Number((item.staffing || "").match(/\d+/)?.[0] || 1)));
  return flowPeople.value.slice(0, count).map((person) => person.name);
}

function createStepFromItem(item, overrides = {}) {
  return {
    id: overrides.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemId: item.id || item.name,
    name: overrides.name || item.name,
    staffing: overrides.staffing || item.staffing || "待配置",
    assignees: overrides.assignees || resolveStepPeople(item),
    executionDuration: overrides.executionDuration || item.executionDuration || item.duration || "待定",
    equipment: overrides.equipment || item.equipment || item.defaultEquipment || guessEquipment(item.name),
    locked: Boolean(overrides.locked)
  };
}

const keyNodeInsertProfiles = {
  "kt-1": { after: ["任务计划导入"], ratio: 0.12 },
  "kt-2": { after: ["岗位定岗生成", "系统准备", "单次任务准备测试", "并行任务准备测试"], ratio: 0.32 },
  "kt-3": { after: ["保障量确认", "关键节点生成", "系统准备", "测试工作", "岗位定岗生成"], before: ["电子审签"], ratio: 0.58 },
  "kt-4": { before: ["电子审签"], after: ["质量证据采集", "关键点标注"], ratio: 0.82 },
  "kt-5": { before: ["执行归档"], after: ["电子审签", "应急处置流程", "故障处置流程", "供气车辆保障"], ratio: 0.92 }
};

function getKeyNodeSortWeight(nodeMeta) {
  const matchedIndex = keyTimeNodes.value.findIndex((item) => item.id === nodeMeta.id);
  if (matchedIndex >= 0) return matchedIndex;
  const labelMatch = String(nodeMeta.label || "").match(/T-(\d+)/i);
  return labelMatch ? Number(labelMatch[1]) : 999;
}

function findStepIndexByKeywords(steps, keywords = [], prefer = "last") {
  if (!keywords.length) return -1;
  const indexes = steps
    .map((step, index) => (keywords.some((keyword) => step.name.includes(keyword)) ? index : -1))
    .filter((index) => index >= 0);
  if (!indexes.length) return -1;
  return prefer === "first" ? indexes[0] : indexes[indexes.length - 1];
}

function createKeyNodeLockedStep(nodeMeta) {
  return createStepFromItem({
    id: nodeMeta.id,
    name: `关键时间节点：${nodeMeta.label}`,
    staffing: "系统自动补全 / 关键节点锁定",
    defaultAssignees: [flowPeople.value[0]?.name || "系统工程师"],
    duration: "自动补全",
    defaultEquipment: "流程引擎"
  }, {
    id: `key-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: `关键时间节点：${nodeMeta.label}`,
    staffing: "系统自动补全 / 关键节点锁定",
    assignees: [flowPeople.value[0]?.name || "系统工程师"],
    executionDuration: "自动补全",
    equipment: "流程引擎",
    locked: true
  });
}

function getKeyNodeInsertIndex(steps, nodeMeta) {
  const profile = keyNodeInsertProfiles[nodeMeta.id] || {};
  const afterIndex = findStepIndexByKeywords(steps, profile.after, "last");
  if (afterIndex >= 0) return afterIndex + 1;
  const beforeIndex = findStepIndexByKeywords(steps, profile.before, "first");
  if (beforeIndex >= 0) return beforeIndex;
  const ratio = typeof profile.ratio === "number" ? profile.ratio : 0.5;
  return Math.max(0, Math.min(steps.length, Math.round(steps.length * ratio)));
}

function buildSequenceWithKeyNodes(items, selectedKeyLabels = []) {
  const steps = items.map((item) => (
    item.executionDuration || item.assignees || item.itemId
      ? cloneValue(item)
      : createStepFromItem(item)
  ));
  const selectedNodes = [...new Set(selectedKeyLabels)]
    .map((label) => keyTimeNodes.value.find((item) => item.label === label || item.id === label))
    .filter(Boolean)
    .sort((left, right) => getKeyNodeSortWeight(left) - getKeyNodeSortWeight(right));

  selectedNodes.forEach((nodeMeta) => {
    const insertIndex = getKeyNodeInsertIndex(steps, nodeMeta);
    steps.splice(insertIndex, 0, createKeyNodeLockedStep(nodeMeta));
  });

  return steps;
}

function getAutoNodePosition(index) {
  return {
    x: 92 + index * 320,
    y: 180 + (index % 2) * 52
  };
}

function createCanvasNode(step, overrides = {}) {
  const fallback = getAutoNodePosition(workflowCanvasNodes.value.length);
  return {
    ...step,
    x: overrides.x ?? fallback.x,
    y: overrides.y ?? fallback.y
  };
}

function appendCanvasNode(item, overrides = {}) {
  const step = item.executionDuration || item.assignees || item.itemId ? item : createStepFromItem(item, overrides);
  const node = createCanvasNode(step, overrides);
  workflowCanvasNodes.value.push(node);
  return node;
}

function renderTemplate(templateId) {
  const template = flowTemplates.value.find((item) => item.id === templateId) || flowTemplates.value[0];
  if (!template) return;
  planState.currentTemplateId = template.id;
  workflowCanvasNodes.value = [];
  selectedStepId.value = "";
  nextNodePicker.open = false;
  closeLiveConflictPopup();
  templateCanvasZoom.value = 1;
}

function zoomInTemplateCanvas() {
  templateCanvasZoom.value = Math.min(1.3, Number((templateCanvasZoom.value + 0.1).toFixed(2)));
}

function zoomOutTemplateCanvas() {
  templateCanvasZoom.value = Math.max(0.72, Number((templateCanvasZoom.value - 0.1).toFixed(2)));
}

function resetTemplateCanvas() {
  templateCanvasZoom.value = 1;
}

function fitTemplateCanvas() {
  templateCanvasZoom.value = workflowCanvasNodes.value.length >= 5 ? 0.86 : 0.96;
}

function renderIntegration(mode) {
  integrationItems.value = mode === "all"
    ? ["已整合特燃特气筹措流程", "已整合任务工作流程", "已整合发射日工作流程", "已形成全系统综合时间线"]
    : [`已整合当前系统内 ${definition.value?.shortTitle || "专项流程"} 相关流程`, "已按时间顺序归并当前系统流程", "支持系统工程师查看综合工作流程"];
}

function getAllCanvasSteps() {
  return workflowCanvasNodes.value;
}

function normalizeSelectedValues(values = []) {
  const next = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!next.length) return ["none"];
  if (next.includes("none") && next.length > 1) return next.filter((item) => item !== "none");
  return next;
}

function syncTemplateSelections() {
  planState.selectedConstraintIds = normalizeSelectedValues(planState.selectedConstraintIds);
  planState.selectedKeyNodeIds = normalizeSelectedValues(planState.selectedKeyNodeIds);
  planState.selectedLockWorkIds = normalizeSelectedValues(planState.selectedLockWorkIds);

  const selectedConstraints = planState.selectedConstraintIds.includes("none")
    ? []
    : flowConstraints.value.filter((item) => planState.selectedConstraintIds.includes(item.id));
  const selectedNodes = planState.selectedKeyNodeIds.includes("none")
    ? []
    : keyTimeNodes.value.filter((item) => planState.selectedKeyNodeIds.includes(item.id));
  const selectedLocks = planState.selectedLockWorkIds.includes("none")
    ? []
    : templateLockOptions.value.filter((item) => planState.selectedLockWorkIds.includes(item.id));

  planState.limits = selectedConstraints.length ? selectedConstraints.map((item) => item.name).join(" / ") : "无";
  planState.keyNodeInput = selectedNodes.length ? selectedNodes.map((item) => item.label).join(" / ") : "无";
  planState.keyNodes = selectedNodes.map((item) => item.label);
  planState.lockWorkInput = selectedLocks.length ? selectedLocks.map((item) => item.label || item.name).join(" / ") : "无";
}

function setDragLibrary(itemId) {
  dragState.type = "library";
  dragState.itemId = itemId;
  dragState.sourceSlotIndex = -1;
}

function clearDragState() {
  dragState.type = "";
  dragState.itemId = "";
  dragState.sourceSlotIndex = -1;
}

function handleCanvasDrop(event) {
  if (dragState.type !== "library") return;
  const item = allWorkItems.value.find((entry) => entry.id === dragState.itemId);
  if (!item || item.status !== "启用") {
    showToast("该工作项目已停用，无法添加到画布");
    clearDragState();
    return;
  }
  const viewport = canvasViewportRef.value;
  const rect = viewport?.getBoundingClientRect();
  const scrollLeft = viewport?.scrollLeft || 0;
  const scrollTop = viewport?.scrollTop || 0;
  const x = rect ? Math.max(32, (event.clientX - rect.left + scrollLeft) / templateCanvasZoom.value - templateCanvasMetrics.value.nodeWidth / 2) : undefined;
  const y = rect ? Math.max(48, (event.clientY - rect.top + scrollTop) / templateCanvasZoom.value - templateCanvasMetrics.value.nodeHeight / 2) : undefined;
  addWorkItemToCanvas(item, { x, y });
  clearDragState();
}

function startNodeDrag(nodeId, event) {
  const node = workflowCanvasNodes.value.find((item) => item.id === nodeId);
  if (!node) return;
  selectedStepId.value = nodeId;
  pointerState.nodeId = nodeId;
  pointerState.startClientX = event.clientX;
  pointerState.startClientY = event.clientY;
  pointerState.startNodeX = node.x;
  pointerState.startNodeY = node.y;
  window.addEventListener("mousemove", handleNodeDrag);
  window.addEventListener("mouseup", stopNodeDrag);
}

function handleNodeDrag(event) {
  if (!pointerState.nodeId) return;
  const node = workflowCanvasNodes.value.find((item) => item.id === pointerState.nodeId);
  if (!node) return;
  node.x = Math.max(24, pointerState.startNodeX + (event.clientX - pointerState.startClientX) / templateCanvasZoom.value);
  node.y = Math.max(48, pointerState.startNodeY + (event.clientY - pointerState.startClientY) / templateCanvasZoom.value);
}

function stopNodeDrag() {
  pointerState.nodeId = "";
  window.removeEventListener("mousemove", handleNodeDrag);
  window.removeEventListener("mouseup", stopNodeDrag);
}

function closeNextNodePicker() {
  nextNodePicker.open = false;
  nextNodePicker.afterNodeId = "";
  nextNodePicker.keyword = "";
}

function openNextNodePicker(link) {
  nextNodePicker.open = true;
  nextNodePicker.afterNodeId = link.fromNodeId;
  nextNodePicker.keyword = "";
  nextNodePicker.x = link.midpointX;
  nextNodePicker.y = link.midpointY;
}

function insertNodeBetween(itemId) {
  const item = allWorkItems.value.find((entry) => entry.id === itemId);
  const afterIndex = workflowCanvasNodes.value.findIndex((node) => node.id === nextNodePicker.afterNodeId);
  if (!item || afterIndex < 0) {
    closeNextNodePicker();
    return;
  }
  const current = workflowCanvasNodes.value[afterIndex];
  const next = workflowCanvasNodes.value[afterIndex + 1];
  const insertX = next ? (current.x + next.x) / 2 : current.x + 320;
  const insertY = next ? (current.y + next.y) / 2 : current.y;
  if (next && next.x - current.x < 280) {
    for (let index = afterIndex + 1; index < workflowCanvasNodes.value.length; index += 1) {
      workflowCanvasNodes.value[index].x += 320;
    }
  }
  const node = createCanvasNode(createStepFromItem(item), { x: insertX, y: insertY });
  workflowCanvasNodes.value.splice(afterIndex + 1, 0, node);
  closeNextNodePicker();
  recalcConflicts();
  showToast(`已在线路中插入“${item.name}”`);
}

function addWorkItemToCanvas(item, overrides = {}) {
  if (item.status !== "启用") {
    showToast("该工作项目已停用，无法添加到画布");
    return;
  }
  appendCanvasNode(item, overrides);
  recalcConflicts();
  showToast(`已将“${item.name}”加入画布节点`);
}

function selectStep(stepId) {
  selectedStepId.value = stepId;
}

function toggleLockStep(step) {
  step.locked = !step.locked;
  recalcConflicts();
  showToast(step.locked ? "已锁定当前工作" : "已解除锁定");
}

function removeStep(stepId) {
  workflowCanvasNodes.value = workflowCanvasNodes.value.filter((step) => step.id !== stepId);
  if (selectedStepId.value === stepId) selectedStepId.value = "";
  if (nextNodePicker.afterNodeId === stepId) closeNextNodePicker();
  recalcConflicts();
  showToast("已删除画布中的工作节点");
}

function addKeyNodeStep() {
  if (!planState.keyNodes.length) return;
  planState.keyNodes.forEach((node) => {
    appendCanvasNode(createStepFromItem({
      id: `key-${node}`,
      name: `关键节点：${node}`,
      duration: "自动补全",
      staffing: "系统自动补全",
      defaultAssignees: [flowPeople.value[0]?.name || "系统工程师"],
      defaultEquipment: "流程引擎"
    }, {
      id: `key-${Date.now()}-${node}`,
      name: `关键节点：${node}`,
      executionDuration: "自动补全",
      assignees: [flowPeople.value[0]?.name || "系统工程师"],
      equipment: "流程引擎"
    }));
  });
}

function populateTemplateFromItems(items) {
  items.forEach((item) => {
    appendCanvasNode(item);
  });
}

function applySelectedLockIfPresent() {
  const selectedIds = normalizeSelectedValues(planState.selectedLockWorkIds);
  if (selectedIds.includes("none")) return;
  getAllCanvasSteps().forEach((step) => {
    if (selectedIds.includes(step.id) || selectedIds.includes(step.itemId)) step.locked = true;
  });
}

function autoGeneratePlan() {
  renderTemplate(planState.currentTemplateId);
  const orderedItems = [...flowItems.value].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  const autoNode = keyTimeNodes.value[0];
  const selectedAutoNodes = autoNode ? [autoNode.label] : [];
  planState.keyNodes = selectedAutoNodes;
  populateTemplateFromItems(buildSequenceWithKeyNodes(orderedItems, selectedAutoNodes));
  applySelectedLockIfPresent();
  return void finalizeGeneratedPlan("全自主生成");
  recalcConflicts();
  saveCurrentWorkflowToLibrary("全自主生成");
  showToast("已按规则完成全自主生成");
}

function applyPlan(mode = planState.generationMode) {
  planState.generationMode = mode;
  if (mode === "auto") {
    autoGeneratePlan();
    return;
  }
  renderTemplate(planState.currentTemplateId);
  syncTemplateSelections();
  if (mode === "manual") {
    recalcConflicts();
    showToast("已进入手动生成模式，请通过拖拽工作项目和可视化元件编制流程");
    return;
  }
  const sourceItems = mode === "history" ? [...flowItems.value].reverse() : [...flowItems.value];
  const selectedKeyLabels = mode === "template" ? planState.keyNodes : [];
  populateTemplateFromItems(buildSequenceWithKeyNodes(sourceItems, selectedKeyLabels));
  if (mode === "template") {
    applySelectedLockIfPresent();
  }
  return void finalizeGeneratedPlan(mode === "history" ? "按以往计划生成" : "按模板生成");
  recalcConflicts();
  saveCurrentWorkflowToLibrary("流程生成");
  showToast(mode === "history" ? "已按以往计划生成" : "已按模板生成");
}

function addManualWork() {
  appendCanvasNode(createStepFromItem({
    id: `manual-${Date.now()}`,
    name: "手动新增工作",
    duration: "待定",
    staffing: "待定",
    defaultAssignees: [flowPeople.value[0]?.name || "系统工程师"],
    defaultEquipment: "待定"
  }));
  recalcConflicts("manual");
  showToast("已新增手动工作");
}

function removeSelectedWork() {
  if (!selectedStepId.value) {
    showToast("请先选中一个工作项目");
    return;
  }
  removeStep(selectedStepId.value);
}

function lockAnyWork() {
  syncTemplateSelections();
  const selectedIds = normalizeSelectedValues(planState.selectedLockWorkIds);
  if (selectedIds.includes("none")) {
    showToast("请先从锁定工作下拉框中选择至少一个工作");
    return;
  }
  const targets = getAllCanvasSteps().filter((step) => selectedIds.includes(step.id) || selectedIds.includes(step.itemId));
  if (!targets.length) {
    showToast("未找到要锁定的工作，请先生成或拖入工作项目");
    return;
  }
  targets.forEach((target) => {
    target.locked = true;
  });
  recalcConflicts("manual");
  showToast(`已锁定 ${targets.length} 项工作，并对剩余工作进行优化`);
}

function fetchTaskPlan() {
  planState.fetched = true;
  const taskNameField = planningInputs.value.find((item) => item.label === "任务名称");
  if (taskNameField) taskNameField.value = maskSensitiveText(`${definition.value?.shortTitle || "专项流程"} / 从智慧发射场系统导入`);
  showToast("已从智慧发射场系统获取任务计划信息");
}

function currentPlanRecord(status = "已执行") {
  return {
    id: planState.id,
    title: `${currentTaskName.value} / ${activeTemplate.value?.name || "当前模板"}`,
    date: new Date().toISOString().slice(0, 10),
    startTime: formatDisplayTime(planState.startTime),
    endTime: formatDisplayTime(planState.endTime),
    system: String(definition.value?.system || "").replace("当前系统：", ""),
    owner: flowPeople.value[0]?.name || "系统工程师",
    status,
    type: definition.value?.specificTitle || "流程计划",
    risk: planState.conflicts.length ? "高" : "低",
    tags: [flow.value, activeTemplate.value?.name || "模板", ...planState.keyNodes].filter(Boolean),
    steps: getAllCanvasSteps().map((step) => ({
      name: step.name,
      assignees: step.assignees,
      equipment: step.equipment,
      executionDuration: step.executionDuration
    }))
  };
}

function currentMonitoringRecord() {
  const steps = getAllCanvasSteps().map((step, index) => ({
    id: step.id,
    order: index + 1,
    name: step.name,
    assignees: [...step.assignees],
    equipment: step.equipment,
    executionDuration: step.executionDuration,
    durationMinutes: parseDurationMinutes(step.executionDuration),
    locked: step.locked
  }));
  return {
    id: planState.id,
    title: `${currentTaskName.value} / ${activeTemplate.value?.name || "当前模板"}`,
    flowId: flow.value,
    type: definition.value?.specificTitle || "流程规划",
    system: String(definition.value?.system || "").replace("当前系统：", ""),
    startTime: planState.startTime,
    endTime: planState.endTime,
    progress: 0,
    status: "执行中",
    autoAdvance: true,
    changeType: "normal",
    currentStepIndex: 0,
    lastAnnouncedStepIndex: -1,
    voiceText: "",
    createdAt: new Date().toISOString(),
    keyNodes: [...planState.keyNodes],
    lockedStepIds: steps.filter((step) => step.locked).map((step) => step.id),
    steps
  };
}

function recalcConflicts(trigger = "system") {
  const steps = getAllCanvasSteps();
  const conflicts = [...(existingPlanConflicts[flow.value] || []).map((message) => ({ type: "基础提示", message }))];
  if (!steps.some((item) => item.name.includes("电子审签"))) {
    conflicts.push({ type: "流程缺项", message: "缺少电子审签节点，计划无法生效执行。", suggestion: "建议补充电子审签步骤。" });
  }
  if (steps.some((item) => item.locked)) {
    conflicts.push({ type: "锁定提示", message: "存在已锁定工作，优化时仅调整非锁定工作。", suggestion: "仅自动优化非锁定步骤。" });
  }
  listExecutedPlans().filter((item) => item.id !== planState.id).forEach((plan) => {
    plan.steps.forEach((executedStep) => {
      steps.forEach((currentStep) => {
        if (currentStep.name === executedStep.name) {
          conflicts.push({ type: "工作冲突", message: `当前工作“${currentStep.name}”与已执行计划“${plan.title}”存在同名工作冲突。`, suggestion: "建议后移当前工作或改为并行分支。" });
        }
        if (currentStep.assignees.some((person) => executedStep.assignees.includes(person))) {
          conflicts.push({ type: "人员冲突", message: `当前工作“${currentStep.name}”与已执行计划“${plan.title}”存在执行人员冲突。`, suggestion: "建议改派人员或错峰执行。" });
        }
        if (currentStep.equipment === executedStep.equipment) {
          conflicts.push({ type: "设备冲突", message: `当前工作“${currentStep.name}”与已执行计划“${plan.title}”存在设备冲突。`, suggestion: "建议更换设备或调整执行窗口。" });
        }
      });
    });
  });
  const unique = [];
  const seen = new Set();
  conflicts.forEach((item) => {
    if (!seen.has(item.message)) {
      seen.add(item.message);
      unique.push(item);
    }
  });
  planState.conflicts = unique;
  planState.unresolved = unique.filter((item) => !item.suggestion);
  if (trigger === "manual") {
    if (unique.length) openLiveConflictPopup(unique);
    else closeLiveConflictPopup();
  }
  refreshPlanTiming();
}

function confirmOptimize() {
  const unlockedSteps = getAllCanvasSteps().filter((step) => !step.locked);
  if (!planState.conflicts.length) {
    showToast("当前没有可优化的冲突");
    return;
  }
  unlockedSteps.forEach((step, index) => {
    if (planState.conflicts.some((item) => item.type === "人员冲突" && item.message.includes(step.name))) {
      const replacement = flowPeople.value[(index + 1) % Math.max(flowPeople.value.length, 1)];
      if (replacement) step.assignees = [replacement.name];
    }
    if (planState.conflicts.some((item) => item.type === "设备冲突" && item.message.includes(step.name))) {
      step.equipment = `${step.equipment} / 备用窗口`;
    }
  });
  planState.unresolved = planState.conflicts.filter((item) => item.type === "流程缺项");
  recalcConflicts();
  showToast("已确认自动优化，系统已调整非锁定工作");
}

function showUnresolved() {
  if (!planState.unresolved.length) {
    showToast("当前冲突均可自动处理");
    return;
  }
  showToast(`仍有 ${planState.unresolved.length} 项冲突需人工处理`);
}

function submitReview() {
  planState.status = "review";
  saveCurrentWorkflowToLibrary("待审核流程");
  showToast("已提交岗位指挥员审核");
}

function activatePlan() {
  planState.status = "active";
  saveCurrentWorkflowToLibrary("已生效流程");
  showToast("计划审核后已生效");
}

function startExecute() {
  planState.status = "executing";
  saveCurrentWorkflowToLibrary("执行中流程");
  saveExecutedPlan(currentPlanRecord("已执行"));
  saveMonitoringPlan(currentMonitoringRecord());
  showToast("计划已开始执行，并已进入流程动态监控界面");
}

function deletePlan() {
  if (planState.status === "executing") {
    showToast("执行中的计划无法删除");
    return;
  }
  removeExecutedPlan(planState.id);
  planState.id = createPlanId();
  planState.status = "draft";
  renderTemplate(planState.currentTemplateId);
  recalcConflicts();
  showToast("计划已删除");
}

function terminatePlan() {
  planState.status = "terminated";
  saveCurrentWorkflowToLibrary("已终止流程");
  showToast("计划已终止");
}

function addVisualModule(name) {
  if (!name) return;
  visualCanvasNodes.value.push({ id: `visual-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name });
  dragState.type = "";
  dragState.itemId = "";
}

function removeVisualNode(nodeId) {
  visualCanvasNodes.value = visualCanvasNodes.value.filter((item) => item.id !== nodeId);
}

function generateFuelDemand() {
  fuelDemandGenerated.value = true;
  fuelDataSigned.value = false;
  fuelDispatchStatus.value = "当前状态：保障数据已生成，待系统指挥员电子审签。";
  fuelSignOpen.value = true;
  showToast("已生成特燃特气保障数据");
}

function confirmFuelSign() {
  if (!fuelDemandGenerated.value) {
    showToast("请先生成特燃特气保障数据");
    return;
  }
  fuelDataSigned.value = true;
  fuelDispatchStatus.value = "当前状态：系统指挥员已完成电子审签，保障数据已下发。";
  fuelSignOpen.value = false;
  showToast("已完成电子审签并下发特燃特气保障数据");
}

function findWorkItemByName(name) {
  return selectableWorkItems.value.find((entry) => entry.name === name);
}

function pushNamedPlanSteps(planName) {
  renderTemplate(planState.currentTemplateId);
  const stepNames = fuelPlanStepMap[planName] || [];
  stepNames.forEach((name) => {
    const item = findWorkItemByName(name) || {
      id: name,
      name,
      duration: "待定",
      staffing: "待配置",
      defaultEquipment: guessEquipment(name),
      defaultAssignees: [flowPeople.value[0]?.name || "系统工程师"]
    };
    appendCanvasNode(item);
  });
}

function generateFuelPlan(name) {
  requestFuelPlanGeneration(name);
}

function generateMissionPlan(name) {
  requestMissionPlanGeneration(name);
}

function generateLaunchPlan(name) {
  requestLaunchPlanGeneration(name);
}

function generateRepairPlan(name) {
  requestRepairPlanGeneration(name);
}

function generateMaintenancePlan(name) {
  requestMaintenancePlanGeneration(name);
}

function requestFuelPlanGeneration(name) {
  if (!fuelDemandGenerated.value) {
    showToast("请先生成特燃特气保障数据");
    return;
  }
  pushNamedPlanSteps(name);
  if (!fuelPlanOutputs.value.find((item) => item.name === name)) {
    fuelPlanOutputs.value.unshift({ name, status: "待冲突确认" });
  }
  finalizeGeneratedPlan(name, "fuel");
}

function requestMissionPlanGeneration(name) {
  pushSpecialSteps("mission", name);
  if (!missionOutputs.value.find((item) => item.name === name)) {
    missionOutputs.value.unshift({ name, status: "待冲突确认" });
  }
  if (name === "标注任务关键点") {
    missionKeyPoints.value = [
      "系统准备完成",
      "例行试验通过",
      "协同系统关键节点确认",
      "加注供气保障到位"
    ];
  }
  if (name === "补充异常 / 应急处置流程") {
    missionEmergencyNotes.value = [
      "已补充异常流程：任务节点延迟后自动重排测试窗口",
      "已补充应急处置流程：按应急预案追加应急处置步骤"
    ];
  }
  if (name === "生成故障处置流程") {
    missionEmergencyNotes.value = [
      "已根据故障预案生成故障隔离步骤",
      "已加入故障恢复验证和复测步骤"
    ];
  }
  finalizeGeneratedPlan(name, "mission");
}

function requestLaunchPlanGeneration(name) {
  pushSpecialSteps("launch", name);
  if (!launchOutputs.value.find((item) => item.name === name)) {
    launchOutputs.value.unshift({ name, status: "待冲突确认" });
  }
  if (name === "生成当日定岗和工作安排") {
    launchRoster.value = [
      "王指挥 / 发射日总协调 / 发射前全程值守",
      "李工 / 供气试验岗 / T-180 至 T+30 保障",
      "张工 / 系统工程师 / 节点复核与冲突确认"
    ];
  }
  if (name === "生成常规在线供气保障策略" || name === "生成应急在线供气保障策略") {
    launchStrategies.value = [
      "主供气链路：在线供气设备 A 负责主路保障",
      "备份切换：应急供气设备 B 负责异常切换",
      "窗口限制：发射前安全确认节点保持锁定"
    ];
  }
  finalizeGeneratedPlan(name, "launch");
}

function requestRepairPlanGeneration(name) {
  pushSpecialSteps("repair", name);
  if (!repairOutputs.value.find((item) => item.name === name)) {
    repairOutputs.value.unshift({ name, status: "待冲突确认" });
  }
  if (name === "生成质量确认点清单") {
    repairQualityPoints.value = [
      "质量确认点 1：改造件安装扭矩达标，附扭矩记录表",
      "质量确认点 2：调试测试数据达标，附测试曲线和视频记录",
      "质量确认点 3：复核签字完成，附电子审签记录"
    ];
  }
  if (name === "生成保障条件辅助信息") {
    repairSupportNotes.value = [
      "需协调检测仪器 3 台、维修工装 2 套",
      "需预留调试测试窗口 1.5 小时",
      "需通知质量岗在质量确认点到场复核"
    ];
  }
  finalizeGeneratedPlan(name, "repair");
}

function requestMaintenancePlanGeneration(name) {
  pushSpecialSteps("maintenance", name);
  if (!maintenanceOutputs.value.find((item) => item.name === name)) {
    maintenanceOutputs.value.unshift({ name, status: "待冲突确认" });
  }
  if (["生成日维护计划", "生成周维护计划", "生成月维护计划", "生成仪器仪表标校计划", "生成预防性检修维护计划"].includes(name)) {
    maintenanceCalendar.value = [
      "日维护：08:30 巡检阀组，10:00 清洁供气接口",
      "周维护：周三 14:00 检查供气车辆状态",
      "月维护：月末 09:00 执行库区设备全检",
      "标校：本周完成压力表、流量计标校",
      "预防性检修：根据健康状态安排 2 项预防性维护"
    ];
  }
  if (name === "生成维护流程调整方案") {
    maintenanceAdjustments.value = [
      "已将 1 项维护活动前移至任务窗口前",
      "已将 2 项重复维护活动合并执行",
      "已对非关键维护活动做精简处理"
    ];
  }
  finalizeGeneratedPlan(name, "maintenance");
}
</script>

<template>
  <div v-if="definition">
    <div class="topbar">
      <div>
        <h1>{{ maskSensitiveText(definition.title) }}</h1>
        <div class="muted">{{ maskSensitiveText(definition.summary) }} 当前步骤、人员、设备、约束和模板均引用工作规则管理模块。</div>
      </div>
      <div class="topbar-actions">
        <span class="badge">{{ maskSensitiveText(definition.role) }}</span>
        <span class="badge">{{ maskSensitiveText(definition.system) }}</span>
        <button class="button" type="button" @click="assistantOpen = true">智能助手</button>
      </div>
    </div>

    <section class="stat-grid">
      <div v-for="metric in definition.metrics" :key="metric.title" class="metric">
        <h3>{{ maskSensitiveText(metric.title) }}</h3>
        <p>{{ maskSensitiveText(metric.desc) }}</p>
        <strong>{{ maskSensitiveText(metric.value) }}</strong>
      </div>
    </section>

    <section class="panel collapsible-section" style="margin-top:18px;">
      <button class="section-toggle" type="button" @click="genericOpen = !genericOpen">
        <span>流程自主规划通用要求</span>
        <span class="toggle-mark">{{ genericOpen ? "收起" : "展开" }}</span>
      </button>
      <div class="requirement-grid collapsed-content" :class="{ hidden: !genericOpen }">
        <div v-for="item in genericRequirements" :key="item[0]" class="requirement-card">
          <strong>{{ maskSensitiveText(item[0]) }}</strong>
          <p>{{ maskSensitiveText(item[1]) }}</p>
        </div>
      </div>
    </section>

    <section class="panel collapsible-section" style="margin-top:18px;">
      <button class="section-toggle" type="button" @click="specificOpen = !specificOpen">
        <span>{{ maskSensitiveText(definition.specificTitle) }}</span>
        <span class="toggle-mark">{{ specificOpen ? "收起" : "展开" }}</span>
      </button>
      <div class="requirement-grid collapsed-content" :class="{ hidden: !specificOpen }">
        <div v-for="(item, index) in definition.specificRequirements" :key="item" class="requirement-card">
          <strong>要求 {{ index + 1 }}</strong>
          <p>{{ maskSensitiveText(item) }}</p>
        </div>
      </div>
    </section>

    <section v-if="flow === 'fuel'" class="panel" style="margin-top:18px;">
      <h3>{{ maskSensitiveText("特燃特气测算与保障数据") }}</h3>
      <div class="button-row" style="margin-bottom:16px;">
        <button class="button" type="button" @click="generateFuelDemand">{{ maskSensitiveText("生成特燃特气保障数据") }}</button>
        <button class="ghost" type="button" @click="fuelSignOpen = true">系统指挥员电子审签确认</button>
      </div>
      <div class="fuel-data-grid">
        <div v-for="item in fuelDemandEntries" :key="item.title" class="fuel-data-card">
          <strong>{{ maskSensitiveText(item.title) }}</strong>
          <small>{{ maskSensitiveText(item.status) }}</small>
        </div>
      </div>
      <div class="notice-card" style="margin-top:16px;">
        <span>{{ maskSensitiveText(fuelDispatchStatus) }}</span>
        <span class="accent">{{ fuelDataSigned ? "已审签并下发" : "待审签" }}</span>
      </div>
    </section>

    <section class="panel" style="margin-top:18px;">
      <h3>规划输入参数</h3>
      <div class="filter-grid">
        <div v-for="field in planningInputs" :key="field.label" class="field">
          <label>{{ maskSensitiveText(field.label) }}</label>
          <select v-if="field.type === 'select'" v-model="field.value">
            <option v-for="option in field.options" :key="option" :value="option">{{ maskSensitiveText(option) }}</option>
          </select>
          <input v-else v-model="field.value">
        </div>
      </div>
      <div class="chip-row" style="margin-top:16px;">
        <span v-for="item in flowConstraints" :key="item.id" class="chip">{{ maskSensitiveText(item.name) }}</span>
      </div>
    </section>

    <section class="panel" style="margin-top:18px;">
      <h3>计划生成控制</h3>
      <div class="filter-grid">
        <div class="field">
          <label>生成方式</label>
          <select v-model="planState.generationMode">
            <option v-for="item in generationModeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </div>
        <div class="field">
          <label>流程起始时间</label>
          <input v-model="planState.startTime" type="datetime-local">
        </div>
        <div class="field">
          <label>流程结束时间</label>
          <input :value="formatDisplayTime(planState.endTime)" disabled>
        </div>
        <div class="field">
          <label>时间范围</label>
          <input v-model="planState.range">
        </div>
        <div class="field">
          <label>优先级</label>
          <select v-model="planState.priority">
            <option>高优先级</option>
            <option>中优先级</option>
            <option>常规</option>
          </select>
        </div>
        <div class="field">
          <label>任务计划获取</label>
          <button class="ghost" type="button" @click="fetchTaskPlan">{{ maskSensitiveText("从智慧发射场系统获取任务计划信息") }}</button>
        </div>
      </div>

      <div v-if="planState.generationMode === 'template'" class="filter-grid" style="margin-top:16px;">
        <div class="field">
          <label>限制因素</label>
          <select v-model="planState.selectedConstraintIds" multiple size="5" @change="syncTemplateSelections">
            <option v-for="item in templateConstraintOptions" :key="item.id" :value="item.id">{{ maskSensitiveText(item.name) }}</option>
          </select>
        </div>
        <div class="field">
          <label>关键工作时间节点</label>
          <select v-model="planState.selectedKeyNodeIds" multiple size="5" @change="syncTemplateSelections">
            <option v-for="item in templateKeyNodeOptions" :key="item.id" :value="item.id">{{ maskSensitiveText(item.label) }}</option>
          </select>
        </div>
        <div class="field">
          <label>锁定工作</label>
          <select v-model="planState.selectedLockWorkIds" multiple size="5" @change="syncTemplateSelections">
            <option v-for="item in templateLockOptions" :key="item.id" :value="item.id">{{ maskSensitiveText(item.label) }}</option>
          </select>
        </div>
        <div class="field">
          <label>模板选择</label>
          <select v-model="planState.currentTemplateId">
            <option v-for="item in flowTemplates" :key="item.id" :value="item.id">{{ maskSensitiveText(item.name) }} / {{ item.version }}</option>
          </select>
        </div>
        <div class="field">
          <label>按模板生成</label>
          <button class="button" type="button" @click="applyPlan('template')">按当前模板生成</button>
        </div>
        <div class="field">
          <label>清空模板</label>
          <button class="danger-btn" type="button" @click="renderTemplate(planState.currentTemplateId); recalcConflicts(); showToast('模板内容已清空')">清空</button>
        </div>
      </div>

      <div v-else-if="planState.generationMode === 'auto'" class="notice-card" style="margin-top:16px;">
        <span>全自主生成模式下不提供下拉选择，系统将依据任务名称、流程类型、资源和约束规则自动分配。</span>
        <button class="button" type="button" @click="applyPlan('auto')">一键自主生成</button>
      </div>

      <div v-else-if="planState.generationMode === 'history'" class="notice-card" style="margin-top:16px;">
        <span>按以往计划生成模式将优先复用历史专项流程的编排顺序。</span>
        <button class="button" type="button" @click="applyPlan('history')">按以往计划生成</button>
      </div>

      <div v-else class="notice-card" style="margin-top:16px;">
        <span>手动生成模式下，请通过拖拽工作项目、事件元件、规则元件和逻辑元件进行编排。</span>
        <button class="button" type="button" @click="applyPlan('manual')">进入手动生成模式</button>
      </div>

      <div v-if="flow === 'fuel'" class="filter-grid" style="margin-top:16px;">
        <div class="field">
          <label>{{ maskSensitiveText("特燃特气专项计划") }}</label>
          <select v-model="selectedFuelPlanName">
            <option v-for="item in fuelPlanButtons" :key="item" :value="item">{{ maskSensitiveText(item) }}</option>
          </select>
        </div>
        <div class="field">
          <label>专项计划生成</label>
          <button class="button" type="button" :disabled="!fuelDemandGenerated" @click="generateFuelPlan(selectedFuelPlanName)">生成所选计划</button>
        </div>
      </div>

      <div v-if="flow === 'fuel'" class="rules-list" style="margin-top:16px;">
        <div v-if="!fuelDemandGenerated" class="notice-card">
          <span>{{ maskSensitiveText("请先在上方“特燃特气测算与保障数据”模块生成并审签保障数据，再选择专项计划生成。") }}</span>
          <span class="warning">前置条件</span>
        </div>
        <div v-for="item in fuelPlanOutputs" :key="item.name" class="notice-card">
          <span>{{ maskSensitiveText(item.name) }} 已生成并同步到画布，当前状态为 {{ maskSensitiveText(item.status) }}，可继续自动调整、手动调整、删除或提交审核。</span>
          <span class="accent">{{ item.status }}</span>
        </div>
      </div>

      <div class="button-row" style="margin-top:16px;">
        <button class="ghost" type="button" @click="lockAnyWork">锁定当前选定工作</button>
        <button class="ghost" type="button" @click="addManualWork">新增工作</button>
        <button class="ghost" type="button" @click="removeSelectedWork">删除选中工作</button>
        <button class="ghost" type="button" @click="saveDraftWorkflow">保存草稿</button>
        <button class="ghost" type="button" @click="confirmOptimize">重新优化</button>
      </div>

      <div class="chip-row" style="margin-top:16px;">
        <span class="chip active">当前方式：{{ generationModeLabel }}</span>
        <span v-if="planState.limits" class="chip">{{ maskSensitiveText(planState.limits) }}</span>
        <span v-for="item in planState.keyNodes" :key="item" class="chip active">{{ maskSensitiveText(item) }}</span>
      </div>
    </section>

    <section class="planning-summary-grid" style="margin-top:18px;">
      <div class="panel">
        <h3>工作规划</h3>
        <div class="rules-list">
          <div v-for="item in workPlanSummary" :key="item.id" class="detail-line"><span>{{ maskSensitiveText(item.name) }}</span><strong>{{ maskSensitiveText(item.duration) }}</strong></div>
        </div>
      </div>
      <div class="panel">
        <h3>人员规划</h3>
        <div class="rules-list">
          <div v-for="item in flowPeople" :key="item.id" class="detail-line"><span>{{ item.name }}</span><strong>{{ maskSensitiveText(item.post) }} / {{ maskSensitiveText(item.status) }}</strong></div>
        </div>
      </div>
      <div class="panel">
        <h3>设备规划</h3>
        <div class="rules-list">
          <div v-for="item in equipmentSummary" :key="item" class="detail-line"><span>设备</span><strong>{{ maskSensitiveText(item) }}</strong></div>
        </div>
      </div>
    </section>

    <section v-if="flow === 'mission'" class="panel-grid two" style="margin-top:18px;">
      <div class="panel">
        <h3>任务工作专项生成</h3>
        <div class="fuel-plan-actions">
          <button v-for="item in missionPlanButtons" :key="item" class="ghost" type="button" @click="generateMissionPlan(item)">{{ maskSensitiveText(item) }}</button>
        </div>
        <div class="rules-list" style="margin-top:16px;">
          <div v-for="item in missionOutputs" :key="item.name" class="notice-card">
            <span>{{ maskSensitiveText(item.name) }} 已生成并同步到画布，可继续人工调整或提交审核。</span>
            <span class="accent">{{ maskSensitiveText(item.status) }}</span>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>任务关键点与异常补充</h3>
        <div class="rules-list">
          <div v-for="item in missionKeyPoints" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="accent">关键点</span></div>
          <div v-for="item in missionEmergencyNotes" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="warning">补充结果</span></div>
          <div v-if="!missionKeyPoints.length && !missionEmergencyNotes.length" class="notice-card"><span>尚未生成任务关键点、异常流程或故障处置流程。</span><span class="accent">待生成</span></div>
        </div>
      </div>
    </section>

    <section v-if="flow === 'launch'" class="panel-grid two" style="margin-top:18px;">
      <div class="panel">
        <h3>{{ maskSensitiveText("发射日专项生成") }}</h3>
        <div class="fuel-plan-actions">
          <button v-for="item in launchPlanButtons" :key="item" class="ghost" type="button" @click="generateLaunchPlan(item)">{{ maskSensitiveText(item) }}</button>
        </div>
        <div class="rules-list" style="margin-top:16px;">
          <div v-for="item in launchOutputs" :key="item.name" class="notice-card">
            <span>{{ maskSensitiveText(item.name) }} 已生成并同步到画布，可继续人工调整或提交审核。</span>
            <span class="accent">{{ maskSensitiveText(item.status) }}</span>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>{{ maskSensitiveText("发射日定岗与保障策略") }}</h3>
        <div class="rules-list">
          <div v-for="item in launchRoster" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="accent">定岗</span></div>
          <div v-for="item in launchStrategies" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="warning">策略</span></div>
          <div v-if="!launchRoster.length && !launchStrategies.length" class="notice-card"><span>{{ maskSensitiveText("尚未生成发射日定岗安排或在线供气保障策略。") }}</span><span class="accent">待生成</span></div>
        </div>
      </div>
    </section>

    <section v-if="flow === 'repair'" class="panel-grid two" style="margin-top:18px;">
      <div class="panel">
        <h3>装备维修专项生成</h3>
        <div class="fuel-plan-actions">
          <button v-for="item in repairPlanButtons" :key="item" class="ghost" type="button" @click="generateRepairPlan(item)">{{ maskSensitiveText(item) }}</button>
        </div>
        <div class="rules-list" style="margin-top:16px;">
          <div v-for="item in repairOutputs" :key="item.name" class="notice-card">
            <span>{{ maskSensitiveText(item.name) }} 已生成并同步到画布，可继续人工调整或提交审核。</span>
            <span class="accent">{{ maskSensitiveText(item.status) }}</span>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>质量确认点与保障条件</h3>
        <div class="rules-list">
          <div v-for="item in repairQualityPoints" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="accent">质量点</span></div>
          <div v-for="item in repairSupportNotes" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="warning">保障条件</span></div>
          <div v-if="!repairQualityPoints.length && !repairSupportNotes.length" class="notice-card"><span>尚未生成质量确认点清单或保障条件辅助信息。</span><span class="accent">待生成</span></div>
        </div>
      </div>
    </section>

    <section v-if="flow === 'maintenance'" class="panel-grid two" style="margin-top:18px;">
      <div class="panel">
        <h3>日常维护专项生成</h3>
        <div class="fuel-plan-actions">
          <button v-for="item in maintenancePlanButtons" :key="item" class="ghost" type="button" @click="generateMaintenancePlan(item)">{{ maskSensitiveText(item) }}</button>
        </div>
        <div class="rules-list" style="margin-top:16px;">
          <div v-for="item in maintenanceOutputs" :key="item.name" class="notice-card">
            <span>{{ maskSensitiveText(item.name) }} 已生成并同步到画布，可继续人工调整或提交审核。</span>
            <span class="accent">{{ maskSensitiveText(item.status) }}</span>
          </div>
        </div>
      </div>
      <div class="panel">
        <h3>维护排布与流程调整</h3>
        <div class="rules-list">
          <div v-for="item in maintenanceCalendar" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="accent">维护计划</span></div>
          <div v-for="item in maintenanceAdjustments" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="warning">调整结果</span></div>
          <div v-if="!maintenanceCalendar.length && !maintenanceAdjustments.length" class="notice-card"><span>尚未生成维护计划、标校计划、预防性检修计划或调整方案。</span><span class="accent">待生成</span></div>
        </div>
      </div>
    </section>

    <section class="planner-layout" style="margin-top:18px;">
      <div class="panel workflow-library-panel">
        <h3>工作流项目库</h3>
        <div class="workflow-picker">
          <div class="picker-menu library-scroll">
            <div
              v-for="item in allWorkItems"
              :key="item.id"
              class="picker-item"
              :class="{ disabled: item.status !== '启用' }"
              :draggable="item.status === '启用'"
              @dragstart="setDragLibrary(item.id)"
            >
              <div>
                <strong>{{ maskSensitiveText(item.name) }}</strong>
                <small>{{ maskSensitiveText(item.duration) }} / {{ maskSensitiveText(item.staffing) }}</small>
                <small>默认执行人：{{ (item.defaultAssignees || []).join(" / ") || "待分配" }}</small>
                <small>{{ maskSensitiveText(item.status) }} / 适用流程：{{ item.flowTypes.join(" / ") }}</small>
              </div>
              <button class="ghost add-picker-item" type="button" :disabled="item.status !== '启用'" @click="addWorkItemToCanvas(item)">添加到画布</button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="template-head template-head-shell">
          <div>
            <h3>模板拖拽画布</h3>
            <strong>{{ maskSensitiveText(activeTemplate?.name) }} / {{ activeTemplate?.version }}</strong>
            <div class="muted">{{ maskSensitiveText(activeTemplate?.description) }}</div>
          </div>
          <div class="button-row">
            <button class="ghost" type="button" @click="zoomOutTemplateCanvas">缩小</button>
            <button class="ghost" type="button" @click="zoomInTemplateCanvas">放大</button>
            <button class="ghost" type="button" @click="fitTemplateCanvas">适配视图</button>
            <button class="ghost" type="button" @click="resetTemplateCanvas">重置</button>
          </div>
        </div>
        <div class="dify-template-frame">
          <div
            ref="canvasViewportRef"
            class="dify-template-viewport"
            @dragover.prevent
            @drop="handleCanvasDrop"
          >
            <div class="dify-template-scene" :style="templateCanvasStyle">
              <svg
                class="template-connector-layer"
                :viewBox="`0 0 ${templateCanvasMetrics.width} ${templateCanvasMetrics.height}`"
                preserveAspectRatio="none"
              >
                <path
                  v-for="link in templateCanvasLinks"
                  :key="link.id"
                  class="template-connector-path"
                  :d="link.d"
                />
                <g v-for="link in templateCanvasLinks" :key="`${link.id}-add`">
                  <circle class="template-link-dot" :cx="link.midpointX" :cy="link.midpointY" r="14" @click="openNextNodePicker(link)" />
                  <text class="template-link-plus" :x="link.midpointX" :y="link.midpointY + 1" @click="openNextNodePicker(link)">+</text>
                </g>
              </svg>

              <div
                v-if="nextNodePicker.open"
                class="next-step-picker"
                :style="{
                  left: `${nextNodePicker.x}px`,
                  top: `${nextNodePicker.y + 20}px`
                }"
              >
                <label class="field">
                  <span>在线路中插入工作步骤</span>
                  <input v-model="nextNodePicker.keyword" type="text" placeholder="搜索工作项目名称">
                </label>
                <div class="next-step-list">
                  <button
                    v-for="item in filteredNextNodeItems"
                    :key="item.id"
                    class="next-step-item"
                    type="button"
                    @click="insertNodeBetween(item.id)"
                  >
                    <div>
                      <strong>{{ maskSensitiveText(item.name) }}</strong>
                      <small>{{ maskSensitiveText(item.duration) }} / {{ maskSensitiveText(item.staffing) }}</small>
                    </div>
                    <span class="accent">插入</span>
                  </button>
                </div>
                <div class="button-row" style="margin-top:12px;">
                  <button class="ghost" type="button" @click="closeNextNodePicker">取消</button>
                </div>
              </div>

              <div v-if="!workflowCanvasNodes.length" class="template-scene-empty">
                拖拽左侧工作流项目到画布中，或点击“按模板生成”自动生成节点流程。
              </div>

              <div
                v-for="node in workflowCanvasNodes"
                :key="node.id"
                class="template-node-shell"
                :style="{ left: `${node.x}px`, top: `${node.y}px`, width: `${templateCanvasMetrics.nodeWidth}px` }"
              >
                <article
                  class="template-node-card"
                  :class="{ selected: selectedStepId === node.id, locked: node.locked }"
                  @click.stop="selectStep(node.id)"
                  @dblclick.stop="removeStep(node.id)"
                  @mousedown.stop="startNodeDrag(node.id, $event)"
                >
                  <div class="template-node-head">
                    <div class="template-node-tags">
                      <span class="template-node-type">工作节点</span>
                      <span v-if="node.locked" class="template-step-locked-tag">已锁定</span>
                    </div>
                    <div class="template-node-actions">
                      <button class="mini-action" type="button" @mousedown.stop @click.stop="toggleLockStep(node)">{{ node.locked ? "解锁" : "锁定" }}</button>
                      <button class="mini-action" type="button" @mousedown.stop @click.stop="removeStep(node.id)">删除</button>
                    </div>
                  </div>
                  <strong>{{ maskSensitiveText(node.name) }}</strong>
                  <p>{{ maskSensitiveText(node.staffing) }}</p>
                  <div class="template-node-meta">
                    <span>执行人员：{{ node.assignees.join(" / ") || "待分配" }}</span>
                    <span>执行时长：{{ maskSensitiveText(node.executionDuration) }}</span>
                    <span>设备：{{ maskSensitiveText(node.equipment) }}</span>
                  </div>
                </article>
              </div>
            </div>
          </div>
          <div class="template-canvas-tips">
            <span class="chip">拖拽左侧工作项目到画布任意位置</span>
            <span class="chip">双击节点可直接删除</span>
            <span class="chip">锁定后优化仅调整未锁定节点</span>
            <span class="chip active">当前缩放：{{ Math.round(templateCanvasZoom * 100) }}%</span>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3>智能建议</h3>
        <div class="notice-card"><span>当前步骤库来自工作项目管理，人员来自人员库，模板来自流程模板管理。</span><span class="accent">规则联动</span></div>
        <div v-for="item in definition.suggestions" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="accent">建议</span></div>
      </div>
    </section>

    <section class="panel" style="margin-top:18px;">
      <h3>流程库</h3>
      <div class="rules-list">
        <div
          v-for="item in currentWorkflowLibrary"
          :key="item.id"
          class="notice-card workflow-library-entry"
          @dblclick="openWorkflowFromLibrary(item)"
        >
          <span>{{ maskSensitiveText(item.name) }} / {{ item.updatedAt }} / {{ maskSensitiveText(item.status) }}</span>
          <span class="accent">双击打开</span>
        </div>
        <div v-if="!currentWorkflowLibrary.length" class="notice-card">
          <span>当前流程类型下还没有存入流程库的流程。生成流程或保存草稿后，这里会自动收录。</span>
          <span class="accent">待生成</span>
        </div>
      </div>
    </section>
    <section class="panel" style="margin-top:18px;">
      <h3>计划状态与执行控制</h3>
      <div class="status-bar">
        <span class="chip active">{{ planStatusLabel }}</span>
        <span class="chip">生成方式：{{ generationModeLabel }}</span>
        <span class="chip">{{ planState.fetched ? "任务计划已获取" : "任务计划未获取" }}</span>
        <span class="chip">开始：{{ formatDisplayTime(planState.startTime) }}</span>
        <span class="chip">结束：{{ formatDisplayTime(planState.endTime) }}</span>
        <span class="chip">{{ planState.keyNodes.length ? `关键节点 ${planState.keyNodes.length} 项` : "未指定关键节点" }}</span>
      </div>
      <div class="button-row" style="margin-top:16px;">
        <button class="button" type="button" @click="submitReview">提交岗位指挥员审核</button>
        <button class="ghost" type="button" @click="activatePlan">审核后生效执行</button>
        <button class="ghost" type="button" @click="startExecute">开始执行</button>
        <button class="ghost" type="button" @click="deletePlan">删除计划</button>
        <button class="ghost" type="button" @click="terminatePlan">计划终止</button>
        <button class="ghost" type="button" @click="showToast('已导出系统计划表格（Excel）')">导出表格</button>
        <button class="ghost" type="button" @click="showToast('已导出流程图片（PNG）')">导出图片</button>
        <button class="ghost" type="button" @click="showToast('已导出流程文件（PDF）')">导出 PDF</button>
      </div>
    </section>

    <section class="panel-grid two" style="margin-top:18px;">
      <div class="panel">
        <h3>冲突检测与确认优化</h3>
        <div class="rules-list">
          <div v-for="item in planState.conflicts" :key="item.message" class="notice-card">
            <span>{{ maskSensitiveText(item.message) }}<template v-if="item.suggestion">；建议：{{ maskSensitiveText(item.suggestion) }}</template></span>
            <span class="warning">{{ maskSensitiveText(item.type) }}</span>
          </div>
          <div v-if="!planState.conflicts.length" class="notice-card"><span>未检测到冲突，可继续执行。</span><span class="accent">正常</span></div>
        </div>
        <div class="button-row" style="margin-top:16px;">
          <button class="button" type="button" @click="confirmOptimize">确认自动优化</button>
          <button class="ghost" type="button" @click="showUnresolved">查看无法自动调整冲突</button>
        </div>
      </div>
      <div class="panel">
        <h3>多级综合流程整合</h3>
        <div class="button-row">
          <button class="ghost" type="button" @click="renderIntegration('system'); showToast('已整合当前系统综合工作流程')">整合当前系统流程</button>
          <button class="ghost" type="button" @click="renderIntegration('all'); showToast('已整合加注供气系统全部工作计划')">{{ maskSensitiveText("整合加注供气系统全部流程") }}</button>
        </div>
        <div class="rules-list" style="margin-top:16px;">
          <div v-for="item in integrationItems" :key="item" class="notice-card"><span>{{ maskSensitiveText(item) }}</span><span class="accent">整合结果</span></div>
        </div>
      </div>
    </section>

    <section class="panel-grid two" style="margin-top:18px;">
      <div class="panel">
        <h3>可视化元件库</h3>
        <div v-for="item in visualModules" :key="item" class="visual-module" draggable="true" @dragstart="dragState.type = 'visual'; dragState.itemId = item" @click="addVisualModule(item)">{{ maskSensitiveText(item) }}</div>
      </div>
      <div class="panel">
        <h3>可视化流程编制区</h3>
        <div class="visual-canvas" @dragover.prevent @drop="dragState.type === 'visual' ? addVisualModule(dragState.itemId) : null">
          <div v-for="item in visualCanvasNodes" :key="item.id" class="visual-node" @dblclick="removeVisualNode(item.id)">{{ maskSensitiveText(item.name) }}</div>
        </div>
      </div>
    </section>

    <section class="panel" style="margin-top:18px;">
      <h3>时间线综合流程</h3>
      <div class="timeline">
        <div v-for="item in definition.timeline" :key="item.title" class="timeline-card">
          <strong>{{ maskSensitiveText(item.title) }}</strong>
          <div><span v-for="tag in item.tags" :key="tag" class="tag">{{ maskSensitiveText(tag) }}</span></div>
          <p>{{ maskSensitiveText(item.desc) }}</p>
          <div class="progress"><span :style="{ width: `${item.progress}%` }"></span></div>
        </div>
      </div>
    </section>

    <div class="modal-overlay live-conflict-overlay" :class="{ open: liveConflictPopup.open }">
      <div class="modal-card live-conflict-modal">
        <div class="live-conflict-head">
          <strong>实时冲突动态提示</strong>
          <span class="warning">检测到冲突</span>
        </div>
        <p class="muted">当前在手动修改流程时检测到冲突，请确认后再继续调整。</p>
        <div class="rules-list" style="margin-top: 16px;">
          <div v-for="item in liveConflictPopup.items" :key="item.message" class="notice-card">
            <span>{{ maskSensitiveText(item.message) }}<template v-if="item.suggestion">；建议：{{ maskSensitiveText(item.suggestion) }}</template></span>
            <span class="warning">{{ maskSensitiveText(item.type) }}</span>
          </div>
        </div>
        <div class="button-row" style="margin-top: 18px; justify-content: flex-end;">
          <button class="button" type="button" @click="closeLiveConflictPopup">确认</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: generationConflictModal.open }">
      <div class="modal-card generation-conflict-modal">
        <div class="live-conflict-head">
          <strong>生成冲突确认</strong>
          <span class="warning">库内计划存在重复或冲突</span>
        </div>
        <p class="muted">当前新生成计划与流程库中的现有计划存在重复或冲突工作点。确认后系统将自动调整当前流程，优先删除或改派可调整节点。</p>
        <div class="rules-list modal-scroll-list" style="margin-top: 16px;">
          <div v-for="item in generationConflictModal.conflicts" :key="item.key" class="notice-card">
            <span>{{ maskSensitiveText(item.message) }}<template v-if="item.suggestion">；处理方式：{{ maskSensitiveText(item.suggestion) }}</template></span>
            <span :class="item.removable ? 'warning' : 'danger'">{{ maskSensitiveText(item.type) }}</span>
          </div>
        </div>
        <div class="button-row" style="margin-top: 18px; justify-content: flex-end;">
          <button class="ghost" type="button" @click="closeGenerationConflictModal">取消</button>
          <button class="button" type="button" @click="confirmGenerationConflictAdjustment">确认并自动调整</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: generationConflictFeedbackModal.open }">
      <div class="modal-card generation-conflict-modal">
        <div class="live-conflict-head">
          <strong>冲突反馈</strong>
          <span class="danger">存在无法自动调整的工作项</span>
        </div>
        <p class="muted">以下工作点为当前计划中的必要节点，系统无法自动删除或替换，请岗位人员人工确认并处理冲突。</p>
        <div class="rules-list modal-scroll-list" style="margin-top: 16px;">
          <div v-for="item in generationConflictFeedbackModal.conflicts" :key="item.key" class="notice-card">
            <span>{{ maskSensitiveText(item.message) }}</span>
            <span class="danger">{{ maskSensitiveText(item.type) }}</span>
          </div>
        </div>
        <div class="button-row" style="margin-top: 18px; justify-content: flex-end;">
          <button class="button" type="button" @click="closeGenerationConflictFeedbackModal">确认</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: fuelSignOpen }">
      <div class="modal-card">
        <h3>系统指挥员电子审签</h3>
        <p>{{ maskSensitiveText("特燃特气保障量等信息生成后，需由系统指挥员完成电子审签确认。确认后系统将下发特燃特气保障数据。") }}</p>
        <div class="detail-list">
          <div class="detail-line"><span>审签对象</span><strong>{{ maskSensitiveText("特燃特气保障数据") }}</strong></div>
          <div class="detail-line"><span>审签角色</span><strong>系统指挥员</strong></div>
          <div class="detail-line"><span>下发动作</span><strong>确认后自动下发至相关系统</strong></div>
        </div>
        <div class="button-row" style="margin-top:18px;">
          <button class="button" type="button" @click="confirmFuelSign">确认审签并下发</button>
          <button class="ghost" type="button" @click="fuelSignOpen = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>









