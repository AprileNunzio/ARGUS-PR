<div align="center">

# ARGUS-PR

**Network Video Recorder self-hosted, multipiattaforma, senza cloud.**

Registra le tue telecamere IP su hardware tuo. Nessun abbonamento, nessun servizio esterno, nessun dato che esce dalla tua rete.

[![Node](https://img.shields.io/badge/node-%3E%3D20.11-3c873a)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-0f6fa8)](#installazione)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

</div>

---

## Che cos'è

ARGUS-PR trasforma un PC — anche vecchio — in un videoregistratore di rete completo. Un demone Node.js acquisisce i flussi RTSP delle telecamere, li registra su disco e li rende consultabili da un'interfaccia web che si apre da qualsiasi dispositivo della rete: computer, tablet o telefono.

Non è un'applicazione desktop. Gira **headless**: puoi installarlo su una macchina senza monitor con Ubuntu Server, lasciarla in un armadio, e amministrarla dal browser.

> **Stato attuale: 0.3.0.** Il ciclo completo funziona: le telecamere si vedono in diretta, si registrano su disco e l'archivio è navigabile con una linea temporale. Mancano ancora esportazione, rilevamento movimento e pianificazione oraria. Vedi [Roadmap](#roadmap) per il quadro onesto.

---

## Perché esiste

I sistemi di videosorveglianza commerciali hanno tre problemi ricorrenti: obbligano al cloud del produttore, smettono di ricevere aggiornamenti dopo pochi anni, e costano un abbonamento per funzioni che l'hardware già possiede.

ARGUS-PR nasce per stare interamente sulla tua infrastruttura, funzionare su hardware modesto, e restare ispezionabile: il codice è aperto e le registrazioni sono file normali su un disco che controlli tu.

---

## Caratteristiche

### Disponibili oggi

| | |
|---|---|
| **Scoperta automatica** | Trova le telecamere ONVIF sulla rete locale via WS-Discovery, senza inserire indirizzi a mano |
| **Verifica flusso** | Interroga ogni telecamera con ffprobe e riporta codec, risoluzione e frame rate reali |
| **Credenziali cifrate** | Le password delle telecamere sono protette con AES-256-GCM; la chiave sta sul disco con permessi 0600 e non lascia mai la macchina |
| **Accesso a ruoli** | Amministratore, operatore e osservatore, con permessi distinti per diretta, archivio ed esportazione |
| **Registro di controllo** | Ogni accesso, modifica e operazione sensibile viene tracciata con utente, orario e indirizzo |
| **Eventi in tempo reale** | Canale WebSocket autenticato che spinge gli eventi al browser senza interrogazioni continue |
| **Interfaccia responsive** | Stessa interfaccia su desktop, tablet e telefono, senza app da installare |
| **Diretta video** | Flussi RTSP riprodotti nel browser con latenza sotto il secondo, senza plugin e senza librerie esterne |
| **Muro video** | Griglia adattiva 1/4/9 riquadri, riconnessione automatica, stato per canale |
| **Registrazione continua** | Segmenti MP4 senza ricodifica, con hash SHA-256 di ogni file per l'integrità |
| **Archivio navigabile** | Linea temporale delle 24 ore: clicchi l'istante e parte la riproduzione da lì |
| **Ritenzione automatica** | Per giorni, per quota e per spazio libero; i segmenti protetti non vengono mai cancellati |
| **Diagnostica** | `npm run doctor` verifica ambiente, permessi, database e presenza di ffmpeg prima che tu scopra i problemi in produzione |

### In sviluppo

Registrazione su evento · Esportazione con catena di custodia · Rilevamento movimento con zone · Pianificazione oraria e per data · Ritenzione automatica e quote · Archiviazione su NAS con tiering · Uscite di allarme relè, ONVIF e MQTT · Uscite audio per entrata, uscita e allarme · Riconoscimento targhe e volti

---

## Requisiti

| | Minimo | Consigliato |
|---|---|---|
| **CPU** | Dual core x86-64 o ARM64 | Quad core |
| **RAM** | 2 GB | 4 GB o più |
| **Disco** | 8 GB per il sistema | SSD per il sistema, HDD o NAS per le registrazioni |
| **Node.js** | 20.11 | 22 LTS |
| **ffmpeg** | — | 6.0 o superiore, necessario per registrazione e riproduzione |

Sistemi supportati: **Windows 10/11 e Server**, **Linux** (Debian, Ubuntu, Fedora, Alpine, Raspberry Pi OS), **macOS**.

Un vecchio PC con un Core i5 di seconda generazione e 4 GB di RAM gestisce senza difficoltà 4-8 canali, perché i flussi vengono copiati così come arrivano dalla telecamera, senza ricodifica.

---

## Installazione

### Windows — prova rapida

Il modo più veloce per vedere il programma funzionare.

1. Installa Node.js: `winget install OpenJS.NodeJS.LTS`
2. Installa ffmpeg: `winget install Gyan.FFmpeg`
3. Scarica il progetto e fai **doppio clic** su `deploy\windows\quick-start.bat`

Lo script controlla i prerequisiti, installa le dipendenze, avvia il server e apre il browser. La password dell'amministratore compare nella finestra del terminale al primo avvio.

### Windows — installazione permanente come servizio

Da PowerShell come amministratore:

```powershell
winget install NSSM.NSSM
.\deploy\windows\install-service.ps1
```

Il servizio parte da solo all'accensione del PC. Registra anche la regola del firewall sulla porta scelta.

### Linux — installazione come servizio

```bash
git clone https://github.com/AprileNunzio/ARGUS-PR.git
cd ARGUS-PR
sudo ./deploy/linux/install.sh
```

Installa in `/opt/argus-pr`, crea l'utente di servizio, prepara `/var/lib/argus-pr` e registra l'unità systemd con isolamento rinforzato.

```bash
systemctl status argus-pr
journalctl -u argus-pr -f
journalctl -u argus-pr -n 40            # banner iniziale
```

<details>
<summary><b>Ubuntu Server da zero — trasformare un vecchio PC in un NVR</b></summary>

```bash
sudo apt update && sudo apt upgrade -y

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs ffmpeg git rsync

git clone https://github.com/AprileNunzio/ARGUS-PR.git
cd ARGUS-PR
sudo ./deploy/linux/install.sh

sudo ufw allow 8088/tcp
```

Per un disco dedicato alle registrazioni:

```bash
sudo mkfs.ext4 /dev/sdb1
sudo mkdir -p /srv/registrazioni
echo '/dev/sdb1 /srv/registrazioni ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab
sudo mount -a
sudo chown -R argus:argus /srv/registrazioni

sudo systemctl edit argus-pr
# aggiungi:
#   [Service]
#   Environment=ARGUS_MEDIA_DIR=/srv/registrazioni
sudo systemctl restart argus-pr
```

</details>

### Docker

```bash
cd deploy/docker
docker compose up -d
```

Usa `network_mode: host` perché la scoperta ONVIF ha bisogno del multicast sulla rete locale.

### Da sorgente, per sviluppo

```bash
git clone https://github.com/AprileNunzio/ARGUS-PR.git
cd ARGUS-PR
npm install
npm run doctor
npm start
```

---

## Primo avvio

Al primo avvio ARGUS-PR entra in **configurazione guidata**. Apri `http://<indirizzo-del-server>:8088` e segui cinque passi:

1. **Benvenuto** — riepilogo dell'hardware rilevato
2. **Amministratore** — crei tu l'account, con requisiti di password verificati mentre scrivi
3. **Motore video** — se ffmpeg manca, lo installa il sistema con verifica SHA-256
4. **Archiviazione** — percorsi e spazio disponibile
5. **Riepilogo** — conferma finale

Terminata la procedura non è più ripetibile: le rotte di configurazione si chiudono definitivamente.

> **Completa la configurazione subito dopo il primo avvio.** Finché non esiste un amministratore, chiunque raggiunga l'indirizzo può crearlo. Il banner nel terminale te lo ricorda.

Se perdi la password:

```bash
npm run reset-admin
```

---

## Configurazione

Variabili d'ambiente, oppure un file `argus.env` nella cartella dati.

| Variabile | Default | Descrizione |
|---|---|---|
| `ARGUS_HOST` | `0.0.0.0` | Indirizzo di ascolto |
| `ARGUS_PORT` | `8088` | Porta HTTP |
| `ARGUS_DATA_DIR` | dipende dal sistema | Database, chiavi, configurazione |
| `ARGUS_MEDIA_DIR` | `<dati>/media` | Registrazioni video |
| `ARGUS_FFMPEG_PATH` | rilevato dal PATH | Percorso esplicito a ffmpeg |
| `ARGUS_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `ARGUS_TRUST_PROXY` | `false` | Attivalo **solo** dietro un reverse proxy tuo |
| `ARGUS_SESSION_TTL_HOURS` | `12` | Durata della sessione |

Cartella dati predefinita: `%PROGRAMDATA%\ARGUS-PR` su Windows, `/var/lib/argus-pr` su Linux con systemd, `~/.local/share/argus-pr` altrimenti.

---

## Sicurezza

Il progetto adotta un approccio Zero-Trust: ogni input è ostile finché non è validato.

- **Password utenti** con `scrypt` e salt individuale; confronto a tempo costante.
- **Password telecamere** cifrate AES-256-GCM con chiave generata alla prima esecuzione, salvata con permessi `0600` e mai inclusa nel repository.
- **Sessioni** con token da 256 bit; nel database finisce solo l'hash SHA-256. Cookie `HttpOnly`, `SameSite=Strict`, `Secure` sotto HTTPS.
- **CSP restrittiva** senza `unsafe-inline`, più `X-Frame-Options: DENY` e `nosniff`.
- **Rate limiting** su login e cambio password.
- **Verifica dell'origine** su tutte le richieste che modificano dati.
- **Nessuna shell** nell'invocazione di ffmpeg: argomenti passati come array, `shell: false`. Gli URL RTSP sono input utente e vengono validati contro una lista di schemi ammessi.
- **Percorsi confinati**: ogni percorso derivato da input è verificato come discendente della radice consentita.
- **Registro di controllo** immutabile per accessi e operazioni sensibili.

> **Esposizione su Internet.** ARGUS-PR è pensato per la rete locale. Se ti serve accedervi da fuori, usa una VPN (WireGuard, Tailscale) oppure mettilo dietro un reverse proxy con TLS e autenticazione propria. Non aprire la porta direttamente sul router.

Per segnalare una vulnerabilità apri una issue senza dettagli sfruttabili e chiedi un contatto privato.

---

## Architettura

```
┌──────────────────────────────────────────────────────┐
│  Browser — desktop, tablet, telefono                 │
│  ESM nativo, nessun build step                       │
└───────────────┬──────────────────────┬───────────────┘
                │ HTTPS/HTTP           │ WebSocket
┌───────────────▼──────────────────────▼───────────────┐
│  Processo ARGUS-PR (Node.js)                         │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐  │
│  │ Router  │ │ Sicurezza│ │ Eventi │ │ File Range │  │
│  └─────────┘ └──────────┘ └────────┘ └────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Funzionalità: auth · cameras · discovery       │  │
│  └────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ SQLite (WAL) │  │ Vault AES   │  │ ffmpeg      │  │
│  └──────────────┘  └─────────────┘  └──────┬──────┘  │
└───────────────────────────────────────────┼─────────┘
                                            │ RTSP
                                    ┌───────▼────────┐
                                    │ Telecamere IP  │
                                    └────────────────┘
```

Il codice segue la Clean Architecture con colocation per funzionalità: ogni modulo vive in una cartella con la propria logica, le proprie rotte e la propria vista. La regola di dipendenza va sempre verso l'interno — `features` dipende da `security`, `storage` e `platform`, che dipendono da `kernel`, che non dipende da nulla.

Dettagli completi per chi contribuisce, umano o AI: **[AGENTS.md](AGENTS.md)**.

---

## Roadmap

| Fase | Contenuto | Stato |
|---|---|---|
| **F0** | Kernel, sicurezza, HTTP, interfaccia, telecamere, scoperta ONVIF | ✅ completata |
| **F1** | Pipeline ffmpeg, diretta video, trasporto fMP4 su WebSocket | ✅ completata |
| **F2** | Registrazione, segmentazione, indice archivio, ritenzione | ✅ completata |
| **F3** | Riproduzione e timeline | ✅ completata · esportazione ⬜ |
| **F4** | Pianificazione oraria e per data, rilevamento movimento, zone | 🔜 in corso |
| **F5** | NAS con tiering, uscite di allarme, uscite audio | ⬜ |
| **F6** | Monitoraggio salute, watchdog, conformità GDPR | ⬜ |

Il riconoscimento di targhe e volti richiede un motore di inferenza separato e sarà valutato dopo F6, non prima: preferisco un NVR che registra in modo affidabile a uno che promette intelligenza artificiale e perde fotogrammi.

---

## Risoluzione dei problemi

<details>
<summary><b>ffmpeg non trovato</b></summary>

Windows: `winget install Gyan.FFmpeg`, poi riapri il terminale.
Debian/Ubuntu: `sudo apt install ffmpeg`
Fedora: `sudo dnf install ffmpeg`
macOS: `brew install ffmpeg`

Se è installato in una posizione non standard: `ARGUS_FFMPEG_PATH=/percorso/a/ffmpeg`
</details>

<details>
<summary><b>better-sqlite3 non compila</b></summary>

Da npm 11 gli script di installazione sono bloccati per default. Il campo `allowScripts` in `package.json` autorizza questo pacchetto. Se serve forzare:

```bash
npm rebuild better-sqlite3
```

Su Linux senza binari precompilati servono gli strumenti di build: `sudo apt install build-essential python3`
</details>

<details>
<summary><b>La scoperta ONVIF non trova nulla</b></summary>

Usa il multicast UDP sulla porta 3702: deve poter uscire dalla macchina. Verifica che il server e le telecamere siano nella stessa sottorete, che il firewall consenta UDP 3702, e che in Docker sia attivo `network_mode: host`. Alcune telecamere hanno ONVIF disabilitato di fabbrica.
</details>

<details>
<summary><b>Ho perso la password</b></summary>

```bash
npm run reset-admin
```
Richiede accesso locale alla macchina, che è il presupposto corretto per un recupero.
</details>

---

## Contribuire

Le pull request sono benvenute. Prima di aprirne una leggi **[AGENTS.md](AGENTS.md)**: contiene i vincoli architetturali del progetto, che sono stretti e applicati con rigore — niente commenti nel codice, nessun file oltre 500 righe, nessuna dipendenza aggiunta senza necessità dimostrata, CSP mai indebolita.

---

## Licenza

MIT — vedi [LICENSE](LICENSE).

<div align="center">
<sub>Creato da Nunzio Aprile · NunzioTech</sub>
</div>
