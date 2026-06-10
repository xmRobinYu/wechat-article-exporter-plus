<p align="center">
  <img src="./assets/logo.svg" alt="Logo">
</p>

# wechat-article-exporter

![GitHub stars]
![GitHub forks]
![GitHub License]
![Package Version]


一款在线的 **微信公众号文章批量下载** 工具，支持导出阅读量与评论数据，无需搭建任何环境，可通过 [在线网站] 使用，同时也支持 docker 私有化部署和 Cloudflare 部署。

支持下载各种文件格式，其中 HTML 格式可100%还原文章排版与样式。

> [!TIP]
> **想要更稳定、更省心的开箱体验？** 试试本项目的商业版 —— **[公号三刀 →](https://wechat.zoro.build)**
> 自带高速抓取通道，**无需自建代理、也不用抢公共节点的每日额度**，注册即用；功能更全、更新更及时。

交流群(QQ):
- `991482155` 1群已满
- `775909845` 2群已满
- `814249342` 3群

## :bell: 重要告知：项目域名调整
项目域名调整如下：

|     | 下载站                            | 文档站                        |
|-----|--------------------------------|----------------------------|
| 调整后 | https://down.mptext.top        | https://docs.mptext.top    |
| 调整前 | https://exporter.wxdown.online | https://docs.wxdown.online |

具体细节可以查看 [这里](https://docs.mptext.top/misc/domain.html)。


## :books: 如何使用？

该工具的使用教程已移至 [文档站点](https://docs.mptext.top)。

## :rocket: 本地启动建议

当前仓库在这台机器上使用 `yarn dev` 时，偶发会出现 Nuxt / Vite 前端产物失配，表现为空白页。

因此，日常本地使用更推荐下面这种方式：

```bash
yarn build
node .output/server/index.mjs
```

说明：

- 该启动方式更稳定
- 服务默认监听 `3000` 端口
- 推荐直接访问：
  - `http://127.0.0.1:3000/dashboard/account`

如果只是改前端样式或做开发调试，也可以使用：

```bash
yarn dev
```

但如果遇到空白页，通常需要清理以下目录后重新启动：

```bash
rm -rf .nuxt .output node_modules/.vite
```

## :floppy_disk: 元数据持久化与增量同步

当前仓库支持将公众号元数据与文章元数据持久化到 MySQL，用于避免重复同步历史文章。

- `mp_accounts`：保存公众号列表、同步进度、增量同步停点
- `mp_articles`：保存已同步过的文章元数据
- `mp_cookies`：保存登录态 cookie / token

说明：

- HTML、图片、资源、评论正文等大文件内容**不写入 MySQL**
- MySQL 主要保存“账号 + 文章清单 + 登录态”这类轻量元数据

增量同步规则：

- 首次同步某公众号时，按正常流程同步
- 同步完成后，系统会记录该公众号的“增量同步停点”
- 后续在 `仅新增` 模式下同步时，只会继续抓取停点之后的新文章
- 如果切换到 `全量` 模式，则会临时忽略停点，重新同步历史文章

公众号管理页支持：

- 设置增量停点
- 从最新开始同步
- 清空停点并全量同步
- 同步模式切换：`仅新增` / `全量`

文章下载页支持：

- 顶部按发布时间范围筛选
- 表头筛选
- 抓取 / 导出范围规则：
  - 有选中时，作用于选中文章
  - 无选中时，作用于当前筛选结果

## :white_check_mark: 验收清单

可以按下面顺序快速验证当前能力：

1. 配置 `.env` 中的 MySQL 连接并启动服务
2. 在“公众号管理”里添加一个公众号并完成首次同步
3. 确认 MySQL 中出现该公众号的 `mp_accounts` 记录和对应 `mp_articles` 记录
4. 将同步模式切换为 `仅新增`，再次同步，确认不会重复回溯历史文章
5. 点击“从最新开始同步”，确认后续只会抓取新发文章
6. 点击“清空停点并全量同步”，确认会重新执行全量同步
7. 在“文章下载”页设置发布时间范围或表头筛选
8. 不手动选中任何文章，直接执行抓取/导出，确认作用于当前筛选结果
9. 点击“全选当前筛选结果”，确认选中范围与当前显示结果一致


## :dart: 特性

- [x] 搜索公众号，支持关键字搜索
- [x] 支持导出 html/json/excel/txt/md/docx 格式(html 格式打包了图片和样式文件，能够保证100%还原文章样式)
- [x] 缓存文章列表数据，减少接口请求次数
- [x] 支持文章过滤，包括作者、标题、发布时间、原创标识、所属合集等
- [x] 支持合集下载
- [x] 支持图片分享消息
- [x] 支持视频分享消息
- [x] 支持导出评论、评论回复、阅读量、转发量等数据 (需要抓包获取 credentials 信息，[查看操作步骤](https://docs.mptext.top/advanced/wxdown-service.html))
- [x] 支持 Docker 部署
- [x] 支持 Cloudflare 部署
- [x] 开放 API 接口


## :heart: 感谢

- 感谢 [Deno Deploy]、[Cloudflare Workers] 提供免费托管服务
- 感谢 [WeChat_Article] 项目提供原理思路


## :star: 支持

如果你觉得本项目帮助到了你，请给作者一个免费的 Star，感谢你的支持！


## :bulb: 原理

在公众号后台写文章时支持搜索其他公众号的文章功能，以此来实现抓取指定公众号所有文章的目的。


## :memo: 许可

MIT

## :red_circle: 声明

本程序承诺，不会利用您扫码登录的公众号进行任何形式的私有爬虫，也就是说不存在把你的账号作为公共账号为别人爬取文章的行为，也不存在类似账号池的东西。

您的公众号只会服务于您自己的抓取文章的目的。

通过本程序获取的公众号文章内容，版权归文章原作者所有，请合理使用。若发现侵权行为，请联系我们处理。


## :chart_with_upwards_trend: Star 历史

[![Star History Chart]][Star History Chart Link]



<!-- Definitions -->

[GitHub stars]: https://img.shields.io/github/stars/wechat-article/wechat-article-exporter?style=social&label=Star&style=plastic

[GitHub forks]: https://img.shields.io/github/forks/wechat-article/wechat-article-exporter?style=social&label=Fork&style=plastic

[GitHub License]: https://img.shields.io/github/license/wechat-article/wechat-article-exporter?label=License

[Package Version]: https://img.shields.io/github/package-json/v/wechat-article/wechat-article-exporter


[Deno Deploy]: https://deno.com/deploy

[Cloudflare Workers]: https://workers.cloudflare.com

[Wechat_Article]: https://github.com/1061700625/WeChat_Article

[Star History Chart]: https://api.star-history.com/svg?repos=wechat-article/wechat-article-exporter&type=Timeline

[Star History Chart Link]: https://star-history.com/#wechat-article/wechat-article-exporter&Timeline

[在线网站]: https://down.mptext.top
