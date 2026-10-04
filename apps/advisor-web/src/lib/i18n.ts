export type Lang = "en" | "nl";

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "nl", label: "Dutch", short: "NL" },
];

// Why a file could not be attached; the composer turns this into a message in the chosen language
export type AttachmentProblem =
  | { kind: "tooMany"; max: number }
  | { kind: "imageTooBig"; file: string }
  | { kind: "unreadableImage"; file: string }
  | { kind: "binaryFile"; file: string }
  | { kind: "textTooLong"; file: string; max: number }
  | { kind: "unsupported"; file: string };

// Error codes returned by /api/chat
export type ApiErrorCode =
  | "not_configured"
  | "invalid_request"
  | "attachments_invalid"
  | "not_found"
  | "n8n_status"
  | "no_answer"
  | "too_slow"
  | "unreachable";

export type Strings = {
  appName: string;
  newChat: string;
  chats: string;
  noChats: string;
  renameChat: string;
  deleteChat: string;
  save: string;
  cancel: string;
  openChats: string;
  welcomeTitle: string;
  welcomeSub: string;
  examples: string[];
  placeholder: string;
  disclaimer: string;
  attachFiles: string;
  send: string;
  removeFile: (name: string) => string;
  sources: string;
  followUps: string;
  tierLabel: (tier: string) => string;
  tierReason: (reason: string) => string;
  lookAtAttachments: string;
  languageLabel: string;
  brandSubtitle: string;
  collapseSidebar: string;
  expandSidebar: string;
  searchChats: string;
  noMatches: string;
  groupToday: string;
  groupYesterday: string;
  groupWeek: string;
  groupOlder: string;
  deleteConfirm: string;
  copy: string;
  copied: string;
  thinking: string;
  retry: string;
  errorTitle: string;
  enterHint: string;
  exampleLabels: string[];
  hintFiles: string;
  themeLabel: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  errorPrefix: string;
  genericError: string;
  apiError: (code: ApiErrorCode | undefined, fallback: string | undefined) => string;
  attachmentProblem: (p: AttachmentProblem) => string;
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (n: number, lang: Lang) => n.toLocaleString(lang === "nl" ? "nl-NL" : "en-US");

export const STRINGS: Record<Lang, Strings> = {
  en: {
    appName: "Advisor Agent",
    newChat: "New chat",
    chats: "Chats",
    noChats: "No chats yet. Ask your first question.",
    renameChat: "Rename chat",
    deleteChat: "Delete chat",
    save: "Save",
    cancel: "Cancel",
    openChats: "Open chats",
    welcomeTitle: "How can I help with IFS Cloud?",
    welcomeSub: "Ask a functional or technical question.",
    examples: [
      "How do I configure a project budget in IFS Cloud?",
      "What is the difference between a Customer Order and a Sales Quotation?",
      "Which IFS Cloud release introduced the new Aurena navigator?",
    ],
    placeholder: "Ask about IFS Cloud…",
    disclaimer: "Answers are not yet verified against approved IFS sources. Always check the official documentation.",
    attachFiles: "Attach files",
    send: "Send",
    removeFile: (name) => `Remove ${name}`,
    sources: "Sources",
    followUps: "You could also ask",
    tierLabel: (tier) => `${cap(tier)} tier`,
    tierReason: (reason) => `Chosen because: ${reason}`,
    lookAtAttachments: "Please look at the attached file(s).",
    languageLabel: "Language",
    brandSubtitle: "IFS Cloud advisor",
    collapseSidebar: "Hide sidebar",
    expandSidebar: "Show sidebar",
    searchChats: "Search chats",
    noMatches: "No chats match your search.",
    groupToday: "Today",
    groupYesterday: "Yesterday",
    groupWeek: "Previous 7 days",
    groupOlder: "Older",
    deleteConfirm: "Delete this chat?",
    copy: "Copy answer",
    copied: "Copied",
    thinking: "Thinking…",
    retry: "Try again",
    errorTitle: "Could not get an answer",
    enterHint: "Enter to send, Shift+Enter for a new line",
    exampleLabels: ["Configuration", "Concepts", "Releases"],
    hintFiles: "Paste or drop screenshots and files into the message box.",
    themeLabel: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    errorPrefix: "Error:",
    genericError: "Something went wrong.",
    apiError: (code, fallback) => {
      switch (code) {
        case "not_configured":
          return "The server is not set up to reach n8n (N8N_WEBHOOK_URL is missing).";
        case "invalid_request":
          return "The request was not valid.";
        case "attachments_invalid":
          return "The attachments are not valid. Use up to 4 images or text files within the size limits.";
        case "not_found":
          return "The n8n webhook was not found. Is the workflow active and does the URL match?";
        case "no_answer":
          return "The n8n workflow did not return an answer. Check the Executions tab in n8n for the failing node.";
        case "too_slow":
          return "The advisor took too long to respond.";
        case "unreachable":
          return "Could not reach n8n. Is it running?";
        default:
          return fallback ?? "Something went wrong.";
      }
    },
    attachmentProblem: (p) => {
      switch (p.kind) {
        case "tooMany":
          return `You can attach up to ${p.max} files per message.`;
        case "imageTooBig":
          return `${p.file}: the image is larger than 15 MB.`;
        case "unreadableImage":
          return `${p.file}: this image could not be read.`;
        case "binaryFile":
          return `${p.file}: this looks like a binary file, not text.`;
        case "textTooLong":
          return `${p.file}: the file is too long (maximum ${num(p.max, "en")} characters).`;
        case "unsupported":
          return `${p.file}: not supported yet. Attach images or text files (txt, md, csv, json, xml, log, sql, yaml).`;
      }
    },
  },
  nl: {
    appName: "Advisor Agent",
    newChat: "Nieuwe chat",
    chats: "Chats",
    noChats: "Nog geen chats. Stel uw eerste vraag.",
    renameChat: "Chat hernoemen",
    deleteChat: "Chat verwijderen",
    save: "Opslaan",
    cancel: "Annuleren",
    openChats: "Chats openen",
    welcomeTitle: "Waarmee kan ik u helpen met IFS Cloud?",
    welcomeSub: "Stel een functionele of technische vraag.",
    examples: [
      "Hoe stel ik een projectbudget in IFS Cloud in?",
      "Wat is het verschil tussen een Customer Order en een Sales Quotation?",
      "Welke IFS Cloud-release introduceerde de nieuwe Aurena-navigator?",
    ],
    placeholder: "Stel een vraag over IFS Cloud…",
    disclaimer:
      "Antwoorden zijn nog niet geverifieerd aan de hand van goedgekeurde IFS-bronnen. Controleer altijd de officiële documentatie.",
    attachFiles: "Bijlagen toevoegen",
    send: "Verzenden",
    removeFile: (name) => `${name} verwijderen`,
    sources: "Bronnen",
    followUps: "U kunt ook vragen",
    tierLabel: (tier) => `${cap(tier)}-niveau`,
    tierReason: (reason) => `Gekozen omdat: ${reason}`,
    lookAtAttachments: "Bekijk de bijgevoegde bestand(en).",
    languageLabel: "Taal",
    brandSubtitle: "IFS Cloud-adviseur",
    collapseSidebar: "Zijbalk verbergen",
    expandSidebar: "Zijbalk tonen",
    searchChats: "Chats zoeken",
    noMatches: "Geen chats gevonden.",
    groupToday: "Vandaag",
    groupYesterday: "Gisteren",
    groupWeek: "Afgelopen 7 dagen",
    groupOlder: "Ouder",
    deleteConfirm: "Deze chat verwijderen?",
    copy: "Antwoord kopiëren",
    copied: "Gekopieerd",
    thinking: "Even nadenken…",
    retry: "Opnieuw proberen",
    errorTitle: "Geen antwoord ontvangen",
    enterHint: "Enter om te verzenden, Shift+Enter voor een nieuwe regel",
    exampleLabels: ["Configuratie", "Begrippen", "Releases"],
    hintFiles: "Plak of sleep screenshots en bestanden in het berichtveld.",
    themeLabel: "Thema",
    themeLight: "Licht",
    themeDark: "Donker",
    themeSystem: "Systeem",
    errorPrefix: "Fout:",
    genericError: "Er is iets misgegaan.",
    apiError: (code, fallback) => {
      switch (code) {
        case "not_configured":
          return "De server is niet ingesteld om n8n te bereiken (N8N_WEBHOOK_URL ontbreekt).";
        case "invalid_request":
          return "Het verzoek was ongeldig.";
        case "attachments_invalid":
          return "De bijlagen zijn ongeldig. Gebruik maximaal 4 afbeeldingen of tekstbestanden binnen de groottelimieten.";
        case "not_found":
          return "De n8n-webhook is niet gevonden. Is de workflow actief en klopt de URL?";
        case "no_answer":
          return "De n8n-workflow gaf geen antwoord. Controleer het tabblad Executions in n8n voor de mislukte node.";
        case "too_slow":
          return "De adviseur deed er te lang over om te antwoorden.";
        case "unreachable":
          return "n8n is niet bereikbaar. Draait het?";
        default:
          return fallback ?? "Er is iets misgegaan.";
      }
    },
    attachmentProblem: (p) => {
      switch (p.kind) {
        case "tooMany":
          return `U kunt maximaal ${p.max} bestanden per bericht toevoegen.`;
        case "imageTooBig":
          return `${p.file}: de afbeelding is groter dan 15 MB.`;
        case "unreadableImage":
          return `${p.file}: deze afbeelding kon niet worden gelezen.`;
        case "binaryFile":
          return `${p.file}: dit lijkt een binair bestand, geen tekst.`;
        case "textTooLong":
          return `${p.file}: het bestand is te lang (maximaal ${num(p.max, "nl")} tekens).`;
        case "unsupported":
          return `${p.file}: wordt nog niet ondersteund. Voeg afbeeldingen of tekstbestanden toe (txt, md, csv, json, xml, log, sql, yaml).`;
      }
    },
  },
};
