<script setup lang="ts">
import type {
  ColDef,
  GetRowIdParams,
  GridApi,
  GridOptions,
  GridReadyEvent,
  ICellRendererParams,
  SelectionChangedEvent,
  ValueGetterParams,
} from 'ag-grid-community';
import { AgGridVue } from 'ag-grid-vue3';
import { defu } from 'defu';
import { formatTimeStamp } from '#shared/utils/helpers';
import { getArticleList } from '~/apis';
import GlobalSearchAccountDialog from '~/components/global/SearchAccountDialog.vue';
import GridAccountActions from '~/components/grid/AccountActions.vue';
import GridLoadProgress from '~/components/grid/LoadProgress.vue';
import ConfirmModal from '~/components/modal/Confirm.vue';
import LoginModal from '~/components/modal/Login.vue';
import SetIncrementalCheckpointModal from '~/components/modal/SetIncrementalCheckpoint.vue';
import toastFactory from '~/composables/toast';
import useLoginCheck from '~/composables/useLoginCheck';
import { IMAGE_PROXY, websiteName } from '~/config';
import { sharedGridOptions } from '~/config/shared-grid-options';
import { deleteAccountData } from '~/store/v2';
import { getArticleCache, hitCache } from '~/store/v2/article';
import {
  getAllInfo,
  getInfoCache,
  importMpAccounts,
  setLatestSyncedArticleTime,
  type MpAccount,
} from '~/store/v2/info';
import type { AccountManifest } from '~/types/account';
import type { Preferences } from '~/types/preferences';
import { exportAccountJsonFile } from '~/utils/exporter';
import { createBooleanColumnFilterParams, createDateColumnFilterParams } from '~/utils/grid';

useHead({
  title: `公众号管理 | ${websiteName}`,
});

interface PromiseInstance {
  resolve: (value: unknown) => void;
  reject: (reason?: any) => void;
}

const toast = toastFactory();
const modal = useModal();
const { checkLogin } = useLoginCheck();

const { getSyncTimestamp, getSyncRangeLabel, isSyncAll } = useSyncDeadline();
const syncToTimestamp = getSyncTimestamp();

const preferences = usePreferences();

// 账号事件总线，用于和 Credentials 面板保持列表同步
const { accountEventBus } = useAccountEventBus();
accountEventBus.on(event => {
  if (event === 'account-added' || event === 'account-removed') {
    refresh();
  }
});

const searchAccountDialogRef = ref<typeof GlobalSearchAccountDialog | null>(null);

const addBtnLoading = ref(false);
function addAccount() {
  if (!checkLogin()) return;

  searchAccountDialogRef.value!.open();
}
async function onSelectAccount(account: MpAccount) {
  addBtnLoading.value = true;
  await loadAccountArticle(account, false);
  await refresh();
  addBtnLoading.value = false;
  toast.success('公众号添加成功', `已成功添加公众号【${account.nickname}】，并同步了第一页的文章数据`);
  // 通知 Credentials 面板按钮立即变更为“已添加”
  accountEventBus.emit('account-added', { fakeid: account.fakeid });
}

// 表示同步过程中是否执行了取消操作
const isCanceled = ref(false);
const isDeleting = ref(false);
const isSyncing = ref(false);

// 当前正在同步的公众号id
const syncingRowId = ref<string | null>(null);

