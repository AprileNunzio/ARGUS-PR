# AGENTS.md

Contesto operativo per assistenti AI che lavorano su questo repository.
Leggi questo file **prima** di scrivere codice. Per sapere **cosa manca ancora** leggi [HANDOVER.md](HANDOVER.md); per **come costruirlo** leggi [docs/IMPLEMENTAZIONE.md](docs/IMPLEMENTAZIONE.md). Se modifichi il progetto, **aggiorna questo file nello stesso commit**.

Ultimo aggiornamento: 2026-09-02 · versione progetto: 0.6.0

---

## 1. Cos'e' ARGUS-PR

NVR (Network Video Recorder) self-hosted: un demone Node.js che acquisisce flussi RTSP da telecamere IP, li registra su disco, li rende riproducibili e li analizza. L'interfaccia e' una web app servita dallo stesso processo.

**Non e' un'applicazione desktop.** Gira headless su Linux server o come servizio Windows; si amministra dal browser di qualunque dispositivo in rete.

Stato reale: **fondamenta, diretta, registrazione, archivio, riproduzione, console locale, installazione automatica Linux e autoaggiornamento funzionanti.** Vedi §9.

---

## 2. Vincoli di progetto non negoziabili

Imposti dal proprietario del repository. Valgono per ogni contributo.

1. **Clean Architecture**, Separation of Concerns, Single Responsibility.
2. **Nessun commento nel codice.** Il codice sorgente non contiene commenti, salvo richiesta esplicita. La documentazione vive nei file `.md`. Questo file e il README sono le uniche sedi delle spiegazioni.
3. **Nessun file oltre 500 righe.** Superato il limite, si modularizza.
4. **UI totalmente responsive**, nativa sia mobile sia desktop.
5. **Zero-Trust**: prevenzione OWASP, sanitizzazione totale degli input, cifratura di ogni dato sensibile.
6. **Error handling senza abuso di try/catch.** Solo ai confini di I/O (rete, filesystem, processi, DB). Mai sopprimere un'eccezione in silenzio.
7. **Colocation per funzionalita'**, non per strato tecnico.

---

## 3. Ambiente

| Voce | Valore |
|---|---|
| Runtime | Node.js >= 20.11 (sviluppato su 24.x) |
| Moduli | ESM (`"type": "module"`) — usa `import`, mai `require` nel codice sorgente |
| Database | better-sqlite3, file su disco, WAL |
| Dipendenze runtime | `better-sqlite3`, `ws`. Nient'altro. |
| Video | ffmpeg/ffprobe come **eseguibili esterni**, mai come libreria |
| Piattaforme | Windows, Linux (x64 e arm64), macOS |
| Repository | https://github.com/AprileNunzio/ARGUS-PR (pubblico) |

**Attenzione npm 11+**: `better-sqlite3` ha uno script di install che npm blocca per default. Il campo `allowScripts` in `package.json` lo autorizza. Se il binding non si compila: `npm rebuild better-sqlite3`.

**Il repository e' pubblico.** Nessun segreto, nessuna chiave, nessun percorso personale nei file versionati.

---

## 4. Struttura

```
bin/argus.js              CLI: serve | doctor | reset-admin
src/
  kernel/                 config, result, errors, logger, process_guard, event_bus
  platform/               paths, ffmpeg, media_tools, version
  storage/                database, migrations/ (001_core, 002_exports)
  security/               vault, password, sessions, rbac, guards, audit
  http/                   server, router, http_utils, static_files, rate_limit, websocket
  features/<nome>/        <nome>_service.js, <nome>_routes.js, <nome>_repository.js
  app.js                  composizione: avvio, registrazione rotte
web/
  index.html
  assets/                 app.js, shell.js, dom.js, api.js, icons.js,
                          tokens.css, base.css, components.css, views.css
  wall.html               console locale a schermo intero (rotta /wall)
  features/<nome>/        vista della funzionalita'
                          system/ ospita la pagina Sistema e il pannello aggiornamenti
autoinstaller.sh          installatore Linux non presidiato (entry point del wget)
deploy/
  systemd/ windows/ docker/
  linux/                  install.sh, kiosk-session.sh, pre-start.sh
```

