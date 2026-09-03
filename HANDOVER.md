# HANDOVER — Stato e Consegna Completa ARGUS-PR

Documento operativo di consegna per l'assistente AI che prosegue lo sviluppo di **ARGUS-PR**.
Leggi **prima** [AGENTS.md](AGENTS.md): contiene la regola zero di sicurezza, i vincoli non negoziabili e le convenzioni architetturali.

Stato alla consegna: **v0.18.3**, **215 test verdi** (205 NVR + 10 ARGUS-SHIELD).

Ultimo blocco consegnato: **F7.3 — Automazioni**: regole evento-azione con email SMTP nativa, Telegram, webhook firmato, MQTT, comando HTTP e relè ONVIF per i varchi. Prima F7.1 aveva spostato l'app in Sistema e unificato l'ingresso video. L'app è stata spostata nella macro-area Sistema del Launchpad e riscritta come console di configurazione; è nato `src/features/cameras/camera_input.js`, l'unico punto del sistema che sa aprire una sorgente video (RTSP, HTTP, MJPEG, USB locale). Il progetto completo dei tre blocchi è in [docs/TELECAMERE.md](docs/TELECAMERE.md): il blocco 2 (analisi per telecamera con scelta del motore) e il blocco 3 (notifiche, email, varchi) sono progettati ma **non** costruiti.

---

## 0. I Vincoli del Progetto (Non Negoziabili)

1. **La sicurezza viene prima di tutto (§0 di AGENTS.md)**: Se sicurezza ed eleganza o comodità sono in conflitto, vince sempre la sicurezza.
2. **Nessun commento nel codice sorgente**: Il codice sorgente non contiene commenti. La documentazione vive nei file `.md` (`AGENTS.md`, `HANDOVER.md`, `docs/`).
3. **Nessun file oltre 500 righe**: Modularizzare rigorosamente prima di raggiungere il limite.
4. **Clean Architecture**: Dipendenze unidirezionali `features → security/storage/platform → kernel`. `kernel` non importa mai nulla del progetto tranne se stesso.
5. **Due dipendenze di runtime**: Solo `better-sqlite3` e `ws` per Node.js. ARGUS-SHIELD ha **zero** dipendenze.
6. **Error handling**: Nessun abuso di `try/catch`. Solo ai confini di I/O, traducendo sempre in `AppError` con preservazione della `cause`.
7. **Processi esterni**: `spawn` ed `execFile` **sempre** con array di argomenti e `shell: false`.
8. **CSP stretta senza `unsafe-inline`**: Nessun attributo `style="..."` nel DOM generato via JavaScript.
9. **Distribuzione e allineamento**: A ogni traguardo completato, eseguire i test, aggiornare la documentazione, compilare l'installer Windows (`deploy/windows/build-installer.ps1`), effettuare il commit, taggare la release e pubblicare su GitHub.

---

## 1. Cosa È Stato Realizzato Dall'Inizio Ad Oggi (v0.15.0)

Tutti i moduli elencati di seguito sono **completi, integrati, funzionanti e verificati con test automatici**:

### Fondamenta & Storage (F0)
- **Kernel & Event Bus**: Sistema di logging strutturato JSON, gestione unificata degli errori (`AppError`), `Result` pattern, intercettazione dei crash (`process_guard.js`).
- **Database SQLite**: Migrazioni progressive (001 a 009) gestite con WAL mode, transazioni atomiche e tuning della cache RAM a caldo.
- **Crittografia & Vault**: Cifratura master key AES-256-GCM con permessi 0600 per le credenziali RTSP delle telecamere, hashing password con `scrypt` e salt casuale, token di sessione casuali a 256 bit memorizzati solo con hash SHA-256.
- **RBAC & Audit**: Controllo degli accessi a ruoli (`admin`, `operator`, `viewer`) con granularità per singola operazione e registro audit immutabile.

### Pipeline Video & Registrazione (F1, F2, F3)
- **Diretta fMP4 su WebSocket**: Flusso H.264 inviato a frammenti con latenza inferiore al secondo, senza HLS e senza librerie esterne lato client (MSE nativo). Segmento di inizializzazione conservato per ingresso immediato.
- **Registrazione 24/7 Continua**: Segmentazione automatica ffmpeg in cartelle giornaliere.
- **Indice Append-Only**: Nessun affollamento del database; l'indice dei filmati vive in file `.jsonl` dedicati per telecamera e data.
- **Ritenzione Automatica**: Motore puro coperto da test per quote su disco, giorni e spazio libero. I segmenti marcati come prove o protetti non vengono mai rimossi.
- **Timeline & Archivio**: Navigazione visuale continua nelle 24 ore con supporto scrubbing e Range requests HTTP.
- **Catena di Custodia (F3b)**: Esportazione prove video accompagnata da manifesto crittografico sigillato con hash SHA-256 dei segmenti per validità legale.

