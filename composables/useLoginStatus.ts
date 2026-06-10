import { request } from '#shared/utils/request';
import type { GetAuthKeyResult } from '~/types/types';

export default function useLoginStatus() {
  const loginAccount = useLoginAccount();

  async function refreshLoginStatus(): Promise<boolean> {
    if (!loginAccount.value) {
      return false;
    }

    try {
      const resp = await request<GetAuthKeyResult>('/api/public/v1/authkey');
      if (resp.code === 0) {
        return true;
      }
    } catch (error) {
      console.warn('登录态校验失败:', error);
    }

    loginAccount.value = null;
    return false;
  }

  return {
    refreshLoginStatus,
  };
}
