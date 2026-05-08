import { reactive, ref } from "vue";
import { ruleCatalog } from "../data/ruleCatalog";

const executedPlanStorageKey = "screen-vue-executed-plans";
const monitoringPlanStorageKey = "screen-vue-monitoring-plans";
const authStorageKey = "screen-vue-auth-user";
const fuelPlanningStorageKey = "screen-vue-fuel-planning-packet";
const genericPlanningStorageKey = "screen-vue-generic-planning-packets";
const globalKeyNodeStorageKey = "screen-vue-global-key-nodes";
const customMonitoringWorkStorageKey = "screen-vue-custom-monitoring-works";
const workRuleLibraryStorageKey = "screen-vue-work-rule-library";
const workActionOverrideStorageKey = "screen-vue-work-action-overrides";

const mojibakeReplacementMap = {
  "姘ф皵": "氧气",
  "姘㈡皵": "氢气",
  "姘皵": "氮气",
  "姘︽皵": "氦气",
  "绯荤粺": "系统",
  "璁″垝": "计划",
  "娴佺▼": "流程",
  "浠诲姟": "任务",
  "宸ヤ綔": "工作",
  "鐢熶骇": "生产",
  "瀹夊叏鍑嗗": "安全准备",
  "鐢熶骇鏍￠獙": "生产校验",
  "鐢熶骇鎵ц": "生产执行",
  "璐ㄩ噺澶嶆牳": "质量复核",
  "璐ㄩ噺纭": "质量确认",
  "璐ㄩ噺": "质量",
  "淇濋殰": "保障",
  "渚涙皵": "供气",
  "鍦ㄧ嚎": "在线",
  "鐩戞祴": "监测",
  "杞繍": "转运",
  "鎷夎繍": "拉运",
  "鍏呮皵": "充气",
  "琛ユ皵": "补气",
  "娴嬭瘯": "测试",
  "璇曢獙": "试验",
  "缁翠慨": "维修",
  "缁存姢": "维护",
  "鎵ц": "执行",
  "纭": "确认",
  "褰掓。": "归档",
  "鍙傛暟": "参数",
  "鍔犺浇": "加载",
  "绛惧瓧": "签字",
  "璁板綍": "记录",
  "璁惧": "设备",
  "璧勬簮": "资源",
  "鐢熸垚浜哄憳": "生成人员",
  "纭鏃堕棿": "确认时间",
  "闇€姹傞噺": "需求量",
  "鐢熶骇閲": "生产量",
  "淇濋殰閲": "保障量",
  "搴撳瓨閲": "库存量",
  "鍒樺伐": "刘工",
  "璧靛伐": "赵工",
  "瀛欏伐": "孙工",
  "閽卞伐": "钱工",
  "鍚村伐": "吴工",
  "寮犲伐": "张工",
  "鏉庡伐": "李工",
  "鍛ㄥ伐": "周工",
  "闄堝伐": "陈工",
  "鐜嬫寚鎸?": "王指挥",
  "宸插畬鎴?": "已完成",
  "宸插綊妗?": "已归档",
  "鍚敤": "启用",
  "鍦ㄥ矖": "在岗",
  "灏忔椂": "小时",
  "骞?": "年",
  "娑叉哀": "液氧",
  "姘旂摱": "气瓶",
  "杞﹁締": "车辆",
  "妲借溅": "槽车",
  "缁堢": "终端",
  "鍥炲満": "回场",
  "璺嚎": "路线",
  "璧勬枡": "资料",
  "澶嶆牳": "复核",
  "鍗忓悓": "协同",
  "缁撴灉": "结果",
  "鏀跺熬": "收尾",
  "鍑嗗": "准备",
  "妫€鏌": "检查",
  "妫€淇": "检修",
  "寮€濮": "开始",
  "鏁呴殰": "故障",
  "闅旂": "隔离",
  "鏍囨牎": "标校",
  "鑷畾涔": "自定义",
  "鍏抽敭": "关键",
  "閿佸畾": "锁定"
};

