# 邮件发送平台

一个本地运行的中文 HTML 邮件发送工具：上传 HTML 文件，并通过 Gmail SMTP 向多个收件人分别投递。

## 环境要求

- Node.js 24 或更高版本
- pnpm 10
- 已开启两步验证的 Gmail 账号

## 本地启动

```bash
pnpm install
test -e .env.local || cp .env.example .env.local
pnpm dev
```

打开 <http://localhost:3000>。

## 配置 Gmail SMTP

1. 为发件 Gmail 账号开启两步验证。
2. 在 Google 账号的「应用专用密码」页面创建一个 16 位密码。
3. 首次运行时执行 `test -e .env.local || cp .env.example .env.local`。
4. 在 `.env.local` 填写 `SMTP_USER`、`SMTP_APP_PASSWORD` 和 `EMAIL_FROM_NAME`，然后重启服务。

个人 Gmail 通常最多发送约 500 封或 500 个收件人/天。平台不限制收件邮箱域名，但 Gmail 仍可能因额度、退信或反垃圾策略拒绝邮件。

## 使用

1. 上传不超过 1 MB 的 `.html` 文件。
2. 确认已选择正确的 HTML 文件。
3. 使用逗号、中文逗号或换行填写最多 50 个收件人。
4. 确认标题后点击「发送邮件」。平台会为每位收件人生成独立邮件，地址不会互相暴露。

## 验证

```bash
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

自动化测试拦截发送接口，不会连接 Gmail。真实投递请配置 `.env.local` 后，通过页面分别发送到 Gmail 和其他邮箱进行核对。
