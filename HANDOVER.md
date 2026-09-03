# HANDOVER — cosa resta da fare su ARGUS-PR

Documento di consegna per l'assistente che prosegue il lavoro.

Leggi **prima** [AGENTS.md](AGENTS.md): contiene la regola zero sulla sicurezza, i vincoli non negoziabili e le convenzioni. Questo file dice **cosa manca e in che ordine**.

Stato alla consegna: **v0.12.0**, 150 test verdi (140 NVR + 10 ARGUS-SHIELD), tutto pubblicato su GitHub fino al tag v0.12.0.

---

## 0. Le regole del proprietario, prima di toccare qualsiasi cosa

Non sono preferenze. Sono vincoli.

1. **La sicurezza viene prima di tutto.** È la regola zero di AGENTS.md §0. Se sicurezza ed eleganza sono in conflitto, vince la sicurezza e il compromesso va scritto in AGENTS.md.
2. **Nessun commento nel codice.** Le spiegazioni vanno nei file `.md`.
3. **Nessun file oltre 500 righe.** Superato il limite, si modularizza.
4. **Clean Architecture**, colocation per funzionalità. `features → security/storage/platform → kernel`, mai al contrario.
5. **Due dipendenze soltanto**: `better-sqlite3` e `ws`. Ogni pacchetto in più è superficie d'attacco. ARGUS-SHIELD ne ha **zero**.
6. **Niente abuso di try/catch**: solo ai confini di I/O, e sempre traducendo in `AppError`.
7. **`spawn` sempre con `shell: false`**, argomenti come array.
8. **UI totalmente responsive**, nativa su mobile e desktop.
9. **A ogni lavoro finito**: commit, tag, release GitHub, README e **AGENTS.md aggiornato nello stesso commit**.
10. **Dichiara sempre cosa non hai verificato.** Non scrivere "funziona" di qualcosa che non hai eseguito. Le note di release esistenti rispettano questa regola: continuala.

---

## 1. Pubblicare fa parte del lavoro, sempre

Lo stato è allineato: `main` e i tag `v0.11.0` e `v0.12.0` sono su GitHub, le release sono pubblicate.

**Non lasciare mai lavoro finito senza release.** L'autoaggiornamento del prodotto scarica l'ultimo tag di release da GitHub: finché non pubblichi, nessun impianto installato riceve niente. Pubblicare non è burocrazia, è il canale di distribuzione.

Il ciclo a fine lavoro, senza chiedere il permesso al proprietario:

```bash
node --test test/*.test.js         # deve essere verde
node --test shield/test/*.test.js  # deve essere verde
git commit                          # AGENTS.md aggiornato nello stesso commit
git tag -a vX.Y.Z
git push origin main && git push origin vX.Y.Z
gh release create vX.Y.Z --notes-file <note>
```

Il tag deve rispettare `^v[0-9]+\.[0-9]+\.[0-9]+$`, altrimenti l'updater lo rifiuta. La versione in `package.json` va allineata al tag.

Le note di release vanno scritte con la stessa onestà delle precedenti: cosa cambia, come si aggiorna dalla versione prima, **e cosa manca ancora**. Guarda v0.11.0 e v0.12.0 come modello.

---

## 2. Cosa esiste davvero oggi

Non rifare queste cose, sono complete e coperte da test.

**Fondamenta**: kernel, config, logger strutturato, SQLite con migrazioni (schema 7), vault AES-256-GCM, autenticazione scrypt, RBAC, audit, server HTTP con Range, WebSocket autenticato.

**Video**: diretta reale via fMP4 su WebSocket e Media Source Extensions, registrazione continua segmentata, indice append-only, ritenzione automatica, archivio con timeline e riproduzione, esportazione con catena di custodia.

**Analisi**: motion detection a modelli di sfondo con zone poligonali, pianificazione oraria 7×48, visione AI (persone, veicoli, animali), tracciamento IoU, biometria facciale YuNet + SFace conforme GDPR, ANPR con voto su fotogrammi multipli, regole di accesso.

**Sicurezza (v0.11.0)**: TLS obbligatorio con PKI interna autogenerata e autorinnovante, redirect 308 dalla porta 80, zone di rete `local`/`lan`/`wan` con default negato per ogni rotta, divieto di accesso amministrativo da internet, sessioni legate alla zona di emissione, blocco progressivo per account, flusso eventi append-only, **ARGUS-SHIELD** (firewall nftables autonomo con punteggio a decadimento).

