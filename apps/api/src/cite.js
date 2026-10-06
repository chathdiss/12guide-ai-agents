// The agent cites the passages it was given as [1], [2], ... The numbers are only valid for one
// request, so they are checked here: markers that do not match a passage are removed, the rest are
// renumbered in order of first use, and the sources list holds exactly the passages that were cited.

const MARKER = /\s?\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]/g;
const CODE = /(```[\s\S]*?```|`[^`\n]*`)/;

export function buildCitations(answer, passages) {
  const order = []; // passage indexes in order of first citation
  const newNumber = new Map();

  const rewrite = (text) =>
    text.replace(MARKER, (whole, list) => {
      const numbers = [];
      for (const raw of list.split(",")) {
        const index = Number(raw.trim()) - 1;
        if (!passages[index]) continue;
        if (!newNumber.has(index)) {
          order.push(index);
          newNumber.set(index, order.length);
        }
        const n = newNumber.get(index);
        if (!numbers.includes(n)) numbers.push(n);
      }
      if (numbers.length === 0) return "";
      return `${whole.startsWith(" ") ? " " : ""}${numbers.map((n) => `[${n}]`).join("")}`;
    });

  // code is left alone: arr[1] in a code sample is not a citation
  const text = answer
    .split(CODE)
    .map((part, i) => (i % 2 === 1 ? part : rewrite(part)))
    .join("");

  return { answer: text, sources: order.map((i) => toSource(passages[i])) };
}

export function toSource(p) {
  return {
    title: p.title,
    url: p.url ?? "",
    origin: p.origin,
    path: p.path,
    startLine: p.startLine,
    endLine: p.endLine,
    version: p.version,
    excerpt: p.content.slice(0, 1200),
  };
}