const syncTimer = ref<number | null>(null);
const syncMode = useLocalStorage<'incremental' | 'full'>('account-sync-mode', 'incremental');
async function _load(account: MpAccount, begin: number, loadMore: boolean, promise: PromiseInstance) {
  if (isCanceled.value) {
    isCanceled.value = false; // 这里需要将状态复位
    promise.reject(new Error('已取消同步'));
    return;
  }

  syncingRowId.value = account.fakeid;
  isSyncing.value = true;

  const [articles, completed] = await getArticleList(account, begin);
  if (isCanceled.value) {
    isCanceled.value = false;
    promise.reject(new Error('已取消同步'));
    return;
  }
  if (completed) {
    await updateRow(account.fakeid);
    syncingRowId.value = null;
    isSyncing.value = false;
    promise.resolve(account);
    return;
  }

  const count = articles.filter(article => article.itemidx === 1).length; // 消息数
  begin += count;

  // 检查是否可以「快进」，也就是已经同步过更早的历史数据
  // todo: 这里还可以继续优化，防止出现多段不连续的范围
  const lastArticle = articles.at(-1);
  if (
    syncMode.value === 'incremental' &&
    lastArticle &&
    account.latest_synced_article_time &&
    lastArticle.update_time < account.latest_synced_article_time
  ) {
    if (await hitCache(account.fakeid, lastArticle.create_time)) {
      const cachedArticles = await getArticleCache(account.fakeid, lastArticle.create_time);

      // 更新 begin 参数
      const count = cachedArticles.filter(article => article.itemidx === 1).length;
      begin += count;
      articles.push(...cachedArticles);
    }
  }

  if (articles.at(-1)!.create_time < syncToTimestamp) {
    // 已同步到配置的时间范围
    loadMore = false;
  }

  await updateRow(account.fakeid);
  if (loadMore) {
    syncTimer.value = window.setTimeout(
      () => {
        if (isCanceled.value) {
          console.warn('已取消同步');
          isCanceled.value = false;
          promise.reject(new Error('已取消同步'));
          return;
        }
        _load(account, begin, true, promise);
      },
      ((preferences.value as unknown as Preferences).accountSyncSeconds || 5) * 1000
    );
  } else {
    syncingRowId.value = null;
    isSyncing.value = false;
    promise.resolve(account);
  }
}

// 同步指定公众号
async function loadAccountArticle(account: MpAccount, loadMore = true) {
  return new Promise((resolve, reject) => {
    const promise: PromiseInstance = { resolve, reject };

    _load(account, 0, loadMore, promise).catch(e => {
      syncingRowId.value = null;
      isSyncing.value = false;

      if (e.message === 'session expired') {
        modal.open(LoginModal);
      }
      reject(e);
    });
  });
}

// 同步所有公众号
async function loadSelectedAccountArticle() {
  if (!checkLogin()) return;

  isCanceled.value = false;

  try {
    const rows = getSelectedRows();
    for (const account of rows) {
      await loadAccountArticle(account);
    }
    const modeHint = syncMode.value === 'incremental' ? '（模式：仅新增）' : '（模式：全量）';
    const rangeHint = isSyncAll() ? '' : `（同步范围：${getSyncRangeLabel()}）`;
    toast.success('同步完成', `已成功同步 ${rows.length} 个公众号${modeHint}${rangeHint}`);
  } catch (e: any) {
    toast.error('同步失败', e.message);
  }
}

let globalRowData: MpAccount[] = [];

