# Telecamere: sorgenti, profili e azioni

L'app **Telecamere** è la console di configurazione dei canali. Dalla versione 0.16.0 vive nella macro-area **Sistema** del Launchpad, non più in *Flussi Live*: non è una vista di sorveglianza, è il posto dove si dichiara *che cosa* il sistema deve guardare e *come*.

Questo documento descrive l'architettura completa in tre blocchi. Il primo è costruito; il secondo e il terzo sono progettati qui prima di essere scritti, perché le scelte del primo li vincolano.

---

## 1. Blocco costruito (v0.16.0): sorgenti e console

### 1.1 Il descrittore d'ingresso

`src/features/cameras/camera_input.js` è **l'unico punto** del sistema che sa come si apre una sorgente video. Prima esistevano quattro punti che scrivevano a mano `-rtsp_transport … -i url` (diretta, registrazione, movimento, visione): aggiungere un tipo di sorgente significava toccarli tutti e dimenticarne uno.

```
resolveInput(camera, { preferSub, platform })
    → { kind, local, target, demuxArgs, label }

buildCaptureArgs(input)   → argomenti ffmpeg,  fino a  -i <target>
buildProbeArgs(input, …)  → argomenti ffprobe (senza i flag esclusivi di ffmpeg)
```

`label` è la forma sicura per i log: le credenziali negli URL passano da `redactCredentials`. Nessun consumatore deve più costruire URL autenticati per conto proprio.

Tipi di sorgente supportati:

| `sourceKind` | Ingresso ffmpeg | Note |
|---|---|---|
| `rtsp` | `-rtsp_transport tcp\|udp -stimeout 8000000 -i rtsp://…` | telecamere IP, ONVIF |
| `mjpeg` | `-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -i http://…` | webcam di rete, ESP32-CAM |
| `http` | come sopra | HLS, MP4 remoto |
| `usb` | Windows `-f dshow -i video=<nome>` · Linux `-f v4l2 -i /dev/videoN` · macOS `-f avfoundation -i <indice>` | periferica collegata al server |

Le sorgenti locali non ricevono `-fflags nobuffer -flags low_delay`: sono flag pensati per la rete e su una periferica locale non servono.

**Il parametro `platform` esiste per i test.** Le tre varianti USB sono verificate su tutte le piattaforme da una macchina sola (`test/camera_input.test.js`).

### 1.2 Perché l'identificativo di periferica è validato

`requireDeviceId` accetta solo `^[A-Za-z0-9/][A-Za-z0-9 ._:@#()\\/-]{0,199}$`. Il valore arriva dall'utente e finisce in un argomento di `spawn`. Con `shell: false` non c'è iniezione di comando, ma un identificativo con virgolette o punto e virgola produce comportamenti opachi di dshow: meglio rifiutarlo al confine. Le periferiche rilevate che non superano la validazione vengono scartate con un avviso, non passate avanti.

### 1.3 Enumerazione delle periferiche

`src/features/cameras/local_devices.js` interroga ffmpeg e traduce il suo output in dati:

- Windows: `-list_devices true -f dshow -i dummy`, e su richiesta `-list_options true` per formato, risoluzione e cadenza massima di ciascuna periferica.
- Linux: `/dev/video*` con il nome letto da `/sys/class/video4linux/<nodo>/name`, e su richiesta `-list_formats all`.
- macOS: `-f avfoundation -list_devices true`.

`GET /api/cameras/devices?formats=1` espone il risultato a `camera.manage`, con rate limit 20/min: elencare le periferiche costa processi ffmpeg. I parser sono funzioni pure esportate come `parsers` e testate su output reali (`test/local_devices.test.js`).

### 1.4 Modello dati

Migrazione `009_camera_profiles` estende `cameras` senza toccare le colonne esistenti:

```
device_id, input_format, capture_width, capture_height, capture_fps,
audio_enabled (default 1), location, camera_group, retention_days, hwaccel, notes
```

`audio_enabled` vale 1 per impostazione predefinita: gli impianti già installati registravano l'audio quando presente, e un aggiornamento non deve cambiare in silenzio ciò che finisce nell'archivio.

`insertCamera` **omette** le colonne non fornite invece di scrivere `NULL`, così i valori predefiniti dello schema restano validi: una telecamera USB non ha trasporto RTSP, e la colonna `transport` è `NOT NULL DEFAULT 'tcp'`.

### 1.5 Validazione

`camera_payload.js` è l'unico traduttore fra corpo HTTP e riga di database. Regola centrale: **la forma della validazione dipende dal tipo di sorgente**. Una telecamera di rete pretende un URL con schema consentito; una USB pretende una periferica e azzera gli URL. Su `PUT` la validazione è parziale ma non permissiva: i campi presenti sono verificati con lo stesso rigore, i campi assenti non vengono inventati.

### 1.6 Applicazione a caldo

Salvare una modifica pubblica `Topic.CAMERA_UPDATED`. Diretta, registrazione e movimento fermano la pipeline del canale interessato e la politica la ricrea con la configurazione nuova. Senza questo, cambiare l'URL o la periferica avrebbe richiesto un riavvio del servizio, e l'utente avrebbe visto il flusso vecchio credendo di aver sbagliato i parametri.

### 1.7 Interfaccia

`web/features/cameras/` è diviso per responsabilità, nessun file oltre le 500 righe:

