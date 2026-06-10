import { getAccount } from '~/server/repositories/accounts';

export default defineEventHandler(async event => {
  const fakeid = getRouterParam(event, 'fakeid');
  if (!fakeid) {
    throw createError({ statusCode: 400, statusMessage: 'fakeid is required' });
  }
  return await getAccount(fakeid);
});
