import { request } from '#shared/utils/request';
import type { AppMsgExWithFakeID, PublishInfo, PublishPage } from '~/types/types';
import { db } from './db';
import { type MpAccount, updateInfoCache, updateLatestSyncedArticleTime } from './info';

export type ArticleAsset = AppMsgExWithFakeID;

export async function persistArticles(articles: AppMsgExWithFakeID[]): Promise<void> {
  if (articles.length === 0) return;
  for (const article of articles) {
    await db.article.put(article, `${article.fakeid}:${article.aid}`);
  }
  await request('/api/internal/articles/upsert', {
    method: 'POST',
    body: {
      articles,
    },
  });
}

/**
 * 更新文章缓存
 * @param account
 * @param publish_page
 */
export async function updateArticleCache(account: MpAccount, publish_page: PublishPage) {
  const publish_list = publish_page.publish_list.filter(item => !!item.publish_info);
  const latestArticleTime = publish_list
    .flatMap(item => {
      const publish_info: PublishInfo = JSON.parse(item.publish_info);
      return publish_info.appmsgex.map(article => article.update_time || article.create_time || 0);
    })
    .reduce((max, current) => Math.max(max, current), 0);

  await db.transaction('rw', ['article', 'info'], async () => {
    const keys = await db.article.toCollection().keys();

    const fakeid = account.fakeid;
    const total_count = publish_page.total_count;

    // 统计本次缓存成功新增的数量
    let msgCount = 0;
    let articleCount = 0;

    for (const item of publish_list) {
      const publish_info: PublishInfo = JSON.parse(item.publish_info);
      let newEntryCount = 0;

      for (const article of publish_info.appmsgex) {
        const key = await db.article.put({ ...article, fakeid, _status: '' }, `${fakeid}:${article.aid}`);
        if (!keys.includes(key)) {
          newEntryCount++;
          articleCount++;
        }
      }

      if (newEntryCount > 0) {
        // 新增成功
        msgCount++;
      }
    }

    await updateInfoCache({
      fakeid: fakeid,
      completed: publish_list.length === 0,
      count: msgCount,
      articles: articleCount,
      nickname: account.nickname,
      round_head_img: account.round_head_img,
      total_count: total_count,
      latest_synced_article_time: latestArticleTime || undefined,
    });
  });

  if (latestArticleTime > 0) {
    await updateLatestSyncedArticleTime(account.fakeid, latestArticleTime);
  }

  const fakeid = account.fakeid;
  const remoteArticles = publish_list.flatMap(item => {
    const publish_info: PublishInfo = JSON.parse(item.publish_info);
    return publish_info.appmsgex.map(article => ({ ...article, fakeid, _status: '' }));
  });
  await persistArticles(remoteArticles);
}

/**
 * 检查是否存在指定时间之前的缓存
 * @param fakeid 公众号id
 * @param create_time 创建时间
 */
export async function hitCache(fakeid: string, create_time: number): Promise<boolean> {
  const count = await db.article.where('fakeid').equals(fakeid).and(article => article.create_time < create_time).count();
  if (count > 0) {
    return true;
  }
  const resp = await request<{ hit: boolean }>(
    `/api/internal/articles/before?fakeid=${encodeURIComponent(fakeid)}&create_time=${create_time}&mode=hit`
  );
  return resp.hit;
}

/**
 * 读取缓存中的指定时间之前的历史文章
 * @param fakeid 公众号id
 * @param create_time 创建时间
 */
export async function getArticleCache(fakeid: string, create_time: number): Promise<AppMsgExWithFakeID[]> {
  const local = await db.article
    .where('fakeid')
    .equals(fakeid)
    .and(article => article.create_time < create_time)
    .reverse()
    .sortBy('create_time');
  if (local.length > 0) {
    return local;
  }
  const remote = await request<AppMsgExWithFakeID[]>(
    `/api/internal/articles/before?fakeid=${encodeURIComponent(fakeid)}&create_time=${create_time}`
  );
  if (remote.length > 0) {
    for (const article of remote) {
      await db.article.put(article, `${article.fakeid}:${article.aid}`);
    }
  }
  return remote;
}

/**
 * 根据 url 获取文章对象
 * @param url
 */
export async function getArticleByLink(url: string): Promise<AppMsgExWithFakeID> {
  const article = await db.article.where('link').equals(url).first();
  if (article) {
    return article;
  }
  const remote = await request<AppMsgExWithFakeID | null>(`/api/internal/articles/link?url=${encodeURIComponent(url)}`);
  if (!remote) {
    throw new Error(`Article(${url}) does not exist`);
  }
  await db.article.put(remote, `${remote.fakeid}:${remote.aid}`);
  return remote;
}

// 根据 url 获取 SINGLE_ARTICLE_FAKEID 文章对象
export async function getSingleArticleByLink(url: string): Promise<AppMsgExWithFakeID> {
  const article = await db.article
    .where('link')
    .equals(url)
    .and(article => article.fakeid === 'SINGLE_ARTICLE_FAKEID')
    .first();
  if (article) {
    return article;
  }
  const remote = await request<AppMsgExWithFakeID | null>(
    `/api/internal/articles/link?url=${encodeURIComponent(url)}&single=true`
  );
  if (!remote) {
    throw new Error(`Article(${url}) does not exist`);
  }
  await db.article.put(remote, `${remote.fakeid}:${remote.aid}`);
  return remote;
}

/**
 * 文章被删除
 * @param url
 * @param is_deleted
 */
export async function articleDeleted(url: string, is_deleted = true): Promise<void> {
  await db.transaction('rw', 'article', async () => {
    await db.article
      .where('link')
      .equals(url)
      .modify(article => {
        article.is_deleted = is_deleted;
      });
  });
  await request('/api/internal/articles/patch', {
    method: 'POST',
    body: {
      url,
      patch: {
        is_deleted,
      },
    },
  });
}

/**
 * 更新文章状态
 * @param url
 * @param status
 */
export async function updateArticleStatus(url: string, status: string): Promise<void> {
  await db.transaction('rw', 'article', async () => {
    await db.article
      .where('link')
      .equals(url)
      .modify(article => {
        article._status = status;
      });
  });
  await request('/api/internal/articles/patch', {
    method: 'POST',
    body: {
      url,
      patch: {
        _status: status,
      },
    },
  });
}

/**
 * 更新文章的fakeid
 * @param url
 * @param fakeid
 */
export async function updateArticleFakeid(url: string, fakeid: string): Promise<void> {
  await db.transaction('rw', 'article', async () => {
    await db.article
      .where('link')
      .equals(url)
      .and(article => article.fakeid === 'SINGLE_ARTICLE_FAKEID')
      .modify(article => {
        article.fakeid = fakeid;

        // 标记改数据是【单篇文章下载】添加的
        article._single = true;
      });
  });
  await request('/api/internal/articles/patch', {
    method: 'POST',
    body: {
      url,
      patch: {
        fakeid,
        _single: true,
      },
    },
  });
}
