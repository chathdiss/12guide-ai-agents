import { readdir } from "node:fs/promises";
import path from "node:path";

// Source files that carry meaning. Left out on purpose:
//   .ins (installation data, huge), .resx (UI resource files), *.Designer.cs (generated form layout),
//   icons, project and solution files, scripts.
const KEEP = new Set([".plsql", ".plsvc", ".views", ".apv", ".cdb", ".cre", ".storage", ".upg", ".cs", ".csv", ".xml", ".java"]);

const KIND = {
  ".plsql": "PL/SQL package",
  ".plsvc": "PL/SQL service",
  ".views": "database views",
  ".upg": "upgrade script",
  ".cre": "create script",
  ".cs": "C# client code",
  ".csv": "field descriptions",
  ".xml": "XML",
  ".java": "Java",
};

export const SOURCE_ID = "ifs-apps10-upd29";
export const ORIGIN = "IFS source code";

export function describeKind(ext) {
  return KIND[ext] ?? ext.slice(1);
}

// Yields one entry per useful file below `root`.
// Folder layout: <root>/<Version>/<component>/<layer>/.../<file>, e.g. Apps10_UPD29/accrul/database/X.plsql
export async function* walkIfsSource(root) {
  async function* walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        yield* walk(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!KEEP.has(ext)) continue;
      if (entry.name.toLowerCase().endsWith(".designer.cs")) continue;

      const rel = path.relative(root, full).split(path.sep);
      const [versionDir, component = "", layer = ""] = rel;
      yield {
        absPath: full,
        docKey: rel.join("/"),
        title: entry.name,
        ext,
        kind: describeKind(ext),
        version: (versionDir ?? "").replace(/_/g, " "),
        component: component.toUpperCase(),
        layer: rel.length > 3 ? layer : "",
      };
    }
  }
  yield* walk(root);
}