**Gestione (v0.12.0)**: pannello Impostazioni completo, politica di riavvio (`ask` / `window` / `immediate`), finestra di manutenzione, impostazioni applicate a caldo.

**Installazione**: autoinstaller Linux non presidiato, console kiosk su HDMI, installatore Windows con launcher desktop, autoaggiornamento con quarantena e ripristino.

---

## 3. Il lavoro che manca, in ordine di priorità

> Le prime quattro voci hanno una guida operativa dedicata: **[docs/SICUREZZA.md](docs/SICUREZZA.md)**. Schema del database, contratto delle rotte, sequenze di autenticazione, vettori di prova e criteri di verifica stanno lì. Questa sezione dice **cosa e perché**; quel documento dice **come**. La 3.5 (F6) è invece ancora solo un elenco: quando toccherà a lei, va specificata prima di scrivere codice.

### 3.1 MFA TOTP — la cosa più importante

**Perché per prima:** il sistema può essere esposto a internet (`ARGUS_PUBLIC_ACCESS`). Con la sola password, una credenziale rubata è un impianto perso. È l'unica difesa di livello base ancora assente.

Cosa serve:

- `src/security/totp.js` — RFC 6238 puro con `node:crypto`, nessuna dipendenza. Finestra ±1 intervallo da 30 s, cifre 6, algoritmo SHA-1 (è quello che le app supportano davvero).
- Seed cifrato nel vault esistente (`encryptSecret`), **mai** in chiaro nel database né nei log.
- Codici di recupero: 10, generati una volta, salvati come hash scrypt, consumati singolarmente.
- Migrazione 008: colonne `totp_secret`, `totp_enabled`, tabella `recovery_codes`.
- **Obbligatorio per il ruolo `admin`**, opzionale per `operator` e `viewer`. Un admin senza TOTP attivo deve essere costretto ad attivarlo al primo accesso, come già accade per il cambio password.
- Il QR code va generato **lato client** in SVG dal solo `otpauth://` URI: non aggiungere una libreria per questo.
- Flusso di arruolamento nella UI (`web/features/account/`), accanto al cambio password.
- Il blocco per account (`lockout.js`) deve valere anche sui codici TOTP sbagliati.

Test obbligatori: vettori RFC 6238, riuso dello stesso codice rifiutato, codice di recupero consumato una sola volta, admin da WAN comunque rifiutato (regola esistente, non indebolirla).

### 3.2 Firma degli aggiornamenti

Il meccanismo di verifica **esiste già** in `deploy/linux/pre-start.sh` (`verify_signature()`, `git verify-tag` in un `GNUPGHOME` temporaneo), ma è inerte finché non c'è una chiave in `/etc/argus-pr/update-key.asc`.

Cosa manca:

- Firmare i tag di release con GPG (`git tag -s`).
- Distribuire la chiave pubblica e farla installare dall'autoinstaller.
- Documentare la rotazione della chiave.

**Perché conta:** con l'autoaggiornamento attivo su ogni impianto, chi controlla l'account GitHub controlla tutti gli impianti installati. Questo è il rischio più grande rimasto e va detto al proprietario in questi termini.

### 3.3 Integrità dell'archivio e dell'audit

- Hash SHA-256 di ogni segmento alla chiusura, concatenato all'hash del precedente (catena append-only per canale e per giorno, accanto all'indice JSONL esistente).
- Stessa catena sull'`audit_log`, più inoltro syslog verso una macchina esterna: oggi un admin compromesso può cancellare le proprie tracce.

**Perché conta:** per la videosorveglianza dimostrare che un filmato non è stato alterato è il requisito legale vero, più della riservatezza.

### 3.4 Cifratura del disco dati

Non è codice: è documentazione operativa. `master.key` e le chiavi della PKI stanno a `0600` sul disco. Chi si porta via il mini PC ha credenziali RTSP e registrazioni. La configurazione LUKS con sblocco via TPM 2.0 è specificata in [docs/SICUREZZA.md](docs/SICUREZZA.md) §4: va trasformata nella guida `docs/INSTALLAZIONE-SICURA.md` e provata su hardware.

### 3.5 F6 — funzionalità non ancora costruite

