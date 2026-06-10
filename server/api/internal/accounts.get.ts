import { listAccounts } from '~/server/repositories/accounts';

export default defineEventHandler(async () => {
  return await listAccounts();
});
