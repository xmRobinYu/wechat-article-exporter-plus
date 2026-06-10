import type { RowDataPacket } from 'mysql2';
import type { MpAccount } from '~/store/v2/info';
import { getMysqlPool } from '~/server/utils/mysql';

interface AccountRow extends RowDataPacket {
  fakeid: string;
  nickname: string | null;
  round_head_img: string | null;
  completed: number;
  count: number;
  articles: number;
  total_count: number;
  create_time: number | null;
  update_time: number | null;
  last_update_time: number | null;
  latest_synced_article_time: number | null;
}

function mapAccountRow(row: AccountRow): MpAccount {
  return {
    fakeid: row.fakeid,
    nickname: row.nickname || undefined,
    round_head_img: row.round_head_img || undefined,
    completed: Boolean(row.completed),
    count: row.count,
    articles: row.articles,
    total_count: row.total_count,
    create_time: row.create_time || undefined,
    update_time: row.update_time || undefined,
    last_update_time: row.last_update_time || undefined,
    latest_synced_article_time: row.latest_synced_article_time || undefined,
  };
}

export async function listAccounts(): Promise<MpAccount[]> {
  const db = await getMysqlPool();
  const [rows] = await db.query<AccountRow[]>(
    'SELECT fakeid, nickname, round_head_img, completed, count, articles, total_count, create_time, update_time, last_update_time, latest_synced_article_time FROM mp_accounts ORDER BY COALESCE(update_time, create_time, 0) DESC'
  );
  return rows.map(mapAccountRow);
}

export async function getAccount(fakeid: string): Promise<MpAccount | undefined> {
  const db = await getMysqlPool();
  const [rows] = await db.query<AccountRow[]>(
    'SELECT fakeid, nickname, round_head_img, completed, count, articles, total_count, create_time, update_time, last_update_time, latest_synced_article_time FROM mp_accounts WHERE fakeid = ? LIMIT 1',
    [fakeid]
  );
  return rows[0] ? mapAccountRow(rows[0]) : undefined;
}

export async function upsertAccount(account: MpAccount): Promise<void> {
  const db = await getMysqlPool();
  const now = Math.round(Date.now() / 1000);
  await db.query(
    `
      INSERT INTO mp_accounts (
        fakeid, nickname, round_head_img, completed, count, articles, total_count, create_time, update_time, last_update_time, latest_synced_article_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        nickname = VALUES(nickname),
        round_head_img = VALUES(round_head_img),
        completed = VALUES(completed),
        count = VALUES(count),
        articles = VALUES(articles),
        total_count = VALUES(total_count),
        create_time = COALESCE(mp_accounts.create_time, VALUES(create_time)),
        update_time = VALUES(update_time),
        last_update_time = VALUES(last_update_time),
        latest_synced_article_time = GREATEST(COALESCE(mp_accounts.latest_synced_article_time, 0), COALESCE(VALUES(latest_synced_article_time), 0))
    `,
    [
      account.fakeid,
      account.nickname || null,
      account.round_head_img || null,
      account.completed ? 1 : 0,
      account.count,
      account.articles,
      account.total_count,
      account.create_time || now,
      account.update_time || now,
      account.last_update_time || null,
      account.latest_synced_article_time || null,
    ]
  );
}

export async function deleteAccounts(fakeids: string[]): Promise<void> {
  if (fakeids.length === 0) return;
  const db = await getMysqlPool();
  await db.query('DELETE FROM mp_accounts WHERE fakeid IN (?)', [fakeids]);
}
