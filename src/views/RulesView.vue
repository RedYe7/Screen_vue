<script setup>
import { computed, reactive } from "vue";
import { usePlatformState } from "../composables/usePlatformState";
import { maskSensitiveText } from "../utils/maskSensitiveText";

const { catalog, showToast: rawShowToast, addCatalogLog, getCatalogCollection, assistantOpen } = usePlatformState();

const m = maskSensitiveText;

const tabs = [
  { key: "items", label: "工作项目管理" },
  { key: "constraints", label: "约束条件管理" },
  { key: "people", label: "人员管理" },
  { key: "algorithms", label: maskSensitiveText("TKTQ保障规则") },
  { key: "templates", label: "流程模板管理" }
];

const definitions = {
  items: {
    title: "工作项目管理",
    desc: "工作项目列表已按各个工作计划中的具体工作环节更新，默认折叠展示，点击展开后可查看各项详细信息。",
    labels: ["工作名称", "工作用时", "工作前置条件", "工作描述", "工作人员需求", "工作质量证据需求", "责任人员", "默认人员", "默认设备", "所属流程类型", "状态", "版本号"]
  },
  constraints: {
    title: "约束条件管理",
    desc: "新增和修改约束条件需经系统指挥员及系统管理员审核后生效。",
    labels: ["约束名称", "类型", "影响对象", "约束说明", "影响效果", "优先级", "状态"]
  },
  people: {
    title: "人员管理",
    desc: "支持姓名、职务、岗位、经验、状态等信息管理，并记录创建、修改、迭代日志。",
    labels: ["姓名", "岗位", "所属流程", "可参与气体", "资质标签", "当前状态", "备注"]
  },
  algorithms: {
    title: maskSensitiveText("TKTQ保障规则"),
    desc: maskSensitiveText("支持低温推进剂、常规推进剂、供气保障、生产、转运和补气规则管理。"),
    labels: ["规则名称", "规则类别", "适用气体", maskSensitiveText("适用型号"), "规则说明", "输入参数", "输出结果", "版本号", "状态"]
  },
  templates: {
    title: "流程模板管理",
    desc: "支持模板的新建、复制、编辑、删除、导入和导出。",
    labels: ["模板名称", "流程类型", "模板说明", "包含工作项目", "默认周期", "前后顺序说明", "状态", "版本号"]
  }
};

function blankFields() {
  return Array.from({ length: 12 }, () => "");
}

const state = reactive({
  tab: "items",
  keyword: "",
  auditOpen: false,
  logOpen: false,
  createOpen: false,
  editOpen: false,
  auditText: "",
  pendingAction: null,
  logTitle: "",
  logItems: [],
  fields: blankFields(),
  responsiblePerson: "",
  responsibleEquipment: "",
  editingId: "",
  editFields: blankFields(),
  editResponsiblePerson: "",
  editResponsibleEquipment: "",
  expandedEntries: {}
});

const currentDef = computed(() => definitions[state.tab]);
const collection = computed(() => getCatalogCollection(state.tab));
const peopleOptions = computed(() => catalog.people.filter((item) => item.status !== "停用"));

const filteredList = computed(() =>
  collection.value.filter((item) => {
    if (!state.keyword.trim()) return true;
    return JSON.stringify(item).toLowerCase().includes(state.keyword.trim().toLowerCase());
  })
);

function createField(index, label, options = {}) {
  return {
    index,
    label,
    type: options.type || "text",
    placeholder: options.placeholder || `请输入${label}`,
    wide: Boolean(options.wide),
    options: options.options || []
  };
}

