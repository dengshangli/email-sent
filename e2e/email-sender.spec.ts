import { expect, test } from "@playwright/test";

test("上传、校验并发送 HTML 邮件", async ({ page }) => {
  let requestCount = 0;
  let payload: unknown;
  let releaseFirstSend = () => {};
  const firstSendGate = new Promise<void>((resolve) => {
    releaseFirstSend = resolve;
  });

  await page.route("**/api/send", async (route) => {
    requestCount += 1;
    payload = route.request().postDataJSON();
    if (requestCount === 1) {
      await firstSendGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, acceptedCount: 2, failedRecipients: [] }),
      });
      return;
    }
    await route.fulfill({
      status: 207,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        acceptedCount: 1,
        failedRecipients: ["b@example.com"],
        error: "部分邮件未被服务器接受，请检查失败地址后重试。",
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "邮件发送平台" })).toBeVisible();

  await page.getByLabel("选择 HTML 文件").setInputFiles({
    name: "previous.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>旧内容</h1>"),
  });
  await expect(page.getByText("previous.html")).toBeVisible();

  await page.getByLabel("选择 HTML 文件").setInputFiles({
    name: "oversize.html",
    mimeType: "text/html",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  });
  await expect(
    page.getByText("拖入 HTML 文件，或点击选择").locator("..").getByRole("alert"),
  ).toContainText("HTML 文件不能超过 1 MB");
  await expect(page.getByText("previous.html")).toHaveCount(0);
  await page.getByLabel("收件人邮箱").fill("a@example.com");
  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(
    page.getByText("拖入 HTML 文件，或点击选择").locator("..").getByRole("alert"),
  ).toContainText("请上传 HTML 邮件文件");
  expect(requestCount).toBe(0);

  await page.getByLabel("选择 HTML 文件").setInputFiles({
    name: "mail.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>上传内容</h1>"),
  });
  await expect(page.getByText("mail.html")).toBeVisible();
  await expect(page.getByRole("heading", { name: "HTML 编辑" })).toHaveCount(0);
  await expect(page.getByLabel("HTML 源码")).toHaveCount(0);
  await expect(page.locator('iframe[title="邮件预览"]')).toHaveCount(0);

  await page.getByLabel("收件人邮箱").fill("错误地址");
  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(
    page.getByLabel("收件人邮箱").locator("..").getByRole("alert"),
  ).toContainText("以下邮箱格式不正确：错误地址");
  expect(requestCount).toBe(0);

  await page.getByLabel("收件人邮箱").fill("dengshangli.001@gamil.com");
  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(
    page.getByLabel("收件人邮箱").locator("..").getByRole("alert"),
  ).toContainText("dengshangli.001@gamil.com（是否想输入 @gmail.com？）");
  expect(requestCount).toBe(0);

  await page.getByLabel("收件人邮箱").fill("a@example.com，b@example.com");
  const sendButton = page.getByRole("button", { name: "发送邮件" });
  await sendButton.click();
  await expect(page.getByRole("button", { name: "正在发送…" })).toBeDisabled();
  releaseFirstSend();

  await expect(
    page.getByRole("alert").filter({ hasText: "邮件服务器已接受 2 封邮件" }),
  ).toBeVisible();
  expect(payload).toEqual({
    recipients: ["a@example.com", "b@example.com"],
    subject: "测试邮件",
    html: "<h1>上传内容</h1>",
  });

  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "邮件服务器已接受 1 封" })
      .filter({ hasText: "失败地址：b@example.com" }),
  ).toBeVisible();
});
