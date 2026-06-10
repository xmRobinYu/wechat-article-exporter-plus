import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { AppMsgExWithFakeID } from '~/types/types';
import { getMysqlPool } from '~/server/utils/mysql';

interface ArticleRow extends RowDataPacket {
  id: string;
  fakeid: string;
  aid: string;
  appmsgid: number;
  itemidx: number;
  title: string;
  link: string;
  digest: string | null;
  cover: string | null;
  author_name: string | null;
  create_time: number;
  update_time: number;
  is_deleted: number;
  status: string;
  is_single: number;
  copyright_stat: number;
  copyright_type: number;
  is_pay_subscribe: number;
  item_show_type: number;
  wecoin_count: number;
}

function toId(fakeid: string, aid: string): string {
  return `${fakeid}:${aid}`;
}

function mapArticleRow(row: ArticleRow): AppMsgExWithFakeID {
  const cover = row.cover || '';
  return {
    fakeid: row.fakeid,
    _status: row.status || '',
    _single: Boolean(row.is_single),
    aid: row.aid,
    album_id: '',
    appmsg_album_infos: [],
    appmsgid: row.appmsgid,
    author_name: row.author_name || '',
    ban_flag: 0,
    checking: 0,
    copyright_stat: row.copyright_stat,
    copyright_type: row.copyright_type,
    cover,
    cover_img: cover,
    cover_img_theme_color: undefined,
    create_time: row.create_time,
    digest: row.digest || '',
    has_red_packet_cover: 0,
    is_deleted: Boolean(row.is_deleted),
    is_pay_subscribe: row.is_pay_subscribe,
    wecoin_count: row.wecoin_count,
    item_show_type: row.item_show_type,
    itemidx: row.itemidx,
    link: row.link,
    media_duration: '0:00',
    mediaapi_publish_status: 0,
    pic_cdn_url_1_1: cover,
    pic_cdn_url_3_4: cover,
    pic_cdn_url_16_9: cover,
    pic_cdn_url_235_1: cover,
    title: row.title,
    update_time: row.update_time,
  };
}

export async function upsertArticles(articles: AppMsgExWithFakeID[]): Promise<number> {
  if (articles.length === 0) return 0;
  const db = await getMysqlPool();
  let inserted = 0;
  for (const article of articles) {
    const [result] = await db.query<ResultSetHeader>(
      `
        INSERT INTO mp_articles (
          id, fakeid, aid, appmsgid, itemidx, title, link, digest, cover, author_name, create_time, update_time,
          is_deleted, status, is_single, copyright_stat, copyright_type, is_pay_subscribe, item_show_type, wecoin_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          title = VALUES(title),
          link = VALUES(link),
          digest = VALUES(digest),
          cover = VALUES(cover),
          author_name = VALUES(author_name),
          create_time = VALUES(create_time),
          update_time = VALUES(update_time),
          is_deleted = VALUES(is_deleted),
          status = VALUES(status),
          is_single = VALUES(is_single),
          copyright_stat = VALUES(copyright_stat),
          copyright_type = VALUES(copyright_type),
          is_pay_subscribe = VALUES(is_pay_subscribe),
          item_show_type = VALUES(item_show_type),
          wecoin_count = VALUES(wecoin_count)
      `,
      [
        toId(article.fakeid, article.aid),
        article.fakeid,
        article.aid,
        article.appmsgid,
        article.itemidx,
        article.title,
        article.link,
        article.digest || '',
        article.cover || article.cover_img || '',
        article.author_name || '',
        article.create_time,
        article.update_time,
        article.is_deleted ? 1 : 0,
        article._status || '',
        article._single ? 1 : 0,
        article.copyright_stat || 0,
        article.copyright_type || 0,
        article.is_pay_subscribe || 0,
        article.item_show_type || 0,
        article.wecoin_count || 0,
      ]
    );
    if (result.affectedRows === 1) {
      inserted++;
    }
  }
  return inserted;
}