Regola di dipendenza: `features` → `security`/`storage`/`platform` → `kernel`. Mai al contrario. `kernel` non importa nulla del progetto tranne se stesso.

---

## 5. Convenzioni obbligatorie

### Errori

- Dominio e logica: nessun `try/catch`. Le condizioni previste sono valori di ritorno (`src/kernel/result.js`) oppure `AppError` lanciato.
- `AppError` (`src/kernel/errors.js`) porta `code`, `status`, `details`, `exposable`. Solo gli errori `exposable` mostrano il messaggio al client.
- Ai confini di I/O: `try/catch` ammesso, ma **traduci** in `AppError` conservando `cause`.
- Il pipeline HTTP cattura tutto in un punto solo (`src/http/server.js`, `handleFailure`). Non gestire errori nelle rotte.
- `process_guard.js` intercetta `uncaughtException` e `unhandledRejection` e chiude in modo pulito.
- Il pattern `.catch(() => null)` e' ammesso **solo** dove l'assenza di valore e' un esito legittimo, mai per nascondere guasti.

### Validazione

Ogni input esterno passa da `src/security/guards.js`. Mai fidarsi del body.
`requireStreamUrl` limita gli schemi a rtsp/rtsps/http/https: e' la difesa contro l'iniezione via URL.

### Processi esterni

`execFile`/`spawn` **sempre** con array di argomenti e `shell: false`. Mai interpolare stringhe in un comando. `rtsp_url` e' input utente: trattalo come ostile.

### Segreti

Password telecamere: `encryptSecret`/`decryptSecret` (AES-256-GCM, chiave in `<dataDir>/secrets/master.key`, permessi 0600).
Password utenti: `scrypt` con salt per utente.
Sessioni: token casuale a 256 bit, in DB solo l'hash SHA-256, cookie `HttpOnly; SameSite=Strict`.
Nei log e nelle risposte API le credenziali negli URL passano da `redactCredentials`.

### HTTP

CSP stretta senza `unsafe-inline`. **Conseguenza pratica: nessun attributo `style` nel DOM generato da JS.** Usa le classi di utilita' in `base.css`/`components.css` (`.stack`, `.row`, `.span-all`, `.form-grid`, ...). Per i valori dinamici usa `element.style.setProperty('--token', valore)`: le proprieta' personalizzate non violano la CSP. Aggiungere classi e' preferibile a indebolire il CSP.
Le rotte mutanti verificano l'`Origin`. Le rotte sensibili hanno rate limit.

### Frontend

Fogli di stile in quattro file caricati da `index.html`: `tokens.css` (colori, spaziature, ombre), `base.css` (reset, primitive di layout, animazioni), `components.css` (bottoni, pannelli, chip, form, tabelle), `views.css` (guscio, dashboard, wizard, login). Nessun file supera le 500 righe.

Icone: `web/assets/icons.js` genera SVG inline da tracciati locali. Nessuna CDN, nessun font di icone: la CSP resta intatta. Per aggiungerne una basta un tracciato nel dizionario `PATHS`.

**Tema unico chiaro**, per scelta del proprietario: nessun interruttore, nessun blocco `data-theme`. Ogni colore passa comunque dai token in `tokens.css`: mai valori letterali nei componenti.

Nessun framework, nessun build step. ESM nativo servito staticamente.
`el()` in `web/assets/dom.js` costruisce il DOM: usa `textContent`, mai `innerHTML`, per i dati.
Ricorda `[hidden] { display: none !important; }`: senza, `display:flex` di un componente vince sull'attributo.

---

## 5b. Primo avvio e dipendenze

**Setup guidato.** Se la tabella `users` e' vuota il sistema entra in *setup mode* e l'interfaccia mostra una procedura in 5 passi (`web/features/setup/`): benvenuto con rilevamento hardware, account amministratore con requisiti verificati in tempo reale, motore video, archiviazione, riepilogo. Le rotte `/api/setup/*` sono anonime e restano aperte finche' non esiste alcun utente; dopo `claimInstance()` rispondono 409 per sempre.

Nota di sicurezza consapevole: per scelta del proprietario **non c'e' codice di rivendicazione**. Nella finestra tra il primo avvio e il completamento del setup, chiunque raggiunga l'indirizzo puo' creare l'amministratore. Il banner di avvio lo dichiara. Non reintrodurre un token senza chiederlo.

