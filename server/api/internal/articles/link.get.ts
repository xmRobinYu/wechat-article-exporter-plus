import { getArticleByLinkFromDb } from '~/server/repositories/articles';

interface Query {
  url: string;
  single?: string;
}

export default defineEventHandler(async event => {
  const query = getQuery<Query>(event);
  if (!query.url) {
    throw createError({ statusCode: 400, statusMessage: 'url is required' });
  }
  return await getArticleByLinkFromDb(query.url, query.single === 'true');
});
