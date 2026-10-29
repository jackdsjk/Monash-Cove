# 真实账号凭据准备

## 0. 当前状态

- Google Cloud 项目：`cove-local`（Cove Local）
- OAuth client：`Cove Desktop`（Desktop app）
- Consent screen：External / Testing；测试用户已加入
- 本地 client id/secret：`local-service/.env.local`（chmod 600，已在 `.gitignore`）
- Gmail token：macOS Keychain `cove-local` / `gmail-oauth-tokens`
- 已完成真实 Gmail OAuth、20 封 backfill、history 增量 0
- Ed token：已通过本地数据源页连接并同步；值只在 Keychain
- Moodle session：已通过本地数据源页连接并同步；值只在 Keychain
- 当前真实数据：Gmail 20、Ed 91、Moodle 6（Moodle 课程暂无 forum 链接）
- 注意：External/Testing 的 refresh token 可能 7 天后过期；过期后重新连接 Gmail。

> 只记录获取步骤，不记录任何真实 token、cookie、client secret 或账号密码。所有值只进 macOS Keychain 或本地环境变量。

## 1. Gmail

1. 在 Google Cloud Console 创建项目，启用 Gmail API。
2. OAuth consent screen 设为 Testing，把要用的 Gmail 账号加入 Test users。
3. 创建 OAuth client，类型选 **Desktop app**（本地 loopback 流程）。
4. Authorized redirect URI 填：

```text
http://127.0.0.1:4317/oauth/google/callback
```

5. 把 client id/secret 放进本地环境变量，不写进仓库：

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export GOOGLE_REDIRECT_URI="http://127.0.0.1:4317/oauth/google/callback"
```

6. 启动服务，打开 `http://127.0.0.1:5174/sources`，点“连接 Gmail”。
7. 授权成功后 token 写入 `cove-local` Keychain，服务只拿 access/refresh token。

只申请 `gmail.readonly`；不申请发送、删除或修改权限。

## 2. Ed

1. 登录 Ed。
2. 打开 `https://edstem.org/us/settings/api-tokens`（按账号区域替换 us/au/eu）。
3. 创建 token。
4. 在 `http://127.0.0.1:5174/sources` 或后续的 Ed 设置表单中录入 token 和 region；token 只进 Keychain。
5. 当前适配器只拉每门 active course 最新 30 个主题，不是完整论坛归档。

## 3. Moodle

Moodle 没有公开 API。当前使用已登录的 `MoodleSession`：

1. 在浏览器完成 Monash Okta/MFA 登录；
2. 从开发者工具复制 `MoodleSession` cookie 的值；
3. 在来源设置中录入；值只进 Keychain，不写日志、不写 Git；
4. 会话过期时重新登录并替换；
5. 不保存 Moodle 密码。

如果后续实现本地登录助手，也只在用户本机运行，不把密码或 cookie 上传云端。

## 4. 模型（可选）

规则分诊不依赖模型。启用模型时：

```bash
export COVE_MODEL_PROVIDER="openai-compatible"
export COVE_MODEL_NAME="..."
export COVE_MODEL_BASE_URL="..."
export COVE_MODEL_API_KEY="..."
```

API key 只进 Keychain 或本地环境变量。没有 key 时服务必须自动回退规则分诊。

## 5. 验证边界

- 没有凭据时，S1–S7 可以用 fixture/mock 验证；
- S8 真实账号验证必须由项目所有者完成登录；
- 不得把 mock 通过写成“真实 Gmail/Ed/Moodle 已接通”。
