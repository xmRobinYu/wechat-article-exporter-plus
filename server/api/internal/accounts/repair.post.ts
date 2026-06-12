import { upsertAccount } from '~/server/repositories/accounts';
import { upsertArticles } from '~/server/repositories/articles';
import { getTokenFromStore } from '~/server/utils/CookieStore';
import { proxyMpRequest } from '~/server/utils/proxy-request';
import type { AppMsgExWithFakeID, PublishInfo, PublishPage } from '~/types/types';

interface RepairBody {
  fakeids: string[];
}

interface AppMsgPublishQuery {
  begin?: number;
  size?: number;
  id: string;
  keyword: string;
}

async function fetchPublishPage(event: any, fakeid: string, begin = 0, size = 5) {
  const token = await getTokenFromStore(event);
  if (!token) {
    throw new Error('未登录或登录已过期，请重新扫码登录');
  }

  const params: Record<string, string | number> = {
    sub: 'list',
    search_field: 'null',
    begin,
    count: size,
    query: '',
    fakeid,
    type: '101_1',
    free_publish_type: 1,
    sub_action: 'list_ex',
    token,
    lang: 'zh_CN',
    f: 'json',
    ajax: 1,
  };

  return await proxyMpRequest({
    event,
    method: 'GET',
    endpoint: 'https://mp.weixin.qq.com/cgi-bin/appmsgpublish',
    query: params as AppMsgPublishQuery,
    parseJson: true,
  });
}

export default defineEventHandler(async event => {
  const body = await readBody<RepairBody>(event);
  const fakeids = body.fakeids || [];
  const repaired: Array<{ fakeid: string; inserted: number }> = [];

  for (const fakeid of fakeids) {
    let begin = 0;
    let inserted = 0;
    let latestSyncedArticleTime = 0;

    for (let page = 0; page < 50; page++) {
      const resp = await fetchPublishPage(event, fakeid, begin, 5);
      if (!resp?.base_resp || resp.base_resp.ret !== 0) {
        throw new Error(`${fakeid} 获取文章列表失败: ${resp?.base_resp?.err_msg || 'unknown error'}`);
      }

      const publishPage: PublishPage = JSON.parse(resp.publish_page);
      const publishList = publishPage.publish_list.filter(item => !!item.publish_info);
      if (publishList.length === 0) {
        break;
      }

      const articles: AppMsgExWithFakeID[] = publishList.flatMap(item => {
        const publishInfo: PublishInfo = JSON.parse(item.publish_info);
        return publishInfo.appmsgex.map(article => {
          latestSyncedArticleTime = Math.max(latestSyncedArticleTime, article.update_time || article.create_time || 0);
          return { ...article, fakeid, _status: '' };
        });
      });

      inserted += await upsertArticles(articles);
      begin += publishList
        .flatMap(item => {
          const publishInfo: PublishInfo = JSON.parse(item.publish_info);
          return publishInfo.appmsgex.filter(article => article.itemidx === 1);
        })
        .length;

      await upsertAccount({
        fakeid,
        completed: false,
        count: begin,
        articles: begin,
        total_count: publishPage.total_count,
        latest_synced_article_time: latestSyncedArticleTime || undefined,
      });
    }

    repaired.push({ fakeid, inserted });
  }

  return { ok: true, repaired };
});
