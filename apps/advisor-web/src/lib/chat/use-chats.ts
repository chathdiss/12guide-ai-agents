"use client";

import { useCallback, useEffect, useState } from "react";
import { STRINGS, type ApiErrorCode, type Lang } from "../i18n";
import type { ChatRequest, ChatResponse } from "./api-types";
import { toMeta, type PendingAttachment } from "./attachments";
import type { Chat, Message } from "./types";

const STORAGE_KEY = "advisor-agent:chats:v1";

const uid = () => crypto.randomUUID();

function load(): Chat[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Chat[]) : [];
  } catch {
    return [];
  }
}

function save(chats: Chat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    // storage full or blocked: keep working in memory
  }
}

export function useChats(lang: Lang) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // localStorage only exists in the browser, so load after mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChats(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) save(chats);
  }, [chats, ready]);

  const activeChat = chats.find((c) => c.id === activeId) ?? null;

  const newChat = useCallback(() => setActiveId(null), []);

  const deleteChat = useCallback((id: string) => {
    setChats((prev) => prev.filter((c) => c.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  }, []);

  const renameChat = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: clean } : c)));
  }, []);

  // Sends one question to the advisor and appends the answer (or an error) to the chat.
  const ask = useCallback(
    async (
      target: string,
      question: string,
      attachments: PendingAttachment[],
      history: { role: "user" | "assistant"; content: string }[],
    ) => {
      const t = STRINGS[lang];
      setPending(true);

      let reply: Message;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: target,
            question,
            language: lang,
            history,
            attachments: attachments.map(({ name, kind, mimeType, data }) => ({ name, kind, mimeType, data })),
          } satisfies ChatRequest),
        });
        // A forward that fails (backend not running) comes back as plain text, not JSON
        const data = await res.json().catch(() => null);
        if (!data) throw new Error(t.apiError("server_unreachable", undefined));
        if (!res.ok) throw new Error(t.apiError(data.code as ApiErrorCode | undefined, data.error));
        const { answer, sources, followUps, tier, tierReason } = data as ChatResponse;
        reply = { id: uid(), role: "assistant", content: answer, sources, followUps, tier, tierReason, createdAt: Date.now() };
      } catch (err) {
        // fetch itself rejects with a TypeError when the network or the site is down
        const msg =
          err instanceof TypeError
            ? t.apiError("server_unreachable", undefined)
            : err instanceof Error
              ? err.message
              : t.genericError;
        reply = { id: uid(), role: "assistant", content: msg, error: true, createdAt: Date.now() };
      }

      setChats((prev) =>
        prev.map((c) =>
          c.id === target ? { ...c, messages: [...c.messages, reply], updatedAt: Date.now() } : c,
        ),
      );
      setPending(false);
    },
    [lang],
  );

  const sendMessage = useCallback(
    async (text: string, attachments: PendingAttachment[] = []) => {
      const t = STRINGS[lang];
      const question = text.trim() || (attachments.length > 0 ? t.lookAtAttachments : "");
      if (!question || pending) return;

      const now = Date.now();
      const userMsg: Message = {
        id: uid(),
        role: "user",
        content: question,
        attachments: attachments.length > 0 ? attachments.map(toMeta) : undefined,
        createdAt: now,
      };
      let chatId = activeId;

      if (!chatId) {
        chatId = uid();
        const title = question.length > 40 ? `${question.slice(0, 40)}…` : question;
        setChats((prev) => [
          { id: chatId!, title, messages: [userMsg], createdAt: now, updatedAt: now },
          ...prev,
        ]);
        setActiveId(chatId);
      } else {
        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, messages: [...c.messages, userMsg], updatedAt: now } : c,
          ),
        );
      }

      // earlier turns only: failed attempts are not part of the conversation
      const history = (chats.find((c) => c.id === chatId)?.messages ?? [])
        .filter((m) => !m.error)
        .map((m) => ({ role: m.role, content: m.content }));

      await ask(chatId, question, attachments, history);
    },
    [activeId, pending, chats, lang, ask],
  );

  // Can the last answer be requested again? Not when files were attached: their content is not kept.
  const canRetry = (() => {
    const msgs = activeChat?.messages ?? [];
    const last = msgs[msgs.length - 1];
    const asked = msgs[msgs.length - 2];
    return !pending && !!last?.error && asked?.role === "user" && !asked.attachments?.length;
  })();

  const retryLast = useCallback(async () => {
    if (!canRetry || !activeChat) return;
    const msgs = activeChat.messages;
    const asked = msgs[msgs.length - 2];
    setChats((prev) => prev.map((c) => (c.id === activeChat.id ? { ...c, messages: c.messages.slice(0, -1) } : c)));
    const history = msgs
      .slice(0, -2)
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
    await ask(activeChat.id, asked.content, [], history);
  }, [canRetry, activeChat, ask]);

  return {
    chats,
    activeChat,
    activeId,
    setActiveId,
    ready,
    pending,
    newChat,
    deleteChat,
    renameChat,
    sendMessage,
    canRetry,
    retryLast,
  };
}
