import type { MpAccount } from '~/store/v2/info';
import { upsertAccount } from '~/server/repositories/accounts';

export default defineEventHandler(async event => {
  const body = await readBody<MpAccount>(event);
  await upsertAccount(body);
  return { ok: true };
});