const mojibakeReplacementEntries = Object.entries(mojibakeReplacementMap).sort(
  ([left], [right]) => right.length - left.length
);

function repairMojibakeText(text) {
  if (typeof text !== "string") return text;
  return mojibakeReplacementEntries.reduce((result, [from, to]) => result.split(from).join(to), text);
}

function repairMojibakeValue(value) {
  if (typeof value === "string") return repairMojibakeText(value);
  if (Array.isArray(value)) return value.map((item) => repairMojibakeValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, repairMojibakeValue(item)]));
  }
  return value;
}

function getTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const fuelPlanningToday = getTodayIso();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : fallback;
    const repaired = repairMojibakeValue(value);
    if (raw && JSON.stringify(repaired) !== JSON.stringify(value)) {
      localStorage.setItem(key, JSON.stringify(repaired));
    }
    return repaired;
  } catch {
    return repairMojibakeValue(fallback);
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(repairMojibakeValue(value)));
}

function createMonitoringHistorySeed2025AnnualTask() {
  return createCanonicalHistorySeed2025();
}

function withExecutedPlanSeeds(storedPlans) {
  return Array.isArray(storedPlans) ? storedPlans : [];
}
function createFuelGasPacket() {
  return {
    dispatched: false,
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

function createDefaultFuelPacket() {
  return {
    status: "idle",
    lastUpdatedAt: "",
    submittedBy: "",
    taskInfo: {
      taskName: "",
      taskCode: "",
      rocketModel: "",
      taskType: "单次任务",
      startDate: "2026-04-17",
      endDate: "2026-04-17",
      messageTemplate: "TKTQ 测算报文模板 / v1.0"
    },
    reportRows: [],
    gasPackets: {
      oxygen: createFuelGasPacket(),
      hydrogen: createFuelGasPacket(),
      nitrogen: createFuelGasPacket(),
      helium: createFuelGasPacket()
    }
  };
}

function normalizeFuelPacket(packet) {
  const base = createDefaultFuelPacket();
  const next = { ...base, ...clone(packet || {}) };
  next.taskInfo = { ...base.taskInfo, ...(packet?.taskInfo || {}) };
  next.reportRows = Array.isArray(packet?.reportRows) ? clone(packet.reportRows) : [];
  next.gasPackets = {
    oxygen: { ...createFuelGasPacket(), ...(packet?.gasPackets?.oxygen || {}) },
    hydrogen: { ...createFuelGasPacket(), ...(packet?.gasPackets?.hydrogen || {}) },
    nitrogen: { ...createFuelGasPacket(), ...(packet?.gasPackets?.nitrogen || {}) },
    helium: { ...createFuelGasPacket(), ...(packet?.gasPackets?.helium || {}) }
  };
  return next;
}

function createGenericPlanningGasPacket() {
  return {
    calendarPlans: [],
    keyNodes: [],
    conflictRecords: [],
    planStatus: "idle",
    planGeneratedBy: "",
    planConfirmedAt: "",
    lastEditedBy: ""
  };
}

function createGenericPlanningPacket() {
  return {
    mission: {
      lastUpdatedAt: "",
      gasPackets: {
        oxygen: createGenericPlanningGasPacket(),
        hydrogen: createGenericPlanningGasPacket(),
        nitrogen: createGenericPlanningGasPacket(),
        helium: createGenericPlanningGasPacket()
      }
    },
    launch: {
      lastUpdatedAt: "",
      gasPackets: {
        oxygen: createGenericPlanningGasPacket(),
        hydrogen: createGenericPlanningGasPacket(),
        nitrogen: createGenericPlanningGasPacket(),
        helium: createGenericPlanningGasPacket()
      }
    },
    repair: {
      lastUpdatedAt: "",
      gasPackets: {
        oxygen: createGenericPlanningGasPacket(),
        hydrogen: createGenericPlanningGasPacket(),
        nitrogen: createGenericPlanningGasPacket(),
        helium: createGenericPlanningGasPacket()
      }
    },
    maintenance: {
      lastUpdatedAt: "",
      gasPackets: {
        oxygen: createGenericPlanningGasPacket(),
        hydrogen: createGenericPlanningGasPacket(),
        nitrogen: createGenericPlanningGasPacket(),
        helium: createGenericPlanningGasPacket()
      }
    },
    custom: {
      lastUpdatedAt: "",
      gasPackets: {
        oxygen: createGenericPlanningGasPacket(),
        hydrogen: createGenericPlanningGasPacket(),
        nitrogen: createGenericPlanningGasPacket(),
        helium: createGenericPlanningGasPacket()
      }
    }
  };
}

function normalizeGenericPlanningPacket(packet) {
  const base = createGenericPlanningPacket();
  const result = clone(base);
  Object.keys(base).forEach((flowId) => {
    result[flowId] = {
      ...base[flowId],
      ...(packet?.[flowId] || {}),
      gasPackets: {
        oxygen: { ...createGenericPlanningGasPacket(), ...(packet?.[flowId]?.gasPackets?.oxygen || {}) },
        hydrogen: { ...createGenericPlanningGasPacket(), ...(packet?.[flowId]?.gasPackets?.hydrogen || {}) },
        nitrogen: { ...createGenericPlanningGasPacket(), ...(packet?.[flowId]?.gasPackets?.nitrogen || {}) },
        helium: { ...createGenericPlanningGasPacket(), ...(packet?.[flowId]?.gasPackets?.helium || {}) }
      }
    };
  });
  return result;
}

function legacyCreateMonitoringHistorySeed2025AnnualTask() {
  return [createCanonicalHistorySeed2025()];
}

function legacyWithExecutedPlanSeeds(storedPlans) {
  return normalizeExecutedHistoryStore(storedPlans);
}

function toDateOnly(iso) {
  const [year, month, day] = `${iso}`.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(iso, offset) {
  const date = toDateOnly(iso);
  date.setDate(date.getDate() + offset);
  return formatDateOnly(date);
}

function enumerateDates(startIso, endIso) {
  if (!startIso || !endIso) return [];
  const dates = [];
  let cursor = startIso;
  while (toDateOnly(cursor).getTime() <= toDateOnly(endIso).getTime()) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function createCanonicalHistorySeed2025() {
  const plans = [
    { id: "seed-2025-window", flowTitle: "Annual Task Coordination", name: "2025 Annual Task Import And Window Lock", startDate: "2025-01-06", endDate: "2025-01-15", color: "#7da1ff", completionMeta: { totalCount: 6, completedCount: 6, progress: 100, complete: true, status: "Completed" } },
    { id: "seed-2025-production", flowTitle: "Fuel And Gas Planning", name: "Oxygen System Annual Production Plan", startDate: "2025-02-10", endDate: "2025-03-05", color: "#60e3ff", completionMeta: { totalCount: 10, completedCount: 10, progress: 100, complete: true, status: "Completed" } },
    { id: "seed-2025-transfer", flowTitle: "Fuel And Gas Planning", name: "Oxygen System Annual Transfer Plan", startDate: "2025-04-08", endDate: "2025-05-20", color: "#83f0c1", completionMeta: { totalCount: 14, completedCount: 14, progress: 100, complete: true, status: "Completed" } }
  ];
  return {
    id: "monitoring-calendar-history-2025-annual-oxygen",
    kind: "monitoring-calendar-history",
    category: "History Calendar",
    gasType: "oxygen",
    gasLabel: "Oxygen",
    title: "2025 Annual Task Calendar",
    system: "Oxygen System",
    owner: "System Engineer",
    status: "Archived",
    type: "Annual Task",
    risk: "Low",
    date: "2025-12-18",
    startTime: "2025-01-06T08:00",
    endTime: "2025-12-18T18:00",
    archivedAt: "2025/12/20 18:30:00",
    totalPlans: plans.length,
    completedPlans: plans.length,
    dateRange: "2025-01-06 - 2025-12-18",
    historySignature: "seed-2025-annual-task-calendar-clean-v1",
    taskCode: "HIS-OXYGEN-2025",
    tags: ["Annual Task", "History", "Oxygen System"],
    plans
  };
}

function deriveHistoryChildrenFromCalendar(calendar) {
  const historyId = calendar.id;
  const gasLabel = calendar.gasLabel || "System";
  const system = calendar.system || `${gasLabel} System`;
  const archivedAt = calendar.archivedAt || calendar.confirmedAt || calendar.updatedAt || "";
  const plans = Array.isArray(calendar.plans) ? calendar.plans : [];

  const planEntries = plans.map((plan, index) => ({
    id: `${historyId}-plan-${plan.id}`,
    parentHistoryId: historyId,
    sourcePlanId: plan.id,
    kind: "monitoring-plan-history",
    category: "Work Plan",
    gasType: calendar.gasType,
    gasLabel,
    title: plan.name,
    planTitle: plan.name,
    flowTitle: plan.flowTitle,
    system,
    owner: `${gasLabel} Commander`,
    status: plan.completionMeta?.status || "Completed",
    type: plan.flowTitle,
    risk: calendar.risk || "Low",
    date: plan.endDate,
    startTime: `${plan.startDate}T08:00`,
    endTime: `${plan.endDate}T18:00`,
    archivedAt,
    dateRange: `${plan.startDate} - ${plan.endDate}`,
    taskCode: `${calendar.taskCode || historyId}-PLAN-${String(index + 1).padStart(2, "0")}`,
    tags: ["History Work Plan", gasLabel, plan.flowTitle, plan.name],
    completionMeta: clone(plan.completionMeta || {})
  }));

  const workEntries = plans.flatMap((plan, planIndex) =>
    enumerateDates(plan.startDate, plan.endDate).map((dateIso, dateIndex) => ({
      id: `${historyId}-work-${plan.id}-${dateIso}`,
      parentHistoryId: historyId,
      sourcePlanId: plan.id,
      kind: "monitoring-work-history",
      category: "Work",
      gasType: calendar.gasType,
      gasLabel,
      title: `${plan.name} - Day ${dateIndex + 1} Work`,
      planTitle: plan.name,
      flowTitle: plan.flowTitle,
      system,
      owner: `${gasLabel} Operator`,
      personnel: [`${gasLabel} Operator`, `${gasLabel} Commander`],
      status: "Completed",
      type: plan.flowTitle,
      risk: "Routine Risk",
      date: dateIso,
      startTime: `${dateIso}T08:00`,
      endTime: `${dateIso}T10:00`,
      archivedAt,
      dateRange: `${dateIso} 08:00-10:00`,
      taskCode: `${calendar.taskCode || historyId}-WORK-${String(planIndex + 1).padStart(2, "0")}-${String(dateIndex + 1).padStart(2, "0")}`,
      tags: ["History Work", gasLabel, plan.name, plan.flowTitle]
    }))
  );

  return [...planEntries, ...workEntries];
}

function normalizeExecutedHistoryStore(storedPlans) {
  const source = Array.isArray(storedPlans) ? clone(storedPlans) : [];
  const merged = new Map();
  source.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  const canonicalSeed = createCanonicalHistorySeed2025();
  merged.set(canonicalSeed.id, canonicalSeed);
  [...merged.values()]
    .filter((item) => item?.kind === "monitoring-calendar-history")
    .forEach((calendar) => deriveHistoryChildrenFromCalendar(calendar).forEach((entry) => merged.set(entry.id, entry)));
  return [...merged.values()];
}
const authProfiles = {
  engineer: {
    role: "engineer",
    roleLabel: "系统工程师",
    username: "engineer01",
    password: "Eng@2026"
  },
  commander: {
    role: "commander",
    roleLabel: "指挥人员",
    username: "commander01",
    password: "Cmd@2026"
  },
  operator: {
    role: "operator",
    roleLabel: "操作人员",
    username: "operator01",
    password: "Opr@2026"
  }
};
const storedWorkRuleLibrary = readStorage(workRuleLibraryStorageKey, []);
const catalogSeed = repairMojibakeValue(clone(ruleCatalog));
if (Array.isArray(storedWorkRuleLibrary) && storedWorkRuleLibrary.length) {
  storedWorkRuleLibrary.forEach((rule) => {
    if (!catalogSeed.workItems.some((item) => item.id === rule.id)) {
      catalogSeed.workItems.unshift(rule);
    }
  });
}
const catalog = reactive(catalogSeed);
const initialExecutedPlans = repairMojibakeValue(normalizeExecutedHistoryStore(readStorage(executedPlanStorageKey, [])));
writeStorage(executedPlanStorageKey, initialExecutedPlans);
const executedPlans = ref(initialExecutedPlans);
const monitoringPlans = ref(readStorage(monitoringPlanStorageKey, []));
const toastMessage = ref("");
const assistantOpen = ref(false);
const currentUser = ref(readStorage(authStorageKey, null));
const fuelPlanningPacket = ref(
  repairMojibakeValue(normalizeFuelPacket(readStorage(fuelPlanningStorageKey, createDefaultFuelPacket())))
);
const genericPlanningPackets = ref(
  repairMojibakeValue(normalizeGenericPlanningPacket(readStorage(genericPlanningStorageKey, createGenericPlanningPacket())))
);
const globalKeyNodes = ref(readStorage(globalKeyNodeStorageKey, []));
const customMonitoringWorks = ref(readStorage(customMonitoringWorkStorageKey, []));
const workRuleLibrary = ref(Array.isArray(storedWorkRuleLibrary) ? storedWorkRuleLibrary : []);
const workActionOverrides = ref(readStorage(workActionOverrideStorageKey, []));

const keyTimeNodes = ref([
  {
    id: "kt-1",
    label: "T-180 任务计划锁定",
    category: "任务输入",
    description: "任务计划完成导入并锁定关键窗口，作为后续各专项流程生成的起点。"
  },
  {
    id: "kt-2",
    label: "T-120 人员定岗完成",
    category: "人员规划",
    description: "系统完成人员定岗、岗位确认和主备班次分配。"
  },
  {
    id: "kt-3",
    label: "T-90 关键保障策略确认",
    category: "保障策略",
    description: "完成关键设备、供气策略和应急切换策略审定。"
  },
  {
    id: "kt-4",
    label: "T-60 电子审签完成",
    category: "审核确认",
    description: "系统指挥员与相关岗位完成电子审签，允许进入执行态。"
  },
  {
    id: "kt-5",
    label: "T-30 在线保障切换窗口",
    category: "执行节点",
    description: "进入在线保障、冲突重检和应急联动切换窗口。"
  }
]);
function nowLabel() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function showToast(message) {
  toastMessage.value = message;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    if (toastMessage.value === message) toastMessage.value = "";
  }, 2200);
}

function login({ role, gasType, username, password }) {
  const profile = authProfiles[role];
  if (!profile) {
    return { ok: false, message: "请选择登录身份。" };
  }

  if ((role === "commander" || role === "operator") && !gasType) {
    return { ok: false, message: "指挥人员和操作人员需要先选择气体类型。" };
  }

  if (username !== profile.username || password !== profile.password) {
    return { ok: false, message: "账号或密码不正确，请重新输入。" };
  }

  const user = {
    role,
    roleLabel: profile.roleLabel,
    username,
    gasType: role === "engineer" ? "all" : gasType,
    gasTypeLabel:
      role === "engineer"
        ? "全部气体"
        : gasType === "oxygen"
          ? "氧气"
          : gasType === "hydrogen"
            ? "氢气"
            : gasType === "nitrogen"
              ? "氮气"
              : "氦气",
    loginAt: nowLabel()
  };

  currentUser.value = user;
  writeStorage(authStorageKey, user);
  return { ok: true, user };
}

function logout() {
  currentUser.value = null;
  localStorage.removeItem(authStorageKey);
}

function listExecutedPlans() {
  return executedPlans.value;
}

function saveExecutedPlan(plan) {
  const next = [...executedPlans.value];
  const index = next.findIndex((item) => item.id === plan.id);
  if (index >= 0) next[index] = plan;
  else next.unshift(plan);
  executedPlans.value = next;
  writeStorage(executedPlanStorageKey, next);
}

function removeExecutedPlan(planId) {
  executedPlans.value = executedPlans.value.filter((item) => item.id !== planId);
  writeStorage(executedPlanStorageKey, executedPlans.value);
}

function listMonitoringPlans() {
  return monitoringPlans.value;
}

function saveMonitoringPlan(plan) {
  const next = [...monitoringPlans.value];
  const index = next.findIndex((item) => item.id === plan.id);
  if (index >= 0) next[index] = { ...next[index], ...plan };
  else next.unshift(plan);
  monitoringPlans.value = next;
  writeStorage(monitoringPlanStorageKey, next);
}

function updateMonitoringPlan(planId, updater) {
  const next = monitoringPlans.value.map((item) => {
    if (item.id !== planId) return item;
    const patch = typeof updater === "function" ? updater(item) : updater;
    return { ...item, ...patch };
  });
  monitoringPlans.value = next;
  writeStorage(monitoringPlanStorageKey, next);
}

function removeMonitoringPlan(planId) {
  monitoringPlans.value = monitoringPlans.value.filter((item) => item.id !== planId);
  writeStorage(monitoringPlanStorageKey, monitoringPlans.value);
}

function addCatalogLog(id, text) {
  if (!catalog.logs[id]) catalog.logs[id] = [];
  catalog.logs[id].unshift(`${nowLabel()} ${text}`);
}

function getCatalogCollection(key) {
  if (key === "items") return catalog.workItems;
  if (key === "constraints") return catalog.constraints;
  if (key === "people") return catalog.people;
  if (key === "algorithms") return catalog.algorithms;
  return catalog.flowTemplates;
}

function saveFuelPlanningPacket(nextPacket) {
  fuelPlanningPacket.value = repairMojibakeValue(normalizeFuelPacket(nextPacket));
  writeStorage(fuelPlanningStorageKey, fuelPlanningPacket.value);
}

function updateFuelPlanningPacket(patch) {
  const next =
    typeof patch === "function"
      ? patch(clone(fuelPlanningPacket.value))
      : { ...fuelPlanningPacket.value, ...patch };
  saveFuelPlanningPacket(next);
}

function markFuelGasReviewed(gasType, reviewerName) {
  updateFuelPlanningPacket((draft) => {
    if (!draft.gasPackets[gasType]) return draft;
    draft.gasPackets[gasType].reviewed = true;
    draft.gasPackets[gasType].reviewedBy = reviewerName;
    draft.gasPackets[gasType].reviewedAt = nowLabel();
    return draft;
  });
}

function saveFuelGasCalendar(gasType, calendarPlans) {
  updateFuelPlanningPacket((draft) => {
    if (!draft.gasPackets[gasType]) return draft;
    if (Array.isArray(calendarPlans)) {
      draft.gasPackets[gasType].calendarPlans = clone(calendarPlans);
    } else {
      draft.gasPackets[gasType] = {
        ...draft.gasPackets[gasType],
        ...clone(calendarPlans || {})
      };
    }
    return draft;
  });
}

function saveGenericPlanningPackets(nextValue) {
  genericPlanningPackets.value = repairMojibakeValue(normalizeGenericPlanningPacket(nextValue));
  writeStorage(genericPlanningStorageKey, genericPlanningPackets.value);
}

function saveGenericFlowCalendar(flowId, gasType, payload) {
  const next = clone(genericPlanningPackets.value);
  if (!next[flowId]) return;
  next[flowId].lastUpdatedAt = nowLabel();
  next[flowId].gasPackets[gasType] = {
    ...next[flowId].gasPackets[gasType],
    ...(Array.isArray(payload) ? { calendarPlans: clone(payload) } : clone(payload || {}))
  };
  saveGenericPlanningPackets(next);
}

function saveGlobalKeyNode(node) {
  const normalized = {
    id: node.id || `global-key-node-${Date.now()}`,
    dateIso: node.dateIso,
    title: node.title || "",
    nodeType: node.nodeType || "关键检查",
    description: node.description || "",
    blockScheduling: Boolean(node.blockScheduling),
    scopeFlowIds: Array.isArray(node.scopeFlowIds) && node.scopeFlowIds.length ? [...node.scopeFlowIds] : ["all"],
    gasTypes: Array.isArray(node.gasTypes) && node.gasTypes.length ? [...node.gasTypes] : ["all"],
    createdAt: node.createdAt || nowLabel(),
    createdBy: node.createdBy || currentUser.value?.roleLabel || "系统用户"
  };
  const next = [normalized, ...globalKeyNodes.value.filter((item) => item.id !== normalized.id)];
  globalKeyNodes.value = next;
  writeStorage(globalKeyNodeStorageKey, next);
}

function removeGlobalKeyNode(nodeId) {
  globalKeyNodes.value = globalKeyNodes.value.filter((item) => item.id !== nodeId);
  writeStorage(globalKeyNodeStorageKey, globalKeyNodes.value);
}

function addMonitoringWork(work) {
  const normalized = {
    ...clone(work || {}),
    id: work?.id || `monitoring-work-${Date.now()}`,
    source: work?.source || "manual",
    createdAt: work?.createdAt || nowLabel(),
    createdBy: work?.createdBy || currentUser.value?.roleLabel || "岗位人员"
  };
  const next = [normalized, ...customMonitoringWorks.value.filter((item) => item.id !== normalized.id)];
  customMonitoringWorks.value = next;
  writeStorage(customMonitoringWorkStorageKey, next);
  return normalized;
}

function saveWorkRule(rule) {
  const normalized = {
    ...clone(rule || {}),
    id: rule?.id || `monitoring-rule-${Date.now()}`,
    status: rule?.status || "启用",
    version: rule?.version || "v1.0",
    createdAt: rule?.createdAt || nowLabel(),
    createdBy: rule?.createdBy || currentUser.value?.roleLabel || "岗位人员"
  };
  const nextRules = [normalized, ...workRuleLibrary.value.filter((item) => item.id !== normalized.id)];
  workRuleLibrary.value = nextRules;
  writeStorage(workRuleLibraryStorageKey, nextRules);

  const index = catalog.workItems.findIndex((item) => item.id === normalized.id);
  if (index >= 0) {
    catalog.workItems[index] = normalized;
  } else {
    catalog.workItems.unshift(normalized);
  }
  return normalized;
}

function saveWorkActionOverride(record) {
  const normalized = {
    ...clone(record || {}),
    id: record?.id || `work-action-${Date.now()}`,
    createdAt: record?.createdAt || nowLabel(),
    createdBy: record?.createdBy || currentUser.value?.roleLabel || "岗位人员"
  };
  const next = [normalized, ...workActionOverrides.value];
  workActionOverrides.value = next;
  writeStorage(workActionOverrideStorageKey, next);
  return normalized;
}

export function usePlatformState() {
  return {
    authProfiles,
    catalog,
    executedPlans,
    monitoringPlans,
    toastMessage,
    assistantOpen,
    currentUser,
    fuelPlanningPacket,
    genericPlanningPackets,
    globalKeyNodes,
    customMonitoringWorks,
    workRuleLibrary,
    workActionOverrides,
    fuelPlanningToday,
    keyTimeNodes,
    showToast,
    login,
    logout,
    listExecutedPlans,
    saveExecutedPlan,
    removeExecutedPlan,
    listMonitoringPlans,
    saveMonitoringPlan,
    updateMonitoringPlan,
    removeMonitoringPlan,
    addCatalogLog,
    getCatalogCollection,
    saveFuelPlanningPacket,
    updateFuelPlanningPacket,
    markFuelGasReviewed,
    saveFuelGasCalendar,
    saveGenericFlowCalendar,
    saveGlobalKeyNode,
    removeGlobalKeyNode,
    addMonitoringWork,
    saveWorkRule,
    saveWorkActionOverride
  };
}



