<script setup>
import { computed, reactive, ref, watch } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const { currentUser, genericPlanningPackets, globalKeyNodes, fuelPlanningToday, saveGenericFlowCalendar, showToast } = usePlatformState();

const TODAY_ISO = fuelPlanningToday || "2026-04-18";

const gasLabelMap = {
  oxygen: "氧气",
  hydrogen: "氢气",
  nitrogen: "氮气",
  helium: "氦气"
};

const rocketOptions = ["长征九号", "长征十号", "长征货运型"];
const weatherHints = [
  "今日天气：台风 / 气象预警，请双岗复核注意",
  "今日天气：多云 / 风速平稳，按常规窗口执行",
  "今日天气：阵风增强，请做好在线供气切换准备"
];

const commanderForm = reactive({
  launchDate: "2026-04-20",
  launchTime: "09:00",
  rocketModel: rocketOptions[0]
});

const activeGasType = computed(() => currentUser.value?.gasType || "oxygen");
const activeGasLabel = computed(() => gasLabelMap[activeGasType.value] || "氧气");
const isEngineer = computed(() => currentUser.value?.role === "engineer");
const isCommander = computed(() => currentUser.value?.role === "commander");

const launchPacket = computed(() => genericPlanningPackets.value?.launch || { gasPackets: {} });
const launchGlobalKeyNodes = computed(() =>
  globalKeyNodes.value.filter((node) => isGlobalKeyNodeApplicable(node, "launch", activeGasType.value))
);
const visibleGasPacket = computed(
  () => launchPacket.value.gasPackets?.[activeGasType.value] || {
    planStatus: "idle",
    launchDay: "",
    launchTime: "",
    rocketModel: "",
    weatherNote: "",
    scheduleRows: [],
    strategyText: ""
  }
);

const engineerSummaries = computed(() =>
  Object.entries(launchPacket.value.gasPackets || {}).map(([gasType, gasPacket]) => ({
    gasType,
    gasLabel: gasLabelMap[gasType],
    planStatus: gasPacket.planStatus,
    launchDay: gasPacket.launchDay,
    launchTime: gasPacket.launchTime,
    rocketModel: gasPacket.rocketModel,
    weatherNote: gasPacket.weatherNote,
    strategyText: gasPacket.strategyText,
    scheduleRows: gasPacket.scheduleRows || []
  }))
);

const scheduleRows = ref([]);
const localStatus = ref("idle");
const clearPlanModal = reactive({
  open: false
});

