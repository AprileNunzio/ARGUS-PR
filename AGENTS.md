# AGENTS.md

Contesto operativo per assistenti AI che lavorano su questo repository.
Leggi questo file **prima** di scrivere codice. Per sapere **cosa manca ancora** leggi [HANDOVER.md](HANDOVER.md); per **come costruirlo** leggi [docs/IMPLEMENTAZIONE.md](docs/IMPLEMENTAZIONE.md); per **le difese di sicurezza ancora mancanti** leggi [docs/SICUREZZA.md](docs/SICUREZZA.md). Se modifichi il progetto, **aggiorna questo file nello stesso commit**.

Ultimo aggiornamento: 2026-09-03 · versione progetto: 0.13.0

**Mappa della documentazione.** Ogni file ha un compito, e ognuno dichiara in testa cosa e' gia' costruito, cosi' nessuno ricostruisce quello che esiste.

| File | Compito |
|---|---|
| `AGENTS.md` | vincoli, convenzioni, stato delle API e del progetto |
| `HANDOVER.md` | cosa manca, in ordine di priorita' |
| `docs/SICUREZZA.md` | come costruire MFA, firma delle release, integrita', cifratura a riposo |
| `docs/AUTOMAZIONI.md` | come costruire varchi, notifiche, ricerca forense, planimetria, PTZ |
| `docs/IMPLEMENTAZIONE.md` | metodo: come si accerta che una funzione sia vera, e cosa non fare |
| `docs/MOVIMENTO.md` | perche' pianificazione e movimento sono fatti cosi (gia' costruiti) |
| `docs/VISIONE.md` | perche' la visione e' fatta cosi (gia' costruita) |
| `shield/README.md` | ARGUS-SHIELD: ruleset, punteggio, comandi |



---

## 0. Regola zero: la sicurezza viene prima di tutto

Questo e' un sistema di videosorveglianza esposto a internet. Ogni riga di codice si giudica **prima** per la sua superficie d'attacco e **poi** per tutto il resto: eleganza, prestazioni, comodita' d'uso. Se le due cose sono in conflitto, vince la sicurezza, e il compromesso va scritto qui.

Le sette regole che non si negoziano mai:

1. **Niente traffico in chiaro.** Il servizio parla solo TLS. La porta 80 esiste unicamente per rispondere 308 verso HTTPS e non serve nessun contenuto, non legge cookie, non tocca il database.
2. **Default negato.** Ogni rotta nuova nasce `Exposure.PRIVATE`: irraggiungibile da internet finche' qualcuno non decide il contrario **motivandolo qui**. Non si aggiunge `Exposure.PUBLIC` per far funzionare qualcosa in fretta.
3. **Da internet si guarda, non si tocca.** Nessuna configurazione, nessun archivio, nessuna esportazione, nessun account amministrativo. Vedi §6b.
4. **Ogni input e' ostile** finche' non ha attraversato `src/security/guards.js`. Vale anche per gli indirizzi IP: prima di raggiungere `nft` passano da `isAddress()`, sempre.
5. **`spawn` con `shell: false`**, argomenti come array, mai concatenazione di stringhe. Nessuna eccezione.
6. **Ogni rifiuto e' un evento.** Se il codice nega qualcosa, lo scrive in `security-events.jsonl`: e' il flusso che alimenta ARGUS-SHIELD. Un rifiuto silenzioso e' un attacco che nessuno vede.
7. **Il segreto non si allarga.** Chiavi private a `0600`, mai nei log, mai in una risposta HTTP, mai in un messaggio d'errore.

Prima di aprire una rotta, allargare un permesso o toccare `net_zones.js`, `tls.js`, `lockout.js` o `shield/`: fermati e chiedi. Sono i file dove un errore non produce un bug, produce una telecamera in mano a qualcun altro.

---

## 1. Cos'e' ARGUS-PR

NVR (Network Video Recorder) self-hosted: un demone Node.js che acquisisce flussi RTSP da telecamere IP, li registra su disco, li rende riproducibili e li analizza. L'interfaccia e' una web app servita dallo stesso processo.

**Non e' un'applicazione desktop.** Gira headless su Linux server o come servizio Windows; si amministra dal browser di qualunque dispositivo in rete. Su Windows esiste un launcher desktop (`ARGUS-PR.exe`) che avvia il servizio e apre la console in finestra applicativa: e' un avviatore, non una riscrittura dell'interfaccia.

Il sistema e' pensato per essere **esposto a internet in sola visione**: chi arriva da fuori vede le telecamere, chi arriva dalla rete locale amministra. La separazione e' applicata dal codice, non dalla configurazione del router. Vedi §6b.

Accanto al NVR gira **ARGUS-SHIELD**, un applicativo autonomo (`shield/`) che governa il firewall del sistema e risponde agli attacchi. Vedi §6d.

Stato reale: **fondamenta, diretta, registrazione, archivio, riproduzione, console locale, installazione automatica Linux, autoaggiornamento, TLS obbligatorio, separazione visione/gestione e firewall perimetrale funzionanti.** Vedi §9.

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
8. **La regola zero (§0) prevale su tutte le altre.**

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
bin/argus.js              CLI: serve | doctor | cert | reset-admin
src/
  kernel/                 config, result, errors, logger, process_guard, event_bus
  platform/               paths, ffmpeg, media_tools, version, tls, x509, metrics, hardware
  storage/                database, migrations/ (001_core ... 008_mfa)
  security/               vault, password, sessions, rbac, guards, audit,
                          net_zones, lockout, security_events, totp
  http/                   server, router, http_utils, static_files, rate_limit, websocket
  features/<nome>/        <nome>_service.js, <nome>_routes.js, <nome>_repository.js
  features/settings/      settings_schema.js dichiara OGNI impostazione modificabile
  app.js                  composizione: avvio, registrazione rotte
web/
  index.html
  assets/                 app.js, shell.js, dom.js, api.js, icons.js,
                          tokens.css, base.css, components.css, views.css
  wall.html               console locale a schermo intero (rotta /wall)
  features/<nome>/        vista della funzionalita'
                          system/ ospita la pagina Sistema e il pannello aggiornamenti
shield/                   ARGUS-SHIELD: applicativo firewall autonomo, zero dipendenze
  bin/argus-shield.js     CLI: apply | watch | status | ban | unban | ruleset | flush
  src/                    config, addresses, ruleset, banlist, detectors, watcher,
                          service, logger, backends/ (nftables, netsh, report-only)
  test/                   suite propria, si lancia separatamente
autoinstaller.sh          installatore Linux non presidiato (entry point del wget)
deploy/
  systemd/ docker/
  linux/                  install.sh, kiosk-session.sh, pre-start.sh
  windows/                install.ps1, uninstall.ps1, installer.iss,
                          build-installer.ps1, quick-start.bat,
                          launcher/ArgusLauncher.cs
web/assets/argus.ico      icona dell'installer, del launcher e dei collegamenti
build/                    output di build del launcher, ignorato da git
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
- Il muro carica `https://127.0.0.1/wall`. Lo script di sessione installa l autorita interna nel database NSS del profilo con `certutil`; se `certutil` manca ripiega su `--ignore-certificate-errors`, che vale solo per quel browser e per quel singolo URL di loopback. Se aggiungi altre pagine al kiosk, questa scorciatoia va rivista.
- La home dell utente kiosk sta sotto `/home`, non in `/var/lib`: su Ubuntu il browser e uno snap e il confinamento non legge home directory fuori da `/home`. Spostarla altrove fa partire un muro nero.
- `autoinstaller.sh` gira come root e **non fa domande**. Se aggiungi un passo, deve avere un default sicuro: nessun prompt, mai. Fa checkout dell'**ultimo tag**, non di `main`.

---

## 5f. Aggiornamento automatico (FU)

`src/features/updates/` + `deploy/linux/pre-start.sh` + `web/features/system/`.

Il principio che regge tutto: **il servizio non puo' riscrivere il proprio codice.** `/opt/argus-pr` appartiene a root, il servizio gira come `argus`, e l'unita' systemd concede scrittura solo su `DATA_DIR` e `vendor/`. Non "sistemare" questo dando la proprieta' del codice al servizio: e' il motivo per cui l'autoaggiornamento qui non e' un vettore di persistenza.

**Il riavvio non e' mai una decisione del software.** La politica sta in `updates.restartPolicy` e vale tre cose:

| Politica | Comportamento |
|---|---|
| `ask` (predefinita) | trovato un aggiornamento, la fase diventa `awaiting-approval` e non succede altro finche' un amministratore non chiama `POST /api/updates/approve` |
| `window` | applica da solo, ma **solo** dentro la finestra di manutenzione; fuori resta in attesa e ricontrolla ogni 10 minuti |
| `immediate` | applica appena disponibile |

Il valore predefinito e' `ask` **per scelta di sicurezza**: un NVR che si riavvia da solo mentre registra e' un buco nella prova, non una comodita'. Non cambiare questo default. La finestra e' valutata sull'ora locale della macchina e sa attraversare la mezzanotte (`maintenance_window.js`); `nextOpening()` serve a dire all'operatore quando accadra'.

**Il controllo dell'aggiornamento e' automatico a ogni avvio.** `runAutomaticUpgrade()` in `src/features/updates/auto_update.js` gira in `bootstrap()` **prima** che partano ffmpeg, gli hub e il server: se c'e' una release piu' recente la richiede ed esce con 75, cosi' il riavvio non interrompe nulla di gia' avviato. Lo stesso codice viene richiamato dal controllo periodico ogni 6 ore, perche' un NVR acceso da mesi non si aggiornerebbe mai altrimenti: quel percorso costa un riavvio del servizio, quindi qualche secondo di buco nella registrazione. Con `ARGUS_AUTO_UPDATE=false` resta tutto manuale.

Le quattro protezioni contro il ciclo infinito, tutte necessarie:

1. **Quarantena.** Se una versione applicata automaticamente finisce in `rolled-back` o `failed`, all'avvio successivo il suo tag entra in `quarantine` e **non viene piu' tentato in automatico**. Senza questo, una release difettosa manderebbe la macchina in un ciclo di aggiornamento e ripristino all'infinito. La quarantena vale solo per i tentativi automatici: un aggiornamento chiesto a mano dall'operatore passa comunque, ed e' voluto.
2. **Freno temporale.** `ARGUS_AUTO_UPDATE_MIN_INTERVAL` (60 minuti) e' la distanza minima fra due tentativi automatici, registrata in `lastAutoAttemptAt`. Protegge dal caso in cui il servizio venga riavviato in continuazione.
3. **Fase in corso.** Con fase `pending` o `requested` nessun nuovo controllo parte: si sta ancora verificando la versione appena applicata.
4. **Errore di rete non fatale.** GitHub irraggiungibile significa avviare la versione installata, non fallire l'avvio.

Quando `markHealthy()` conferma la versione, il tag viene tolto dalla quarantena: una release che prima falliva e poi funziona torna pienamente valida.

**Firma delle release.** `verify_signature()` in `pre-start.sh` verifica il tag con `git verify-tag` in un `GNUPGHOME` temporaneo, usando la chiave in `/etc/argus-pr/update-key.asc` (`ARGUS_UPDATE_KEYRING`). Se la chiave c'e' e la firma non torna, **l'aggiornamento viene rifiutato**. Se la chiave non c'e', l'aggiornamento procede e viene registrato un avviso esplicito nel journal. Questo e' il punto debole residuo: con l'aggiornamento automatico attivo, chi controlla l'account GitHub controlla ogni impianto installato. Firmare i tag e distribuire la chiave pubblica chiude il buco, ed e' la cosa da fare appena possibile.

Divisione dei compiti:

- **L'applicazione chiede.** `POST /api/updates/apply` valida il riferimento, scrive `update-state.json` in `dataDir` e chiama `scheduleRestart()`, che esce con **codice 75**. Non tocca nient'altro. L'unita' dichiara `SuccessExitStatus=75`.
- **Lo script privilegiato applica.** `ExecStartPre=+/usr/local/lib/argus-pr/pre-start.sh` gira come root (il prefisso `+` scavalca `User=` e il sandbox). Rivalida il riferimento, riscrive il remoto sull'URL ufficiale, fa fetch, verifica che il tag esista, fa checkout e reinstalla le dipendenze.
- **La validazione e' doppia e identica**: `^v[0-9]+\.[0-9]+\.[0-9]+$`, in `semver.js` e di nuovo nello script. Rami, commit, percorsi e stringhe con metacaratteri non raggiungono mai `git`. Se aggiungi un canale beta, cambia **entrambe** le espressioni e i test.
- **I downgrade sono rifiutati** da `requestUpdate`: `isNewer` e' l'unico cancello.
- **Ripristino automatico**: applicato l'aggiornamento la fase e' `pending` con un contatore. Se il processo resta vivo 90 secondi si marca `healthy` da solo. Altrimenti `pre-start.sh` incrementa il contatore a ogni riavvio e al superamento di `MAX_ATTEMPTS` rimette in checkout `previousRef` (il SHA salvato prima di partire) e marca `rolled-back`.
- `update_state.js` **sanifica in lettura**, non solo in scrittura: il file sta in una directory scrivibile dal servizio, quindi va trattato come input ostile. Fase sconosciuta, ref non conforme, SHA non esadecimale e campi lunghi vengono scartati o troncati. Coperto da test.
- Le rotte richiedono `system.manage`. Verificato: un `viewer` riceve 403, un anonimo 401.
- Su Windows e Linux l'aggiornamento automatico e con ripristino e' pienamente supportato: su Linux via systemd e pre-start.sh, su Windows via windows_updater.js (download archivio release o git, backup e ripristino automatico alla partenza in caso di mancata stabilizzazione).

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

## 5h. Pianificazione oraria, rilevamento movimento con zone, ingressi rilevamenti (F4)

`src/features/scheduling/` + `src/features/motion/` + `src/features/detections/`.

- **Pianificazione oraria pura**: `schedule.js` calcola gli slot su orario locale (7 giorni × 48 slot da 30 minuti = 336 slot). Nessun I/O. `recording_hub.js` rivaluta la policy ogni 30 secondi e gestisce eccezioni di calendario giornaliere.
- **Rilevamento movimento su pixel senza librerie AI**: processo ffmpeg separato su substream (`fps=5,scale=160:90,format=gray`, 14400 byte a fotogramma). Modello di sfondo a media mobile esponenziale ($\alpha=0.02$), differenza pixel (soglia 25), guardia anti-abbagliamento / cambi di luce (>60% pixel azzera lo sfondo, 0 eventi).
- **Zone poligonali normalizzate (0–1)**: point-in-polygon a ray-casting puro, bitmask a 32 bit per frame 160×90, massimo 32 zone per telecamera. Isteresi a 2 frame per accensione e 10 per spegnimento, cooldown configurabile per zona.
- **Ingresso rilevamenti macchina**: `POST /api/detections` protetto da chiavi API con memorizzazione del solo hash SHA-256 (nessuna chiave in chiaro nel DB) o sessione operatore. Rate limit 600/min per sorgente.
- **Registrazione su evento e ritenzione selettiva**: segmenti associati a finestre temporali di eventi rilevati; `retention.js` estesa per conservare i segmenti con evento più a lungo rispetto ai segmenti ordinari e sacrificare per primi i segmenti ordinari in caso di quota o pressione disco.
- **Interfaccia responsive**: editor griglia oraria 7×48 (`web/features/scheduling/schedule_editor.js`) ed editor canvas per il tracciamento di poligoni di movimento con slider sensibilità e cooldown (`web/features/motion/zone_editor.js`).

---

## 5i. Visione AI, tracciamento, biometria facciale, targhe ANPR e controllo accessi (F5)

`src/features/vision/` + `src/features/access/` + `src/features/people/` + `vision/worker.py`.

- **Isolamento runtime Node.js**: Node.js mantiene strettamente **2 dipendenze** runtime (`better-sqlite3`, `ws`). Nessuna libreria di rete neurale o binding C++ caricato nel processo principale.
- **Worker di visione Python su standard I/O**: `vision/worker.py` legge fotogrammi rawvideo BGR24 640×360 da `stdin` e invia risultati JSONL su `stdout`. Esegue modelli ONNX YOLOX (oggetti, persone, veicoli, animali), YuNet (volti) e SFace (vettori 128-d).
- **Tracciamento puro IoU**: `tracking.js` associa rilevazioni consecutive con soglia minima IoU 0.3, conferma le tracce dopo 3 frame e le chiude dopo 5 assenze.
- **Voto multi-frame su targhe**: `plates.js` colleziona le letture e calcola la stringa vincente pesata per confidenza con validazione del formato targa italiano ed europeo.
- **Biometria facciale e cancellazione GDPR**: `face_matcher.js` calcola similarità del coseno (soglia SFace 0.363). `people_repository.js` supporta la cancellazione immediata e totale di anagrafica e log ai sensi del GDPR.
- **Controllo accessi e priorità assoluta blacklist**: `access_rules.js` valuta pattern con wildcard (`*`, `?`). La blacklist vince sempre sulla whitelist in caso di conflitto (`deny`).
- **Installatori completi e autonomi**: `autoinstaller.sh` (Linux) e `deploy/windows/install.ps1` (Windows) configurano autonomamente l'ambiente Python virtualenv, scaricano i modelli ONNX con controllo SHA-256 e configurano i servizi di sistema.

---

## 5j. Accelerazione hardware totale e ottimizzazione prestazioni (GPU, RAM, CPU)

`src/platform/hardware.js` + `src/features/settings/performance_tuning.js` + `web/features/system/performance_panel.js`.

- **Sfruttamento totale dell'hardware**: rilevamento dinamico delle risorse della macchina host (CPU modello e core logici, RAM totale/libera, acceleratori ffmpeg GPU rilevati, provider di inferenza AI disponibili).
- **Accelerazione decodifica e codifica GPU**: supporto per `-hwaccel` su flussi di anteprima, motion detection e visione AI (`cuda`, `qsv`, `vaapi`, `d3d11va`, `videotoolbox`, `amf`). Supporto encoder GPU per transcodifica (`h264_nvenc`, `h264_qsv`, `h264_amf`, `h264_vaapi`, `h264_videotoolbox`, `libx264`).
- **AI Execution Providers e multithreading**: worker Python configurabile via CLI per esecuzione su provider hardware prioritario (NVIDIA CUDA / TensorRT, DirectML su Windows, OpenVINO su Intel, CPU multi-core con `intra_op_num_threads` e `inter_op_num_threads`). Supporto backend CUDA in OpenCV DNN per YuNet e SFace.
- **Tuning estremo SQLite in RAM**: applicazione dinamica a caldo di `cache_size` (fino a 2048 MB in RAM), `mmap_size` (memoria mappata I/O fino a 4096 MB), `threads` e `temp_store = MEMORY`.
- **Preset rapidi di sistema**: 'Massime Prestazioni (Full GPU + RAM)', 'Bilanciato', 'Risparmio Energetico' e personalizzato, applicabili a caldo dall'interfaccia delle impostazioni.

---


## 5k. Installazione Windows e launcher desktop

`deploy/windows/` + `web/assets/argus.ico`.

- `installer.iss` produce `dist/ARGUS-PR-v0.9.0-Setup.exe` con Inno Setup. I collegamenti puntano a `{app}\ARGUS-PR.exe`, **mai a un URL**: un collegamento Internet non ha icona propria e apre una scheda del browser che, se il servizio non e' ancora attivo, mostra "connessione rifiutata".
- `launcher/ArgusLauncher.cs` e' il launcher: legge la porta da `ARGUS_PORT` o da `argus.env`, avvia il servizio `ArgusPR` (con elevazione via `sc.exe` se serve, altrimenti processo `node` staccato), attende la porta fino a 90 secondi e apre il browser in modalita' `--app`. Ogni fallimento diventa una finestra di dialogo con il percorso del registro.
- `build-installer.ps1` e' l'unico entry point di build: compila il launcher con `csc.exe` del .NET Framework di sistema (nessuna dipendenza aggiuntiva), incorpora `argus.ico` e invoca `ISCC.exe`. L'eseguibile finisce in `build/`, ignorato da git.
- `install.ps1` non deve mai copiare i file su se stessi: quando gira dentro `{app}` la sorgente coincide con la destinazione e la copia va saltata. Usa `robocopy` con esclusioni, controlla `$LASTEXITCODE` di ogni comando nativo, scrive un transcript in `%ProgramData%\ARGUS-PR\install.log` e termina con codice 1 se la porta non risponde entro 60 secondi. Se `nssm` manca, ripiega su un'attivita' pianificata SYSTEM all'avvio.
- `uninstall.ps1` rimuove servizio, attivita' pianificata e regole firewall, ma **non** tocca `%ProgramData%\ARGUS-PR`: le registrazioni sopravvivono alla disinstallazione.

---

## 6. Modello di sicurezza

- Ruoli: `admin`, `operator`, `viewer` (`src/security/rbac.js`).
- Permessi separati per `live.view`, `archive.view`, `archive.export`: vedere il live e portarsi via l'archivio hanno gravita' diverse.
- Ogni azione sensibile scrive in `audit_log` tramite `recordAudit`.
- Al primo avvio non esiste alcun utente: l'installazione e' "non reclamata" e la procedura guidata web crea l'amministratore. Nessuna password viene stampata sui log. Il codice di installazione e' stato rimosso su richiesta esplicita dell'utente: **non reintrodurlo senza chiederlo**.
- Path traversal: ogni percorso da input passa da `resolveInside()` (`src/platform/paths.js`).
- **Blocco progressivo per account** (`src/security/lockout.js`): il limite per indirizzo non basta contro una botnet distribuita, quindi il contatore e' **per nome utente**. Dal terzo fallimento parte l'attesa esponenziale (30s, 60s, 120s... fino a 30 minuti); al decimo scattano 60 minuti. Il controllo avviene **prima** di verificare la password, e un accesso riuscito azzera tutto. La finestra di decadimento e' un'ora.
- **Ogni rifiuto alimenta ARGUS-SHIELD** tramite `emitSecurityEvent()`.

---

## 6b. TLS obbligatorio e PKI interna

`src/platform/tls.js` + `src/platform/x509.js`.

Il server e' `https.createServer`, punto. Non esiste piu' un percorso in chiaro: `createRedirectServer()` occupa la porta 80 solo per rispondere **308** verso HTTPS, senza router, senza cookie, senza database. Appena la connessione e' cifrata, `securityHeaders()` emette HSTS e `buildCookie()` aggiunge `Secure`: erano gia' scritti cosi', semplicemente prima non si attivavano mai.

- **`x509.js` genera certificati in DER puro**, senza dipendenze e senza invocare `openssl`. Chiavi ECDSA P-256, firma `ecdsa-with-SHA256`. Se tocchi la codifica ASN.1, i test in `test/tls.test.js` fanno un handshake TLS vero: se passano, la codifica e' corretta.
- **La PKI interna e' a due livelli**: un'autorita' (`ca.crt` / `ca.key`, 10 anni) firma il certificato del server (`server.crt` / `server.key`, 397 giorni). Il file da installare sui client e' `ca.crt`. Le chiavi private stanno in `<dataDir>/secrets/pki/` a `0600`.
- **Non distruggere la chiave della CA.** Serve a riemettere il certificato quando scade o quando cambiano gli indirizzi. E' protetta dai permessi del filesystem e, in produzione, va protetta da LUKS.
- **Il certificato si rinnova da solo** quando mancano meno di 30 giorni alla scadenza o quando l'insieme dei SAN cambia (nuovo IP, nuovo nome pubblico). Il confronto e' su `server.json`.
- I SAN comprendono `localhost`, l'hostname, tutti gli IPv4 locali e ogni nome in `ARGUS_PUBLIC_HOSTS`. **Chi espone il NVR su un dominio deve dichiararlo li'**, altrimenti il certificato non copre quel nome.
- Con `ARGUS_TLS_CERT` e `ARGUS_TLS_KEY` un certificato pubblico vero ha la precedenza e la PKI interna non viene nemmeno toccata.
- `argus cert` stampa impronta, scadenza e percorso dell'autorita': e' il comando da dare all'utente che vede l'avviso del browser.

---

## 6c. Zone di rete: da internet si guarda, non si tocca

`src/security/net_zones.js` + il dispatch in `src/http/server.js`.

Ogni richiesta viene classificata in tre zone: `local` (loopback), `lan` (RFC1918, link-local, ULA IPv6, piu' le reti in `ARGUS_TRUSTED_NETWORKS`, dove va messa la subnet WireGuard), `wan` (tutto il resto, **compreso un indirizzo non riconosciuto**: in caso di dubbio si assume il caso peggiore).

Ogni rotta dichiara la propria esposizione, e **il default e' `PRIVATE`**:

| Esposizione | Raggiungibile da | Uso |
|---|---|---|
| `LOCAL` | solo loopback | console del muro video |
| `PRIVATE` (default) | loopback e rete locale | tutta l'amministrazione |
| `PUBLIC` | ovunque | login, sessione, elenco telecamere, diretta |

Sopra il livello di rotta agiscono quattro sbarramenti indipendenti, ognuno dei quali basta da solo:

1. **`ARGUS_PUBLIC_ACCESS=false` (default) chiude tutto alla WAN**, rotte pubbliche comprese. L'esposizione a internet e' una decisione esplicita.
2. **Nessun account amministrativo puo' entrare da internet.** Chi ha `system.manage` viene rifiutato al login con lo stesso messaggio di una password sbagliata (nessuna enumerazione) e in `enforceSessionZone()` a ogni richiesta successiva.
3. **Le sessioni sono legate alla zona di nascita** (colonna `sessions.zone`): un cookie emesso in rete locale e' inutilizzabile da internet. Un cookie rubato in ufficio non apre nulla da fuori.
4. **L'elenco telecamere e' ridotto da WAN**: `publicView()` restituisce id, nome e stato. URL RTSP, host, porte, marca e modello non escono mai: la topologia interna non e' affare di chi guarda da fuori.

**Un rifiuto di zona genera un evento di sicurezza solo se la richiesta non ha una sessione valida.** Un utente gia' autenticato che da internet tocca una rotta privata e' quasi sempre la SPA che chiede qualcosa che quella zona non concede: penalizzarlo significherebbe far bandire dallo scudo un utente legittimo dopo due richieste. Chi non ha credenziali invece viene contato. Per lo stesso motivo `GET /api/auth/session` restituisce `zone` e `managementAllowed`: e' l'informazione con cui il frontend nasconde cio' che da quella zona non potrebbe comunque usare.

Il socket WebSocket applica gli stessi criteri: `/api/events` e' vietato da WAN, i flussi video no.

Da WAN valgono inoltre un budget di 240 richieste al minuto per indirizzo e limiti di rotta divisi per quattro.

**Se un giorno il NVR finisce dietro un reverse proxy**, `ARGUS_TRUST_PROXY` fa fidare di `X-Forwarded-For` e da quel momento la zona la decide il proxy: allora il proxy deve essere l'unico ad avere accesso alla porta e deve ripulire l'intestazione. Attivarlo con il servizio raggiungibile direttamente significa lasciar scegliere all'attaccante la propria zona.

---

## 6d. ARGUS-SHIELD, il firewall perimetrale

`shield/` — applicativo autonomo, `package.json` proprio, **zero dipendenze**, unita' systemd separata (`argus-shield.service`), utente `root` con le sole capability `CAP_NET_ADMIN` e `CAP_NET_RAW`.

**Il principio che regge il progetto: lo scudo legge, il NVR non comanda.** La comunicazione e' a senso unico, il NVR scrive eventi in append su `<dataDir>/security-events.jsonl` e lo scudo li segue. Non esiste API, socket o segnale con cui il NVR possa ordinare qualcosa allo scudo. **Non introdurne uno**: e' il motivo per cui un NVR compromesso non si porta dietro il firewall.

- **Ruleset nftables `inet argus_shield`** applicato in modo atomico e **validato con `nft -c` prima di essere installato**: se non compila, non si applica e la configurazione precedente resta. Policy `drop` su input e forward, output libero (servono telecamere e aggiornamenti).
- Difese di base: stati `invalid` scartati, scansioni NULL/XMAS/FIN/SYN-RST rifiutate, ICMP a 5/s, connessioni contemporanee per sorgente limitate, nuove connessioni al minuto limitate, **DHCP client sempre consentito** (senza quella regola la macchina perde l'indirizzo al riavvio: non rimuoverla).
- SSH raggiungibile **solo dalle reti locali**. Le porte pubbliche sono quelle di `publicPorts`, di norma 443 e 80.
- **Punteggio con decadimento esponenziale** (dimezzamento ogni 10 minuti): ogni evento pesa, superata la soglia 10 scatta il blocco. La recidiva quadruplica la durata fino al tetto di 7 giorni. `auth.admin_from_wan` blocca subito: nessuno tenta di entrare come amministratore da internet per sbaglio.
- **Rete locale e allowlist non vengono mai bloccate** (`banLocalNetworks: false`). Bloccare la propria LAN significa chiudersi fuori da un impianto che sta registrando; un problema interno e' un problema di persone, non di firewall.
- I blocchi sopravvivono al riavvio (`state.json`) e vengono riapplicati con `restoreBans()`.
- **Ogni indirizzo passa da `isAddress()` prima di raggiungere `nft`**, che viene invocato con `spawn` a `shell: false` e argomenti come array.
- Dove nftables manca: backend `netsh` su Windows, altrimenti `report-only`, che calcola e registra tutto senza toccare la rete. **`report-only` non protegge nulla**: se lo status lo mostra, il sistema e' scoperto.
- Se lo scudo e' attivo, l'installer disattiva ufw e firewalld: due gestori sulla stessa tabella si sabotano a vicenda.

---

## 7. Comandi

```bash
npm install            # con allowScripts gia' configurato
npm start              # avvia il server
npm run doctor         # verifica ambiente, vault, DB, ffmpeg
npm run cert           # impronta del certificato e percorso dell'autorita' interna
npm run reset-admin    # rigenera la password amministratore
node --test test/*.test.js         # su Windows serve il glob: "node --test test/" fallisce
node --test shield/test/*.test.js  # suite di ARGUS-SHIELD, separata

argus-shield status    # backend, ruleset, indirizzi bloccati e sorvegliati
argus-shield ruleset   # stampa il ruleset senza applicarlo
argus-shield ban <ip>  # blocco manuale
```

Variabili NVR: `ARGUS_AUTO_UPDATE` (default `true`), `ARGUS_AUTO_UPDATE_MIN_INTERVAL` (minuti, default 60), `ARGUS_UPDATE_KEYRING`, `ARGUS_HOST`, `ARGUS_PORT` (HTTPS, default 443), `ARGUS_HTTP_PORT` (solo redirect, default 80, `0` disabilita), `ARGUS_DATA_DIR`, `ARGUS_MEDIA_DIR`, `ARGUS_FFMPEG_PATH`, `ARGUS_LOG_LEVEL`, `ARGUS_TRUST_PROXY`, `ARGUS_SESSION_TTL_HOURS`, `ARGUS_PUBLIC_ACCESS`, `ARGUS_PUBLIC_HOSTS`, `ARGUS_TRUSTED_NETWORKS`, `ARGUS_TLS_CERT`, `ARGUS_TLS_KEY`, `ARGUS_TLS_CA`.

Variabili ARGUS-SHIELD: `ARGUS_SHIELD_CONFIG`, `ARGUS_SHIELD_EVENTS`, `ARGUS_SHIELD_STATE_DIR`, `ARGUS_SHIELD_ALLOWLIST`, `ARGUS_SHIELD_LAN`, `ARGUS_SHIELD_PUBLIC_PORTS`, `ARGUS_SHIELD_THRESHOLD`, `ARGUS_SHIELD_BAN_SECONDS`, `ARGUS_SHIELD_DRY_RUN`.

---

## 8. API attuali

| Metodo | Rotta | Permesso |
|---|---|---|
| GET | `/api/setup/status` | anonimo |
| POST | `/api/setup/claim` | anonimo, rate limit 10/10min |
| POST | `/api/setup/dependencies/ffmpeg` | anonimo, solo a setup aperto |
| POST | `/api/system/dependencies/ffmpeg` | `system.manage` |
| POST | `/api/auth/login` | anonimo, rate limit 8/5min |
| POST | `/api/auth/mfa` | anonimo, rate limit 8/5min |
| POST | `/api/auth/logout` | autenticato |
| GET | `/api/auth/session` | autenticato |
| POST | `/api/auth/password` | autenticato, rate limit 5/10min |
| GET | `/api/account/mfa/status` | autenticato |
| POST | `/api/account/mfa/setup` | autenticato, rate limit 10/10min |
| POST | `/api/account/mfa/confirm` | autenticato, rate limit 10/10min |
| POST | `/api/account/mfa/disable` | autenticato, rate limit 5/10min |
| GET | `/api/cameras` | `live.view` |
| GET | `/api/cameras/:id` | `live.view` |
| POST | `/api/cameras` | `camera.manage` |
| PUT | `/api/cameras/:id` | `camera.manage` |
| DELETE | `/api/cameras/:id` | `camera.manage` |
| POST | `/api/cameras/:id/probe` | `camera.manage` |
| POST | `/api/discovery/onvif` | `camera.manage` |
| GET | `/api/cameras/:id/schedule` | `camera.manage` |
| PUT | `/api/cameras/:id/schedule` | `camera.manage` |
| DELETE | `/api/cameras/:id/schedule` | `camera.manage` |
| POST | `/api/cameras/:id/schedule/exceptions` | `camera.manage` |
| DELETE | `/api/cameras/:id/schedule/exceptions/:day` | `camera.manage` |
| GET | `/api/cameras/:id/motion/zones` | `live.view` |
| PUT | `/api/cameras/:id/motion/zones` | `camera.manage` |
| POST | `/api/cameras/:id/motion/zones` | `camera.manage` |
| DELETE | `/api/cameras/:id/motion/zones/:zoneId` | `camera.manage` |
| POST | `/api/detections` | API key sorgente o `camera.manage`, rate limit 600/1min |
| GET | `/api/detections` | `live.view` |
| GET | `/api/detections/sources` | `system.manage` |
| POST | `/api/detections/sources` | `system.manage` |
| DELETE | `/api/detections/sources/:id` | `system.manage` |
| GET | `/api/access/rules` | `live.view` |
| POST | `/api/access/rules` | `camera.manage` |
| PUT | `/api/access/rules/:id` | `camera.manage` |
| DELETE | `/api/access/rules/:id` | `camera.manage` |
| GET | `/api/access/events` | `live.view` |
| GET | `/api/people` | `live.view` |
| POST | `/api/people` | `camera.manage` |
| GET | `/api/people/:id` | `live.view` |
| PUT | `/api/people/:id` | `camera.manage` |
| DELETE | `/api/people/:id` | `camera.manage` |
| POST | `/api/people/match` | `live.view` |
| GET | `/api/people/logs/faces` | `live.view` |
| GET | `/api/system/health` | anonimo |
| GET | `/api/system/info` | `live.view` |
| GET | `/api/system/hardware` | `live.view` |
| GET | `/api/system/performance` | `live.view` |
| PUT | `/api/system/performance` | `system.manage` |
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

**Funzionante e verificato:** kernel, config, logger strutturato, gestione errori globale, SQLite con migrazioni, vault AES-256-GCM, autenticazione scrypt con sessioni, RBAC, audit, server HTTP con Range e CSP, WebSocket autenticato, rilevamento ffmpeg, **setup guidato in 5 passi**, **cambio password imposto**, **installazione automatica di ffmpeg con verifica SHA-256**, CRUD telecamere, probe RTSP via ffprobe, discovery ONVIF WS-Discovery, interfaccia web responsive con setup/login/riepilogo/telecamere, **diretta video reale via fMP4 su WebSocket e Media Source Extensions**, **registrazione continua con segmentazione**, **indice append-only**, **ritenzione automatica**, **archivio con timeline e riproduzione**, **console locale loopback su `/wall`**, **autoinstaller Linux non presidiato**, **autoaggiornamento da GitHub con ripristino automatico**, **esportazione con catena di custodia verificata su segmenti reali**, **pianificazione oraria (griglia 7x48 con eccezioni calendario)**, **rilevamento movimento reale a modelli di sfondo su fotogrammi 160x90**, **rilevamento zone poligonali su point-in-polygon e maschere bitmask**, **guardia anti-abbagliamento cambi luce**, **isteresi e cooldown**, **processo ffmpeg su substream per analisi**, **ingresso rilevamenti macchina POST /api/detections con chiavi API ad hash SHA-256**, **ritenzione differenziata su eventi**, **editor web responsive per orari e zone**, **motore di visione AI con rilevamento persone, auto, camion, moto, animali**, **tracciamento IoU tra fotogrammi**, **riconoscimento biometrico volti YuNet + SFace con soglia 0.363 e conformità GDPR**, **lettura targhe ANPR con voto su fotogrammi multipli e sintassi europea**, **regole di accesso con blacklist prioritaria**, **installatore Windows autonomo install.ps1 con winget, nssm e firewall**, **Setup .exe Inno Setup con launcher desktop nativo, icona propria e verifica della porta prima di dichiarare il successo**, **rilevamento e profilazione hardware (CPU, RAM, GPU)**, **accelerazione hardware video GPU (CUDA, QSV, D3D11VA, VAAPI, VideoToolbox, AMF)**, **encoder transcodifica GPU (h264_nvenc, h264_qsv, etc.)**, **worker AI multithread con session options ONNX e provider prioritari**, **tuning RAM SQLite a caldo (cache_size fino a 2GB, mmap_size fino a 4GB)**, **pannello web di configurazione prestazioni con preset rapidi**.


Aggiunte della versione 0.13.0: **autenticazione a due fattori MFA TOTP** (RFC 6238 nativo con `node:crypto`, Base32 senza dipendenze, seed cifrato AES-256-GCM nel vault, 10 codici di recupero monouso scrypt, login a due fasi con challenge in memoria a 32 byte con scadenza a 5 minuti, protezione anti-replay a 90 secondi, blocco progressivo per account esteso a MFA, divieto admin da WAN inalterato, obbligo configurabile per account amministratore con isolamento d arruolamento, rendering QR code SVG client-side senza librerie ne stili inline), **aggiornamento e aggiornamento automatico completi su Windows** (download release, staging, backup, ripristino automatico alla partenza in caso di mancata stabilizzazione, nessun vincolo di clone git, installer Inno Setup sincronizzato).

Aggiunte della versione 0.12.0: **pannello Impostazioni completo nel browser** (aggiornamenti, accesso remoto, sicurezza account, console, ritenzione), **politica di riavvio con conferma esplicita o finestra di manutenzione**, **impostazioni applicate a caldo senza riavvio** (accesso remoto, reti fidate, durata sessione, soglie di blocco), **validazione tipizzata con audit di ogni modifica**.

Aggiunte della versione 0.11.0: **aggiornamento automatico a ogni avvio e ogni 6 ore**, **quarantena delle versioni difettose**, **freno temporale contro i cicli di riavvio**, **verifica opzionale della firma GPG dei tag**.

Aggiunte della versione 0.10.0: **TLS obbligatorio con PKI interna autogenerata e autorinnovante**, **redirect 308 dalla porta 80**, **classificazione delle zone di rete**, **separazione visione/gestione applicata dal codice**, **divieto di accesso amministrativo da internet**, **sessioni legate alla zona di emissione**, **riduzione dei dati telecamera verso internet**, **blocco progressivo per account**, **flusso eventi di sicurezza append-only**, **ARGUS-SHIELD con ruleset nftables, punteggio a decadimento e blocco automatico**, **CPU, RAM e GPU in diretta sulla barra della console**.

**Non ancora implementato:** firma GPG dei tag verificata da `pre-start.sh` (l'autoaggiornamento si fida ancora del solo nome del tag), hash chain sui segmenti registrati e sull'audit log, cifratura del disco dati, relè hardware di apertura varchi, notifiche push Telegram / MQTT, ricerca forense unificata per targa/volto su storico registrato, planimetria con barriere virtuali.

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
| F4 | Pianificazione oraria, motion detection con zone, ingressi rilevamenti | completata |
| F5 | Persone, targhe, biometria, ANPR, controllo accessi, installatori autonomi | completata |
| FS | TLS obbligatorio, zone di rete, blocco account, ARGUS-SHIELD | completata |
| FU2 | Aggiornamento automatico a ogni avvio, quarantena, verifica firma | completata |
| FC | Impostazioni complete dal browser, politica di riavvio, finestra di manutenzione | completata |
| FS2 | MFA TOTP (fatta), firma aggiornamenti, integrita archivio e audit | in corso |
| F6 | Planimetria, preset, notifiche Telegram/MQTT, relè, diagnostica, watchdog | da fare |


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
