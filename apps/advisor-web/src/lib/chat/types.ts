export type Source = {
  title: string;
  url: string;
  origin: "IFS documentation" | "IFS community" | "12Guide";
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
