import { createHash } from "node:crypto";
import { chunkText } from "./chunk.js";
import { splitIdentifiers } from "./identifiers.js";
import { readTextFile } from "./read-text.js";

// Turns one file into the rows that are stored: a document and its chunks.
export async function prepareDocument(file) {
  let text = await readTextFile(file.absPath);

  // field description files list thousands of UNUSED entries, which only add noise
  if (file.ext === ".csv") {
    text = text
      .split(/\r\n|\n|\r/)
      .filter((line) => !/;UNUSED;/i.test(line))
      .join("\n");
  }

  const chunks = chunkText(text).map((chunk, index) => ({
    chunkIndex: index,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    content: chunk.text,
    // what the keyword search looks at: the text, where it comes from, and the words inside identifiers
    searchText: [file.docKey, chunk.text, splitIdentifiers(`${file.title} ${chunk.text}`)].join("\n"),
  }));

  // a change in the file, or in how it is cut up, changes the hash, so only then is it stored again
  const hash = createHash("sha1").update(`v1
${text}`).digest("hex");
  return { chunks, characters: text.length, hash };
}
