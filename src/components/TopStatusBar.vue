<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const { assistantOpen, logout } = usePlatformState();

const now = ref(new Date());
let timerId = null;

onMounted(() => {
  timerId = window.setInterval(() => {
    now.value = new Date();
  }, 1000);
});

onBeforeUnmount(() => {
  if (timerId) window.clearInterval(timerId);
});

const timeLabel = () =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now.value);

const dateLabel = () =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now.value);

function toggleAssistant() {
  assistantOpen.value = !assistantOpen.value;
}

function handleLogout() {
  logout();
  window.location.hash = "#/login";
}
</script>

<template>
  <header class="status-bar status-bar-compact">
    <div class="titlebar-ribbon">
      <div class="titlebar-ribbon-text">
        <span class="titlebar-ribbon-kicker">智能流程辅助管理</span>
        <strong>智能流程辅助管理配置项</strong>
      </div>
    </div>

    <div class="titlebar-meta">
      <button class="ghost small" type="button" @click="toggleAssistant">
        {{ assistantOpen ? "关闭助手" : "打开助手" }}
      </button>
      <button class="ghost small" type="button" @click="handleLogout">退出登录</button>
      <div class="titlebar-clock">
        <strong>{{ timeLabel() }}</strong>
        <span>{{ dateLabel() }}</span>
      </div>
    </div>
  </header>
</template>