**Cambio password imposto.** Se `must_change_password` e' attivo, il pipeline HTTP (`src/http/server.js`) blocca ogni rotta tranne quelle marcate `allowWhilePasswordPending: true` (sessione, logout, cambio password). Non e' un avviso: e' un blocco.

**Installazione automatica di ffmpeg.** `src/platform/dependencies/` installa il binario in `vendor/ffmpeg/` senza richiedere elevazione. Il flusso e' deliberato:

1. Scarica `checksums.sha256` dalla release **immutabile** fissata in `catalog.js`.
2. Individua l'asset per la piattaforma corrente con `selectAsset()` — il nome contiene l'hash della build e **non va mai scritto a mano**: si ricava dal file dei checksum, che e' l'unica fonte di verita'.
3. Scarica l'archivio e confronta lo SHA-256. **Discordanza = installazione annullata**, senza eccezioni.
4. Estrae con `Expand-Archive` su Windows e `tar -xf` altrove: nessuna libreria di decompressione aggiunta.

Per aggiornare la versione basta cambiare `tag` e `series` in `catalog.js`. Non esistono hash da mantenere a mano.

## 5c. Pipeline video (F1)

`src/features/streaming/` gestisce la diretta. Scelte da non ribaltare senza motivo:

- **fMP4 su WebSocket, non HLS.** HLS avrebbe imposto hls.js (dipendenza esterna) o segmenti su disco con latenza di secondi. Con fMP4 frammentato inviato su WebSocket e riprodotto con Media Source Extensions la latenza scende sotto il secondo e non serve alcuna libreria.
- **Un processo ffmpeg per canale, con conteggio dei visualizzatori.** Parte al primo spettatore, si ferma 12 secondi dopo l'ultimo. Riavvio con backoff esponenziale e rilevamento di stallo a 20 secondi.
- **Nessuna ricodifica se il codec e' gia' H.264** (`-c:v copy`). Solo H.265 e simili vengono transcodificati, perche' MSE non li accetta in modo affidabile.
- **Il segmento di inizializzazione viene memorizzato** e inviato a ogni nuovo spettatore: senza, chi entra a flusso avviato vedrebbe frammenti non decodificabili. `mp4_splitter.js` separa init e frammenti leggendo i box MP4.
- Il protocollo del socket e' binario: primo byte 1 = init, 2 = frammento.

Verificato end-to-end con sorgente sintetica: 1280x720, `readyState` 4, nessun errore.

## 5d. Registrazione e archivio (F2/F3)

`src/features/recording/`. Vincoli progettuali da rispettare:

