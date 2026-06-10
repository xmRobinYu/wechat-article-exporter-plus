<script setup lang="ts">
const props = defineProps<{
  title: string;
  currentValue?: number;
}>();

const emit = defineEmits<{
  confirm: [value?: number];
  cancel: [];
}>();

const modal = useModal();

const inputValue = ref(props.currentValue ? formatTimeStamp(props.currentValue) : '');
const errorMessage = ref('');

function close() {
  modal.close();
}

function onCancel() {
  emit('cancel');
  close();
}

function onConfirm() {
  const raw = inputValue.value.trim();
  if (!raw) {
    emit('confirm', undefined);
    close();
    return;
  }

  const normalized = raw.replace('T', ' ');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    errorMessage.value = '时间格式不正确，请使用 2025-06-01 12:00:00';
    return;
  }

  emit('confirm', Math.floor(parsed.getTime() / 1000));
  close();
}
</script>

<template>
  <UModal prevent-close>
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold">{{ title }}</h2>
        <UButton
          square
          variant="link"
          color="gray"
          icon="i-lucide:x"
          class="absolute right-3 top-3"
          @click="onCancel"
        />
      </template>

      <div class="space-y-3">
        <p class="text-sm text-gray-500">
          当前停点：{{ currentValue ? formatTimeStamp(currentValue) : '未设置' }}
        </p>
        <UInput v-model="inputValue" placeholder="例如 2025-06-01 12:00:00" />
        <p v-if="errorMessage" class="text-sm text-rose-500">{{ errorMessage }}</p>
        <p class="text-sm text-gray-500">
          留空后点击“确认”可清空停点。后续同步时只会继续抓取这之后的新文章。
        </p>
      </div>

      <template #footer>
        <div class="flex justify-end space-x-3">
          <UButton color="white" class="px-3" @click="onCancel">取消</UButton>
          <UButton color="blue" class="px-3" @click="onConfirm">确定</UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
