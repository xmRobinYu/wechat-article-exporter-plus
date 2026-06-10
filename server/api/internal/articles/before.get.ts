import { hasArticleBefore, listArticlesByFakeidBefore } from '~/server/repositories/articles';

interface Query {
  fakeid: string;
  create_time: string;
  mode?: 'list' | 'hit';
}

export default defineEventHandler(async event => {
  const query = getQuery<Query>(event);
  const fakeid = query.fakeid;
  const createTime = Number(query.create_time || 0);
  if (!fakeid || !createTime) {
    throw createError({ statusCode: 400, statusMessage: 'fakeid and create_time are required' });
  }

  if (query.mode === 'hit') {
    return { hit: await hasArticleBefore(fakeid, createTime) };
  }

  return await listArticlesByFakeidBefore(fakeid, createTime);
});
