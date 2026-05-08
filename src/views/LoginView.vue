<script setup>
import { computed, reactive } from "vue";
import { useRouter } from "vue-router";
import { usePlatformState } from "../composables/usePlatformState";

const router = useRouter();
const { authProfiles, login, showToast } = usePlatformState();

const form = reactive({
  role: "engineer",
  gasType: "oxygen",
  username: authProfiles.engineer.username,
  password: authProfiles.engineer.password
});

const errorMessage = computed(() => "");

function applyPreset(role) {
  form.role = role;
  form.username = authProfiles[role].username;
  form.password = authProfiles[role].password;
}

function submitLogin() {
  const result = login({
    role: form.role,
    gasType: form.role === "engineer" ? "" : form.gasType,
    username: form.username.trim(),
    password: form.password
  });

  if (!result.ok) {
    showToast(result.message);
    return;
  }

  showToast(`已登录：${result.user.roleLabel}`);
  if (result.user.role === "engineer") {
    router.push("/planning");
    return;
  }
  router.push("/planning/fuel");
}
</script>

<template>
  <div class="login-shell">
    <section class="login-panel">
      <div class="login-ribbon">
        <span>软件标题名称</span>
        <strong>智能流程辅助管理配置项</strong>
      </div>

      <div class="login-grid">
        <div class="login-copy">
          <div class="eyebrow">身份登录</div>
          <h1>进入智能流程辅助管理系统</h1>
          <p>先选择身份完成登录。系统工程师登录后进入流程自主规划总入口；指挥人员和操作人员登录后进入特燃特气筹措工作规划界面。</p>

          <div class="login-accounts">
            <div class="login-account-card">
              <strong>系统工程师</strong>
              <small>账号：{{ authProfiles.engineer.username }}</small>
              <small>密码：{{ authProfiles.engineer.password }}</small>
            </div>
            <div class="login-account-card">
              <strong>指挥人员</strong>
              <small>账号：{{ authProfiles.commander.username }}</small>
              <small>密码：{{ authProfiles.commander.password }}</small>
            </div>
            <div class="login-account-card">
              <strong>操作人员</strong>
              <small>账号：{{ authProfiles.operator.username }}</small>
              <small>密码：{{ authProfiles.operator.password }}</small>
            </div>
          </div>
        </div>

        <div class="login-form-card">
          <div class="field">
            <span>登录身份</span>
            <select v-model="form.role" @change="applyPreset(form.role)">
              <option value="engineer">系统工程师</option>
              <option value="commander">指挥人员</option>
              <option value="operator">操作人员</option>
            </select>
          </div>

          <div v-if="form.role !== 'engineer'" class="field">
            <span>气体类型</span>
            <select v-model="form.gasType">
              <option value="oxygen">氧气</option>
              <option value="hydrogen">氢气</option>
            </select>
          </div>

          <div class="field">
            <span>账号</span>
            <input v-model="form.username" type="text" placeholder="请输入账号">
          </div>

          <div class="field">
            <span>密码</span>
            <input v-model="form.password" type="password" placeholder="请输入密码" @keyup.enter="submitLogin">
          </div>

          <div class="button-row login-actions">
            <button class="button" type="button" @click="submitLogin">登录</button>
            <button class="ghost" type="button" @click="applyPreset(form.role)">填入预设账号</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
