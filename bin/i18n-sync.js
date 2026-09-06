import fs from "node:fs";
import path from "node:path";

const LOCALES_ROOT = path.resolve("locales");
const WEB_ROOT = path.resolve("web");

function walk(dir, ext) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results = results.concat(walk(full, ext));
        } else if (full.endsWith(ext)) {
            results.push(full);
        }
    }
    return results;
}

function extractKeys() {
    const jsFiles = walk(WEB_ROOT, ".js");
    const used = new Map();
    const regex = /\bt\(\s*['"]([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)['"]/g;

    for (const file of jsFiles) {
        const content = fs.readFileSync(file, "utf8");
        let match;
        while ((match = regex.exec(content)) !== null) {
            const [, ns, key] = match;
            if (!used.has(ns)) used.set(ns, new Set());
            used.get(ns).add(key);
        }
    }
    return used;
}

function verifyAndSync() {
    const used = extractKeys();
    const manifestPath = path.join(LOCALES_ROOT, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
        process.stderr.write("Missing locales/manifest.json\n");
        process.exit(1);
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const locales = manifest.supportedLocales.map((l) => l.code);
    let hasDiscrepancy = false;

    for (const locale of locales) {
        const localeDir = path.join(LOCALES_ROOT, locale);
        if (!fs.existsSync(localeDir)) {
            fs.mkdirSync(localeDir, { recursive: true });
        }

        for (const [ns, keys] of used.entries()) {
            const filePath = path.join(localeDir, ns + ".json");
            let existing = {};
            if (fs.existsSync(filePath)) {
                try {
                    existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
                } catch {
                    existing = {};
                }
            }

            let modified = false;
            for (const key of keys) {
                if (!(key in existing)) {
                    existing[key] = "[MISSING: " + key + "]";
                    modified = true;
                    hasDiscrepancy = true;
                    process.stdout.write("Missing key " + ns + "." + key + " in locale " + locale + " -> stub generated\n");
                }
            }

            if (modified) {
                fs.writeFileSync(filePath, JSON.stringify(existing, null, 4) + "\n");
            }
        }
    }

    if (!hasDiscrepancy) {
        process.stdout.write("All i18n keys are synchronized and up to date across all locales.\n");
    }
}

verifyAndSync();
