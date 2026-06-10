import { deleteAccounts } from '~/server/repositories/accounts';
import { deleteArticlesByFakeids } from '~/server/repositories/articles';

interface DeleteBody {
  fakeids: string[];
}

export default defineEventHandler(async event => {
  const body = await readBody<DeleteBody>(event);
  const fakeids = body.fakeids || [];
  await deleteArticlesByFakeids(fakeids);
  await deleteAccounts(fakeids);
  return { ok: true };
});
