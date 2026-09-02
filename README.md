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

> **Stato attuale: 0.4.0.** Il ciclo completo funziona: le telecamere si vedono in diretta, si registrano su disco e l'archivio è navigabile con una linea temporale. Su Linux un solo comando installa tutto e trasforma la macchina in un'appliance che mostra il muro video sul monitor collegato. Mancano ancora esportazione, rilevamento movimento e pianificazione oraria. Vedi [Roadmap](#roadmap) per il quadro onesto.

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
| **Installazione automatica Linux** | Un comando solo: rileva la distribuzione, installa Node.js e ffmpeg, registra il servizio, apre il firewall e stampa l'indirizzo web. Nessuna domanda |
| **Console locale** | Sul monitor collegato al server appare il muro video a schermo intero con barra di stato e indirizzo IP: la macchina diventa un'appliance |
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

### Linux — installazione automatica (consigliata)

Un solo comando. Non fa domande e non chiede conferme: riconosce la distribuzione, installa quello che manca, registra il servizio e ti restituisce l'indirizzo a cui collegarti.

```bash
wget -qO- https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/autoinstaller.sh | sudo bash
```

Se preferisci leggere lo script prima di eseguirlo — abitudine sana, visto che gira come root:

```bash
wget https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/autoinstaller.sh
less autoinstaller.sh
sudo bash autoinstaller.sh
```

**Cosa fa, nell'ordine:**

1. Si rieleva a root con `sudo` se non lo è già.
2. Riconosce il gestore pacchetti: `apt`, `dnf`, `yum`, `pacman`, `zypper` o `apk`. Copre Debian, Ubuntu, Fedora, RHEL, Rocky, Alma, Arch, openSUSE e Alpine.
3. Installa i prerequisiti: `curl`, `git`, `xz`, `python3`, la toolchain di compilazione (serve a `better-sqlite3` sulle architetture senza binario precompilato) e `ffmpeg`.
4. **Node.js**: se ne trova già uno ≥ 20 lo usa; altrimenti scarica la build ufficiale LTS da nodejs.org in `/usr/local/lib/argus-node` e la collega in `/usr/local/bin`. Riconosce x86-64, ARM64, ARMv7, ppc64le e s390x — quindi funziona anche su Raspberry Pi.
5. Clona il repository in `/opt/argus-pr` e mette in checkout **l'ultimo tag di release**, non il ramo di sviluppo.
6. Crea l'utente di servizio `argus`, la directory dati `/var/lib/argus-pr` con permessi `750` e il file di configurazione `/etc/argus-pr/argus.env` con permessi `640`, leggibile solo da root e dal servizio.
7. Scrive l'unità systemd con isolamento rinforzato (`ProtectSystem=strict`, `NoNewPrivileges`, nessuna capability, scrittura consentita solo su dati e `vendor/`), la abilita e la avvia.
8. Apre la porta su `ufw` o `firewalld`, se attivi.
9. Se la macchina ha una scheda video, installa anche la **console locale** (vedi la sezione dedicata più avanti).
10. Stampa un riepilogo con indirizzo web, versione installata e percorsi.

**Opzioni**, tutte facoltative — il default va bene nella grande maggioranza dei casi:

| Opzione | Effetto |
|---|---|
| `--port 9443` | Porta HTTP diversa da 8088 |
| `--dir /srv/argus` | Directory di installazione del codice |
| `--data /srv/registrazioni` | Directory di dati e registrazioni: usala per puntare a un disco dedicato |
| `--ref v0.4.0` | Installa un tag o un ramo preciso invece dell'ultima release |
| `--kiosk` | Forza la console locale anche se lo script non rileva una scheda video |
| `--no-kiosk` | Solo servizio, nessuna interfaccia locale — tipico per un server in armadio |

```bash
sudo bash autoinstaller.sh --port 9443 --data /srv/registrazioni --no-kiosk
```

Rilanciare lo script su una macchina già installata è sicuro: aggiorna il codice all'ultima release, riscrive l'unità systemd e riavvia il servizio **senza toccare database e registrazioni**.

### Linux — installazione manuale come servizio

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

## Console locale — la macchina diventa un'appliance

Un NVR chiuso in un armadio con un monitor davanti dovrebbe mostrare le telecamere, non un prompt di login. La **console locale** fa esattamente questo: all'accensione, sul monitor collegato al server, parte a schermo intero il muro video con tutte le telecamere attive.

L'autoinstaller la attiva da solo quando rileva una scheda video (`/dev/dri/card0`, `/dev/fb0` o una scheda in `/sys/class/drm`) e la macchina non è un container. Puoi forzarla con `--kiosk` o escluderla con `--no-kiosk`.

**Come appare**

- Griglia che si dispone da sola: 1 riquadro con una telecamera, 2 affiancati con due, poi 2×2, 3×3, 4×4 e così via. Nessuna configurazione: il layout segue il numero di canali attivi.
- Ogni riquadro porta il nome della telecamera e un pallino di stato — verde in diretta, ambra in connessione, rosso se il flusso non è riproducibile.
- In basso una barra di stato con l'indirizzo web da digitare sugli altri dispositivi, il numero di canali, quanti stanno registrando, la versione e l'orologio.
- Se la configurazione iniziale non è ancora stata fatta, al posto dei riquadri compare l'indirizzo a cui collegarsi per farla. Stessa cosa se non è ancora presente nessuna telecamera.
- La griglia si riallinea da sola: aggiungi una telecamera dal web e compare sul monitor entro dieci secondi, senza riavviare niente.

**Bassa risoluzione, per scelta**

Il muro usa il **flusso secondario** della telecamera quando è configurato (`subStreamUrl`), cioè quello a bassa risoluzione. Serve a mostrare molti riquadri senza saturare CPU e rete: il flusso principale in alta definizione resta per la registrazione e per la visione a pieno schermo dal web. Se una telecamera non ha flusso secondario viene usato il principale, ridimensionato a 720p solo nel caso in cui serva comunque una ricodifica.

**Come è fatta, e perché è sicura**

La console non ha credenziali scritte da nessuna parte. La pagina `/wall` chiede una sessione a `POST /api/console/session`, e il server la concede **solo se la richiesta arriva da loopback** (`127.0.0.1`, `::1`): cioè solo dal browser che gira sulla macchina stessa. Da qualunque altro indirizzo la stessa chiamata risponde `403`, anche dalla rete locale.

La sessione emessa appartiene a un utente di servizio `__kiosk__` con ruolo **osservatore**: può vedere diretta e archivio, non può aggiungere telecamere, cambiare impostazioni o gestire utenti. Chi ha accesso fisico al monitor vede le immagini e nient'altro. Finché la configurazione iniziale non è completata la console non emette alcuna sessione.

**Sotto il cofano**

L'unità systemd `argus-pr-kiosk.service` avvia una sessione X minimale su `tty1` con l'utente dedicato `argus-kiosk` — di sistema, senza privilegi — e lancia Chromium in modalità kiosk su `http://127.0.0.1:8088/wall`. Se Chromium non è disponibile ripiega su Firefox; se non c'è nessun browser installabile l'installazione prosegue lo stesso e lo segnala: il NVR resta raggiungibile via web.

```bash
systemctl status argus-pr-kiosk          # stato della console
systemctl restart argus-pr-kiosk         # riavvia il muro video
systemctl disable --now argus-pr-kiosk   # spegni la console, il NVR continua
systemctl enable --now getty@tty1        # riattiva il terminale su tty1
```

Il muro è raggiungibile anche da un altro PC all'indirizzo `http://<indirizzo>:8088/wall`, ma da remoto serve il login normale: la scorciatoia loopback non si applica.

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
| **FA** | Autoinstaller Linux e console locale a schermo intero | ✅ completata |
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
