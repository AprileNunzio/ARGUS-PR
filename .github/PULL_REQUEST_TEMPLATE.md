## Pull Request Description / Descrizione della Modifica

Briefly describe the purpose of this PR and what changes it introduces.  
*Descrivi sinteticamente lo scopo di questa PR e le novità o correzioni introdotte.*

- **Type of change / Tipo di modifica**:
  - [ ] Bug fix / Correzione bug
  - [ ] New feature / Nuova funzionalità
  - [ ] Performance optimization / Ottimizzazione prestazioni
  - [ ] Documentation / Aggiornamento documentazione
  - [ ] Refactoring / Ristrutturazione codice

---

## Subsystems Involved / Aree e Moduli Coinvolti

- [ ] Core & Architecture (app.js, server, kernel)
- [ ] Video Pipeline & Streaming (FFmpeg, RTSP, HLS, WebSockets)
- [ ] AI Vision & Biometrics (YOLO, YuNet, SFace, CRNN)
- [ ] Database & SQLite Migrations
- [ ] Web UI & Design System
- [ ] Internationalization & Translations (i18n)
- [ ] Installers & Deployment Scripts (Windows / Linux)
- [ ] Firewall & Perimeter Defense (ARGUS-SHIELD)

---

## Standards Compliance Checklist / Checklist di Conformità

Before requesting a review, verify that the PR complies with all quality standards:  
*Prima di richiedere la revisione, verifica che la PR rispetti tutti i requisiti di qualità:*

- [ ] **Automated Tests**: `npm test` passes 100% with no regressions (*Tutti i test passano senza errori*).
- [ ] **Code Purity**: Zero comments in source code, self-explanatory variable and function naming (*Zero commenti nel codice sorgente*).
- [ ] **File Size Limit**: No modified or added file exceeds 500 lines of code (*Nessun file supera le 500 righe*).
- [ ] **Zero-Trust Security**: Input paths validated with `resolveInside`, zero unauthorized outbound network calls (*Nessun path traversal né telemetria*).
- [ ] **Web UI**: No native blocking dialogs (`alert()`, `confirm()`, `prompt()`) used (*Nessuna finestra bloccante del browser*).
- [ ] **Bilingual Docs**: Updated both `README.md` and `README_EN.md` if options or commands changed (*Documentazione aggiornata sia in IT che in EN*).
