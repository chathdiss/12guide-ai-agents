"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, Check, Copy, CornerDownRight, ExternalLink, FileText, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";
import type { Message, Tier } from "@/lib/chat/types";
import { BrandMark } from "./brand-mark";

type Props = {
  message: Message;
  // only the newest answer offers its follow-up questions
  showFollowUps?: boolean;
  onFollowUp?: (question: string) => void;
  // set on a failed answer that can be requested again
  onRetry?: () => void;
};

const TIER_DOT: Record<Tier, string> = {
  lite: "bg-emerald-500",
  full: "bg-sky-500",
  super: "bg-violet-500",
};

const MARKDOWN_STYLES =
  "space-y-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:pt-1 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_strong]:font-semibold " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] " +
  "[&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6 [&_li_ul]:mt-1.5 [&_li_ol]:mt-1.5 " +
  "[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm [&_th]:border-b [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-2 [&_th]:font-semibold " +
  "[&_td]:border-b [&_td]:px-3 [&_td]:py-2 [&_td]:align-top";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function CopyButton({ text }: { text: string }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-muted-foreground"
      aria-label={t.copy}
      title={t.copy}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
        } catch {
          // clipboard blocked by the browser: nothing to confirm
        }
      }}
    >
      {copied ? <Check className="text-emerald-500" /> : <Copy />}
      {copied && <span>{t.copied}</span>}
    </Button>
  );
}

export function MessageItem({ message, showFollowUps = false, onFollowUp, onRetry }: Props) {
  const { t } = useLanguage();

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-2">
        {message.attachments && message.attachments.length > 0 && (
          <ul className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {message.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border bg-card py-1 pr-2.5 pl-1 text-xs">
                {a.thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbnail} alt="" className="size-8 rounded object-cover" />
                ) : (
                  <FileText className="size-8 p-1.5 text-muted-foreground" />
                )}
                <span className="max-w-40 truncate">{a.name}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary/10 px-4 py-2.5 text-[15px] leading-7 whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.error) {
    return (
      <div className="flex gap-3">
        <BrandMark className="size-7 rounded-full" />
        <div
          role="alert"
          className="min-w-0 flex-1 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed"
        >
          <div className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            {t.errorTitle}
          </div>
          <p className="mt-1.5 text-muted-foreground">{message.content}</p>
          {onRetry && (
            <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
              <RotateCcw /> {t.retry}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <BrandMark className="size-7 rounded-full" />
      <div className="min-w-0 flex-1 text-[15px] leading-7">
        <div className={MARKDOWN_STYLES}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || "…"}</ReactMarkdown>
        </div>

        <div className="mt-3 -ml-2 flex items-center gap-1">
          <CopyButton text={message.content} />
          {message.tier && (
            <span
              title={message.tierReason ? t.tierReason(message.tierReason) : undefined}
              className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
            >
              <span className={cn("size-1.5 rounded-full", TIER_DOT[message.tier])} />
              {t.tierLabel(message.tier)}
            </span>
          )}
        </div>

        {message.sources && message.sources.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{t.sources}</div>
            <ul className="grid gap-2 sm:grid-cols-2">
              {message.sources.map((s, i) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2 text-xs leading-snug transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    <span className="mt-px font-semibold text-primary">[{i + 1}]</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{s.title}</span>
                      <span className="block truncate text-muted-foreground">
                        {s.origin}
                        {hostOf(s.url) && ` · ${hostOf(s.url)}`}
                      </span>
                    </span>
                    <ExternalLink className="mt-0.5 size-3 shrink-0 text-muted-foreground group-hover:text-primary" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showFollowUps && onFollowUp && message.followUps && message.followUps.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              {t.followUps}
            </div>
            <ul className="flex flex-col items-start gap-2">
              {message.followUps.map((q) => (
                <li key={q}>
                  <button
                    onClick={() => onFollowUp(q)}
                    className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2 text-left text-sm leading-snug transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{q}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