const columnDefs = ref<ColDef[]>([
  {
    colId: 'fakeid',
    headerName: 'fakeid',
    field: 'fakeid',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    minWidth: 200,
    cellClass: 'font-mono',
    initialHide: true,
  },
  {
    colId: 'round_head_img',
    headerName: '头像',
    field: 'round_head_img',
    sortable: false,
    filter: false,
    cellRenderer: (params: ICellRendererParams) => {
      return `<img alt="" src="${IMAGE_PROXY + params.value}" style="height: 30px; width: 30px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 100%;" />`;
    },
    cellClass: 'flex justify-center items-center',
    minWidth: 80,
  },
  {
    colId: 'nickname',
    headerName: '名称',
    field: 'nickname',
    cellDataType: 'text',
    filter: 'agTextColumnFilter',
    tooltipField: 'nickname',
    minWidth: 200,
  },
  {
    colId: 'create_time',
    headerName: '添加时间',
    field: 'create_time',
    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : ''),
    filter: 'agDateColumnFilter',
    filterParams: createDateColumnFilterParams(),
    filterValueGetter: (params: ValueGetterParams) => {
      return new Date(params.getValue('create_time') * 1000);
    },
    sort: 'desc',
    minWidth: 180,
    initialHide: true,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    colId: 'update_time',
    headerName: '最后同步时间',
    field: 'update_time',
    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : ''),
    filter: 'agDateColumnFilter',
    filterParams: createDateColumnFilterParams(),
    filterValueGetter: (params: ValueGetterParams) => {
      return new Date(params.getValue('update_time') * 1000);
    },
    minWidth: 180,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    colId: 'latest_synced_article_time',
    headerName: '增量停点',
    field: 'latest_synced_article_time',
    valueFormatter: p => (p.value ? formatTimeStamp(p.value) : ''),
    filter: 'agDateColumnFilter',
    filterParams: createDateColumnFilterParams(),
    filterValueGetter: (params: ValueGetterParams) => {
      const value = params.getValue('latest_synced_article_time');
      return value ? new Date(value * 1000) : null;
    },
    minWidth: 180,
    cellClass: 'flex justify-center items-center font-mono',
  },
  {
    colId: 'total_count',
    headerName: '消息总数',
    field: 'total_count',
    cellDataType: 'number',
    cellRenderer: 'agAnimateShowChangeCellRenderer',
    filter: 'agNumberColumnFilter',
    cellClass: 'flex justify-center items-center font-mono',
    minWidth: 150,
  },
  {
    colId: 'count',
    headerName: '已同步消息数',
    field: 'count',
    cellDataType: 'number',
    cellRenderer: 'agAnimateShowChangeCellRenderer',
    filter: 'agNumberColumnFilter',
    cellClass: 'flex justify-center items-center font-mono',
    minWidth: 180,
  },
  {
    colId: 'articles',
    headerName: '已同步文章数',
    field: 'articles',
    cellDataType: 'number',
    cellRenderer: 'agAnimateShowChangeCellRenderer',
    filter: 'agNumberColumnFilter',
    cellClass: 'flex justify-center items-center font-mono',
    minWidth: 180,
    initialHide: true,
  },
  {
    colId: 'detail_article_count',
    headerName: '文章明细数',
    field: 'detail_article_count',
    cellDataType: 'number',
    filter: 'agNumberColumnFilter',
    cellClass: 'flex justify-center items-center font-mono',
    minWidth: 150,
  },
  {
    colId: 'detail_consistency',
    headerName: '明细状态',
    valueGetter: params => {
      const summary = params.data.articles || 0;
      const detail = params.data.detail_article_count || 0;
      if (summary === 0 && detail === 0) return '空';
      if (summary === detail) return '正常';
      return '需修复';
    },
    filter: 'agSetColumnFilter',
    minWidth: 130,
    cellClass: params => {
      const summary = params.data.articles || 0;
      const detail = params.data.detail_article_count || 0;
      return summary === detail ? 'flex justify-center items-center text-green-600 font-medium' : 'flex justify-center items-center text-rose-500 font-medium';
    },
  },
  {
    colId: 'load_percent',
    headerName: '同步进度',
    valueGetter: params => (params.data.total_count === 0 ? 0 : params.data.count / params.data.total_count),
    cellDataType: 'number',
    cellRenderer: GridLoadProgress,
    filter: 'agNumberColumnFilter',
    minWidth: 200,
  },
  {
    colId: 'completed',
    headerName: '是否同步完成',
    field: 'completed',
    cellDataType: 'boolean',
    filter: 'agSetColumnFilter',
    filterParams: createBooleanColumnFilterParams('已同步完成', '未同步完成'),
    cellClass: 'flex justify-center items-center',
    headerClass: 'justify-center',
    minWidth: 200,
  },
  {
    colId: 'action',
    headerName: '操作',
    field: 'fakeid',
    sortable: false,
    filter: false,
    cellRenderer: GridAccountActions,
    cellRendererParams: {
      onSync: (params: ICellRendererParams) => {
        if (!checkLogin()) return;

        isCanceled.value = false;
        loadAccountArticle(params.data)
          .then(() => {
            const rangeHint = isSyncAll() ? '' : `（同步范围：${getSyncRangeLabel()}）`;
            toast.success('同步完成', `公众号【${params.data.nickname}】的文章已同步完毕${rangeHint}`);
          })
          .catch(e => {
            toast.error('同步失败', e.message);
          });
      },
      onStop: (params: ICellRendererParams) => {
        isCanceled.value = true;
        if (syncTimer.value) {
          window.clearTimeout(syncTimer.value);
          syncTimer.value = null;
        }

        syncingRowId.value = null;
        isSyncing.value = false;
      },
      isDeleting: isDeleting,
      isSyncing: isSyncing,
      syncingRowId: syncingRowId,
    },
    cellClass: 'flex justify-center items-center',
    maxWidth: 100,
    pinned: 'right',
  },
]);