- `cameras.js` — elenco a schede con filtro, ricerca ONVIF, adozione di un dispositivo rilevato
- `camera_wizard.js` — aggiunta in due passi: scelta del tipo, poi parametri con **Verifica sorgente** prima del salvataggio (`POST /api/cameras/probe`, che analizza una configurazione non ancora salvata)
- `camera_detail.js` — scheda a tab: Generale, Registrazione (griglia 7×48), Zone di movimento, Diagnostica
- `camera_form.js` — campi condivisi fra creazione e modifica

---

## 2. Blocco progettato: analisi per telecamera e scelta dei motori

Oggi `vision_hub.js` avvia il worker di visione su **ogni** telecamera abilitata ed esegue **tutto** il catalogo di modelli. Non esiste un interruttore per capacità, né una scelta di algoritmo. È il limite più grave rimasto.

### 2.1 Tabella `camera_analytics`

Una riga per telecamera e per capacità:

```sql
CREATE TABLE camera_analytics (
    camera_id   TEXT NOT NULL,
    capability  TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 0,
    engine_id   TEXT NOT NULL,
    threshold   REAL,
    min_size    REAL,
    zone_mask   INTEGER,
    schedule_id TEXT,
    options     TEXT,
    PRIMARY KEY (camera_id, capability)
);
```

Capacità previste: `motion`, `person`, `vehicle`, `animal`, `face_detect`, `face_recognize`, `plate`, `tamper`. Domani `line_crossing`, `loitering`, `abandoned_object`: aggiungerle è un `INSERT`, non una migrazione.

Il riconoscimento facciale resta **disattivato per impostazione predefinita**, con avviso esplicito all'attivazione: è un dato biometrico ai sensi del GDPR (vedi [VISIONE.md](VISIONE.md) §7.5).

### 2.2 Registro dei motori

Catalogo dichiarativo in `src/features/vision/engines_catalog.js`, non nel database: è codice, cambia con il rilascio, e ogni voce porta con sé la licenza.

```js
{ id, capability, label, models: [{ name, sha256, url, license }],
  runtime: 'python' | 'edge' | 'native', providers: [...], cost: 1..5, notes }
```

| Capacità | Motori selezionabili |
|---|---|
| oggetti | YOLOX-nano · YOLOX-tiny · NanoDet-Plus · **analitica di bordo ONVIF** |
| volti (rilevamento) | YuNet · SCRFD-500m |
| volti (identità) | SFace · MobileFaceNet |
| targhe (rilevamento) | LPD dedicato · due passi veicolo→targa · ANPR di bordo |
| targhe (lettura) | PaddleOCR · fast-plate-ocr |
| movimento | EMA su pixel (attuale) · MOG2 · motion ONVIF |

**Il motore "di bordo" è la voce più preziosa del menù.** Molti modelli Hikvision, Dahua e Axis fanno già rilevamento persone, veicoli e targhe in hardware: instradare i loro eventi ONVIF verso `POST /api/detections` dà riconoscimento vero a costo di CPU nullo. Il resto del catalogo serve alle telecamere che non lo fanno.

I modelli **non entrano nel repository**: si scaricano al primo uso con verifica SHA-256, come già fa `src/platform/dependencies/catalog.js` per ffmpeg. Un motore con licenza AGPL può essere offerto ma non ridistribuito: la voce lo dichiara e l'interfaccia lo mostra prima dell'attivazione.

### 2.3 Conseguenze sul worker

`vision/worker.py` riceve un profilo per telecamera (JSON su `--profile` o sulla prima riga di stdin) e carica solo i modelli richiesti. Il `vision_hub` non avvia alcun processo se nessuna capacità AI è attiva sul canale, e riduce la cadenza a 1 fps a riposo, salendo a 5 quando il rilevatore di movimento segnala attività. Su un impianto con dieci telecamere ferme il risparmio è quasi tutto il carico.

---

## 3. Blocco progettato: eventi, notifiche e varchi (F6)

Il motore delle regole trasforma un rilevamento in un'azione:

```
trigger    capacità · classe · telecamera · zona
condizioni confidenza minima · targa in whitelist/blacklist · persona nota o ignota · fascia oraria
freni      cooldown per regola, limite giornaliero, finestra di silenzio
azioni     notifica in console · email SMTP · Telegram · webhook · MQTT
           relè ONVIF · comando HTTP a centralina · GPIO su Linux
           avvio registrazione · marcatura evento in archivio
```

Vincolo di progetto: **nessuna dipendenza npm nuova**. SMTP, Telegram e MQTT sono protocolli, e `node:net`/`node:tls`/`fetch` bastano a parlarli. Ogni esecuzione finisce in una tabella `automation_runs` con esito: un'automazione che non lascia traccia è un'automazione di cui non ci si può fidare quando serve.

Le azioni che aprono varchi sono irreversibili nel mondo fisico. Richiedono conferma esplicita alla creazione della regola, sono registrate in `audit_log` con l'attore, e non sono attivabili da una sessione proveniente da internet (§6c di AGENTS.md).

---

## 4. Cosa non è ancora vero

- Nessuna telecamera USB è stata provata su hardware reale: la catena è verificata sui soli argomenti generati e sull'avvio del processo.
- L'enumerazione delle periferiche non è mai stata eseguita su Linux con un dispositivo v4l2 fisico.
- I blocchi 2 e 3 non esistono: questo documento li progetta, non li descrive.
