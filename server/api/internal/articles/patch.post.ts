import { updateArticleFieldsByLink } from '~/server/repositories/articles';

interface Body {
  url: string;
  patch: Record<string, any>;
}

export default defineEventHandler(async event => {
  const body = await readBody<Body>(event);
  if (!body.url) {
    throw createError({ statusCode: 400, statusMessage: 'url is required' });
  }
  await updateArticleFieldsByLink(body.url, body.patch || {});
  return { ok: true };
});
