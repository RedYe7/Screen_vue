<script setup>
import { computed, reactive, ref } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const { executedPlans, assistantOpen, showToast } = usePlatformState();

const typeOptions = [
  { key: "calendar", label: "历史日历", kinds: ["monitoring-calendar-history"] },
  { key: "plan", label: "工作计划", kinds: ["monitoring-plan-history"] },
  { key: "work", label: "工作", kinds: ["monitoring-work-history"] }
];

const filters = reactive({
  keyword: "",
  system: "",
  year: "",
  selectedTypes: {
    calendar: true,
    plan: true,
    work: true
  }
});

const submitted = ref({
  keyword: "",
  system: "",
  year: "",
  selectedTypes: {
    calendar: true,
    plan: true,
    work: true
  }
});

const historyItems = computed(() =>
  (executedPlans.value || [])
    .filter((item) => typeOptions.some((option) => option.kinds.includes(item.kind)))
    .map((item, index) => normalizeHistoryItem(item, index))
    .sort((left, right) => `${right.sortTime}`.localeCompare(`${left.sortTime}`))
);

const availableSystems = computed(() =>
  [...new Set(historyItems.value.map((item) => item.system).filter(Boolean))]
);

const availableYears = computed(() =>
  [...new Set(historyItems.value.map((item) => item.year).filter(Boolean))].sort((a, b) => `${b}`.localeCompare(`${a}`))
);

const selectedTypeKeys = computed(() =>
  Object.entries(submitted.value.selectedTypes)
    .filter(([, checked]) => checked)
    .map(([key]) => key)
);

const filteredResults = computed(() => {
  const activeTypes = selectedTypeKeys.value;
  if (!activeTypes.length) return [];

  return historyItems.value.filter((item) => {
    const hitType = activeTypes.includes(item.typeKey);
    const hitSystem = !submitted.value.system || item.system === submitted.value.system;
    const hitYear = !submitted.value.year || item.year === submitted.value.year;
    const keyword = submitted.value.keyword.trim();
    const hitKeyword = !keyword || item.searchBlob.includes(keyword);
    return hitType && hitSystem && hitYear && hitKeyword;
  });
});

const historyOverview = computed(() => ({
  total: historyItems.value.length,
  calendar: historyItems.value.filter((item) => item.typeKey === "calendar").length,
  plan: historyItems.value.filter((item) => item.typeKey === "plan").length,
  work: historyItems.value.filter((item) => item.typeKey === "work").length
}));

function normalizeHistoryItem(item, index) {
  const typeKey = item.kind === "monitoring-calendar-history"
    ? "calendar"
    : item.kind === "monitoring-plan-history"
      ? "plan"
      : "work";

  const typeLabel = typeKey === "calendar" ? "历史日历" : typeKey === "plan" ? "工作计划" : "工作";
  const start = item.startTime ? item.startTime.slice(0, 10) : item.date || "";
  const end = item.endTime ? item.endTime.slice(0, 10) : item.date || "";
  const year = start ? start.slice(0, 4) : "";
  const personnelText = Array.isArray(item.personnel) ? item.personnel.join("、") : item.owner || "";
  const timeText = item.dateRange || [start, end].filter(Boolean).join(" - ");
  const taskCode = item.taskCode || `HIS-${String(index + 1).padStart(4, "0")}`;
  const sourceLabel = item.flowTitle || item.type || typeLabel;

  return {
    ...item,
    typeKey,
    typeLabel,
    year,
    taskCode,
    personnelText,
    timeText,
    sourceLabel,
    sortTime: item.archivedAt || item.endTime || item.startTime || item.date || "",
    searchBlob: [
      item.title,
      item.planTitle,
      item.owner,
      personnelText,
      item.system,
      item.gasLabel,
      item.type,
      item.flowTitle,
      item.date,
      item.dateRange,
      taskCode,
      ...(item.tags || [])
    ]
      .filter(Boolean)
      .join(" ")
  };
}

function executeSearch() {
  const activeTypes = Object.values(filters.selectedTypes).filter(Boolean);
  if (!activeTypes.length) {
    showToast("请至少勾选一种历史检索类型");
    return;
  }

  submitted.value = {
    keyword: filters.keyword.trim(),
    system: filters.system,
    year: filters.year,
    selectedTypes: { ...filters.selectedTypes }
  };

  showToast(`搜索完成，共找到 ${filteredResults.value.length} 条历史记录`);
}

function toggleType(typeKey) {
  filters.selectedTypes[typeKey] = !filters.selectedTypes[typeKey];
}

function resetSearch() {
  filters.keyword = "";
  filters.system = "";
  filters.year = "";
  filters.selectedTypes = {
    calendar: true,
    plan: true,
    work: true
  };
  submitted.value = {
    keyword: "",
    system: "",
    year: "",
    selectedTypes: {
      calendar: true,
      plan: true,
      work: true
    }
  };
  showToast("已重置历史库搜索条件");
}

function openHistoryDetail(item) {
  showToast(`已定位到${item.typeLabel}：${item.title}`);
}
</script>