const createFormGroups = computed(() => {
  if (state.tab === "items") {
    return [
      {
        title: "基础信息",
        desc: "定义工作项目的名称、周期和启用状态。",
        fields: [
          createField(0, "工作名称"),
          createField(1, "工作用时", { placeholder: "例如：2小时 / 1天" }),
          createField(10, "状态", { type: "select", options: ["启用", "停用"] }),
          createField(11, "版本号", { placeholder: "例如：v1.0" })
        ]
      },
      {
        title: "执行要求",
        desc: "描述工作前置、人员需求和质量证据要求。",
        fields: [
          createField(2, "工作前置条件"),
          createField(4, "工作人员需求"),
          createField(5, "工作质量证据需求", { wide: true })
        ]
      },
      {
        title: "资源配置",
        desc: "配置责任人员、默认人员、设备和所属流程。",
        fields: [
          createField(6, "责任人员"),
          createField(7, "默认人员", { placeholder: "多人用逗号或顿号分隔" }),
          createField(8, "默认设备"),
          createField(9, "所属流程类型", { placeholder: "例如：fuel, mission" })
        ]
      },
      {
        title: "工作描述",
        desc: "补充工作项目的执行说明。",
        fields: [createField(3, "工作描述", { type: "textarea", wide: true })]
      }
    ];
  }

  if (state.tab === "constraints") {
    return [
      {
        title: "基础信息",
        desc: "定义约束类型、优先级和启用状态。",
        fields: [
          createField(0, "约束名称"),
          createField(1, "类型", { type: "select", options: ["时间窗口", "人员资源", "设备资源", "前后顺序", "质量确认", "其他"] }),
          createField(5, "优先级", { type: "select", options: ["低", "中", "高", "关键"] }),
          createField(6, "状态", { type: "select", options: ["启用", "停用"] })
        ]
      },
      {
        title: "影响范围",
        desc: "说明该约束影响的流程、资源或对象。",
        fields: [createField(2, "影响对象", { wide: true })]
      },
      {
        title: "约束说明",
        desc: "说明约束触发原因和对排程结果的影响。",
        fields: [
          createField(3, "约束说明", { type: "textarea", wide: true }),
          createField(4, "影响效果", { type: "textarea", wide: true })
        ]
      }
    ];
  }

  if (state.tab === "people") {
    return [
      {
        title: "基础信息",
        desc: "维护人员身份、岗位和当前状态。",
        fields: [
          createField(0, "姓名"),
          createField(1, "岗位"),
          createField(5, "当前状态", { type: "select", options: ["在岗", "值班", "休息", "停用"] })
        ]
      },
      {
        title: "能力范围",
        desc: "描述人员可参与的流程、气体和资质标签。",
        fields: [
          createField(2, "所属流程"),
          createField(3, "可参与气体"),
          createField(4, "资质标签", { wide: true, placeholder: "多个标签用逗号或顿号分隔" })
        ]
      },
      {
        title: "备注",
        desc: "补充人员经验、限制或排班说明。",
        fields: [createField(6, "备注", { type: "textarea", wide: true })]
      }
    ];
  }

  if (state.tab === "algorithms") {
    return [
      {
        title: "基础信息",
        desc: "定义规则名称、分类、型号和版本状态。",
        fields: [
          createField(0, "规则名称"),
          createField(1, "规则类别"),
          createField(3, "适用型号"),
          createField(7, "版本号", { placeholder: "例如：v1.0" }),
          createField(8, "状态", { type: "select", options: ["启用", "停用"] })
        ]
      },
      {
        title: "适用范围",
        desc: "设置该规则适用的气体系统。",
        fields: [createField(2, "适用气体", { wide: true, placeholder: "例如：oxygen, hydrogen" })]
      },
      {
        title: "规则内容",
        desc: "描述规则逻辑、输入参数和输出结果。",
        fields: [
          createField(4, "规则说明", { type: "textarea", wide: true }),
          createField(5, "输入参数", { type: "textarea", wide: true }),
          createField(6, "输出结果", { type: "textarea", wide: true })
        ]
      }
    ];
  }

  return [
    {
      title: "基础信息",
      desc: "定义模板名称、类型、周期和版本状态。",
      fields: [
        createField(0, "模板名称"),
        createField(1, "流程类型"),
        createField(4, "默认周期"),
        createField(6, "状态", { type: "select", options: ["启用", "停用"] }),
        createField(7, "版本号", { placeholder: "例如：v1.0" })
      ]
    },
    {
      title: "模板内容",
      desc: "维护模板包含的工作项目、顺序关系和说明。",
      fields: [
        createField(3, "包含工作项目", { type: "textarea", wide: true }),
        createField(5, "前后顺序说明", { type: "textarea", wide: true }),
        createField(2, "模板说明", { type: "textarea", wide: true })
      ]
    }
  ];
});

function showToast(message) {
  rawShowToast(maskSensitiveText(message));
}

