/*
 * Apply translation patches to locale JSON files.
 *
 * Reads a JSON patch file of the shape:
 *   {
 *     "fr": { "key1": "translation1", ... },
 *     "ja": { ... },
 *     ...
 *   }
 *
 * For every locale listed in the patch, the matching key under
 * `translation` is updated. Keys are inserted in alphabetical order so the
 * resulting file stays sortable. The script only touches the locales named
 * in the patch — it does not auto-fill missing keys (that is what
 * `sync-i18n.mjs` is for).
 *
 * Usage:
 *   node scripts/add-translations.mjs <patch.json>
 */
import fs from "node:fs/promises";
import path from "node:path";

const LOCALES_DIR = path.resolve("src/i18n/locales");

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + "\n";
}

async function loadLocale(locale) {
  const file = path.join(LOCALES_DIR, `${locale}.json`);
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw);
}

function mergeTranslations(target, patchKeys) {
  // Patch only adds / overrides keys. Existing keys with no patch entry
  // are preserved verbatim, including their order.
  const merged = { ...target, ...patchKeys };
  const sorted = {};
  for (const k of Object.keys(merged).sort((a, b) => a.localeCompare(b))) {
    sorted[k] = merged[k];
  }
  return sorted;
}

async function main() {
  const patchPath = process.argv[2];
  if (!patchPath) {
    console.error("Usage: node scripts/add-translations.mjs <patch.json>");
    process.exit(2);
  }
  const patchRaw = await fs.readFile(patchPath, "utf8");
  const patch = JSON.parse(patchRaw);

  const summary = [];
  for (const [locale, keys] of Object.entries(patch)) {
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
      console.error(`skip ${locale}: not an object of key -> string`);
      continue;
    }
    const json = await loadLocale(locale);
    if (!json.translation || typeof json.translation !== "object") {
      console.error(`skip ${locale}: missing translation namespace`);
      continue;
    }
    json.translation = mergeTranslations(json.translation, keys);
    const out = stableStringify(json);
    await fs.writeFile(path.join(LOCALES_DIR, `${locale}.json`), out, "utf8");
    summary.push({ locale, applied: Object.keys(keys).length });
  }
  console.log("add-translations done:");
  for (const row of summary) {
    console.log(`  ${row.locale}: ${row.applied} keys applied`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