<template>
  <div class="history-query-page">
    <section class="history-query-hero">
      <div class="history-query-brand">
        <div class="history-query-brand-mark">历史库</div>
        <h1>流程智能查询</h1>
      </div>

      <div class="history-search-panel">
        <div class="history-search-tabs">
          <button class="history-tab active" type="button">检索</button>
          <button class="history-tab" type="button" @click="assistantOpen = true">智能助手</button>
        </div>

        <div class="history-search-box">
          <div class="history-search-type">主题</div>
          <input
            v-model="filters.keyword"
            class="history-search-input"
            placeholder="输入日期、工作、计划、人员、任务代号等关键词"
            @keyup.enter="executeSearch"
          >
          <button class="history-search-button" type="button" @click="executeSearch">检索</button>
        </div>

        <div class="history-type-row">
          <label
            v-for="option in typeOptions"
            :key="option.key"
            class="history-check"
            :class="{ active: filters.selectedTypes[option.key] }"
          >
            <input
              :checked="filters.selectedTypes[option.key]"
              type="checkbox"
              @change="toggleType(option.key)"
            >
            <span>{{ option.label }}</span>
          </label>
        </div>
      </div>
    </section>

    <section class="panel history-library-panel">
      <div class="panel-head">
        <div>
          <h3>历史库</h3>
          <div class="muted">全部历史日历、历史工作计划和历史工作统一汇聚到本模块，供后续回溯、查询和比对使用。</div>
        </div>
        <span class="chip active">历史记录 {{ historyOverview.total }} 条</span>
      </div>

      <div class="history-overview-grid">
        <div class="history-overview-card">
          <strong>{{ historyOverview.calendar }}</strong>
          <span>历史日历</span>
        </div>
        <div class="history-overview-card">
          <strong>{{ historyOverview.plan }}</strong>
          <span>工作计划</span>
        </div>
        <div class="history-overview-card">
          <strong>{{ historyOverview.work }}</strong>
          <span>工作</span>
        </div>
      </div>
    </section>

    <section class="history-query-layout">
      <aside class="history-filter-rail">
        <div class="history-filter-card">
          <div class="history-filter-title">检索类型</div>
          <div class="history-filter-list">
            <label
              v-for="option in typeOptions"
              :key="`side-${option.key}`"
              class="history-filter-option"
            >
              <input
                :checked="filters.selectedTypes[option.key]"
                type="checkbox"
                @change="toggleType(option.key)"
              >
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>

        <div class="history-filter-card">
          <div class="history-filter-title">气体系统</div>
          <select v-model="filters.system">
            <option value="">全部系统</option>
            <option v-for="item in availableSystems" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>

        <div class="history-filter-card">
          <div class="history-filter-title">年度</div>
          <select v-model="filters.year">
            <option value="">全部年度</option>
            <option v-for="item in availableYears" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>

        <div class="history-filter-actions">
          <button class="button" type="button" @click="executeSearch">执行搜索</button>
          <button class="ghost" type="button" @click="resetSearch">重置条件</button>
        </div>
      </aside>

      <div class="history-result-panel">
        <div class="history-result-toolbar">
          <div class="history-result-meta">
            <strong>检索结果</strong>
            <span>共找到 {{ filteredResults.length }} 条</span>
          </div>
          <div class="history-result-meta">
            <span>当前检索范围：</span>
            <strong>
              {{
                Object.entries(submitted.selectedTypes)
                  .filter(([, checked]) => checked)
                  .map(([key]) => typeOptions.find((item) => item.key === key)?.label || "")
                  .join(" / ")
              }}
            </strong>
          </div>
        </div>

        <div class="history-result-table">
          <div class="history-result-head">
            <span>类型</span>
            <span>题名</span>
            <span>人员 / 责任人</span>
            <span>来源</span>
            <span>时间</span>
            <span>任务代号</span>
            <span>操作</span>
          </div>

          <div v-if="filteredResults.length" class="history-result-body">
            <div v-for="item in filteredResults" :key="item.id" class="history-result-row">
              <div class="history-cell type">
                <span class="chip" :class="{ active: item.typeKey === 'calendar' }">{{ item.typeLabel }}</span>
              </div>
              <div class="history-cell title">
                <strong>{{ item.title }}</strong>
                <small>{{ item.system }} ｜ {{ item.status }} ｜ 风险 {{ item.risk }}</small>
              </div>
              <div class="history-cell">{{ item.personnelText || item.owner }}</div>
              <div class="history-cell">{{ item.sourceLabel }}</div>
              <div class="history-cell">{{ item.timeText }}</div>
              <div class="history-cell">{{ item.taskCode }}</div>
              <div class="history-cell action">
                <button class="ghost small" type="button" @click="openHistoryDetail(item)">查看</button>
              </div>
            </div>
          </div>

          <div v-else class="history-empty-state">
            <strong>未检索到结果</strong>
            <p>请调整关键词、历史类型或筛选条件后重新搜索。</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