// 注意，`defu`函数最左边的参数优先级最高
const gridOptions: GridOptions = defu(
  {
    getRowId: (params: GetRowIdParams) => String(params.data.fakeid),
  },
  sharedGridOptions
);

const gridApi = shallowRef<GridApi | null>(null);
function onGridReady(params: GridReadyEvent) {
  gridApi.value = params.api;

  restoreColumnState();
  refresh();
}

function onColumnStateChange() {
  if (gridApi.value) {
    saveColumnState();
  }
}
function saveColumnState() {
  const state = gridApi.value?.getColumnState();
  localStorage.setItem('agGridColumnState-account', JSON.stringify(state));
}

function restoreColumnState() {
  const stateStr = localStorage.getItem('agGridColumnState-account');
  if (stateStr) {
    const state = JSON.parse(stateStr);
    gridApi.value?.applyColumnState({
      state,
      applyOrder: true,
    });
  }
}

async function refresh() {
  globalRowData = await getAllInfo();
  gridApi.value?.setGridOption('rowData', globalRowData);
}

async function updateRow(fakeid: string) {
  const rowNode = gridApi.value?.getRowNode(fakeid);
  if (rowNode) {
    const info = await getInfoCache(fakeid);
    rowNode.updateData(info);
  }
}

// 当前是否有选中的行
const hasSelectedRows = ref(false);
function onSelectionChanged(evt: SelectionChangedEvent) {
  hasSelectedRows.value = (evt.selectedNodes?.map(node => node.data) || []).length > 0;
}
function getSelectedRows() {
  const rows: MpAccount[] = [];
  gridApi.value?.forEachNodeAfterFilterAndSort(node => {
    if (node.isSelected()) {
      rows.push(node.data);
    }
  });
  return rows;
}

// 删除所选的公众号数据
function deleteSelectedAccounts() {
  const rows = getSelectedRows();
  const ids = rows.map(info => info.fakeid);
  modal.open(ConfirmModal, {
    title: '确定要删除所选公众号的数据吗？',
    description: '删除之后，该公众号的所有数据(包括已下载的文章和留言等)都将被清空。',
    async onConfirm() {
      try {
        isDeleting.value = true;
        await deleteAccountData(ids);
        // 通知 Credentials 面板这些公众号已被移除
        ids.forEach(fakeid => accountEventBus.emit('account-removed', { fakeid: fakeid }));
      } finally {
        isDeleting.value = false;
        await refresh();
      }
    },
  });
}

function openSetIncrementalCheckpoint() {
  const rows = getSelectedRows();
  if (rows.length !== 1) {
    toast.info('提示', '请先且仅选择 1 个公众号');
    return;
  }

  const account = rows[0];
  modal.open(SetIncrementalCheckpointModal, {
    title: `设置增量停点：${account.nickname}`,
    currentValue: account.latest_synced_article_time,
    async onConfirm(ts?: number) {
      await setLatestSyncedArticleTime(account.fakeid, ts);
      await refresh();
      toast.success('设置成功', ts ? `增量停点已设置为 ${formatTimeStamp(ts)}` : '增量停点已清空');
    },
  });
}

