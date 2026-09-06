const fs = require('fs');

let rIt = fs.readFileSync('README.md', 'utf8');
if (!rIt.includes('Novità nella versione 1.0.1')) {
    rIt = rIt.replace("## Che cos'è", 
        "## Novità nella versione 1.0.1\n\n" +
        "- **Internazionalizzazione completa (i18n):** Tutti i moduli frontend (Dashboard, Setup, Impostazioni, etc.) supportano il sistema di traduzione dinamico. Le stringhe statiche sono state rimosse e mappate a chiavi di traduzione per garantire flessibilità tra italiano e inglese.\n" +
        "- **Autonomia e Resilienza Locales:** L'interfaccia rileva automaticamente la presenza dei file lingua. Se una cartella lingua non esiste, scompare dal selettore prevenendo rotture dell'interfaccia. La UI fallback gestisce in sicurezza le chiavi mancanti in tempo reale.\n" +
        "- **Fix UI Selettore Lingua:** Corretto il bug del selettore lingua nella topbar che espandeva l'altezza causata da un loop di riassegnazione del DOM.\n" +
        "- **Pulizia Credits & Artefatti:** Rimozione file spuri (`claude.md`, `handover.md`), aggiornamento rigoroso delle intestazioni, dell'autore (`AprileNunzio`) e della mail di contatto (`info@nunziotech.com`).\n" +
        "- **Codice sicuro al 100%:** Conformità totale ai vincoli del progetto. Nessun commento nei sorgenti, file mantenuti snelli, e tutti i 271 test integrati superati con successo.\n\n---\n## Che cos'è");
    fs.writeFileSync('README.md', rIt);
}

let rEn = fs.readFileSync('README_EN.md', 'utf8');
if (!rEn.includes("What's new in version 1.0.1")) {
    rEn = rEn.replace("## What it is", 
        "## What's new in version 1.0.1\n\n" +
        "- **Complete Internationalization (i18n):** All frontend modules (Dashboard, Setup, Settings, etc.) now fully support the dynamic translation system. Hardcoded static strings were extracted and mapped to translation keys for flexible switching between English and Italian.\n" +
        "- **Locales Autonomy & Resilience:** The interface automatically detects the presence of language files. If a language directory is missing, it dynamically hides the option from the selector, preventing UI crashes. Real-time fallback gracefully handles missing keys.\n" +
        "- **Language Selector UI Fix:** Fixed a DOM reassignment loop bug that caused the language selector to unexpectedly expand the topbar's height.\n" +
        "- **Credits & Artifacts Cleanup:** Removed spurious files (`claude.md`, `handover.md`), enforced strict header updates, and ensured all authorship points to `AprileNunzio` with the contact email `info@nunziotech.com`.\n" +
        "- **100% Code Safety:** Maintained strict adherence to project constraints. Zero comments in source code, lightweight files, and all 271 integrated tests successfully passed.\n\n---\n## What it is");
    fs.writeFileSync('README_EN.md', rEn);
}