export async function listArticlesByFakeidBefore(fakeid: string, createTime: number): Promise<AppMsgExWithFakeID[]> {
  const db = await getMysqlPool();
  const [rows] = await db.query<ArticleRow[]>(
    `
      SELECT id, fakeid, aid, appmsgid, itemidx, title, link, digest, cover, author_name, create_time, update_time,
             is_deleted, status, is_single, copyright_stat, copyright_type, is_pay_subscribe, item_show_type, wecoin_count
      FROM mp_articles
      WHERE fakeid = ? AND create_time < ?
      ORDER BY create_time DESC
    `,
    [fakeid, createTime]
  );
  return rows.map(mapArticleRow);
}

export async function hasArticleBefore(fakeid: string, createTime: number): Promise<boolean> {
  const db = await getMysqlPool();
  const [rows] = await db.query<RowDataPacket[]>(
    'SELECT 1 FROM mp_articles WHERE fakeid = ? AND create_time < ? LIMIT 1',
    [fakeid, createTime]
  );
  return rows.length > 0;
}

export async function getArticleByLinkFromDb(url: string, singleOnly = false): Promise<AppMsgExWithFakeID | undefined> {
  const db = await getMysqlPool();
  const [rows] = await db.query<ArticleRow[]>(
    `
      SELECT id, fakeid, aid, appmsgid, itemidx, title, link, digest, cover, author_name, create_time, update_time,
             is_deleted, status, is_single, copyright_stat, copyright_type, is_pay_subscribe, item_show_type, wecoin_count
      FROM mp_articles
      WHERE link = ? ${singleOnly ? 'AND fakeid = \'SINGLE_ARTICLE_FAKEID\'' : ''}
      ORDER BY update_time DESC
      LIMIT 1
    `,
    [url]
  );
  return rows[0] ? mapArticleRow(rows[0]) : undefined;
}

export async function updateArticleFieldsByLink(
  url: string,
  patch: Partial<Pick<AppMsgExWithFakeID, '_status' | 'is_deleted' | 'fakeid' | '_single' | 'title' | 'digest' | 'cover' | 'author_name' | 'update_time'>>
): Promise<void> {
  const sets: string[] = [];
  const values: Array<string | number> = [];

  if (patch._status !== undefined) {
    sets.push('status = ?');
    values.push(patch._status);
  }
  if (patch.is_deleted !== undefined) {
    sets.push('is_deleted = ?');
    values.push(patch.is_deleted ? 1 : 0);
  }
  if (patch.fakeid !== undefined) {
    sets.push('fakeid = ?');
    values.push(patch.fakeid);
  }
  if (patch._single !== undefined) {
    sets.push('is_single = ?');
    values.push(patch._single ? 1 : 0);
  }
  if (patch.title !== undefined) {
    sets.push('title = ?');
    values.push(patch.title);
  }
  if (patch.digest !== undefined) {
    sets.push('digest = ?');
    values.push(patch.digest);
  }
  if (patch.cover !== undefined) {
    sets.push('cover = ?');
    values.push(patch.cover);
  }
  if (patch.author_name !== undefined) {
    sets.push('author_name = ?');
    values.push(patch.author_name);
  }
  if (patch.update_time !== undefined) {
    sets.push('update_time = ?');
    values.push(patch.update_time);
  }

  if (sets.length === 0) return;

  const db = await getMysqlPool();
  await db.query(`UPDATE mp_articles SET ${sets.join(', ')} WHERE link = ?`, [...values, url]);
}

export async function deleteArticlesByFakeids(fakeids: string[]): Promise<void> {
  if (fakeids.length === 0) return;
  const db = await getMysqlPool();
  await db.query('DELETE FROM mp_articles WHERE fakeid IN (?)', [fakeids]);
}

export async function deleteArticleByLink(url: string): Promise<void> {
  const db = await getMysqlPool();
  await db.query('DELETE FROM mp_articles WHERE link = ?', [url]);
}