async function setCheckpointToNow() {
  const rows = getSelectedRows();
  if (rows.length !== 1) {
    toast.info('提示', '请先且仅选择 1 个公众号');
    return;
  }

  const account = rows[0];
  const now = Math.floor(Date.now() / 1000);
  await setLatestSyncedArticleTime(account.fakeid, now);
  await refresh();
  toast.success('设置成功', `已将【${account.nickname}】的增量同步停点设置为当前时间`);
}

async function clearCheckpointAndFullSync() {
  const rows = getSelectedRows();
  if (rows.length !== 1) {
    toast.info('提示', '请先且仅选择 1 个公众号');
    return;
  }

  const account = rows[0];
  await setLatestSyncedArticleTime(account.fakeid, undefined);
  await refresh();
  await loadAccountArticle(account);
  toast.success('操作完成', `已清空【${account.nickname}】的增量同步停点，并启动全量同步`);
}

async function repairSelectedAccounts() {
  if (!checkLogin()) return;

  const rows = getSelectedRows();
  if (rows.length === 0) {
    toast.info('提示', '请先选择至少 1 个公众号');
    return;
  }

  const targets = rows.filter(account => (account.articles || 0) !== (account.detail_article_count || 0));
  if (targets.length === 0) {
    toast.success('无需修复', '当前选中的公众号文章摘要与文章明细一致');
    return;
  }

  try {
    isCanceled.value = false;
    const previousMode = syncMode.value;
    syncMode.value = 'full';
    for (const account of targets) {
      await loadAccountArticle(account);
    }
    syncMode.value = previousMode;
    await refresh();
    toast.success('修复完成', `已对 ${targets.length} 个公众号执行全量同步修复文章明细`);
  } catch (e: any) {
    toast.error('修复失败', e.message);
  }
}

// 导入公众号
const fileRef = ref<HTMLInputElement | null>(null);
const importBtnLoading = ref(false);
function importAccount() {
  fileRef.value!.click();
}
async function handleFileChange(evt: Event) {
  const files = (evt.target as HTMLInputElement).files;
  if (files && files.length > 0) {
    const file = files[0];

    try {
      importBtnLoading.value = true;

      // 解析 JSON
      const jsonData = JSON.parse(await file.text());
      if (jsonData.usefor !== 'wechat-article-exporter') {
        // 文件格式不正确
        toast.error('导入公众号失败', '导入文件格式不正确，请选择该网站导出的文件进行导入。');
        return;
      }
      const infos = jsonData.accounts;
      if (!infos || infos.length <= 0) {
        // 文件格式不正确
        toast.error('导入公众号失败', '导入文件格式不正确，请选择该网站导出的文件进行导入。');
        return;
      }

      await importMpAccounts(infos);
      await refresh();
    } catch (error) {
      console.error('导入公众号时 JSON 解析失败:', error);
      toast.error('导入公众号', (error as Error).message);
    } finally {
      importBtnLoading.value = false;
    }
  }
}

// 导出公众号
const exportBtnLoading = ref(false);
function exportAccount() {
  exportBtnLoading.value = true;
  try {
    const rows = getSelectedRows();
    const data: AccountManifest = {
      version: '1.0',
      usefor: 'wechat-article-exporter',
      accounts: rows,
    };
    exportAccountJsonFile(data, '公众号');
    toast.success('导出公众号', `成功导出了 ${rows.length} 个公众号`);
  } finally {
    exportBtnLoading.value = false;
  }
}

const { getActualDateRange } = useSyncDeadline();
</script>

