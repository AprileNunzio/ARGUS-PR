# CLAUDE.md

Il contesto completo di questo progetto è in **[AGENTS.md](AGENTS.md)**. Leggilo prima di scrivere codice.

**Cosa devi fare** è in **[HANDOVER.md](HANDOVER.md)**: stato reale, lavoro pendente in ordine di priorità, trappole già pagate e cosa non è mai stato provato su hardware vero.

La regola che sovrasta tutte le altre: questo è un sistema di videosorveglianza esposto a internet, quindi **la sicurezza viene prima di eleganza, prestazioni e comodità** (AGENTS.md §0).

Promemoria dei vincoli che vengono violati più spesso:

- Nessun commento nel codice sorgente.
- Nessun file oltre 500 righe.
- Nessun attributo `style` nel DOM generato da JS: la CSP non ammette `unsafe-inline`. Usa le classi di utilità in `web/assets/app.css`.
- `try/catch` solo ai confini di I/O. Mai un catch silenzioso.
- `execFile`/`spawn` sempre con array di argomenti e `shell: false`.
- Aggiorna `AGENTS.md` nello stesso commit in cui cambi struttura, API o stato del progetto.