watch(
  () => visibleGasPacket.value,
  (next) => {
    scheduleRows.value = clone(next.scheduleRows || []);
    localStatus.value = next.planStatus || "idle";
    if (next.launchDay) commanderForm.launchDate = next.launchDay;
    if (next.launchTime) commanderForm.launchTime = next.launchTime;
    if (next.rocketModel) commanderForm.rocketModel = next.rocketModel;
  },
  { immediate: true, deep: true }
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(iso) {
  if (!iso) return "--";
  const date = toDate(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function isGlobalKeyNodeApplicable(node, flowId, gasType) {
  const flows = Array.isArray(node.scopeFlowIds) && node.scopeFlowIds.length ? node.scopeFlowIds : ["all"];
  const gases = Array.isArray(node.gasTypes) && node.gasTypes.length ? node.gasTypes : ["all"];
  return (flows.includes("all") || flows.includes(flowId)) && (gases.includes("all") || gases.includes(gasType));
}

function addHours(timeValue, hours) {
  const [hour, minute] = String(timeValue || "09:00").split(":").map(Number);
  const start = new Date(2026, 0, 1, hour, minute || 0);
  start.setHours(start.getHours() + hours);
  return `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
}

function generateLaunchDayPlan() {
  const blockingNode = launchGlobalKeyNodes.value.find(
    (node) => node.dateIso === commanderForm.launchDate && node.blockScheduling
  );
  if (blockingNode) {
    showToast(`发射日规划日期命中全局关键节点“${blockingNode.title}”，请调整日期后再生成。`);
    return;
  }

  const weatherNote = weatherHints[(commanderForm.rocketModel.length + activeGasType.value.length) % weatherHints.length];
  const gasLabel = activeGasLabel.value;
  const launchTime = commanderForm.launchTime;
  const rows = [
    {
      id: `${activeGasType.value}-launch-1`,
      timeRange: `${addHours(launchTime, -3)}-${addHours(launchTime, -2)}`,
      title: `${gasLabel}系统发射前安全准备`,
      post: "第1岗",
      action: "安全准备"
    },
    {
      id: `${activeGasType.value}-launch-2`,
      timeRange: `${addHours(launchTime, -2)}-${addHours(launchTime, -1)}`,
      title: `${gasLabel}系统在线设备检查`,
      post: "第2岗",
      action: "进行在线检查"
    },
    {
      id: `${activeGasType.value}-launch-3`,
      timeRange: `${addHours(launchTime, -1)}-${launchTime}`,
      title: `${gasLabel}系统供气保障执行`,
      post: "第3岗",
      action: "任务执行"
    }
  ];

  const strategyText = `${gasLabel}系统常规在线供气保障策略：主供气链路按${commanderForm.rocketModel}标准窗口投入，备用供气链路保持热备，发射前 60 分钟完成双岗核验。`;

  scheduleRows.value = clone(rows);
  localStatus.value = "confirmed";

  saveGenericFlowCalendar("launch", activeGasType.value, {
    planStatus: "confirmed",
    planGeneratedBy: currentUser.value?.roleLabel || "指挥人员",
    planConfirmedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    lastEditedBy: currentUser.value?.roleLabel || "指挥人员",
    launchDay: commanderForm.launchDate,
    launchTime: commanderForm.launchTime,
    rocketModel: commanderForm.rocketModel,
    weatherNote,
    strategyText,
    scheduleRows: rows
  });

  showToast(`${gasLabel}系统发射日工作规划已生成，系统工程师现在可以查看。`);
}

function openClearPlanModal() {
  clearPlanModal.open = true;
}

function closeClearPlanModal() {
  clearPlanModal.open = false;
}

function confirmClearGeneratedPlans() {
  const gasPacket = visibleGasPacket.value || {};
  scheduleRows.value = [];
  localStatus.value = "idle";
  saveGenericFlowCalendar("launch", activeGasType.value, {
    ...gasPacket,
    planStatus: "idle",
    planGeneratedBy: "",
    planConfirmedAt: "",
    lastEditedBy: currentUser.value?.roleLabel || "指挥人员",
    launchDay: "",
    launchTime: "",
    rocketModel: "",
    weatherNote: "",
    strategyText: "",
    scheduleRows: [],
    calendarPlans: [],
    conflictRecords: [],
    keyNodes: gasPacket.keyNodes || []
  });
  closeClearPlanModal();
  showToast("已清空当前生成计划");
}
</script>

<template>
  <div class="fuel-page-stack">
    <div class="topbar">
      <div>
        <h1>发射日工作规划</h1>
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
            <h3>发射日工作规划汇总</h3>
            <div class="muted">系统工程师可查看各气体系统指挥员生成的发射日定岗安排和常规在线供气保障策略。</div>
          </div>
        </div>

        <div class="fuel-return-grid">
          <div v-for="summary in engineerSummaries" :key="summary.gasType" class="fuel-return-card">
            <div class="fuel-return-head">
              <strong>{{ summary.gasLabel }}系统</strong>
              <span class="chip" :class="{ active: summary.planStatus === 'confirmed' }">
                {{ summary.planStatus === "confirmed" ? "已生成" : "未生成" }}
              </span>
            </div>

            <div class="summary-line">
              <span>发射日</span>
              <strong>{{ summary.launchDay ? formatDisplayDate(summary.launchDay) : "待生成" }}</strong>
            </div>
            <div class="summary-line">
              <span>发射时间 / 型号</span>
              <strong>{{ summary.launchTime ? `${summary.launchTime} / ${summary.rocketModel}` : "待生成" }}</strong>
            </div>

            <div v-if="summary.scheduleRows.length" class="launch-day-board compact">
              <div class="launch-day-header">
                <strong>{{ formatDisplayDate(summary.launchDay) }}</strong>
                <span>{{ summary.weatherNote }}</span>
              </div>
              <div v-for="row in summary.scheduleRows" :key="row.id" class="launch-row">
                <div class="launch-time">{{ row.timeRange }}</div>
                <div class="launch-task">{{ row.title }}</div>
                <div class="launch-post">{{ row.post }}</div>
                <div class="launch-action">{{ row.action }}</div>
              </div>
            </div>
            <div v-else class="notice-card">
              <span>该气体系统还没有生成发射日工作规划。</span>
              <span class="warning">待生成</span>
            </div>

            <div v-if="summary.strategyText" class="launch-strategy-card">
              <strong>常规在线供气保障策略</strong>
              <p>{{ summary.strategyText }}</p>
            </div>
          </div>
        </div>
      </section>
    </template>

    <template v-else>
      <section class="panel">
        <div class="panel-head">
          <div>
            <h3>发射日规划输入</h3>
            <div class="muted">指挥人员选择发射日、当天发射时间和火箭型号后，直接生成发射日当天的工作人员定岗与工作安排，以及常规在线供气保障策略。</div>
          </div>
          <span class="chip active">{{ currentUser?.roleLabel }} / {{ activeGasLabel }}</span>
        </div>

        <div class="fuel-form-grid">
          <label class="field">
            <span>发射日</span>
            <input v-model="commanderForm.launchDate" type="date" :min="TODAY_ISO">
          </label>
          <label class="field">
            <span>当天发射时间</span>
            <input v-model="commanderForm.launchTime" type="time">
          </label>
          <label class="field">
            <span>火箭型号</span>
            <select v-model="commanderForm.rocketModel">
              <option v-for="item in rocketOptions" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
        </div>

        <div v-if="launchGlobalKeyNodes.length" class="key-node-list" style="margin-top: 12px;">
          <div v-for="node in launchGlobalKeyNodes" :key="node.id" class="key-node-list-item">
            <strong>全局关键节点 · {{ node.title }}</strong>
            <span>{{ formatDisplayDate(node.dateIso) }} · {{ node.nodeType }} · {{ node.blockScheduling ? "阻止自动排程" : "提示关注" }}</span>
          </div>
        </div>

        <div class="button-row" style="margin-top: 16px;">
          <button v-if="isCommander" class="button" type="button" @click="generateLaunchDayPlan">生成发射日规划</button>
          <button v-if="isCommander && scheduleRows.length" class="danger-ghost" type="button" @click="openClearPlanModal">清空计划</button>
          <span class="chip" :class="{ active: localStatus === 'confirmed' }">
            计划状态：{{ localStatus === "confirmed" ? "已生成" : "待生成" }}
          </span>
        </div>
      </section>

      <section class="panel" v-if="scheduleRows.length">
        <div class="panel-head">
          <div>
            <h3>{{ activeGasLabel }}系统发射日工作安排</h3>
            <div class="muted">下方展示发射日当天的定岗安排与工作执行计划。</div>
          </div>
        </div>

        <div class="launch-day-board">
          <div class="launch-day-header">
            <strong>{{ formatDisplayDate(commanderForm.launchDate) }}</strong>
            <span>{{ visibleGasPacket.weatherNote }}</span>
          </div>

          <div v-for="row in scheduleRows" :key="row.id" class="launch-row">
            <div class="launch-time">{{ row.timeRange }}</div>
            <div class="launch-task">{{ row.title }}</div>
            <div class="launch-post">{{ row.post }}</div>
            <div class="launch-action">{{ row.action }}</div>
          </div>
        </div>

        <div class="launch-strategy-card">
          <strong>常规在线供气保障策略</strong>
          <p>{{ visibleGasPacket.strategyText }}</p>
        </div>
      </section>
    </template>

    <div class="modal-overlay" :class="{ open: clearPlanModal.open }" @click.self="closeClearPlanModal">
      <div class="modal-card clear-plan-modal">
        <h3>确认清空当前计划？</h3>
        <p class="muted">清空后会移除当前页面已生成的发射日工作安排和冲突记录，但会保留关键节点、历史库、规则库和当前输入条件。</p>
        <div class="notice-card">
          <span>{{ activeGasLabel }}系统发射日工作规划将被清空。</span>
          <span class="warning">不可撤销</span>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="closeClearPlanModal">取消</button>
          <button class="danger-ghost" type="button" @click="confirmClearGeneratedPlans">确认清空</button>
        </div>
      </div>
    </div>
  </div>
</template>
