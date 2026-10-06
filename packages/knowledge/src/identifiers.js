// Code is full of identifiers such as Customer_Order_API or CodeBHandling. A plain keyword
// search treats each as one long word, so a question about "customer order" would miss them.
// This returns the words hidden inside such identifiers, to be indexed next to the original text.

const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]{2,}/g;
const NEEDS_SPLITTING = /_|[a-z0-9][A-Z]|[A-Z]{2,}[a-z]/;

export function splitIdentifiers(text, limit = 4000) {
  const words = new Set();

  for (const match of text.matchAll(IDENTIFIER)) {
    const id = match[0];
    if (!NEEDS_SPLITTING.test(id)) continue; // ordinary words need no help

    const parts = id
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // CodeBHandling -> Code BHandling
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // BHandling -> B Handling
      .toLowerCase()
      .split(/\s+/);

    for (const part of parts) if (part.length > 1 && !/^\d+$/.test(part)) words.add(part);
  }

  return [...words].join(" ").slice(0, limit);
}
