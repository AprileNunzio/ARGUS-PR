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

> **Stato attuale: 0.15.0.** Massime prestazioni hardware (GPU, CPU, RAM): accelerazione video GPU (CUDA/NVENC, QSV, D3D11VA, VAAPI, VideoToolbox, AMF), inferenza AI ONNX multithread, tuning estremo RAM per SQLite (fino a 2GB cache, 4GB mmap), rilevamento persone/veicoli/animali, biometria volti GDPR, ANPR e installatori autonomi Windows/Linux. Vedi [Roadmap](#roadmap).

---
## Perché esiste

I sistemi di videosorveglianza commerciali hanno tre problemi ricorrenti: obbligano al cloud del produttore, smettono di ricevere aggiornamenti dopo pochi anni, e costano un abbonamento per funzioni che l'hardware già possiede.

ARGUS-PR nasce per stare interamente sulla tua infrastruttura, funzionare su hardware modesto, e restare ispezionabile: il codice è aperto e le registrazioni sono file normali su un disco che controlli tu.

---
## Caratteristiche

### Disponibili oggi

| | |
|---|---|
| **Sorgenti di ogni tipo** | Telecamere IP RTSP, flussi MJPEG e HTTP, e **periferiche USB collegate al server** (dshow su Windows, v4l2 su Linux, avfoundation su macOS), con enumerazione delle periferiche e dei loro formati |
| **Console Telecamere** | Elenco a schede con filtro, wizard di aggiunta con verifica della sorgente prima del salvataggio, scheda per canale con Generale, Registrazione, Zone e Diagnostica |
| **Interfaccia senza finestre di dialogo** | Nessun popup del browser: ogni schermata ha il proprio indirizzo e le conferme distruttive compaiono dentro la pagina, con le conseguenze scritte |
| **Automazioni** | Regole che legano un riconoscimento a un'azione: email, Telegram, webhook firmato, MQTT, comando HTTP e **apertura varchi dal relè ONVIF della telecamera**, con cooldown, limite giornaliero e fascia oraria |
| **Analisi scegliibile per telecamera** | Persone, veicoli, animali, volti, riconoscimento facciale e targhe si accendono uno per uno su ogni canale, e per ognuno si sceglie l'algoritmo fra quelli disponibili, con soglia regolabile |
| **Autoconfigurazione guidata** | Una sequenza di prove reali sulla sorgente — presenza, apertura, formato, anteprima, registrazione, analisi — che propone e applica la configurazione funzionante |
| **Scoperta automatica** | Trova le telecamere ONVIF sulla rete locale via WS-Discovery, senza inserire indirizzi a mano |
| **Verifica flusso** | Interroga ogni telecamera con ffprobe e riporta codec, risoluzione e frame rate reali |
| **Credenziali cifrate** | Le password delle telecamere sono protette con AES-256-GCM; la chiave sta sul disco con permessi 0600 e non lascia mai la macchina |
| **Accesso a ruoli** | Amministratore, operatore e osservatore, con permessi distinti per diretta, archivio ed esportazione |
| **Registro di controllo** | Ogni accesso, modifica e operazione sensibile viene tracciata con utente, orario e indirizzo |
| **Eventi in tempo reale** | Canale WebSocket autenticato che spinge gli eventi al browser senza interrogazioni continue |
| **Interfaccia responsive** | Stessa interfaccia su desktop, tablet e telefono, senza app da installare |
| **Diretta video** | Flussi RTSP riprodotti nel browser con latenza sotto il secondo, senza plugin e senza librerie esterne |
| **Muro video** | Griglia 1/4/9/16/25/36/64 riquadri o adattiva, assegnazione delle telecamere ai singoli riquadri, riconnessione automatica e marchio sui riquadri liberi |
| **Regia del muro** | Layout, qualita Main HD o Sub SD per canale, uscite video HDMI/DP/VGA e formato dell'orologio, applicati **in tempo reale** su HDMI e su web tramite il bus eventi |
| **Riquadri AI sul muro** | I contorni di persone, veicoli e animali compaiono sul video con etichetta, confidenza e colore per classe, in tre stili, riusando i track gia calcolati senza inferenza aggiuntiva |
| **Telemetria del motore AI** | Per ogni canale: fotogrammi al secondo, latenza di inferenza reale, rilevamenti, fotogrammi scartati, riavvii, provider ONNX in uso e ultimo errore |
| **Registrazione continua ed evento** | Segmenti MP4 senza ricodifica, con hash SHA-256 e marcatura eventi per conservazione selettiva |
| **Pianificazione oraria** | Griglia settimanale 7×48 slot da mezz'ora per telecamera più eccezioni giornaliere di calendario |
| **Rilevamento movimento con zone** | Modello di sfondo adattivo a 5 fps 160×90 in pura aritmetica pixel; zone poligonali su canvas, isteresi, guardia anti-abbagliamento e cooldown |
| **Visione AI e tracciamento** | Riconoscimento persone, veicoli (auto, furgoni, moto, bici), animali (cani, gatti, uccelli) con tracciamento IoU tra fotogrammi |
| **Biometria facciale e GDPR** | Modelli YuNet + SFace con soglia standard 0.363, centroide biometrico e cancellazione totale GDPR |
| **Lettura targhe ANPR** | OCR multi-frame con voto pesato per confidenza e validazione formati italiani ed europei |
| **Controllo accessi e varchi** | Regole whitelist, blacklist e monitorate, pattern con wildcard e priorità assoluta per la blacklist |
| **Ingresso rilevamenti macchina** | API autenticata con chiavi crittografiche (solo hash SHA-256 nel DB) per flussi ONVIF esterni o modelli di inferenza |
| **Archivio navigabile** | Linea temporale delle 24 ore: clicchi l'istante e parte la riproduzione da lì |
| **Ritenzione automatica differenziata** | Per giorni, quota e spazio libero, con ritenzione estesa per segmenti contenenti eventi rilevati |
| **Installatori autonomi** | Linux (`autoinstaller.sh`) e Windows (Setup `.exe` con launcher desktop, icona e servizio) non presidiati con venv Python e modelli ONNX |
| **Aggiornamento automatico** | Si aggiorna da GitHub con un clic. Se la nuova versione non parte, il sistema torna da solo alla precedente: il servizio non ha nemmeno i permessi per riscrivere il proprio codice |
| **Esportazione forense** | Il video esce senza ricodifica, accompagnato da un manifesto sigillato che elenca ogni segmento col suo hash, chi ha esportato, quando e perche. Una manomissione di un solo bit viene rilevata |
| **Console locale** | Sul monitor collegato al server appare il muro video a schermo intero con barra di stato e indirizzo IP: la macchina diventa un'appliance |
| **Accelerazione verificata sul campo** | Ogni acceleratore dichiarato da ffmpeg viene **provato** prima dell'uso: `ffmpeg -hwaccels` elenca cio che e compilato, non cio che la macchina possiede. Encoder promossi da una codifica di prova, inclusi NVENC, QSV, VAAPI, VideoToolbox e V4L2 mem2mem |
| **Capacita della macchina** | Un rapporto valido su Linux, Windows e macOS elenca processore, acceleratori usabili, dispositivi V4L2, moduli codec del chip, provider ONNX e temperatura, con i comandi esatti per abilitare cio che manca. **Non applica nulla da solo** |
| **Analisi che non affama la registrazione** | Frequenza di analisi e thread di inferenza derivati dai core disponibili; il worker scarta i fotogrammi arretrati e resta ancorato al presente invece di accumulare ritardo |
| **Gestione macchina** | Riavvio dei servizi, alimentazione del server e pulizia selettiva delle cache dall'interfaccia, con conferma inline |
| **Data, ora e sincronizzazione** | Formato 24h o AM/PM, fuso orario IANA applicato anche al sistema operativo, stato reale dell'ora legale e sincronizzazione NTP su richiesta |
| **Aggiornamento offline** | Installazione da USB, share SMB/NFS gia montata, FTP o HTTPS tramite pacchetti `git bundle`, con verifica SHA-256 e lo stesso watchdog di ripristino della OTA |
| **Tuning RAM** | Cache SQLite fino a 2GB, mmap fino a 4GB e preset rapidi per macchine da un core a molti core |
| **Diagnostica** | `argus doctor` verifica ambiente, permessi, database e ffmpeg, e stampa il rapporto completo delle capacita hardware con i suggerimenti applicabili |
| **Amministrazione da riga di comando** | `argus update`, `argus watchdog-reset` e `argus vision list/enable/disable`: l'intero ciclo di aggiornamento e la configurazione dell'analisi funzionano senza browser |

### In sviluppo

Notifiche push Telegram e MQTT · Integrazione relè fisici di apertura varchi · Ricerca forense unificata · Planimetria con barriere virtuali

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

### Windows — installazione autonoma (consigliata)

Scarica il programma di installazione guidata ufficiale **`.exe`** da **[GitHub Releases](https://github.com/AprileNunzio/ARGUS-PR/releases/latest)** (`ARGUS-PR-v0.15.0-Setup.exe`) e fai **doppio clic** per completare il setup guidato.

Al termine trovi sul desktop e nel menu Start l'icona **ARGUS-PR**. E' un eseguibile vero (`ARGUS-PR.exe`), non un collegamento a una pagina web: all'avvio verifica il servizio `ArgusPR`, lo avvia se e' fermo, attende che risponda e apre la console in una finestra applicativa dedicata, senza barra degli indirizzi. Se il servizio non parte mostra un messaggio con il percorso del registro, invece di lasciare il browser su "connessione rifiutata".

In alternativa, puoi eseguire da **PowerShell** (avviato come Amministratore):


```powershell
irm https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/deploy/windows/install.ps1 | iex
```

L'installatore configura autonomamente Node.js, FFmpeg, Python, virtualenv con modelli ONNX (SHA-256 verificato), crea il servizio Windows `ArgusPR` e imposta la regola firewall per la porta 443. Prima di dichiarare il successo attende che la porta risponda davvero. Registro completo dell'installazione: `%ProgramData%\ARGUS-PR\install.log`.

### Windows — avvio rapido portatile (senza servizio)

Se vuoi solo testarlo senza creare il servizio di sistema:
1. Installa i prerequisiti: `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg`
2. Fai **doppio clic** su `deploy\windows\quick-start.bat`


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
| `--port 9443` | Porta HTTPS diversa da 443 |
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
cd ARGUS-PR && sudo ./deploy/linux/install.sh
```

Per un disco dedicato alle registrazioni:

```bash
sudo mkfs.ext4 /dev/sdb1 && sudo mkdir -p /srv/registrazioni
echo '/dev/sdb1 /srv/registrazioni ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab
sudo mount -a && sudo chown -R argus:argus /srv/registrazioni
sudo systemctl edit argus-pr --setenv=ARGUS_MEDIA_DIR=/srv/registrazioni
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
## Esportazione con catena di custodia

Un filmato estratto da un impianto di videosorveglianza può finire davanti a un'assicurazione o a un giudice. Lì la domanda non è "si vede bene", è "come dimostri che è quello originale". ARGUS-PR risponde con un manifesto.

Dalla scheda **Archivio**, sotto la linea temporale: scegli l'intervallo, scrivi il motivo, premi *Esporta*. Ottieni tre file.

| File | Contenuto |
|---|---|
| `video.mp4` | I segmenti uniti **senza ricodifica**: i fotogrammi sono bit per bit quelli registrati |
| `manifest.json` | Chi ha esportato, da quale indirizzo, quando, perché; ogni segmento sorgente con il suo hash; l'hash del video prodotto; la catena |
| `manifest.sig` | Il sigillo HMAC-SHA256 del manifesto |

**Come funziona la catena.** Ogni segmento produce un anello calcolato sull'anello precedente, sulla propria posizione, sul proprio hash, sull'istante e sulla dimensione. Modificare un segmento, riordinarli o sostituirne uno cambia la radice della catena, e la verifica se ne accorge.

**Il doppio hash.** L'hash di ogni segmento viene calcolato due volte: quando il segmento viene registrato, e di nuovo quando lo si esporta. Se qualcuno ha toccato un file sul disco nel frattempo, il manifesto lo dice e indica **quale** segmento non torna. L'esportazione non viene bloccata: si esporta quello che c'è, dichiarando cosa non quadra. Nascondere il problema sarebbe peggio che segnalarlo.

**Il sigillo.** È un HMAC-SHA256 con una chiave derivata dalla chiave principale dell'installazione tramite HKDF. La chiave principale non viene mai usata direttamente e non lascia la macchina. Un manifesto riscritto e risigillato altrove non passa la verifica.

Il pulsante **Verifica** ricontrolla tutto: hash del manifesto, sigillo, catena dei segmenti e hash del video sul disco.

```
Esportazione integra: video, manifesto e sigillo corrispondono. Catena cc759b5999d1c93d…
```

Limiti voluti: sei ore per intervallo, 720 segmenti, due esportazioni in parallelo. Servono a impedire che un'esportazione saturi la macchina mentre sta registrando.

---
## Aggiornamenti automatici da GitHub

Un videoregistratore resta acceso per anni. Se aggiornarlo richiede una sessione SSH, non verrà aggiornato mai. ARGUS-PR si aggiorna dalla pagina **Sistema**, e se la nuova versione non parte torna da sola alla precedente.

### Come si aggiorna

Apri **Sistema → Aggiornamenti**, premi *Cerca aggiornamenti*, e se ne esiste una nuova premi *Installa*. Il servizio si riavvia e torna su da solo. Non c'è altro da fare.

Il sistema controlla comunque da sé la presenza di nuove versioni ogni sei ore e lo annota nel registro, senza installare niente: l'installazione resta una decisione tua.

### Perché è sicuro

Il punto delicato di ogni autoaggiornamento è che il programma riscrive sé stesso. Se il processo che serve la rete può modificare il proprio codice, chi riesce a comprometterlo ottiene persistenza. Qui non può:

- **Il servizio non ha permessi di scrittura sul proprio codice.** `/opt/argus-pr` appartiene a root; il servizio gira come utente `argus` e può scrivere solo su dati, registrazioni e `vendor/`.
- **L'applicazione può soltanto *chiedere* un aggiornamento.** Scrive `update-state.json` nella directory dati e si spegne con codice 75. Nient'altro.
- **Chi applica l'aggiornamento è `ExecStartPre`**, uno script che systemd esegue come root prima di ogni avvio (con il prefisso `+`, quindi fuori dal sandbox del servizio).
- **Il riferimento richiesto è validato due volte**, dall'applicazione e di nuovo dallo script privilegiato, contro l'espressione `^v[0-9]+\.[0-9]+\.[0-9]+$`. Un ramo, un commit, un percorso o una stringa con un `;` dentro vengono rifiutati e non arrivano mai a `git`.
- **Il remoto viene riscritto sull'URL ufficiale prima del fetch**, quindi il codice arriva da questo repository e da nessun altro, anche se qualcuno avesse manomesso la configurazione git.
- **I downgrade sono rifiutati**: si può solo salire di versione.
- **Solo un amministratore** (`system.manage`) vede e usa questa pagina. Un osservatore riceve `403`.
- **L'integrità la garantisce git**: ogni oggetto è indirizzato dal proprio SHA, quindi un file alterato in transito non corrisponde al commit del tag e il checkout fallisce.

### Il ripristino automatico

Questo è il pezzo che rende l'aggiornamento tranquillo su una macchina che nessuno guarda.

1. Applicato l'aggiornamento, lo stato diventa `pending` con un contatore di tentativi.
2. Se il nuovo processo resta in piedi **90 secondi**, si marca da solo `healthy`. Fine.
3. Se invece va in crash, systemd lo riavvia; a ogni riavvio `ExecStartPre` incrementa il contatore.
4. Al **terzo avvio fallito** lo script rimette in checkout il commit precedente — salvato prima di partire — reinstalla le dipendenze e marca `rolled-back`.
5. Riapri l'interfaccia e trovi la versione vecchia in funzione, con scritto perché.

Lo stato è visibile in `Sistema → Aggiornamenti` e nei log:

```bash
journalctl -u argus-pr | grep argus-pre-start
cat /var/lib/argus-pr/update-state.json
```

### Se non è un clone git

L'aggiornamento automatico richiede che l'installazione sia un clone git, come quella fatta dall'autoinstaller. Se hai scompattato uno zip, la pagina Sistema te lo dice e il pulsante *Installa* non compare: aggiorni scaricando la nuova versione, oppure passi all'installazione automatica, che è anche il modo per ottenere il ripristino automatico.

Su Windows la ricerca degli aggiornamenti e la notifica funzionano allo stesso modo; l'applicazione automatica con ripristino è specifica di systemd e quindi solo Linux.

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

L'unità systemd `argus-pr-kiosk.service` avvia una sessione X minimale su `tty1` con l'utente dedicato `argus-kiosk` — di sistema, senza privilegi — e lancia Chromium in modalità kiosk su `https://127.0.0.1/wall`, dopo avere installato l'autorità interna nel profilo del browser. Se Chromium non è disponibile ripiega su Firefox; se non c'è nessun browser installabile l'installazione prosegue lo stesso e lo segnala: il NVR resta raggiungibile via web.

```bash
systemctl status argus-pr-kiosk          # stato della console
systemctl restart argus-pr-kiosk         # riavvia il muro video
systemctl disable --now argus-pr-kiosk   # spegni la console, il NVR continua
systemctl enable --now getty@tty1        # riattiva il terminale su tty1
```

Il muro è raggiungibile anche da un altro PC all'indirizzo `https://<indirizzo>/wall`, ma da remoto serve il login normale: la scorciatoia loopback non si applica.

---
## Primo avvio

Al primo avvio ARGUS-PR entra in **configurazione guidata**. Apri `https://<indirizzo-del-server>` **dalla rete locale** e segui cinque passi. Il browser mostrerà un avviso sul certificato: è atteso, vedi [Certificato e HTTPS](#certificato-e-https).

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

Quasi tutto si regola dal browser, in **Impostazioni**: aggiornamenti, accesso remoto, sicurezza degli account, console e ritenzione. Ogni modifica e validata, registrata nel giornale di controllo e applicata a caldo, senza riavviare.

Restano nel file di ambiente soltanto porta HTTPS, certificato e percorsi dei dati: un valore sbagliato li renderebbe irraggiungibili proprio dalla pagina da cui li avresti cambiati, quindi si toccano dalla macchina.

### Il riavvio lo decidi tu

Trovato un aggiornamento, il sistema **non si riavvia da solo**. In Impostazioni scegli:

| Politica | Comportamento |
|---|---|
| **Chiedi sempre conferma** (predefinita) | compare un avviso con il pulsante per riavviare quando vuoi tu |
| **Solo nella finestra di manutenzione** | si aggiorna da solo negli orari e nei giorni che indichi, per esempio dalle 03:00 alle 05:00 |
| **Subito** | applica appena disponibile |

La finestra puo attraversare la mezzanotte. Se la nuova versione non si stabilizza, viene ripristinata da sola quella precedente e messa in quarantena.

### Variabili d ambiente

Restano disponibili per l installazione automatica e per chi preferisce configurare da file. Un file `argus.env` nella cartella dati ha lo stesso effetto.

| Variabile | Default | Descrizione |
|---|---|---|
| `ARGUS_HOST` | `0.0.0.0` | Indirizzo di ascolto |
| `ARGUS_PORT` | `443` | Porta HTTPS |
| `ARGUS_HTTP_PORT` | `80` | Porta del solo redirect verso HTTPS; `0` la disattiva |
| `ARGUS_DATA_DIR` | dipende dal sistema | Database, chiavi, configurazione |
| `ARGUS_MEDIA_DIR` | `<dati>/media` | Registrazioni video |
| `ARGUS_FFMPEG_PATH` | rilevato dal PATH | Percorso esplicito a ffmpeg |
| `ARGUS_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `ARGUS_TRUST_PROXY` | `false` | Attivalo **solo** dietro un reverse proxy tuo |
| `ARGUS_SESSION_TTL_HOURS` | `12` | Durata della sessione |
| `ARGUS_AUTO_UPDATE` | `true` | Aggiorna da solo all'avvio e ogni 6 ore |
| `ARGUS_AUTO_UPDATE_MIN_INTERVAL` | `60` | Minuti minimi fra due tentativi automatici |
| `ARGUS_UPDATE_KEYRING` | `/etc/argus-pr/update-key.asc` | Chiave pubblica per verificare la firma delle release |
| `ARGUS_PUBLIC_ACCESS` | `false` | Consente da internet la **sola visione** delle telecamere |
| `ARGUS_PUBLIC_HOSTS` | vuoto | Nomi DNS pubblici da includere nel certificato |
| `ARGUS_TRUSTED_NETWORKS` | vuoto | Reti trattate come locali, es. la subnet WireGuard |
| `ARGUS_TLS_CERT` | vuoto | Certificato pubblico, se ne possiedi uno |
| `ARGUS_TLS_KEY` | vuoto | Chiave privata del certificato |
| `ARGUS_TLS_CA` | vuoto | Catena intermedia del certificato |

Cartella dati predefinita: `%PROGRAMDATA%\ARGUS-PR` su Windows, `/var/lib/argus-pr` su Linux con systemd, `~/.local/share/argus-pr` altrimenti.

---
## Sicurezza

Il progetto adotta un approccio Zero-Trust: ogni input è ostile finché non è validato.

### Certificato e HTTPS

**ARGUS-PR non parla mai in chiaro.** La porta 80 esiste solo per rispondere `308` verso HTTPS: non serve contenuti, non legge cookie, non tocca il database.

Al primo avvio il sistema genera da solo una piccola autorità di certificazione interna e le fa firmare il certificato del server — chiavi ECDSA P-256, nessuna dipendenza esterna, nessun `openssl` da installare. Il certificato copre `localhost`, l'hostname, tutti gli indirizzi IP locali e ogni nome dichiarato in `ARGUS_PUBLIC_HOSTS`, e si rinnova da solo quando mancano 30 giorni alla scadenza o quando cambia un indirizzo.

Il browser mostrerà un avviso, perché nessun ente pubblico garantisce per quella autorità. Hai due strade:

```bash
argus cert     # stampa impronta SHA-256, scadenza e percorso di ca.crt
```

1. **Confronta l'impronta** mostrata dal browser con quella del comando, poi accetta l'eccezione.
2. **Installa `ca.crt`** sui dispositivi da cui accedi: l'avviso sparisce e ottieni il lucchetto verde. Il file si trova in `<cartella dati>/secrets/pki/ca.crt`.

Se possiedi un certificato pubblico vero (Let's Encrypt e simili), indicalo con `ARGUS_TLS_CERT` e `ARGUS_TLS_KEY`: ha la precedenza e la PKI interna non viene nemmeno creata.

### Da internet si guarda, non si tocca

Ogni richiesta viene classificata in tre zone di rete — `local`, `lan`, `wan` — e ogni funzione dichiara da dove è raggiungibile. Il valore predefinito di ogni rotta è **privata**: non raggiungibile da internet finché qualcuno non decide esplicitamente il contrario.

Con `ARGUS_PUBLIC_ACCESS=true` da internet passano soltanto login, sessione, elenco telecamere e diretta video. Restano fuori configurazione, archivio, esportazioni, utenti, aggiornamenti e ogni altra funzione amministrativa. Sopra questo agiscono altri tre sbarramenti indipendenti:

- **Nessun account amministrativo può entrare da internet.** Il rifiuto usa lo stesso messaggio di una password sbagliata, per non rivelare quali utenti esistono.
- **Le sessioni sono legate alla zona in cui sono nate**: un cookie ottenuto in ufficio non funziona da fuori.
- **L'elenco telecamere è ridotto**: da internet escono id, nome e stato. URL RTSP, indirizzi, porte, marca e modello restano dentro.

Chi accede da fuori ha inoltre un budget di 240 richieste al minuto e limiti di rotta quattro volte più stretti.

> Esporre il NVR su internet resta una scelta che aumenta il rischio. Se puoi, preferisci una VPN (WireGuard, Tailscale) e metti la sua subnet in `ARGUS_TRUSTED_NETWORKS`. Se devi esporlo, tieni `ARGUS_PUBLIC_ACCESS` acceso solo finché serve davvero.

### ARGUS-SHIELD, il firewall perimetrale

Insieme al NVR viene installato [ARGUS-SHIELD](shield/README.md), un applicativo **autonomo** che governa il firewall della macchina e risponde agli attacchi in tempo reale: ruleset nftables con politica di rifiuto, difesa dalle scansioni, limiti di connessione, e blocco automatico degli indirizzi che accumulano comportamenti sospetti — con punteggio a decadimento esponenziale e durata crescente per i recidivi.

La comunicazione fra i due programmi è **a senso unico**: il NVR scrive gli eventi, lo scudo li legge. Non esiste modo per il NVR di comandare il firewall, così un NVR compromesso non si porta dietro anche la difesa perimetrale.

```bash
argus-shield status     # backend, ruleset, indirizzi bloccati
argus-shield unban <ip> # sblocco manuale
```

La rete locale non viene mai bloccata: chiudersi fuori da un impianto che sta registrando sarebbe peggio dell'attacco.

### Il resto delle difese

- **Password utenti** con `scrypt` e salt individuale; confronto a tempo costante.
- **Password telecamere** cifrate AES-256-GCM con chiave generata alla prima esecuzione, salvata con permessi `0600` e mai inclusa nel repository.
- **Sessioni** con token da 256 bit; nel database finisce solo l'hash SHA-256. Cookie `HttpOnly`, `SameSite=Strict`, `Secure` sotto HTTPS.
- **CSP restrittiva** senza `unsafe-inline`, più `X-Frame-Options: DENY` e `nosniff`.
- **Rate limiting** su login e cambio password, più **blocco progressivo per account**: dal terzo tentativo fallito l'attesa raddoppia a ogni errore fino a mezz'ora, al decimo scatta un'ora. Il conteggio è per nome utente, così una botnet distribuita su molti indirizzi non lo aggira.
- **Verifica dell'origine** su tutte le richieste che modificano dati.
- **Nessuna shell** nell'invocazione di ffmpeg: argomenti passati come array, `shell: false`. Gli URL RTSP sono input utente e vengono validati contro una lista di schemi ammessi.
- **Percorsi confinati**: ogni percorso derivato da input è verificato come discendente della radice consentita.
- **Registro di controllo** immutabile per accessi e operazioni sensibili.

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
| **F3** | Riproduzione, timeline ed esportazione con catena di custodia | ✅ completata |
| **FA** | Autoinstaller Linux e console locale a schermo intero | ✅ completata |
| **FU** | Aggiornamento da GitHub con ripristino automatico | ✅ completata |
| **F4** | Pianificazione oraria, rilevamento movimento con zone, ingressi rilevamenti | ✅ completata |
| **F5** | Persone, biometria facciale, targhe ANPR, controllo accessi, installer autonomi | ✅ completata |
| **F7.1** | Telecamere in Sistema, ingresso unico, sorgenti USB e MJPEG, console a schede | ✅ completata |
| **F7.2** | Analisi per telecamera e per capacità, registro dei motori selezionabili | ✅ completata |
| **F7.3** | Regole evento→azione: notifiche, email, webhook, MQTT, relè e varchi | ✅ completata |
| **F6** | Planimetria, preset, notifiche Telegram/MQTT, relè fisici | 🔜 in corso |

Il motore di visione AI opera tramite worker Python dedicato alimentato da flussi rawvideo ffmpeg su pipe standard. Esegue YOLOX per rilevamento oggetti, YuNet per volti, SFace per biometria e OCR pesato per targhe ANPR, senza appesantire il processo Node.js.

---
## Risoluzione dei problemi

<details>
<summary><b>Windows: "Connessione rifiutata" su localhost</b></summary>

Significa che il demone non e' in ascolto: l'installazione si e' fermata prima di creare il servizio. Verifica in quest'ordine:

```powershell
Get-Service ArgusPR
Get-Content "$env:ProgramData\ARGUS-PR\install.log" -Tail 40
Get-Content "$env:ProgramData\ARGUS-PR\service.log" -Tail 40
```

Se il servizio non esiste, rilancia la configurazione senza reinstallare tutto:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:ProgramFiles\ARGUS-PR\deploy\windows\install.ps1"
```

La causa storica era una copia dei file su se stessi che interrompeva lo script prima di `npm install`: se in `%ProgramFiles%\ARGUS-PR` manca `node_modules`, sei in quel caso e basta rilanciare il comando qui sopra.
</details>

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