### Sicurezza Perimetrale & Zero-Trust (FS, FS2)
- **TLS Obbligatorio**: PKI interna autogenerata con certificato CA e certificato server autorinnovante; porta 80 dedicata esclusivamente al redirect 308.
- **Zone di Rete & Default Negato**: Classificazione automatica degli IP in `local`, `lan`, `wan`. Da internet è consentita la sola visione delle telecamere (nessuna configurazione, export o accesso admin da WAN).
- **Lockout Progressivo**: Blocco per account con backoff esponenziale contro attacchi a forza bruta.
- **ARGUS-SHIELD**: Firewall autonomo (`shield/`) con ruleset `nftables` (e backend report/netsh), calcolo punteggio sospetto a decadimento e ban automatico degli attaccanti alimentato da `security-events.jsonl`.
- **MFA TOTP (v0.13.0)**: Autenticazione a due fattori nativa RFC 6238 con seed AES-256-GCM nel vault, 10 codici di emergenza scrypt, login a due fasi, protezione anti-replay a 90 secondi e generatore QR code client-side SVG senza dipendenze.

### Visione AI, Biometria & ANPR (F4, F5, v0.15.0)
- **Worker AI Multithread**: Processo Python separato su IPC JSON con accelerazione ONNX Runtime e provider prioritari (CUDA/TensorRT/CPU).
- **Tracciamento Oggetti**: Modelli YOLO per rilevamento e classificazione di persone, veicoli (auto, camion, bus, moto) e animali (cani, gatti, cavalli, mucche, pecore, orsi, uccelli) con tracciamento IoU tra frame.
- **Biometria Facciale GDPR**: Rilevamento facciale con YuNet e feature extraction 128-dimensional con SFace (soglia 0.363). Include endpoint `/api/people/extract-face` per arruolamento istantaneo da fototessere caricate dall'utente.
- **ANPR (Lettura Targhe)**: Rilevamento morfologico dell'area targa, binarizzazione, estrazione caratteri e algoritmo di voto ponderato a confidenza su frame multipli conforme ai formati europei.
- **Regole di Accesso & Varchi**: Gestione liste bianche/nere e monitorate con priorità assoluta per la blacklist.

### Interfaccia Utente & Nuova Dashboard (v0.15.0)
- **Architettura Launchpad / App Portal a 2 Livelli**:
  - Livello 1: 5 grandi Macro-Card di Categoria (`Flussi Live`, `Registrazioni`, `Visione AI`, `Sicurezza`, `Sistema`).
  - Livello 2: Vista istantanea delle sotto-applicazioni con pulsante di ritorno `‹ Tutte le categorie`.
  - Selettore di visualizzazione a cartelle o espanso (`[ ⊞ Categorie ]` / `[ ⠿ Tutte le App ]`).
- **Icone 3D Fluency da Icons8**: 17 icone PNG 3D in alta definizione posizionate in `web/assets/icons/`, senza sfondo invadente, con animazione elastica al passaggio del mouse e fallback automatico ad SVG.
- **Command Toolbar a Riga Singola Unificata**:
  - Spazio ottimizzato al 100% senza vuoti verticali.
  - Logo ARGUS e badge pulsante `● Operativo`.
  - Chip telemetrici interattivi con icone (`📹 X Canali`, `⏱️ Uptime`, `🏷️ v0.15.0`).
  - Ricerca globale istantanea con scorciatoia da tastiera **`Ctrl+K`** e tasto di pulizia immediato `✕`.
  - Strumenti rapidi: apertura immediata del Muro Video `/wall`, ricarica a caldo della telemetria `🔄` e scorciatoia impostazioni.
- **Impostazioni Schema-Driven**: Schermata autogenerante basata sulle definizioni di `settings_registry.js` con tooltip di aiuto sintetici al posto di testi prolissi.

### Distribuzione & Autoaggiornamento (FA, FU)
- **Installatore Linux Automatico (`autoinstaller.sh`)**: Deploy non presidiato con kiosk console HDMI loopback su `/wall`.
- **Installatore Windows Ufficiale**: Inno Setup con eseguibile desktop launcher nativo in C# (`ARGUS-PR.exe`) e installazione automatica dipendenze.
- **Autoaggiornamento Resiliente**: Verifica tag GitHub, installazione privilegiata tramite systemd pre-start su Linux e `windows_updater.js` su Windows, con quarantena automatica delle versioni difettose e ripristino istantaneo alla versione precedente in caso di mancata stabilizzazione entro 90 secondi.

