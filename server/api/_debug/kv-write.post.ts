import { cookieStore } from '~/server/utils/CookieStore';

export default defineEventHandler(async event => {
  if (process.env.NODE_ENV !== 'development') {
    setResponseStatus(event, 404);
    return { ok: false };
  }

  const authKey = `debug-${Date.now()}`;
  const token = 'debug-token';
  const cookies = ['debug_cookie=debug-value; Path=/; HttpOnly'];
  const ok = await cookieStore.setCookie(authKey, token, cookies);

  return {
    ok,
    authKey,
  };
});
