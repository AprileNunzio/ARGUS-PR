# HANDOVER — cosa resta da fare su ARGUS-PR

Documento di consegna per l'assistente che prosegue il lavoro.
Leggi **prima** [AGENTS.md](AGENTS.md): contiene i vincoli non negoziabili e le convenzioni.
Questo file dice **cosa manca**. Per **come costruirlo davvero**, punto per punto, vai in [docs/IMPLEMENTAZIONE.md](docs/IMPLEMENTAZIONE.md).

Stato alla consegna: **v0.6.0**, 33 test verdi, tutto pubblicato su GitHub.

---

## 1. Il contesto in due minuti

Il proprietario aveva un'app di videosorveglianza dentro il marketplace **Adestio**
(`D:\Google Drive (...)\Adestio-Marketplace\App-ArgusPR`). Quella piattaforma ha limiti
insuperabili per un NVR: SQLite in RAM riserializzato per intero a ogni flush, niente moduli
nativi, niente supporto Range, nessun push dal backend al frontend, backend nello stesso
processo dell'app.

Per questo è nato **ARGUS-PR standalone**, questo repository: nessun rapporto con Adestio,
nessun FTP, demone Node.js autonomo. L'obiettivo dichiarato dal proprietario è
**riportare tutte le funzionalità del vecchio programma**, fatte per davvero.

### Cosa NON devi copiare dal vecchio programma

Il "riconoscimento AI" del vecchio programma **non esisteva**. Verificato leggendo il codice:

- `backend/biometrics/biometric_ensemble.js` → `generateSimulatedEmbedding()` produce un
  vettore da un hash SHA-256 del nome. Non è un embedding facciale.
- `engine/worker_manager.js` → `getLiveFrameDetections()` restituisce un riquadro **fisso**
  (`bbox_x: 0.38, bbox_y: 0.24`) con confidenza **0.96 inventata**.
- `backend/detections/detection_handler.js` → ha una lista `BANNED_FAKES` di targhe finte
  (`AB123CD`, `EF456GH`, …) da filtrare: erano dati di esempio seminati nel database.

**Non riprodurre la simulazione.** Il proprietario è stato informato di questo. La strada
corretta è nella sezione 4: un ingresso reale per i rilevamenti, che accetta dati da un
motore di inferenza esterno o dall'analitica di bordo delle telecamere.

---

## 2. Cosa è già fatto e funzionante

| Fase | Contenuto | Versione |
|---|---|---|
| F0 | Kernel, sicurezza, HTTP, UI, telecamere, ONVIF | 0.1.0 |
| F1 | Diretta video fMP4 su WebSocket + MSE | 0.2.0 |
| F2 | Registrazione, segmentazione, indice JSONL, ritenzione | 0.3.0 |
| F3 | Riproduzione e linea temporale | 0.3.0 |
| FA | Autoinstaller Linux, console locale `/wall` | 0.4.0 |
| FU | Autoaggiornamento da GitHub con ripristino automatico | 0.5.0 |
| F3b | Esportazione con catena di custodia | 0.6.0 |

Ognuna ha commit, tag e release su GitHub, con note che dichiarano cosa è stato verificato
e cosa no. **Mantieni questa abitudine**: il proprietario chiede esplicitamente
"per ogni fase completata aggiorna github e release e readme".

---

## 3. Inventario del vecchio programma da portare

Il vecchio programma aveva **19 moduli** e **14 tabelle**. Ecco la mappatura completa.

### Già portato

| Vecchio | Nuovo |
|---|---|
| `camera_management`, `camera_form`, `onvif_scanner` | `src/features/cameras/`, `src/features/discovery/` |
| `live_view` (griglia) | `src/features/streaming/`, `web/features/live/`, `web/features/wall/` |
| `dashboard` | `web/features/dashboard/` |
| `diagnostics` (parziale) | `web/features/system/` |

### Da portare

| Vecchio modulo | Tabelle | Cosa fa | Priorità |
|---|---|---|---|
| `presets`, `preset_form` | `camera_presets` | Modelli di URL RTSP per marca/modello, così l'utente non scrive l'URL a mano | **alta**, è piccolo e utile subito |
| `people`, `person_form`, `person_detail` | `people`, `face_logs` | Anagrafica persone: nome, ruolo (dipendente/visitatore/fornitore/VIP/lista nera), reparto, contatti, foto, conteggio visite | alta |
| `access_logs`, `log_detail` | `plate_logs`, `access_rules` | Registro transiti targhe con esito accesso, dettaglio del singolo transito | alta |
| `analytics`, `rule_form` | `access_rules` | Regole targhe: whitelist/blacklist/monitorata, con validità temporale | alta |
| `automation` | `automation_config`, `physical_gates`, `gate_action_rules` | Notifiche Telegram, relè via webhook HTTP, MQTT; apertura varchi su riconoscimento | media |
| `forensic_search` | `detections`, `plate_logs`, `face_logs` | Ricerca incrociata per classe, telecamera, intervallo, targa, persona | media |
| `floor_plan` | `floor_plans`, `map_camera_positions`, `virtual_barriers` | Planimetria con posizione/rotazione/campo visivo delle telecamere e barriere virtuali (attraversamento linea, zona perimetrale) | media |
| `settings` | — | Impostazioni generali | bassa |
| `diagnostics` (completo) | `system_metrics` | FPS in ingresso, FPS inferenza, latenza per telecamera, storico | bassa |

