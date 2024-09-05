<script setup lang="ts">
import { useFetch } from "@/composables/useFetch";
import { useUserStore } from "@/stores/user";
import { get, set } from "@vueuse/core";
import { FormInst, FormItemRule, useMessage } from "naive-ui";
import { storeToRefs } from "pinia";
import { ref } from "vue";

const message = useMessage();

const userStore = useUserStore();

const { roles } = storeToRefs(userStore);

const showRegisterInvited = ref(false);
const formRef = ref<FormInst | null>(null);
const registerCreatorData = ref({
  name: "",
  description: "",
  invited_code: "",
});
const formRules = {
  name: {
    required: true,
    trigger: ["input", "blur"],
    validator(rule: FormItemRule, value: string) {
      if (!value) {
        return new Error("请输入名称");
      } else if (value.length < 4 || value.length > 16) {
        return new Error("名称长度应在4-16位之间");
      }
      return true;
    },
  },
  description: {
    required: true,
    trigger: ["input", "blur"],
    message: "请输入描述",
  },
  invited_code: {
    required: true,
    trigger: ["input", "blur"],
    message: "请输入邀请码",
  },
};

async function registerCreator() {}

async function registerCreatorInvited(e: MouseEvent) {
  e.preventDefault();
  const errors = await formRef.value?.validate();
  if (errors?.warnings) {
    return;
  }
  const { data, error } = await useFetch("/creator/register-invited")
    .post(get(registerCreatorData))
    .json();
  if (get(error)) {
    set(showRegisterInvited, false);
    message.warning("激活失败：邀请码无效。");
  }
  if (get(data)) {
    await userStore.refreshUser();
    set(showRegisterInvited, false);
    message.success("激活成功");
  }
}
</script>

<template>
  <div class="user-creator-panel flex flex-col gap-2">
    <div>{{ "「星际枢纽」创作者服务" }}</div>
    <!-- <div class="flex flex-row justify-start items-center"> -->
    <div
      class="flex flex-row justify-start items-center gap-2 px-2 py-2 cell-normal hover:shadow"
    >
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="i-tabler:brush w-[28px] h-[28px]"></div>
        <div>
          <span>{{ "创作者服务：" }}</span>
          <span v-if="roles.includes('creator')" class="text-green">{{
            "已激活"
          }}</span>
          <span v-else class="text-blue">{{ "尚未激活" }}</span>
        </div>
      </div>
      <n-divider vertical />
      <div class="flex flex-col flex-grow justify-center items-center gap-1">
        <div>{{ "激活创作者服务将可访问数据查询、作品上传等多项功能" }}</div>
        <div></div>
        <div
          v-if="!roles.includes('creator')"
          class="flex flex-row justify-around items-center gap-2"
        >
          <n-button type="primary" size="small" disabled>
            {{ "申请成为创作者" }}
          </n-button>
          <n-button
            type="info"
            size="small"
            @click="showRegisterInvited = true"
          >
            {{ "使用邀请码激活" }}
          </n-button>
        </div>
      </div>
    </div>
    <n-modal v-model:show="showRegisterInvited" preset="dialog">
      <template #header>
        <div>{{ "使用邀请码激活" }}</div>
      </template>
      <div>
        <n-form
          ref="formRef"
          :model="registerCreatorData"
          :rules="formRules"
          size="small"
          label-placement="top"
        >
          <n-form-item :label="'创作者名称'" path="name">
            <n-input
              v-model:value="registerCreatorData.name"
              :placeholder="'请输入名称'"
              minlength="4"
              maxlength="16"
              show-count
            />
          </n-form-item>
          <n-form-item :label="'创作者简介'" path="description">
            <n-input
              v-model:value="registerCreatorData.description"
              :placeholder="'请输入简介'"
              maxlength="32"
              show-count
              clearable
            />
          </n-form-item>
          <n-form-item :label="'邀请码'" path="invited_code">
            <n-input
              v-model:value="registerCreatorData.invited_code"
              :placeholder="'请输入邀请码'"
              maxlength="32"
              show-count
              clearable
            />
          </n-form-item>
        </n-form>
      </div>
      <template #action>
        <n-button size="small" @click="showRegisterInvited = false">
          {{ "取消" }}
        </n-button>
        <n-button type="primary" size="small" @click="registerCreatorInvited">
          {{ "确认激活" }}
        </n-button>
      </template>
    </n-modal>
  </div>
</template>
