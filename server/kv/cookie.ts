import type { RowDataPacket } from 'mysql2';
import { type CookieEntity } from '~/server/utils/CookieStore';
import { getMysqlPool } from '~/server/utils/mysql';

export type CookieKVKey = string;

export interface CookieKVValue {
  token: string;
  cookies: CookieEntity[];
}

export async function setMpCookie(key: CookieKVKey, data: CookieKVValue): Promise<boolean> {
  try {
    const db = await getMysqlPool();
    await db.query(
      `
        INSERT INTO mp_cookies (auth_key, token, cookies_json, expires_at)
        VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 4 DAY))
        ON DUPLICATE KEY UPDATE
          token = VALUES(token),
          cookies_json = VALUES(cookies_json),
          expires_at = VALUES(expires_at)
      `,
      [key, data.token, JSON.stringify(data.cookies)]
    );
    return true;
  } catch (err) {
    console.error('kv.set call failed:', err);
    return false;
  }
}

export async function getMpCookie(key: CookieKVKey): Promise<CookieKVValue | null> {
  const db = await getMysqlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT token, cookies_json FROM mp_cookies WHERE auth_key = ? AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1',
    [key]
  );
  if (rows.length === 0) {
    return null;
  }
  const row = rows[0];
  const rawCookies = row.cookies_json;
  const cookies = typeof rawCookies === 'string' ? JSON.parse(rawCookies) : rawCookies;
  return {
    token: row.token as string,
    cookies: cookies as CookieEntity[],
  };
}