---

## 4. Le fasi da fare, in ordine

> Le istruzioni operative dettagliate — algoritmi, modelli, comandi ffmpeg, schemi SQL, test di verifica — stanno in **[docs/IMPLEMENTAZIONE.md](docs/IMPLEMENTAZIONE.md)** e nei tre documenti che indicizza:
> [docs/MOVIMENTO.md](docs/MOVIMENTO.md), [docs/VISIONE.md](docs/VISIONE.md), [docs/AUTOMAZIONI.md](docs/AUTOMAZIONI.md).
> Quella e' la guida da seguire. Questa sezione resta come quadro d'insieme.

### F4 — Pianificazione e rilevamento movimento (v0.7.0)

Due cose distinte, entrambe reali e verificabili.

**Pianificazione oraria.** Registrare non 24 ore su 24 ma per fasce. Modello: per telecamera,
una settimana tipo (7 giorni × 24 ore, bitmap) più eccezioni per data. Il `recording_hub`
già decide chi registra: aggiungi un valutatore puro `schedule.js` che, data la settimana
tipo e un istante, dice se registrare. **Scrivilo come funzione pura e testalo**: è la stessa
logica di `retention.js`, che è pura apposta.

**Rilevamento movimento vero.** Non simularlo. Due strade praticabili:

1. **ffmpeg `select` con `scene`**: `-vf "select='gt(scene,0.02)',metadata=print"` e leggi i
   valori da stderr. Semplice, nessuna dipendenza, ma niente zone.
2. **Differenza di frame in Node**: estrai fotogrammi ridotti (`-vf scale=64:36,format=gray`)
   a bassa frequenza su `pipe:1`, confronta i buffer in JavaScript. Ti dà **le zone**, perché
   sai a quale porzione della griglia appartiene ogni pixel. 64×36 = 2304 byte per fotogramma:
   costa niente.

Consiglio la seconda: le zone erano una richiesta esplicita. Le zone si disegnano sul
riquadro live con un canvas, si salvano come poligoni normalizzati (0–1) e si valutano con
un point-in-polygon puro e testabile.

Eventi da pubblicare su `Topic.MOTION` (già dichiarato in `event_bus.js`, mai usato).

### F5 — Eventi, persone, targhe, automazioni (v0.8.0)

Questa è la fase grossa, quella che riporta il cuore del vecchio programma.

**4.1 Ingresso rilevamenti** — `POST /api/detections`, autenticato con una chiave per sorgente
(non con la sessione utente: chi scrive è una macchina). Payload: telecamera, istante, classe
(`person`, `vehicle`, `animal`, `face`, `plate`), confidenza, riquadro normalizzato, testo
targa opzionale, ritaglio in base64 opzionale. Questo è ciò che sostituisce la simulazione:
- un motore di inferenza esterno (ONNX Runtime, Frigate, CodeProject.AI) ci scrive dentro;
- molte telecamere IP fanno ANPR e rilevamento persone a bordo e possono inviare eventi.

