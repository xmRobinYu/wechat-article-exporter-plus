import type { AppMsgExWithFakeID } from '~/types/types';
import { upsertArticles } from '~/server/repositories/articles';

interface Body {
  articles: AppMsgExWithFakeID[];
}

export default defineEventHandler(async event => {
  const body = await readBody<Body>(event);
  const count = await upsertArticles(body.articles || []);
  return { ok: true, inserted: count };
});