function changeTab(tabKey) {
  state.tab = tabKey;
  state.keyword = "";
  resetCreateForm();
  resetEditForm();
  state.createOpen = false;
}

function resetCreateForm() {
  state.fields = blankFields();
  state.responsiblePerson = "";
  state.responsibleEquipment = "";
}

function openCreateModal() {
  resetCreateForm();
  state.createOpen = true;
}

function closeCreateModal() {
  state.createOpen = false;
  resetCreateForm();
}

function resetEditForm() {
  state.editingId = "";
  state.editOpen = false;
  state.editFields = blankFields();
  state.editResponsiblePerson = "";
  state.editResponsibleEquipment = "";
}

function toggleExpand(itemId) {
  state.expandedEntries[itemId] = !state.expandedEntries[itemId];
}

function isExpanded(itemId) {
  return !!state.expandedEntries[itemId];
}

function openAudit(text, callback) {
  state.auditText = text;
  state.pendingAction = callback;
  state.auditOpen = true;
}

function confirmAudit() {
  state.pendingAction?.();
  state.auditOpen = false;
  state.pendingAction = null;
}

function openLogs(item) {
  state.logTitle = `${item.name} 设置日志`;
  state.logItems = catalog.logs[item.id] || ["暂无日志记录"];
  state.logOpen = true;
}

function fillEditForm(item) {
  state.editingId = item.id;
  state.editOpen = true;

  if (state.tab === "items") {
    state.editFields = [
      item.name || "",
      item.duration || "",
      item.predecessor || "",
      item.description || "",
      item.staffing || "",
      item.evidence || "",
      item.responsiblePerson || item.defaultAssignees?.[0] || "",
      (item.defaultAssignees || []).join(", "),
      item.defaultEquipment || "",
      (item.flowTypes || []).join(", "),
      item.status || "",
      item.version || ""
    ];
    state.editResponsiblePerson = item.responsiblePerson || item.defaultAssignees?.[0] || "";
    state.editResponsibleEquipment = item.defaultEquipment || "";
    return;
  }

  if (state.tab === "constraints") {
    state.editFields = [
      item.name || "",
      item.type || item.category || "",
      item.target || (item.flowTypes || []).join(", "),
      item.description || "",
      item.effect || "",
      item.priority || "",
      item.status || ""
    ];
    return;
  }

  if (state.tab === "people") {
    state.editFields = [
      item.name || "",
      item.post || "",
      (item.flowTypes || []).join(", "),
      (item.gasTypes || []).join(", "),
      (item.tags || []).join(", "),
      item.status || "",
      item.remark || item.experience || ""
    ];
    return;
  }

  if (state.tab === "algorithms") {
    state.editFields = [
      item.name || "",
      item.category || "",
      (item.gasTypes || []).join(", "),
      item.model || item.rocket || "",
      item.description || "",
      (item.inputs || []).join(", "),
      (item.outputs || []).join(", "),
      item.version || "",
      item.status || ""
    ];
    return;
  }

  state.editFields = [
    item.name || "",
    item.flowType || item.category || "",
    item.description || "",
    (item.workItemIds || item.slots || []).join(", "),
    item.defaultDuration || "",
    item.sequenceText || "",
    item.status || "",
    item.version || ""
  ];
}