- **L'indice dei segmenti NON sta in SQLite.** Vive in `media/index/<camera>/<AAAA-MM-GG>.jsonl`, append-only. In SQLite restano solo configurazione e impostazioni. Non spostarlo: a un segmento al minuto per otto canali si arriva a milioni di righe l'anno.
- **Partizionamento per giorno**, non per ora: il muxer `segment` di ffmpeg supporta `strftime` ma **non** `strftime_mkdir` (quella e' del muxer `hls`), quindi le directory le crea `ensureSegmentDays()`, con un timer che prepara anche il giorno successivo.
- **L'indicizzazione parte dal CSV di ffmpeg** (`-segment_list ... -segment_list_type csv`), che contiene solo il **nome file**, non il percorso: `segmentPathFromName()` ricostruisce la directory dalla data nel nome. Il CSV viene troncato ad ogni riavvio di ffmpeg, quindi il watcher rileva la troncatura e riazzera il contatore.
- **`-re` sulle sorgenti non RTSP.** Un file letto a velocita' piena verrebbe consumato in un istante e produrrebbe un unico segmento.
- **La ritenzione e' una funzione pura** (`retention.js`), coperta da test. Non introdurre I/O al suo interno: e' il codice che cancella prove, e deve restare verificabile su scenari limite. Un segmento `protected` non si cancella mai, per nessun motivo.
- La riproduzione passa da `/api/archive/:id/media`, che serve i file con supporto Range tramite `serveFile` e confina ogni percorso con `resolveInside`. Il traversal e' verificato: risponde 403.

## 5e. Console locale e installazione Linux (FA)

`src/features/kiosk/` + `web/features/wall/` + `autoinstaller.sh` + `deploy/linux/kiosk-session.sh`.

- **La console si autentica solo da loopback.** `POST /api/console/session` e' anonima ma `assertLocalConsole()` accetta esclusivamente `127.0.0.1`, `::1`, `::ffff:127.0.0.1`, `localhost`. Da qualsiasi altro indirizzo: 403. Non allargare questa lista, e non fidarti mai di `X-Forwarded-For` qui: l'indirizzo arriva da `clientAddress()`, che onora il proxy solo se `ARGUS_TRUST_PROXY` e' attivo — se lo diventa, questa rotta va riesaminata.
- La sessione emessa appartiene all'utente di servizio `__kiosk__`, creato al volo con ruolo `viewer`. **Non promuoverlo**: chi ha accesso fisico al monitor non deve poter riconfigurare l'impianto. Verificato: `POST /api/cameras` con quel cookie risponde 403.
- **Prima del setup la console non emette sessioni** (409). Motivo non estetico: `isSetupRequired()` e' `countUsers() === 0`, quindi creare `__kiosk__` prima del claim renderebbe l'installazione impossibile da configurare. Se un giorno il conteggio cambia, questo vincolo va rivisto.
- Il muro usa il flusso secondario perche' `StreamSession` gia' preferisce `subStreamUrl`. Non aggiungere un parametro di qualita' al socket senza motivo.
- `/wall` e' servita da `PAGE_ALIASES` in `src/http/server.js`, non dal fallback SPA.
- Nessuno stile inline: il CSP resta senza `unsafe-inline`. I valori dinamici della griglia passano da `style.setProperty` su variabili.
- `autoinstaller.sh` gira come root e **non fa domande**. Se aggiungi un passo, deve avere un default sicuro: nessun prompt, mai. Fa checkout dell'**ultimo tag**, non di `main`.

---

## 5f. Aggiornamento automatico (FU)

`src/features/updates/` + `deploy/linux/pre-start.sh` + `web/features/system/`.

Il principio che regge tutto: **il servizio non puo' riscrivere il proprio codice.** `/opt/argus-pr` appartiene a root, il servizio gira come `argus`, e l'unita' systemd concede scrittura solo su `DATA_DIR` e `vendor/`. Non "sistemare" questo dando la proprieta' del codice al servizio: e' il motivo per cui l'autoaggiornamento qui non e' un vettore di persistenza.

Divisione dei compiti:

- **L'applicazione chiede.** `POST /api/updates/apply` valida il riferimento, scrive `update-state.json` in `dataDir` e chiama `scheduleRestart()`, che esce con **codice 75**. Non tocca nient'altro. L'unita' dichiara `SuccessExitStatus=75`.
- **Lo script privilegiato applica.** `ExecStartPre=+/usr/local/lib/argus-pr/pre-start.sh` gira come root (il prefisso `+` scavalca `User=` e il sandbox). Rivalida il riferimento, riscrive il remoto sull'URL ufficiale, fa fetch, verifica che il tag esista, fa checkout e reinstalla le dipendenze.
- **La validazione e' doppia e identica**: `^v[0-9]+\.[0-9]+\.[0-9]+$`, in `semver.js` e di nuovo nello script. Rami, commit, percorsi e stringhe con metacaratteri non raggiungono mai `git`. Se aggiungi un canale beta, cambia **entrambe** le espressioni e i test.
- **I downgrade sono rifiutati** da `requestUpdate`: `isNewer` e' l'unico cancello.
- **Ripristino automatico**: applicato l'aggiornamento la fase e' `pending` con un contatore. Se il processo resta vivo 90 secondi si marca `healthy` da solo. Altrimenti `pre-start.sh` incrementa il contatore a ogni riavvio e al superamento di `MAX_ATTEMPTS` rimette in checkout `previousRef` (il SHA salvato prima di partire) e marca `rolled-back`.
- `update_state.js` **sanifica in lettura**, non solo in scrittura: il file sta in una directory scrivibile dal servizio, quindi va trattato come input ostile. Fase sconosciuta, ref non conforme, SHA non esadecimale e campi lunghi vengono scartati o troncati. Coperto da test.
- Le rotte richiedono `system.manage`. Verificato: un `viewer` riceve 403, un anonimo 401.
- Su Windows funzionano ricerca e notifica; l'applicazione con ripristino dipende da systemd. `isGitInstall()` fa da interruttore e l'interfaccia lo dichiara.

---

## 5g. Esportazione con catena di custodia (F3b)

`src/features/export/`. E' il codice che produce prove: trattalo di conseguenza.

- **`custody.js` e' puro e non fa I/O.** Costruisce il manifesto, incatena i segmenti e sigilla. Coperto da 11 test. Non introdurre lettura di file al suo interno.
- **La catena**: ogni segmento produce un anello `sha256(anello_precedente || posizione || sha_segmento || istante || byte)`. Cambiare, riordinare o sostituire un segmento cambia la radice. Verificato dai test.
- **Il sigillo e' un HMAC-SHA256** con una chiave derivata dalla master key con HKDF (`deriveKey('argus.export.custody.v1')`). La master key non viene mai usata direttamente. Un manifesto sigillato altrove non passa la verifica.
- **Doppio hash dei segmenti**: quello registrato al momento della registrazione e quello ricalcolato al momento dell'esportazione. Se differiscono, il manifesto marca il segmento `intact: false` e l'esportazione `sourcesIntact: false`. L'esportazione **non viene bloccata**: si esporta quello che c'e', dichiarando cosa non torna.
- **Nessuna ricodifica**: `-f concat -c copy`. Il manifesto lo dichiara con `reencoded: false`. Se un giorno servisse la ricodifica, quel campo deve diventare `true`: e' un'informazione legale, non cosmetica.
- Limiti volutamente stretti: sei ore per intervallo, 720 segmenti, due esportazioni in parallelo. Servono a impedire che un'esportazione saturi la macchina mentre registra.
- `export_paths.js` confina tutto con `resolveInside` e valida l'id come UUID. Verificato: una parte di download inesistente risponde 404.

---

## 6. Modello di sicurezza

- Ruoli: `admin`, `operator`, `viewer` (`src/security/rbac.js`).
- Permessi separati per `live.view`, `archive.view`, `archive.export`: vedere il live e portarsi via l'archivio hanno gravita' diverse.
- Ogni azione sensibile scrive in `audit_log` tramite `recordAudit`.
- Al primo avvio non esiste alcun utente: l'installazione e' "non reclamata" e la procedura guidata web crea l'amministratore. Nessuna password viene stampata sui log. Il codice di installazione e' stato rimosso su richiesta esplicita dell'utente: **non reintrodurlo senza chiederlo**.
- Path traversal: ogni percorso da input passa da `resolveInside()` (`src/platform/paths.js`).

---

## 7. Comandi

```bash
npm install            # con allowScripts gia' configurato
npm start              # avvia il server
npm run doctor         # verifica ambiente, vault, DB, ffmpeg
npm run reset-admin    # rigenera la password amministratore
node --test test/*.test.js   # su Windows serve il glob: "node --test test/" fallisce
```

Variabili: `ARGUS_HOST`, `ARGUS_PORT`, `ARGUS_DATA_DIR`, `ARGUS_MEDIA_DIR`, `ARGUS_FFMPEG_PATH`, `ARGUS_LOG_LEVEL`, `ARGUS_TRUST_PROXY`, `ARGUS_SESSION_TTL_HOURS`.

---

## 8. API attuali

| Metodo | Rotta | Permesso |
|---|---|---|
| GET | `/api/setup/status` | anonimo |
| POST | `/api/setup/claim` | anonimo, rate limit 10/10min |
| POST | `/api/setup/dependencies/ffmpeg` | anonimo, solo a setup aperto |
| POST | `/api/system/dependencies/ffmpeg` | `system.manage` |
| POST | `/api/auth/login` | anonimo, rate limit 8/5min |
| POST | `/api/auth/logout` | autenticato |
| GET | `/api/auth/session` | autenticato |
| POST | `/api/auth/password` | autenticato, rate limit 5/10min |
| GET | `/api/cameras` | `live.view` |
| GET | `/api/cameras/:id` | `live.view` |
| POST | `/api/cameras` | `camera.manage` |
| PUT | `/api/cameras/:id` | `camera.manage` |
| DELETE | `/api/cameras/:id` | `camera.manage` |
| POST | `/api/cameras/:id/probe` | `camera.manage` |
| POST | `/api/discovery/onvif` | `camera.manage` |
| GET | `/api/system/health` | anonimo |
| GET | `/api/system/info` | `live.view` |
| GET | `/api/system/audit` | `audit.view` |
| POST | `/api/console/session` | anonimo, solo loopback, rate limit 30/1min |
| GET | `/api/console/status` | anonimo, solo loopback |
| WS | `/api/events` | `live.view` |
| GET | `/api/updates/status` | `system.manage` |
| POST | `/api/updates/check` | `system.manage`, rate limit 10/10min |
| POST | `/api/updates/apply` | `system.manage`, rate limit 5/1h |
| POST | `/api/updates/cancel` | `system.manage` |
| GET | `/api/exports` | `archive.export` |
| POST | `/api/exports` | `archive.export`, rate limit 10/10min |
| GET | `/api/exports/:id` | `archive.export` |
| GET | `/api/exports/:id/verify` | `archive.export` |
| GET | `/api/exports/:id/download/:part` | `archive.export` |
| DELETE | `/api/exports/:id` | `archive.export` |
| WS | `/api/stream/:id` | `live.view` |

Risposta di errore: `{ "error": { "code", "message", "details" } }`.

---

## 9. Stato reale: cosa esiste e cosa no

**Funzionante e verificato:** kernel, config, logger strutturato, gestione errori globale, SQLite con migrazioni, vault AES-256-GCM, autenticazione scrypt con sessioni, RBAC, audit, server HTTP con Range e CSP, WebSocket autenticato, rilevamento ffmpeg, **setup guidato in 5 passi**, **cambio password imposto**, **installazione automatica di ffmpeg con verifica SHA-256**, CRUD telecamere, probe RTSP via ffprobe, discovery ONVIF WS-Discovery, interfaccia web responsive con setup/login/riepilogo/telecamere, **diretta video reale via fMP4 su WebSocket e Media Source Extensions**, **registrazione continua con segmentazione**, **indice append-only**, **ritenzione automatica**, **archivio con timeline e riproduzione**, **console locale loopback su `/wall`**, **autoinstaller Linux non presidiato**, **autoaggiornamento da GitHub con ripristino automatico**, **esportazione con catena di custodia verificata su segmenti reali**.

**Non ancora implementato:** esportazione con catena di custodia, motion detection, pianificazione oraria, ritenzione, target NAS, uscite di allarme, uscite audio, riconoscimento AI.

Se un utente chiede una di queste, **non fingere che esista**: dichiara che va costruita.

---

## 10. Roadmap

| Fase | Contenuto | Stato |
|---|---|---|
| F0 | Kernel, sicurezza, HTTP, UI, telecamere | completata |
| F1 | Pipeline ffmpeg, diretta, fMP4 su WebSocket | completata |
| F2 | Registrazione, segmentazione, indice, ritenzione | completata |
| F3 | Playback, timeline ed esportazione | completata |
| FA | Autoinstaller Linux, console locale a schermo intero | completata |
| FU | Autoaggiornamento da GitHub con ripristino automatico | completata |
| F3b | Esportazione con catena di custodia | completata |
| F4 | Pianificazione oraria, motion detection, zone | da fare |
| F5 | NAS, tiering, allarmi, audio | da fare |
| F6 | Salute, watchdog, conformita' | da fare |

**Vincolo architetturale per F2**: l'indice dei segmenti non va nella tabella SQLite se supera l'ordine di 10^5 righe. Usa file JSONL append-only per canale e per giorno; in SQLite tieni solo configurazione e rollup giornalieri.

---

## 11. Regole per te, assistente

- Non introdurre dipendenze senza necessita' dimostrata. Ogni pacchetto e' superficie d'attacco.
- Non aggiungere commenti nel codice.
- Non superare 500 righe per file.
- Non indebolire il CSP per comodita'.
- Non usare `shell: true`.
- Non inventare funzionalita' assenti: consulta §9.
- Verifica sempre con `npm run doctor` e un avvio reale prima di dichiarare qualcosa completo.
- **Aggiorna questo file** quando cambi struttura, API, dipendenze, convenzioni o stato di §9 e §10.
