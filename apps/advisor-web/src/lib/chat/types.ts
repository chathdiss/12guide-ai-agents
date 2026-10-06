export type Source = {
  title: string;
  // empty for sources without a web page, such as source code: those are cited by file and lines
  url: string;
  origin: "IFS documentation" | "IFS community" | "12Guide" | "IFS source code";
  path?: string;
  startLine?: number;
  endLine?: number;
  version?: string;
  // the passage the answer is based on
  excerpt?: string;
};

// What is kept with a message in history. The file content itself is never stored.
export type AttachmentMeta = {
  id: string;
  name: string;
  kind: "image" | "text";
  mimeType: string;
  size: number;
  thumbnail?: string; // small data URL, images only
};

export type Tier = "lite" | "full" | "super";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  followUps?: string[];
  attachments?: AttachmentMeta[];
  tier?: Tier;
  tierReason?: string;
  error?: boolean;
  createdAt: number;
};

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};
