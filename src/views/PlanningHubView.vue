<script setup>
import { computed, reactive } from "vue";
import { useRouter } from "vue-router";
import { usePlatformState } from "../composables/usePlatformState";

const router = useRouter();
const { currentUser, fuelPlanningToday, globalKeyNodes, saveGlobalKeyNode, removeGlobalKeyNode, showToast } = usePlatformState();

const TODAY_ISO = fuelPlanningToday || "2026-04-18";

const flowOptions = [
  { id: "fuel", label: "特燃特气筹措流程" },
  { id: "mission", label: "任务工作流程" },
  { id: "launch", label: "发射日工作规划" },
  { id: "repair", label: "装备维修流程" },
  { id: "maintenance", label: "日常维护流程" },
  { id: "custom", label: "自定义工作流程" }
];

const gasOptions = [
  { id: "oxygen", label: "氧气" },
  { id: "hydrogen", label: "氢气" },
  { id: "nitrogen", label: "氮气" },
  { id: "helium", label: "氦气" }
];

const keyNodeManager = reactive({
  open: false,
  cursorMonth: TODAY_ISO.slice(0, 7),
  selectedDate: TODAY_ISO,
  editingId: "",
  title: "",
  nodeType: "关键检查",
  description: "",
  blockScheduling: true,
  allFlows: true,
  scopeFlowIds: [],
  allGases: true,
  gasTypes: []
});

const workflowCards = [
  {
    id: "fuel",
    title: "特燃特气筹措工作规划",
    desc: "支持系统工程师进行任务信息填写、数据测算、报文下发，以及指挥人员按气体生成专项日历计划。",
    to: "/planning/fuel"
  },
  {
    id: "mission",
    title: "任务工作流程规划",
    desc: "围绕系统准备、例行试验、测试工作和加注供气保障开展任务流程规划。",
    to: "/planning/mission"
  },
  {
    id: "launch",
    title: "发射日工作规划",
    desc: "围绕发射日定岗安排、关键节点、供气保障策略和应急计划进行规划。",
    to: "/planning/launch"
  },
  {
    id: "repair",
    title: "装备维修流程规划",
    desc: "围绕维修改造方案、质量确认点和保障条件完成维修计划编排。",
    to: "/planning/repair"
  },
  {
    id: "maintenance",
    title: "日常维护流程规划",
    desc: "支持日维护、周维护、月维护、标校计划和预防性检修计划生成。",
    to: "/planning/maintenance"
  },
  {
    id: "custom",
    title: "自定义工作流程规划",
    desc: "从工作项目库、人员库和规则库中自由选取内容，拖拽生成自定义流程。",
    to: "/planning/custom"
  }
];

const globalBlockedNodeCount = computed(() => globalKeyNodes.value.filter((item) => item.blockScheduling).length);

const selectedDateKeyNodes = computed(() =>
  globalKeyNodes.value.filter((item) => item.dateIso === keyNodeManager.selectedDate)
);

const keyNodeCalendar = computed(() => buildKeyNodeCalendar(keyNodeManager.cursorMonth));