Planimetria con barriere virtuali, preset PTZ, notifiche Telegram e MQTT, relè hardware di apertura varchi, ricerca forense unificata per targa e volto sullo storico registrato, diagnostica e watchdog.

Se il proprietario ne chiede una, **non fingere che esista**: dichiara che va costruita.

---

## 4. Trappole già pagate, non ripagarle

- **`node --test test/` fallisce su Windows.** Usa `node --test test/*.test.js`.
- **La suite di ARGUS-SHIELD si lancia a parte**: `node --test shield/test/*.test.js`.
- **`strftime_mkdir` non esiste** sul muxer `segment` di ffmpeg: le directory le crea `ensureSegmentDays()`.
- **Il CSV di ffmpeg contiene solo il nome file**, non il percorso, e viene troncato a ogni riavvio.
- **`-re` serve sulle sorgenti non RTSP**, altrimenti un file viene letto a velocità piena.
- **CSP senza `unsafe-inline`**: nessun attributo `style` nel DOM generato da JS. Per i valori dinamici usa `element.style.setProperty('--token', valore)`.
- **`[hidden]` non basta**: serve `[hidden] { display: none !important; }`.
- **Le varianti di `notice()` sono `error`, `warn`, `ok`, `info`.** Non esiste `success`.
- **Gli heredoc con apostrofi e backtick vengono mangiati dalla shell**: per i file grandi usa lo strumento di scrittura, per le modifiche chirurgiche uno script Python separato.
- **`openDatabase()` è un singleton**: nei test `:memory:` lo stato persiste fra un test e l'altro. Usa nomi utente diversi invece di provare a riaprire il database.
- **I server in background trattengono il file del database**: fermali prima di cancellare la cartella dati.
- **`.gitattributes` forza LF sugli script shell**: un CRLF li renderebbe non eseguibili su Linux e romperebbe l'installatore in silenzio.
- **Non toccare la porta e il certificato dal pannello web.** Sono deliberatamente fuori dalle impostazioni: un valore sbagliato renderebbe irraggiungibile la pagina stessa da cui li avresti cambiati.
- **Il NVR non comanda ARGUS-SHIELD.** La comunicazione è a senso unico, il NVR scrive eventi e lo scudo li legge. Non introdurre un'API di controllo: è il motivo per cui un NVR compromesso non si porta dietro il firewall.

---

## 5. Cosa non è mai stato provato su hardware vero

Va detto a chi prosegue e al proprietario. Non spacciarlo per verificato.

- **L'autoinstaller Linux non è mai stato eseguito su Linux.** La macchina di sviluppo è Windows, senza Docker né WSL. Sintassi e flusso sono verificati; l'esecuzione reale no.
- **Il ruleset nftables non è mai stato applicato su un kernel reale.** È generato e validato come testo; `nft -c` non è mai girato. Le suite girano tutte sul backend `report-only`.
- **`ExecStartPre` non è mai girato sotto systemd reale.**
- **La console locale non è mai stata provata su un monitor collegato a un server Linux.** Nel browser funziona.
- **Nessuna telecamera IP reale è mai stata collegata.** Tutte le prove usano una sorgente sintetica ffmpeg. RTSP con credenziali, UDP, sotto-flussi e ONVIF di marche reali sono da verificare sul campo.
- **Il certificato interno è verificato con handshake TLS veri** (questo sì), ma mai da un browser reale con la CA installata nello store di sistema.

Quando il proprietario installerà su una macchina vera, i primi comandi utili sono `journalctl -u argus-pr -n 50` e `argus-shield status`.

---

## 6. Come si lavora qui

```bash
npm install
npm start                          # avvia il server
npm run doctor                     # verifica ambiente, vault, DB, ffmpeg
npm run cert                       # impronta del certificato e percorso della CA
node --test test/*.test.js         # suite NVR
node --test shield/test/*.test.js  # suite ARGUS-SHIELD
```

In sviluppo su Windows conviene `ARGUS_PORT=8443 ARGUS_HTTP_PORT=0 ARGUS_AUTO_UPDATE=false`, altrimenti il servizio prova a occupare la 443 e a cercare aggiornamenti a ogni avvio.

Prima di dichiarare finito un lavoro: entrambe le suite verdi, nessun file oltre 500 righe, nessun commento nel codice, AGENTS.md aggiornato, commit, tag, release.
