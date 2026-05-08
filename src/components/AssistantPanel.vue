<script setup>
import { ref } from "vue";
import { usePlatformState } from "../composables/usePlatformState";

const { assistantOpen } = usePlatformState();
const input = ref("");
const messages = ref([
  "可以通过自然语言继续调整当前流程的模板、步骤、约束、关键节点和冲突处理建议。"
]);

function send() {
  const text = input.value.trim();
  if (!text) return;
  messages.value.push(`你：${text}`);
  messages.value.push(`助手：已接收指令“${text}”，系统已生成对应建议。`);
  input.value = "";
}

function closeAssistant() {
  assistantOpen.value = false;
}
</script>

<template>
  <aside class="assistant-panel" :class="{ open: assistantOpen }">
    <div class="assistant-head">
      <div>
        <div class="eyebrow">智能辅助助手</div>
        <strong>语音 / 文本协同控制</strong>
      </div>
      <button class="ghost small" type="button" @click="closeAssistant">关闭</button>
    </div>

    <div class="assistant-log">
      <div
        v-for="(message, index) in messages"
        :key="`${index}-${message}`"
        class="bubble"
        :class="{ user: message.startsWith('你：') }"
      >
        {{ message }}
      </div>
    </div>

    <label class="field">
      <span>自然语言输入</span>
      <input
        v-model="input"
        type="text"
        placeholder="例如：将电子审签放到保障量确认之后"
        @keyup.enter="send"
      />
    </label>

    <div class="button-row" style="margin-top:12px;">
      <button class="button" type="button" @click="send">发送</button>
      <button class="ghost" type="button" @click="closeAssistant">关闭</button>
    </div>
  </aside>
</template>