function toDate(iso) {
  const [year, month, day] = String(iso).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDisplayDate(iso) {
  if (!iso) return "--";
  const date = toDate(iso);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function weekdayLabel(index) {
  return ["一", "二", "三", "四", "五", "六", "日"][index];
}

function shiftMonth(offset) {
  const [year, month] = keyNodeManager.cursorMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  keyNodeManager.cursorMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildKeyNodeCalendar(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const totalDays = new Date(year, month, 0).getDate();
  const leading = (first.getDay() + 6) % 7;
  const cells = [];

  for (let index = leading; index > 0; index -= 1) {
    const date = new Date(year, month - 1, 1 - index);
    cells.push(buildKeyNodeCell(date, true));
  }
  for (let day = 1; day <= totalDays; day += 1) {
    cells.push(buildKeyNodeCell(new Date(year, month - 1, day), false));
  }
  while (cells.length % 7 !== 0) {
    const date = new Date(year, month - 1, totalDays + (cells.length % 7));
    cells.push(buildKeyNodeCell(date, true));
  }

  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push({ id: `${monthValue}-${index}`, cells: cells.slice(index, index + 7) });
  }
  return { title: `${year}年${month}月`, weeks };
}

function buildKeyNodeCell(date, outside) {
  const iso = toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return {
    iso,
    day: date.getDate(),
    outside,
    isToday: iso === TODAY_ISO,
    selected: iso === keyNodeManager.selectedDate,
    nodes: globalKeyNodes.value.filter((item) => item.dateIso === iso)
  };
}

function openKeyNodeManager() {
  keyNodeManager.open = true;
  keyNodeManager.cursorMonth = keyNodeManager.selectedDate.slice(0, 7);
  resetKeyNodeForm(keyNodeManager.selectedDate);
}

function closeKeyNodeManager() {
  keyNodeManager.open = false;
}

function resetKeyNodeForm(dateIso = keyNodeManager.selectedDate) {
  keyNodeManager.editingId = "";
  keyNodeManager.selectedDate = dateIso;
  keyNodeManager.title = "";
  keyNodeManager.nodeType = "关键检查";
  keyNodeManager.description = "";
  keyNodeManager.blockScheduling = true;
  keyNodeManager.allFlows = true;
  keyNodeManager.scopeFlowIds = [];
  keyNodeManager.allGases = true;
  keyNodeManager.gasTypes = [];
}

function selectKeyNodeDate(dateIso) {
  keyNodeManager.selectedDate = dateIso;
  keyNodeManager.cursorMonth = dateIso.slice(0, 7);
  const firstNode = globalKeyNodes.value.find((item) => item.dateIso === dateIso);
  if (firstNode) editGlobalKeyNode(firstNode);
  else resetKeyNodeForm(dateIso);
}

function editGlobalKeyNode(node) {
  keyNodeManager.editingId = node.id;
  keyNodeManager.selectedDate = node.dateIso;
  keyNodeManager.cursorMonth = node.dateIso.slice(0, 7);
  keyNodeManager.title = node.title || "";
  keyNodeManager.nodeType = node.nodeType || "关键检查";
  keyNodeManager.description = node.description || "";
  keyNodeManager.blockScheduling = Boolean(node.blockScheduling);
  keyNodeManager.allFlows = !node.scopeFlowIds?.length || node.scopeFlowIds.includes("all");
  keyNodeManager.scopeFlowIds = keyNodeManager.allFlows ? [] : [...node.scopeFlowIds];
  keyNodeManager.allGases = !node.gasTypes?.length || node.gasTypes.includes("all");
  keyNodeManager.gasTypes = keyNodeManager.allGases ? [] : [...node.gasTypes];
}

function toggleOption(listName, id) {
  const values = new Set(keyNodeManager[listName]);
  if (values.has(id)) values.delete(id);
  else values.add(id);
  keyNodeManager[listName] = [...values];
}

function saveGlobalKeyNodeFromForm() {
  if (!keyNodeManager.selectedDate || !keyNodeManager.title.trim()) {
    showToast("请先选择日期并填写关键节点名称。");
    return;
  }
  if (!keyNodeManager.allFlows && !keyNodeManager.scopeFlowIds.length) {
    showToast("请选择至少一个适用流程。");
    return;
  }
  if (!keyNodeManager.allGases && !keyNodeManager.gasTypes.length) {
    showToast("请选择至少一个影响气体。");
    return;
  }
  const nowText = new Date().toLocaleString("zh-CN", { hour12: false });
  saveGlobalKeyNode({
    id: keyNodeManager.editingId || `global-key-node-${Date.now()}`,
    dateIso: keyNodeManager.selectedDate,
    title: keyNodeManager.title.trim(),
    nodeType: keyNodeManager.nodeType,
    description: keyNodeManager.description.trim(),
    blockScheduling: keyNodeManager.blockScheduling,
    scopeFlowIds: keyNodeManager.allFlows ? ["all"] : keyNodeManager.scopeFlowIds,
    gasTypes: keyNodeManager.allGases ? ["all"] : keyNodeManager.gasTypes,
    createdAt: keyNodeManager.editingId
      ? globalKeyNodes.value.find((item) => item.id === keyNodeManager.editingId)?.createdAt || nowText
      : nowText,
    createdBy: currentUser.value?.roleLabel || "系统用户"
  });
  showToast(`已保存全局关键节点：${keyNodeManager.title.trim()}`);
  resetKeyNodeForm(keyNodeManager.selectedDate);
}

function removeSelectedGlobalKeyNode() {
  if (!keyNodeManager.editingId) return;
  removeGlobalKeyNode(keyNodeManager.editingId);
  showToast("已删除全局关键节点。");
  resetKeyNodeForm(keyNodeManager.selectedDate);
}

function describeNodeScope(node) {
  const flows = !node.scopeFlowIds?.length || node.scopeFlowIds.includes("all")
    ? "全部流程"
    : flowOptions.filter((item) => node.scopeFlowIds.includes(item.id)).map((item) => item.label).join("、");
  const gases = !node.gasTypes?.length || node.gasTypes.includes("all")
    ? "全部气体"
    : gasOptions.filter((item) => node.gasTypes.includes(item.id)).map((item) => item.label).join("、");
  return `${flows} / ${gases}`;
}
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>流程自主规划</h1>
        <div class="muted">先进入流程自主规划总入口，再按专项类型进入具体流程安排界面。系统工程师可先进入特燃特气筹措工作规划。</div>
      </div>
    </div>

    <section class="panel global-key-node-entry">
      <div class="panel-head">
        <div>
          <h3>关键时间节点配置</h3>
          <div class="muted">统一设置各流程共享的关键节点，保存后同步到所有流程自主规划日历。</div>
        </div>
        <button class="button" type="button" @click="openKeyNodeManager">设置关键时间节点</button>
      </div>
      <div class="global-key-node-stats">
        <div class="summary-line">
          <span>已设置关键节点</span>
          <strong>{{ globalKeyNodes.length }} 项</strong>
        </div>
        <div class="summary-line">
          <span>禁排节点</span>
          <strong>{{ globalBlockedNodeCount }} 项</strong>
        </div>
        <div class="summary-line">
          <span>同步范围</span>
          <strong>全部自主规划日历</strong>
        </div>
      </div>
    </section>

    <section class="panel">
      <h3>流程自主规划总入口</h3>
      <div class="workflow-selector">
        <button
          v-for="item in workflowCards"
          :key="item.id"
          class="workflow-link-card"
          type="button"
          @click="router.push(item.to)"
        >
          <strong>{{ item.title }}</strong>
          <p>{{ item.desc }}</p>
          <span>进入专项流程</span>
        </button>
      </div>
    </section>

    <div class="modal-overlay" :class="{ open: keyNodeManager.open }" @click.self="closeKeyNodeManager">
      <div class="modal-card global-key-node-modal">
        <div class="panel-head">
          <div>
            <h3>关键时间节点管理</h3>
            <div class="muted">在日历中选择日期并标注全局关键节点，所有适用流程会自动同步显示并参与排程避让。</div>
          </div>
          <span class="chip warning">全局配置 {{ globalKeyNodes.length }} 项</span>
        </div>

        <div class="global-key-node-layout">
          <div class="global-key-node-calendar">
            <div class="calendar-month-title">
              <button class="ghost small" type="button" @click="shiftMonth(-1)">上一月</button>
              <strong>{{ keyNodeCalendar.title }}</strong>
              <button class="ghost small" type="button" @click="shiftMonth(1)">下一月</button>
            </div>
            <div class="calendar-week-head fine">
              <span v-for="dayIndex in 7" :key="`global-key-head-${dayIndex}`">{{ weekdayLabel(dayIndex - 1) }}</span>
            </div>
            <div class="global-key-node-week-stack">
              <div v-for="week in keyNodeCalendar.weeks" :key="week.id" class="calendar-grid-advanced refined">
                <button
                  v-for="cell in week.cells"
                  :key="cell.iso"
                  class="calendar-day-card refined global-key-node-day"
                  :class="{ outside: cell.outside, today: cell.isToday, selected: cell.selected, 'has-key-node': cell.nodes.length }"
                  type="button"
                  @click="selectKeyNodeDate(cell.iso)"
                >
                  <div class="calendar-day-top">
                    <span class="calendar-day-number">{{ cell.day }}</span>
                    <span v-if="cell.nodes.length" class="holiday-tag">{{ cell.nodes.length }} 项</span>
                  </div>
                  <div v-if="cell.nodes.length" class="key-node-stack">
                    <span v-for="node in cell.nodes.slice(0, 2)" :key="node.id" class="key-node-tag global">
                      全局关键节点 · {{ node.title }}
                    </span>
                    <span v-if="cell.nodes.length > 2" class="key-node-more">+{{ cell.nodes.length - 2 }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div class="global-key-node-editor">
            <div class="panel-head compact">
              <div>
                <h3>{{ formatDisplayDate(keyNodeManager.selectedDate) }}</h3>
                <div class="muted">当前日期已有 {{ selectedDateKeyNodes.length }} 项关键节点。</div>
              </div>
              <button class="ghost small" type="button" @click="resetKeyNodeForm(keyNodeManager.selectedDate)">新增</button>
            </div>

            <div v-if="selectedDateKeyNodes.length" class="key-node-list compact">
              <button
                v-for="node in selectedDateKeyNodes"
                :key="node.id"
                class="key-node-list-item"
                type="button"
                @click="editGlobalKeyNode(node)"
              >
                <strong>{{ node.title }}</strong>
                <span>{{ node.nodeType }} · {{ node.blockScheduling ? "阻止自动排程" : "提示关注" }} · {{ describeNodeScope(node) }}</span>
              </button>
            </div>

            <div class="config-grid global-key-node-form">
              <label class="field">
                <span>关键节点名称</span>
                <input v-model="keyNodeManager.title" placeholder="例如：整体大检查">
              </label>
              <label class="field">
                <span>节点类型</span>
                <select v-model="keyNodeManager.nodeType">
                  <option>关键检查</option>
                  <option>质量确认</option>
                  <option>外部保障</option>
                  <option>禁排窗口</option>
                  <option>其他</option>
                </select>
              </label>
              <label class="field wide">
                <span>说明</span>
                <textarea v-model="keyNodeManager.description" rows="3" placeholder="说明关键节点约束和注意事项"></textarea>
              </label>
              <label class="check-row wide">
                <input v-model="keyNodeManager.blockScheduling" type="checkbox">
                <span>阻止自动排程，生成计划时必须避让该日期</span>
              </label>

              <div class="global-key-node-option-group wide">
                <label class="check-row">
                  <input v-model="keyNodeManager.allFlows" type="checkbox">
                  <span>适用全部流程</span>
                </label>
                <div v-if="!keyNodeManager.allFlows" class="option-chip-grid">
                  <button
                    v-for="flow in flowOptions"
                    :key="flow.id"
                    class="chip-option"
                    :class="{ active: keyNodeManager.scopeFlowIds.includes(flow.id) }"
                    type="button"
                    @click="toggleOption('scopeFlowIds', flow.id)"
                  >
                    {{ flow.label }}
                  </button>
                </div>
              </div>

              <div class="global-key-node-option-group wide">
                <label class="check-row">
                  <input v-model="keyNodeManager.allGases" type="checkbox">
                  <span>影响全部气体</span>
                </label>
                <div v-if="!keyNodeManager.allGases" class="option-chip-grid">
                  <button
                    v-for="gas in gasOptions"
                    :key="gas.id"
                    class="chip-option"
                    :class="{ active: keyNodeManager.gasTypes.includes(gas.id) }"
                    type="button"
                    @click="toggleOption('gasTypes', gas.id)"
                  >
                    {{ gas.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="button-row" style="margin-top: 18px;">
              <button class="ghost" type="button" @click="closeKeyNodeManager">关闭</button>
              <button v-if="keyNodeManager.editingId" class="danger-btn" type="button" @click="removeSelectedGlobalKeyNode">删除</button>
              <button class="button" type="button" @click="saveGlobalKeyNodeFromForm">保存关键节点</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