Valida tutto in `guards.js`. La classe deve stare in un elenco chiuso. Il ritaglio va salvato
su disco, **mai** in SQLite (vale la stessa regola dell'indice segmenti).

**4.2 Anagrafica persone** — tabella `people` come il vecchio schema. Il campo `face_embedding`
tienilo, ma **popolalo solo con embedding veri** che arrivano dall'ingresso rilevamenti. Il
confronto con `cosineSimilarity` (in `backend/biometrics/biometric_ensemble.js` del vecchio
programma) è matematica corretta: quella puoi copiarla, è l'unica parte vera.

**4.3 Regole targhe** — `access_rules` con `list_type` whitelist/blacklist/monitored e validità
`valid_from`/`valid_to`. Il confronto va fatto su targa normalizzata (solo A-Z0-9). Attenzione:
è la logica che decide se un cancello si apre. **Falla pura e testala** con casi limite: targa
scaduta, regola disattivata, pattern con caratteri jolly.

**4.4 Automazioni** — Telegram, webhook HTTP per relè, MQTT.
- Telegram e webhook: `fetch` nativo, nessuna dipendenza.
- MQTT: servirebbe un pacchetto. **Il vincolo è due dipendenze soltanto.** Prima di aggiungerne
  una, chiedi al proprietario. In alternativa un webhook verso un bridge MQTT esterno.
- I token vanno nel vault (`encryptSecret`), **mai in chiaro nel database**.
- Ogni azione verso l'esterno deve avere timeout e non deve poter bloccare la registrazione.

**4.5 Varchi** — `physical_gates` e `gate_action_rules`. Un varco che si apre da solo è
l'operazione più delicata del sistema: registra ogni apertura in `audit_log`, metti un limite
di frequenza, e non aprire mai su una corrispondenza sotto soglia di confidenza.

### F6 — Planimetria, preset, diagnostica, watchdog (v0.9.0)

**Planimetria**: immagine di sfondo, telecamere posizionate con rotazione e cono di campo
visivo, barriere virtuali. Nel vecchio programma l'immagine stava in `image_data` come base64
dentro il database: **non farlo**, salvala come file e tieni il percorso.

**Preset telecamere**: tabella `camera_presets` più un elenco di sistema (Hikvision, Dahua,
Reolink, Axis, TP-Link, Foscam…). Nel form telecamera, scelta marca/modello → URL precompilato.

**Diagnostica**: `system_metrics` per FPS e latenza per telecamera, con grafico storico.

**Watchdog**: sorveglia i processi ffmpeg, riavvia quelli fermi, allarme se una telecamera è
irraggiungibile oltre N minuti. Parte dell'infrastruttura c'è già (`STALL_TIMEOUT_MS` in
`stream_session.js`, `recorder.js` con `reconnecting`).

**GDPR**: cancellazione su richiesta di una persona e dei suoi `face_logs`, esportazione dei
dati di una persona, ritenzione separata e più corta per i dati biometrici.

---

## 5. Regole di lavoro che il proprietario ha imposto

Queste non sono preferenze, sono vincoli. Le trovi anche in AGENTS.md §2.

1. **Nessun commento nel codice.** Le spiegazioni vanno in `.md`.
2. **Nessun file oltre 500 righe.** Superato il limite, si modularizza.
3. **Clean Architecture**, colocation per funzionalità.
4. **UI responsive** nativa su mobile e desktop, **tema chiaro unico**.
5. **Zero-Trust**, sanitizzazione totale, dati sensibili cifrati.
6. **Niente abuso di try/catch**: solo ai confini di I/O.
7. **Due dipendenze soltanto**: `better-sqlite3` e `ws`. Ogni pacchetto è superficie d'attacco.
8. **A ogni fase completata**: commit, tag, release GitHub, README e AGENTS.md aggiornati.
9. **Aggiorna AGENTS.md nello stesso commit** di ogni cambiamento strutturale.

E una regola che viene dal modo in cui il proprietario ha lavorato finora: **dichiara sempre
cosa non hai verificato.** Le note di release esistenti lo fanno. Non scrivere "funziona" di
qualcosa che non hai eseguito.

---

## 6. Trappole già pagate, non ripagarle

- **`node --test test/` fallisce su Windows.** Usa `node --test test/*.test.js`.
- **`strftime_mkdir` non esiste** sul muxer `segment` di ffmpeg (è del muxer `hls`): le
  directory le crea `ensureSegmentDays()`.
- **Il CSV di ffmpeg contiene solo il nome file**, non il percorso; e viene troncato a ogni
  riavvio di ffmpeg. `segmentPathFromName()` e il contatore del watcher gestiscono entrambe.
- **`-re` serve sulle sorgenti non RTSP**, altrimenti un file viene letto a velocità piena e
  produce un unico segmento.
- **CSP senza `unsafe-inline`**: nessun attributo `style` nel DOM generato da JS. Per i valori
  dinamici usa `element.style.setProperty('--token', valore)`.
- **`[hidden]` non basta**: serve `[hidden] { display: none !important; }`, altrimenti
  `display:flex` di un componente vince sull'attributo.
- **Le varianti di `notice()` sono `error`, `warn`, `ok`, `info`.** Non esiste `success`.
- **Il tool Bash tronca i comandi molto lunghi**: per file grandi usa lo strumento di scrittura,
  non un heredoc.
- **I server in background trattengono il file del database**: fermali con lo strumento
  apposito, non con `kill`.
- **`.gitattributes` forza LF sugli script shell**: un CRLF li renderebbe non eseguibili su
  Linux e romperebbe l'installatore in modo silenzioso.

---

## 7. Cosa non è mai stato provato su hardware vero

Va detto a chi prosegue e al proprietario:

- **L'autoinstaller Linux non è mai stato eseguito su Linux.** La macchina di sviluppo è
  Windows, senza Docker né WSL. Sintassi, flusso, gestione argomenti e artefatti generati sono
  stati verificati; l'esecuzione reale no.
- **`ExecStartPre` non è mai girato sotto systemd reale.** La macchina a stati del ripristino
  è stata provata a mano su un repository git di prova, e funziona; l'integrazione con systemd
  no.
- **La console locale non è mai stata provata su un monitor collegato a un server Linux.** È
  stata provata nel browser, dove funziona.
- **Nessuna telecamera IP reale è mai stata collegata.** Tutte le prove usano una sorgente
  sintetica generata con ffmpeg. RTSP con credenziali, UDP, sotto-flussi e ONVIF di marche
  reali sono da verificare sul campo.

Quando il proprietario installerà su una macchina vera, il primo comando utile è
`journalctl -u argus-pr -n 50`.
