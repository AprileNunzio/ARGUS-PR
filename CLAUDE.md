# CLAUDE.md

Il contesto completo di questo progetto è in **[AGENTS.md](AGENTS.md)**. Leggilo prima di scrivere codice.

Promemoria dei vincoli che vengono violati più spesso:

- Nessun commento nel codice sorgente.
- Nessun file oltre 500 righe.
- Nessun attributo `style` nel DOM generato da JS: la CSP non ammette `unsafe-inline`. Usa le classi di utilità in `web/assets/app.css`.
- `try/catch` solo ai confini di I/O. Mai un catch silenzioso.
- `execFile`/`spawn` sempre con array di argomenti e `shell: false`.
- Aggiorna `AGENTS.md` nello stesso commit in cui cambi struttura, API o stato del progetto.
