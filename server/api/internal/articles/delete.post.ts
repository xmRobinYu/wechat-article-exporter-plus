import { deleteArticleByLink } from '~/server/repositories/articles';

interface Body {
  url: string;
}

export default defineEventHandler(async event => {
  const body = await readBody<Body>(event);
  if (!body.url) {
    throw createError({ statusCode: 400, statusMessage: 'url is required' });
  }
  await deleteArticleByLink(body.url);
  return { ok: true };
});
