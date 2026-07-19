"use client";

import { useDeferredValue, useState, useTransition, type DragEvent, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_HTML_BYTES, getUtf8ByteLength } from "@/lib/email-limits";
import { parseRecipients } from "@/lib/recipients";

type Notice = { type: "success" | "error"; text: string } | null;
type FieldError = { field: "file" | "html" | "recipients" | "subject"; text: string } | null;

export function EmailSender() {
  const [fileName, setFileName] = useState("");
  const [html, setHtml] = useState("");
  const [recipientsInput, setRecipientsInput] = useState("");
  const [subject, setSubject] = useState("测试邮件");
  const [notice, setNotice] = useState<Notice>(null);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const [sending, startSending] = useTransition();
  const deferredHtml = useDeferredValue(html);

  async function loadFile(file?: File) {
    setNotice(null);
    setFieldError(null);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".html")) {
      setFieldError({ field: "file", text: "请选择 .html 文件。" });
      return;
    }
    if (file.size > MAX_HTML_BYTES) {
      setFieldError({ field: "file", text: "HTML 文件不能超过 1 MB。" });
      return;
    }

    try {
      setHtml(await file.text());
      setFileName(file.name);
    } catch {
      setFieldError({ field: "file", text: "文件读取失败，请重新选择。" });
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void loadFile(event.dataTransfer.files[0]);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setFieldError(null);

    const parsed = parseRecipients(recipientsInput);
    if (parsed.invalid.length) {
      setFieldError({ field: "recipients", text: `以下邮箱格式不正确：${parsed.invalid.join("、")}` });
      return;
    }
    if (parsed.exceedsLimit) {
      setFieldError({ field: "recipients", text: "每次最多发送给 50 个收件人。" });
      return;
    }
    if (!parsed.recipients.length) {
      setFieldError({ field: "recipients", text: "请至少填写一个有效的收件邮箱。" });
      return;
    }
    if (!subject.trim()) {
      setFieldError({ field: "subject", text: "请输入邮件标题。" });
      return;
    }
    if (!html.trim()) {
      setFieldError({ field: "html", text: "请上传或输入 HTML 邮件内容。" });
      return;
    }
    if (getUtf8ByteLength(html) > MAX_HTML_BYTES) {
      setFieldError({ field: "html", text: "HTML 内容不能超过 1 MB。" });
      return;
    }

    startSending(async () => {
      try {
        const response = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipients: parsed.recipients, subject: subject.trim(), html }),
        });
        const result = (await response.json()) as { ok: boolean; count?: number; error?: string };
        if (!response.ok || !result.ok) {
          setNotice({ type: "error", text: result.error || "邮件发送失败，请稍后重试。" });
          return;
        }
        setNotice({ type: "success", text: `已成功发送 ${result.count ?? 0} 封邮件。` });
      } catch {
        setNotice({ type: "error", text: "邮件发送失败，请检查网络后重试。" });
      }
    });
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">内部工具</p>
        <h1 className="text-3xl font-semibold tracking-tight">邮件发送平台</h1>
        <p className="text-muted-foreground">上传并检查 HTML 内容，然后发送给指定收件人。</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>HTML 编辑</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="rounded-lg border border-dashed p-6 text-center transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <Label htmlFor="html-file" className="cursor-pointer justify-center font-medium">
                拖入 HTML 文件，或点击选择
              </Label>
              <Input
                id="html-file"
                aria-label="选择 HTML 文件"
                type="file"
                accept=".html,text/html"
                className="sr-only"
                aria-invalid={fieldError?.field === "file"}
                aria-describedby={fieldError?.field === "file" ? "html-file-error" : undefined}
                onChange={(event) => void loadFile(event.target.files?.[0])}
              />
              <p className="mt-2 text-sm text-muted-foreground">仅支持 .html，最大 1 MB</p>
              {fileName ? <p className="mt-2 text-sm font-medium">{fileName}</p> : null}
              {fieldError?.field === "file" ? (
                <p id="html-file-error" role="alert" className="mt-2 text-sm text-destructive">{fieldError.text}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="html-source">HTML 源码</Label>
              <Textarea
                id="html-source"
                value={html}
                onChange={(event) => setHtml(event.target.value)}
                placeholder="上传文件后可在这里继续编辑"
                className="min-h-96 font-mono text-sm"
                spellCheck={false}
                aria-invalid={fieldError?.field === "html"}
                aria-describedby={fieldError?.field === "html" ? "html-source-error" : undefined}
              />
              {fieldError?.field === "html" ? (
                <p id="html-source-error" role="alert" className="text-sm text-destructive">{fieldError.text}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>邮件预览</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              title="邮件预览"
              sandbox=""
              srcDoc={deferredHtml || "<p style='color:#71717a'>上传或输入 HTML 后将在这里预览。</p>"}
              className="h-[32rem] w-full rounded-lg border bg-white"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>发送设置</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="recipients">收件人邮箱</Label>
              <Textarea
                id="recipients"
                value={recipientsInput}
                onChange={(event) => setRecipientsInput(event.target.value)}
                placeholder="user@example.com，other@example.com"
                aria-invalid={fieldError?.field === "recipients"}
                aria-describedby={fieldError?.field === "recipients" ? "recipients-error" : undefined}
              />
              <p className="text-sm text-muted-foreground">使用逗号、中文逗号或换行分隔，最多 50 个。</p>
              {fieldError?.field === "recipients" ? (
                <p id="recipients-error" role="alert" className="text-sm text-destructive">{fieldError.text}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">邮件标题</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                aria-invalid={fieldError?.field === "subject"}
                aria-describedby={fieldError?.field === "subject" ? "subject-error" : undefined}
              />
              {fieldError?.field === "subject" ? (
                <p id="subject-error" role="alert" className="text-sm text-destructive">{fieldError.text}</p>
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              默认 resend.dev 发件域名只能投递到 Resend 账户邮箱；发给其他人前请先验证自有域名。
            </p>
            {notice ? (
              <Alert variant={notice.type === "error" ? "destructive" : "default"}>
                <AlertDescription>{notice.text}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={sending}>
              {sending ? "正在发送…" : "发送邮件"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
