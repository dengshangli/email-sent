# 邮件发送平台

一个本地运行的中文 HTML 邮件发送工具：上传或编辑 HTML、实时预览，并通过 Resend 向多个收件人分别投递。

## 环境要求

- Node.js 24 或更高版本
- pnpm 10
- Resend 免费账户

## 本地启动

```bash
pnpm install
test -e .env.local || cp .env.example .env.local
pnpm dev
```

打开 <http://localhost:3000>。

## 配置 Resend

1. 在 Resend 控制台创建 API Key，填入 `.env.local` 的 `RESEND_API_KEY`。
2. 首次测试可保留 `EMAIL_FROM="邮件发送平台 <onboarding@resend.dev>"`。
3. `resend.dev` 只能投递到当前 Resend 账户邮箱。若要发送给其他地址，请在 Resend 控制台验证自有域名，并把 `EMAIL_FROM` 改成该域名下的地址。
4. 免费套餐当前提供每月 3,000 封、每天 100 封和 1 个域名；每位收件人分别计入额度。

## 使用

1. 上传不超过 1 MB 的 `.html` 文件。
2. 在左侧修改源码，并在右侧检查预览。
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

自动化测试拦截发送接口，不会消耗 Resend 额度。真实投递请配置 `.env.local` 后，通过页面发送到 Resend 账户邮箱。