<template>
  <div class="h-full">
    <Teleport defer to="#title">
      <h1 class="text-[28px] leading-[34px] text-slate-12 dark:text-slate-50 font-bold">公众号管理</h1>
    </Teleport>

    <div class="flex flex-col h-full divide-y divide-gray-200">
      <!-- 顶部操作区 -->
      <header class="flex flex-wrap items-center gap-3 px-3 py-3">
        <UButton icon="i-lucide:user-plus" color="blue" :disabled="isDeleting || addBtnLoading" @click="addAccount">
          {{ addBtnLoading ? '添加中...' : '添加' }}
        </UButton>
        <UButton icon="i-lucide:arrow-down-to-line" color="blue" :loading="importBtnLoading" @click="importAccount">
          批量导入
          <input ref="fileRef" type="file" accept=".json" class="hidden" @change="handleFileChange" />
        </UButton>
        <UButton
          icon="i-lucide:arrow-up-from-line"
          color="blue"
          :loading="exportBtnLoading"
          :disabled="!hasSelectedRows"
          @click="exportAccount"
        >
          批量导出
        </UButton>
        <UButton
          color="rose"
          icon="i-lucide:user-minus"
          class="disabled:opacity-35"
          :loading="isDeleting"
          :disabled="!hasSelectedRows"
          @click="deleteSelectedAccounts"
          :ui="{ base: 'shrink-0 whitespace-nowrap' }"
          >删除</UButton
        >
        <UButton
          color="amber"
          icon="i-lucide:calendar-sync"
          class="disabled:opacity-35"
          :disabled="isDeleting || !hasSelectedRows"
          @click="openSetIncrementalCheckpoint"
          :ui="{ base: 'shrink-0 whitespace-nowrap' }"
          >设置增量停点</UButton
        >
        <UButton
          color="emerald"
          icon="i-lucide:circle-arrow-up"
          class="disabled:opacity-35"
          :disabled="isDeleting || isSyncing || !hasSelectedRows"
          @click="setCheckpointToNow"
          :ui="{ base: 'shrink-0 whitespace-nowrap' }"
          >从最新开始同步</UButton
        >
        <UButton
          color="orange"
          icon="i-lucide:rotate-ccw"
          class="disabled:opacity-35"
          :disabled="isDeleting || isSyncing || !hasSelectedRows"
          @click="clearCheckpointAndFullSync"
          :ui="{ base: 'shrink-0 whitespace-nowrap' }"
          >清空停点并全量同步</UButton
        >
        <UButton
          color="red"
          icon="i-lucide:wrench"
          class="disabled:opacity-35"
          :disabled="isDeleting || isSyncing || !hasSelectedRows"
          @click="repairSelectedAccounts"
          :ui="{ base: 'shrink-0 whitespace-nowrap' }"
          >修复文章明细</UButton
        >
        <UButton
          color="black"
          icon="i-heroicons:arrow-path-rounded-square-20-solid"
          class="disabled:opacity-35"
          :loading="isSyncing"
          :disabled="isDeleting || !hasSelectedRows"
          @click="loadSelectedAccountArticle"
          :ui="{ base: 'shrink-0 whitespace-nowrap' }"
          >同步</UButton
        >
        <USelectMenu
          v-model="syncMode"
          class="w-32 shrink-0"
          :options="[
            { label: '仅新增', value: 'incremental' },
            { label: '全量', value: 'full' },
          ]"
          value-attribute="value"
          option-attribute="label"
        />
        <div class="hidden xl:flex flex-1 min-w-[320px] justify-end">
          <span class="self-end text-right text-sm text-blue-500 font-medium">
            同步模式: {{ syncMode === 'incremental' ? '仅新增' : '全量' }} ｜ 同步范围: {{ getActualDateRange() }}
          </span>
        </div>
      </header>

      <!-- 数据表格 -->
      <ag-grid-vue
        style="width: 100%; height: 100%"
        :rowData="globalRowData"
        :columnDefs="columnDefs"
        :gridOptions="gridOptions"
        @grid-ready="onGridReady"
        @selection-changed="onSelectionChanged"
        @column-moved="onColumnStateChange"
        @column-visible="onColumnStateChange"
        @column-pinned="onColumnStateChange"
        @column-resized="onColumnStateChange"
      ></ag-grid-vue>
    </div>

    <!-- 添加公众号弹框 -->
    <GlobalSearchAccountDialog ref="searchAccountDialogRef" @select:account="onSelectAccount" />
  </div>
</template>
