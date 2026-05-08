<script setup>
import { computed } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const { toastMessage } = usePlatformState();
const visible = computed(() => Boolean(toastMessage.value));
</script>

<template>
  <div class="toast" :class="{ show: visible }">{{ toastMessage }}</div>
</template>
