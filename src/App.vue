<script setup>
import { computed } from "vue";
import { useRoute } from "vue-router";
import SidebarNav from "./components/SidebarNav.vue";
import TopStatusBar from "./components/TopStatusBar.vue";
import AssistantPanel from "./components/AssistantPanel.vue";
import ToastHost from "./components/ToastHost.vue";

const route = useRoute();
const hideChrome = computed(() => Boolean(route.meta.hideChrome));
</script>

<template>
  <template v-if="hideChrome">
    <RouterView />
    <ToastHost />
  </template>
  <div v-else class="app-shell">
    <SidebarNav />
    <div class="shell-main">
      <TopStatusBar />
      <main class="page view-host">
        <RouterView />
      </main>
    </div>
    <AssistantPanel />
    <ToastHost />
  </div>
</template>