---

## 2. Cosa Manca Da Fare (In Ordine di Priorità)

La roadmap per portare ARGUS-PR al livello Enterprise completo è strutturata nei seguenti punti operativi:

### Priorità 1: F6 — Automazioni Fisiche, Relè e Varchi
*Vedi guida di dettaglio in [docs/AUTOMAZIONI.md](docs/AUTOMAZIONI.md).*
1. **Controllo Relè IP Hardware**:
   - Driver per relè IP Shelly (Shelly Pro / Plus via HTTP POST), Advantech ADAM, Wago e comandi relè ONVIF (`TriggerRelay`).
   - Meccanismo di sicurezza anti-flapping (cooldown minimo 5 secondi) e impulso configurabile (es. 1000ms) per apertura sbarre/cancelli automatici.
   - Associazione diretta tra evento (Targa autorizzata in ANPR o Volto in lista bianca) e attivazione del relè varco.
2. **Dispatcher Notifiche Multicanale**:
   - **Telegram Bot**: Invio immediato di avvisi di intrusione o varco con snapshot fotografico e breve clip video MP4 allegata.
   - **Broker MQTT**: Pubblicazione eventi su topic configurabile (es. `argus/events/<camera_id>`) per integrazione bidirezionale con Home Assistant, Node-RED e SCADA industriali.
   - **Webhooks con Firma HMAC**: Chiamate HTTP POST con payload JSON firmato tramite segreto condiviso e controlli anti-SSRF su IP privati.

### Priorità 2: Firma Crittografica dei Rilasci (GPG Tag Signing)
*Vedi [docs/SICUREZZA.md](docs/SICUREZZA.md) §2.*
- Il codice di verifica esiste già in `deploy/linux/pre-start.sh` (`verify_signature()`).
- Occorre generare la chiave GPG ufficiale di rilascio del progetto, distribuire la chiave pubblica in `/etc/argus-pr/update-key.asc` tramite l'autoinstaller, ed eseguire `git tag -s` per firmare crittograficamente ogni tag.
- Implementare la medesima verifica di firma in `windows_updater.js` per i sistemi Windows.

### Priorità 3: Integrità Crittografica Forense Continua
*Vedi [docs/SICUREZZA.md](docs/SICUREZZA.md) §3.*
- **Merkle-Chain dei Segmenti Video**: Calcolare l'hash SHA-256 di ogni segmento alla chiusura del file e concatenarlo crittograficamente con l'hash del segmento precedente (catena immutabile append-only per data e canale).
- **Forwarding Audit Log Syslog RFC 5424**: Inoltro in tempo reale dei log di audit verso un server Syslog/SIEM remoto non accessibile localmente, per impedire la cancellazione delle tracce in caso di compromissione del server.

### Priorità 4: Planimetria Interattiva & Barriere Virtuali
- Editor planimetrico SVG/Canvas: caricamento piantina dell'edificio/area sorvegliata.
- Posizionamento telecamere con cono di visuale dinamico e orientamento.
- Disegno di linee di confine o varchi virtuali con rilevamento attraversamento bidirezionale (Tripwire / Line Crossing).

### Priorità 5: Controllo PTZ & Ronde Automatiche
- Integrazione controlli ONVIF PTZ continui e a passi (Pan, Tilt, Zoom).
- Memorizzazione e richiamo rapido di posizioni preimpostate (Presets).
- Funzione di pattugliamento (Tour / Ronda programmata) con tempi di stazionamento configurabili.

### Priorità 6: Cifratura a Riposo dei Dischi (LUKS + TPM 2.0)
- Redigere la guida operativa `docs/INSTALLAZIONE-SICURA.md` per il binding della chiave LUKS al chip TPM 2.0 per proteggere i dischi video dal furto fisico dell'hardware.

---

## 3. Guida Rapida per la Prossima AI

- **Comandi di verifica**:
  ```bash
  node --test test/*.test.js         # Suite NVR (161 test)
  node --test shield/test/*.test.js  # Suite ARGUS-SHIELD (10 test)
  ```
- **Compilazione installer Windows**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File deploy/windows/build-installer.ps1
  ```
- **Cartelle chiave**:
  - `src/features/` : Logica di dominio (streaming, recording, vision, settings, access, cameras).
  - `web/features/` : Viste frontend native (dashboard, live, archive, detections, people, access, settings).
  - `web/assets/icons/` : Cartella delle 17 icone PNG 3D Fluency (Icons8).
  - `shield/` : Applicativo autonomo ARGUS-SHIELD firewall.
