# Jessie 的云端求职台账

保留原有 GitHub Pages 界面，使用 Supabase Auth 登录和 PostgreSQL RLS 保存、保护台账。

## 首次使用

1. 打开网站，点击“开启旅程”，用 Supabase Authentication → Users 中创建的邮箱和密码登录。
2. 第一次登录只读取云端，不会自动上传、清空或覆盖原浏览器台账。
3. 点击“导入 JSON 备份”，选择原网站导出的备份。核对岗位和素材数量后确认导入。也可在原浏览器点击“迁移原浏览器台账”。
4. 等待顶部显示“已保存到云端”，再换设备登录验证。

所有设备登录同一个所有者账号即可查看和编辑。打开网页或点击“读取云端”获取最新版本；当前不做后台实时刷新，以免打断编辑。

## 朋友查看

1. 在 Supabase Authentication → Users 中创建朋友账号，确认邮箱（Auto Confirm User）。
2. 所有者在网站点击“查看授权”，填写朋友账号的 User UID，授予只读权限。
3. 将同一个网站地址和登录方式私下交给朋友。对方可以查看、复制和导出台账，无法新增、修改、删除或上传备份。
4. 所有者可以撤销授权。数据库会拒绝后续访问，但无法收回已经查看或下载的副本。

## 保存与故障恢复

- 只有云端写入成功后才提示保存成功。
- 请求超时或断网时，未保存内容留在当前页面，并尽可能保存为所有者专用本机草稿。可重试保存或导出。
- 多设备同时编辑时使用 revision 条件更新。旧设备不能直接覆盖新设备的数据；先导出自己的草稿，再读取云端并手动合并。
- 恢复草稿时保留草稿的旧 revision，仍然检查冲突。
- 刷新页面不会自动上传草稿。原 localStorage 数据保留，只有所有者登录成功后才提供显式迁移入口。
- 退出登录会清除页面中的岗位、素材和编辑表单。登录会话由 Supabase SDK 保存在浏览器中，请在共用设备上退出登录。
- 免费项目可能因不活跃而暂停，需要在 Supabase 控制台恢复。定期导出 JSON 自行备份。

## 配置和权限

`cloud-ui.js` 只包含 Project URL、Publishable key 和所有者 UID。这些是公开配置，不包含管理员密钥或数据库密码。

数据库需要已经执行的 `job_tracker_documents` 和 `job_tracker_viewers` 建表及 RLS 脚本。只有 authenticated 角色获得相应表权限：所有者可修改自己的文档、管理查看授权；已授权账号只可读取文档；anon 无表访问权限。

更换所有者时，需要同步调整云端记录 owner_id 和 `CLOUD_CONFIG.owner`，不能只更改网页配置。不要将 service_role、Secret key、数据库密码或用户备份提交到仓库。

AI 服务商配置和 API Key 继续仅保存在本机，不上传 Supabase，不包含在 JSON 备份中。AI 调用保持原有直连服务商的方式。

## 手动上传更新

1. 解压更新包，不要直接上传 ZIP。
2. 打开原仓库的 Code 页面，确认分支为 main，点击 Add file → Upload files。
3. 将解压后的全部文件及文件夹拖入上传区域，包括 assets、vendor 和“熊心悦的秋招台账_GitHub版”文件夹。不要只上传 index.html，也不要拖入最外层包装文件夹。
4. 点击 Commit changes，提交到 main 分支；等待 GitHub Pages 部署完成。
5. 打开原网址并强制刷新；点击“开启旅程”后应看到登录表单。
6. 用刚创建的台账邮箱和密码登录，选择 JSON 备份并确认导入，等待“已保存到云端”。

## 发布与验证

网站为静态 HTML/JS，无构建步骤。部署时保留 `index.html`、`app.js`、`cloud-ui.js`、`cloud-store.js`、`styles.css`、`assets/`、`vendor/` 和 `.nojekyll`。

仓库原有的两份 tracker-source.json 已在当前版本替换为空对象，避免继续通过网站发布旧数据；Git 历史中曾提交过的数据仍可能被访问。云端权限不能使历史公开数据变成私密数据，需要彻底清理时另行评估历史重写或迁移仓库。

Supabase SDK 固定为 2.118.0，随网站托管，不依赖第三方 CDN 加载。许可证位于 `vendor/SUPABASE-LICENSE`。

运行保存逻辑测试：

```sh
node --test tests/cloud-store.test.cjs
```

上线后用真实账号验证：所有者首次导入、第二台设备读取、朋友只读、未授权账号无权访问、撤销朋友权限。
