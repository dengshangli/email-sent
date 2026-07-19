import { expect, test } from "@playwright/test";

test("上传、编辑、预览、校验并发送 HTML 邮件", async ({ page }) => {
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
        body: JSON.stringify({ ok: true, count: 2 }),
      });
      return;
    }
    await route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, error: "邮件发送失败，请稍后重试。" }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "邮件发送平台" })).toBeVisible();

  await page.getByLabel("选择 HTML 文件").setInputFiles({
    name: "oversize.html",
    mimeType: "text/html",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  });
  await expect(
    page.getByText("拖入 HTML 文件，或点击选择").locator("..").getByRole("alert"),
  ).toContainText("HTML 文件不能超过 1 MB");

  await page.getByLabel("选择 HTML 文件").setInputFiles({
    name: "mail.html",
    mimeType: "text/html",
    buffer: Buffer.from("<h1>上传内容</h1>"),
  });
  await expect(page.getByText("mail.html")).toBeVisible();
  await expect(page.locator('iframe[title="邮件预览"]')).toHaveAttribute("sandbox", "");
  await expect(
    page.frameLocator('iframe[title="邮件预览"]').getByRole("heading", { name: "上传内容" }),
  ).toBeVisible();

  await page.getByLabel("HTML 源码").fill("<h1>编辑后的内容</h1>");
  await expect(
    page.frameLocator('iframe[title="邮件预览"]').getByRole("heading", { name: "编辑后的内容" }),
  ).toBeVisible();

  await page.getByLabel("HTML 源码").fill("你".repeat(350_000));
  await page.getByLabel("收件人邮箱").fill("a@example.com");
  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(page.getByLabel("HTML 源码").locator("..").getByRole("alert")).toContainText(
    "HTML 内容不能超过 1 MB",
  );
  expect(requestCount).toBe(0);

  await page.getByLabel("HTML 源码").fill("<h1>编辑后的内容</h1>");
  await page.getByLabel("收件人邮箱").fill("错误地址");
  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(
    page.getByLabel("收件人邮箱").locator("..").getByRole("alert"),
  ).toContainText("以下邮箱格式不正确：错误地址");
  expect(requestCount).toBe(0);

  await page.getByLabel("收件人邮箱").fill("a@example.com，b@example.com");
  const sendButton = page.getByRole("button", { name: "发送邮件" });
  await sendButton.click();
  await expect(page.getByRole("button", { name: "正在发送…" })).toBeDisabled();
  releaseFirstSend();

  await expect(page.getByRole("alert").filter({ hasText: "已成功发送 2 封邮件" })).toBeVisible();
  expect(payload).toEqual({
    recipients: ["a@example.com", "b@example.com"],
    subject: "测试邮件",
    html: "<h1>编辑后的内容</h1>",
  });

  await page.getByRole("button", { name: "发送邮件" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "邮件发送失败，请稍后重试。" }),
  ).toBeVisible();
});