function splitList(value) {
  return String(value || "")
    .split(/[,，、/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPayload(mode = "create") {
  const fields = mode === "edit" ? state.editFields : state.fields;
  const responsiblePerson = mode === "edit" ? state.editResponsiblePerson : state.responsiblePerson;
  const responsibleEquipment = mode === "edit" ? state.editResponsibleEquipment : state.responsibleEquipment;
  const existingItem = collection.value.find((item) => item.id === state.editingId);

  if (state.tab === "items") {
    return {
      id: state.editingId || `items-${Date.now()}`,
      name: fields[0],
      duration: fields[1],
      predecessor: fields[2],
      description: fields[3],
      staffing: fields[4],
      evidence: fields[5],
      responsiblePerson: fields[6] || responsiblePerson,
      defaultAssignees: splitList(fields[7] || fields[6] || responsiblePerson),
      defaultEquipment: fields[8] || responsibleEquipment || existingItem?.defaultEquipment || "待配置",
      flowTypes: splitList(fields[9]).length ? splitList(fields[9]) : existingItem?.flowTypes || ["custom"],
      status: fields[10] || existingItem?.status || "启用",
      version: fields[11] || existingItem?.version || "v1.0"
    };
  }

  if (state.tab === "constraints") {
    return {
      id: state.editingId || `constraints-${Date.now()}`,
      name: fields[0],
      type: fields[1],
      category: fields[1],
      target: fields[2],
      description: fields[3],
      effect: fields[4],
      priority: fields[5],
      status: fields[6] || existingItem?.status || "启用",
      version: existingItem?.version || "v1.0",
      flowTypes: splitList(fields[2])
    };
  }

  if (state.tab === "people") {
    return {
      id: state.editingId || `people-${Date.now()}`,
      name: fields[0],
      title: fields[1],
      post: fields[1],
      flowTypes: splitList(fields[2]),
      gasTypes: splitList(fields[3]),
      tags: splitList(fields[4]),
      status: fields[5] || existingItem?.status || "在岗",
      remark: fields[6],
      experience: fields[6],
      version: existingItem?.version || "v1.0",
    };
  }

  if (state.tab === "algorithms") {
    return {
      id: state.editingId || `algorithms-${Date.now()}`,
      name: fields[0],
      category: fields[1],
      gasTypes: splitList(fields[2]),
      model: fields[3],
      rocket: fields[3],
      description: fields[4],
      inputs: splitList(fields[5]),
      outputs: splitList(fields[6]),
      version: fields[7] || existingItem?.version || "v1.0",
      status: fields[8] || existingItem?.status || "启用"
    };
  }

  return {
    id: state.editingId || `templates-${Date.now()}`,
    name: fields[0],
    flowType: fields[1],
    category: fields[1],
    description: fields[2],
    workItemIds: splitList(fields[3]),
    slots: splitList(fields[3]),
    defaultDuration: fields[4],
    sequenceText: fields[5],
    status: fields[6] || existingItem?.status || "启用",
    version: fields[7] || existingItem?.version || "v1.0"
  };
}

function submitRule(mode = "create") {
  const fields = mode === "edit" ? state.editFields : state.fields;
  const responsiblePerson = mode === "edit" ? state.editResponsiblePerson : state.responsiblePerson;

  if (!fields[0].trim()) {
    showToast("请先填写必要信息");
    return;
  }

  if (state.tab === "items" && !(fields[6] || responsiblePerson)) {
    showToast("请先为工作项目选择责任人员");
    return;
  }

  const actionLabel = mode === "edit" ? "修改" : "新增";
  openAudit(`确认提交“${fields[0]}”的${actionLabel}内容并进入审核吗？`, () => {
    const target = collection.value;
    const payload = buildPayload(mode);
    const index = target.findIndex((item) => item.id === payload.id);

    if (index >= 0) {
      target[index] = { ...target[index], ...payload };
      addCatalogLog(payload.id, "修改记录");
    } else {
      target.unshift(payload);
      addCatalogLog(payload.id, "创建记录");
    }

    if (mode === "edit") {
      resetEditForm();
    } else {
      closeCreateModal();
    }

    showToast(mode === "edit" ? "记录已修改并更新展示" : `已新增${currentDef.value.title}`);
  });
}

function toggleItem(item) {
  openAudit(`确认变更“${item.name}”状态吗？`, () => {
    item.status = item.status === "停用" ? "启用" : "停用";
    addCatalogLog(item.id, `${item.status === "停用" ? "停用" : "启用"}记录`);
    showToast("状态已更新");
  });
}

function deleteItem(item) {
  openAudit(`删除后不可恢复，确认删除“${item.name}”吗？`, () => {
    const target = collection.value;
    const index = target.findIndex((entry) => entry.id === item.id);
    if (index >= 0) target.splice(index, 1);
    addCatalogLog(item.id, "删除记录");
    showToast("记录已删除");
  });
}

function detailRows(item) {
  if (state.tab === "items") {
    return [
      ["工作用时", item.duration],
      ["工作前置条件", item.predecessor],
      ["工作描述", item.description],
      ["工作人员需求", item.staffing],
      ["工作质量证据需求", item.evidence],
      ["责任人员", item.responsiblePerson || item.defaultAssignees?.[0] || "待配置"],
      ["默认人员", (item.defaultAssignees || []).join(" / ") || "待配置"],
      ["默认设备", item.defaultEquipment || "待配置"],
      ["所属流程类型", (item.flowTypes || []).join(" / ")],
      ["状态", item.status],
      ["版本号", item.version]
    ];
  }

  if (state.tab === "constraints") {
    return [
      ["类型", item.type || item.category],
      ["影响对象", item.target],
      ["约束说明", item.description],
      ["约束效果", item.effect],
      ["优先级", item.priority],
      ["状态", item.status]
    ];
  }

  if (state.tab === "people") {
    return [
      ["岗位", item.post],
      ["所属流程", (item.flowTypes || []).join(" / ")],
      ["可参与气体", (item.gasTypes || []).join(" / ")],
      ["资质标签", (item.tags || []).join(" / ")],
      ["当前状态", item.status],
      ["备注", item.remark || item.experience]
    ];
  }

  if (state.tab === "algorithms") {
    return [
      ["规则类别", item.category],
      ["适用气体", (item.gasTypes || []).join(" / ")],
      [maskSensitiveText("适用型号"), item.model || item.rocket],
      ["规则说明", item.description],
      ["输入参数", (item.inputs || []).join(" / ")],
      ["输出结果", (item.outputs || []).join(" / ")]
    ];
  }

  return [
    ["流程类型", item.flowType],
    ["模板说明", item.description],
    ["包含工作项目", (item.workItemIds || item.slots || []).join(" / ")],
    ["默认周期", item.defaultDuration],
    ["前后顺序说明", item.sequenceText],
    ["状态", item.status],
    ["版本号", item.version]
  ];
}
</script>

<template>
  <div>
    <div class="topbar">
      <div>
        <h1>工作规则管理</h1>
        <div class="muted">维护工作项目、约束条件、人员、保障规则和流程模板。</div>
      </div>
      <div class="topbar-actions">
        <button class="button" type="button" @click="assistantOpen = true">智能助手</button>
      </div>
    </div>

    <section class="panel">
      <div class="tabs rule-manager-tabs">
        <button
          v-for="item in tabs"
          :key="item.key"
          class="tab"
          :class="{ active: state.tab === item.key }"
          type="button"
          @click="changeTab(item.key)"
        >
          {{ m(item.label) }}
        </button>
      </div>
    </section>

    <section class="panel rule-manager-panel" style="margin-top: 18px;">
      <div class="rule-manager-toolbar">
        <div>
          <h3>{{ m(currentDef.title) }}</h3>
          <p>{{ m(currentDef.desc) }}</p>
        </div>
        <div class="rule-manager-actions">
          <span class="chip active">当前 {{ filteredList.length }} / {{ collection.length }} 项</span>
          <label class="rule-manager-search">
            <span>关键词</span>
            <input v-model="state.keyword" placeholder="按名称、描述、状态、流程检索">
          </label>
          <button
            v-if="state.tab === 'templates'"
            class="ghost"
            type="button"
            @click="showToast('已模拟导入模板文件')"
          >
            导入模板
          </button>
          <button
            v-if="state.tab === 'templates'"
            class="ghost"
            type="button"
            @click="showToast('已模拟导出模板文件')"
          >
            导出模板
          </button>
          <button class="button" type="button" @click="openCreateModal">新建</button>
        </div>
      </div>

      <div class="rules-list">
        <div v-for="item in filteredList" :key="item.id" class="rule-entry">
          <div class="rule-entry-head">
            <div class="rule-entry-title">
              <strong>{{ m(item.name) }}</strong>
              <span class="rule-entry-subtext">点击展开后查看详细信息并进行操作</span>
            </div>

            <div class="rule-entry-head-right">
              <span class="chip">{{ item.status || item.version }}<template v-if="item.version"> / {{ item.version }}</template></span>
              <button class="ghost rule-entry-toggle" type="button" @click="toggleExpand(item.id)">
                {{ isExpanded(item.id) ? "收起" : "展开" }}
              </button>
            </div>
          </div>

          <div v-if="isExpanded(item.id)" class="detail-list">
            <div v-for="row in detailRows(item)" :key="`${item.id}-${row[0]}`" class="detail-line">
              <span>{{ m(row[0]) }}</span>
              <strong>{{ m(row[1]) }}</strong>
            </div>

            <div class="button-row rules-entry-actions">
              <button class="ghost" type="button" @click="fillEditForm(item)">修改</button>
              <button
                v-if="state.tab === 'items' || state.tab === 'constraints'"
                class="ghost"
                type="button"
                @click="toggleItem(item)"
              >
                停用 / 启用
              </button>
              <button
                v-if="state.tab !== 'items' && state.tab !== 'constraints'"
                class="ghost"
                type="button"
                @click="deleteItem(item)"
              >
                删除
              </button>
              <button class="ghost" type="button" @click="openLogs(item)">设置日志</button>
            </div>
          </div>
        </div>
        <div v-if="!filteredList.length" class="notice-card">
          <span>当前栏目没有匹配的规则记录。</span>
          <span class="warning">无结果</span>
        </div>
      </div>
    </section>

    <div class="modal-overlay" :class="{ open: state.createOpen }" @click.self="closeCreateModal">
      <div class="modal-card rule-create-modal">
        <div class="rule-create-header">
          <div class="rule-create-title">
            <span>规则库配置</span>
            <h3>新建{{ m(currentDef.title) }}</h3>
            <p>填写基础信息、适用范围和执行要求，保存后将加入当前规则库列表。</p>
          </div>
          <div class="rule-create-meta">
            <span class="chip active">{{ m(currentDef.title) }}</span>
            <span class="chip">当前已有 {{ collection.length }} 项</span>
          </div>
        </div>

        <div class="rule-create-body">
          <div
            v-for="group in createFormGroups"
            :key="`${state.tab}-${group.title}`"
            class="rule-form-section"
          >
            <div class="rule-form-section-head">
              <div>
                <strong>{{ group.title }}</strong>
                <span>{{ group.desc }}</span>
              </div>
            </div>

            <div class="rule-form-grid">
              <label
                v-for="field in group.fields"
                :key="`${state.tab}-${group.title}-${field.index}`"
                class="rule-form-field"
                :class="{ wide: field.wide }"
              >
                <span>{{ m(field.label) }}</span>
                <textarea
                  v-if="field.type === 'textarea'"
                  v-model="state.fields[field.index]"
                  :placeholder="field.placeholder"
                  rows="3"
                ></textarea>
                <select
                  v-else-if="field.type === 'select'"
                  v-model="state.fields[field.index]"
                >
                  <option value="">请选择{{ m(field.label) }}</option>
                  <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
                </select>
                <input
                  v-else
                  v-model="state.fields[field.index]"
                  type="text"
                  :placeholder="field.placeholder"
                >
              </label>
            </div>
          </div>
        </div>

        <div class="rule-create-footer">
          <button class="ghost" type="button" @click="closeCreateModal">取消</button>
          <button class="button" type="button" @click="submitRule('create')">保存</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.editOpen }">
      <div class="modal-card rule-edit-modal">
        <h3>修改{{ m(currentDef.title) }}</h3>
        <p class="muted">请在弹窗中完成修改，确认后提交审核。</p>

        <div class="filter-grid rule-edit-grid">
          <div v-for="(label, index) in currentDef.labels" :key="`edit-${state.tab}-${label}`" class="field">
            <label>{{ m(label) }}</label>
            <input v-model="state.editFields[index]" :placeholder="`请输入${m(label)}`">
          </div>
        </div>

        <div class="button-row" style="margin-top: 18px;">
          <button class="button" type="button" @click="submitRule('edit')">确认修改</button>
          <button class="ghost" type="button" @click="resetEditForm">取消</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.auditOpen }">
      <div class="modal-card">
        <h3>审核确认</h3>
        <p>{{ state.auditText }}</p>
        <div class="button-row" style="margin-top: 18px;">
          <button class="button" type="button" @click="confirmAudit">确认</button>
          <button class="ghost" type="button" @click="state.auditOpen = false">取消</button>
        </div>
      </div>
    </div>

    <div class="modal-overlay" :class="{ open: state.logOpen }">
      <div class="modal-card">
        <h3>{{ state.logTitle }}</h3>
        <div class="log-list">
          <div v-for="item in state.logItems" :key="item" class="log-line">{{ item }}</div>
        </div>
        <div class="button-row" style="margin-top: 18px;">
          <button class="ghost" type="button" @click="state.logOpen = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>
