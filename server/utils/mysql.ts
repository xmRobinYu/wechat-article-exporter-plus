import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let initPromise: Promise<void> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: getRequiredEnv('MYSQL_HOST'),
      port: Number(process.env.MYSQL_PORT || 3306),
      database: getRequiredEnv('MYSQL_DATABASE'),
      user: getRequiredEnv('MYSQL_USER'),
      password: getRequiredEnv('MYSQL_PASSWORD'),
      waitForConnections: true,
      connectionLimit: 5,
      maxIdle: 5,
      idleTimeout: 60000,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function getMysqlPool(): Promise<mysql.Pool> {
  const instance = getPool();
  if (!initPromise) {
    initPromise = ensureSchema(instance);
  }
  await initPromise;
  return instance;
}

async function ensureSchema(db: mysql.Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mp_accounts (
      fakeid VARCHAR(64) NOT NULL PRIMARY KEY COMMENT '公众号 fakeid / 唯一标识',
      nickname VARCHAR(255) NULL COMMENT '公众号名称',
      round_head_img TEXT NULL COMMENT '公众号头像 URL',
      completed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已完整同步历史文章',
      count INT NOT NULL DEFAULT 0 COMMENT '已同步消息数',
      articles INT NOT NULL DEFAULT 0 COMMENT '已同步文章数',
      total_count INT NOT NULL DEFAULT 0 COMMENT '公众号文章总数',
      create_time INT NULL COMMENT '首次入库时间戳（秒）',
      update_time INT NULL COMMENT '最近一次同步时间戳（秒）',
      last_update_time INT NULL COMMENT '最近一次首页同步开始时间戳（秒）',
      latest_synced_article_time INT NULL COMMENT '增量同步停点：当前已同步到的最新文章发布时间戳（秒）',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '数据库创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '数据库更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公众号元数据表'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS mp_articles (
      id VARCHAR(160) NOT NULL PRIMARY KEY COMMENT '主键，格式为 fakeid:aid',
      fakeid VARCHAR(64) NOT NULL COMMENT '所属公众号 fakeid',
      aid VARCHAR(128) NOT NULL COMMENT '微信文章 aid',
      appmsgid BIGINT NOT NULL COMMENT '微信文章 appmsgid',
      itemidx INT NOT NULL DEFAULT 1 COMMENT '同一消息中的文章序号',
      title VARCHAR(500) NOT NULL COMMENT '文章标题',
      link TEXT NOT NULL COMMENT '文章链接',
      digest TEXT NULL COMMENT '文章摘要',
      cover TEXT NULL COMMENT '文章封面 URL',
      author_name VARCHAR(255) NULL COMMENT '作者名',
      create_time INT NOT NULL COMMENT '文章创建时间戳（秒）',
      update_time INT NOT NULL COMMENT '文章发布时间/更新时间戳（秒）',
      is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '文章是否已删除',
      status VARCHAR(64) NOT NULL DEFAULT '' COMMENT '抓取状态，如正常/已删除/异常',
      is_single TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否来自单篇文章下载入口',
      copyright_stat INT NOT NULL DEFAULT 0 COMMENT '版权状态',
      copyright_type INT NOT NULL DEFAULT 0 COMMENT '版权类型',
      is_pay_subscribe INT NOT NULL DEFAULT 0 COMMENT '是否为付费文章',
      item_show_type INT NOT NULL DEFAULT 0 COMMENT '文章展示类型',
      wecoin_count INT NOT NULL DEFAULT 0 COMMENT '付费微币数量',
      UNIQUE KEY uk_mp_articles_link (fakeid, aid),
      KEY idx_mp_articles_fakeid_create_time (fakeid, create_time),
      KEY idx_mp_articles_link (link(255)),
      CONSTRAINT fk_mp_articles_account FOREIGN KEY (fakeid) REFERENCES mp_accounts(fakeid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公众号文章元数据表'
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS mp_cookies (
      auth_key VARCHAR(128) NOT NULL PRIMARY KEY COMMENT '登录态 auth-key',
      token VARCHAR(255) NOT NULL COMMENT '公众号后台 token',
      cookies_json JSON NOT NULL COMMENT '登录 cookie JSON',
      expires_at TIMESTAMP NULL COMMENT '过期时间',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '数据库创建时间',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '数据库更新时间'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公众号登录态存储表'
  `);

  await db.query(`
    ALTER TABLE mp_accounts COMMENT = '公众号元数据表'
  `);
  await db.query(`
    ALTER TABLE mp_accounts
      MODIFY fakeid VARCHAR(64) NOT NULL COMMENT '公众号 fakeid / 唯一标识',
      MODIFY nickname VARCHAR(255) NULL COMMENT '公众号名称',
      MODIFY round_head_img TEXT NULL COMMENT '公众号头像 URL',
      MODIFY completed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已完整同步历史文章',
      MODIFY count INT NOT NULL DEFAULT 0 COMMENT '已同步消息数',
      MODIFY articles INT NOT NULL DEFAULT 0 COMMENT '已同步文章数',
      MODIFY total_count INT NOT NULL DEFAULT 0 COMMENT '公众号文章总数',
      MODIFY create_time INT NULL COMMENT '首次入库时间戳（秒）',
      MODIFY update_time INT NULL COMMENT '最近一次同步时间戳（秒）',
      MODIFY last_update_time INT NULL COMMENT '最近一次首页同步开始时间戳（秒）',
      MODIFY latest_synced_article_time INT NULL COMMENT '增量同步停点：当前已同步到的最新文章发布时间戳（秒）',
      MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '数据库创建时间',
      MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '数据库更新时间'
  `);

  await db.query(`
    ALTER TABLE mp_articles COMMENT = '公众号文章元数据表'
  `);
  await db.query(`
    ALTER TABLE mp_articles
      MODIFY id VARCHAR(160) NOT NULL COMMENT '主键，格式为 fakeid:aid',
      MODIFY fakeid VARCHAR(64) NOT NULL COMMENT '所属公众号 fakeid',
      MODIFY aid VARCHAR(128) NOT NULL COMMENT '微信文章 aid',
      MODIFY appmsgid BIGINT NOT NULL COMMENT '微信文章 appmsgid',
      MODIFY itemidx INT NOT NULL DEFAULT 1 COMMENT '同一消息中的文章序号',
      MODIFY title VARCHAR(500) NOT NULL COMMENT '文章标题',
      MODIFY link TEXT NOT NULL COMMENT '文章链接',
      MODIFY digest TEXT NULL COMMENT '文章摘要',
      MODIFY cover TEXT NULL COMMENT '文章封面 URL',
      MODIFY author_name VARCHAR(255) NULL COMMENT '作者名',
      MODIFY create_time INT NOT NULL COMMENT '文章创建时间戳（秒）',
      MODIFY update_time INT NOT NULL COMMENT '文章发布时间/更新时间戳（秒）',
      MODIFY is_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '文章是否已删除',
      MODIFY status VARCHAR(64) NOT NULL DEFAULT '' COMMENT '抓取状态，如正常/已删除/异常',
      MODIFY is_single TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否来自单篇文章下载入口',
      MODIFY copyright_stat INT NOT NULL DEFAULT 0 COMMENT '版权状态',
      MODIFY copyright_type INT NOT NULL DEFAULT 0 COMMENT '版权类型',
      MODIFY is_pay_subscribe INT NOT NULL DEFAULT 0 COMMENT '是否为付费文章',
      MODIFY item_show_type INT NOT NULL DEFAULT 0 COMMENT '文章展示类型',
      MODIFY wecoin_count INT NOT NULL DEFAULT 0 COMMENT '付费微币数量'
  `);

  await db.query(`
    ALTER TABLE mp_cookies COMMENT = '公众号登录态存储表'
  `);
  await db.query(`
    ALTER TABLE mp_cookies
      MODIFY auth_key VARCHAR(128) NOT NULL COMMENT '登录态 auth-key',
      MODIFY token VARCHAR(255) NOT NULL COMMENT '公众号后台 token',
      MODIFY cookies_json JSON NOT NULL COMMENT '登录 cookie JSON',
      MODIFY expires_at TIMESTAMP NULL COMMENT '过期时间',
      MODIFY created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '数据库创建时间',
      MODIFY updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '数据库更新时间'
  `);
}
