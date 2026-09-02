# Visione artificiale: oggetti, targhe, volti

Come costruire il riconoscimento **vero**. Il processo di visione è un componente separato, trattato come ffmpeg: un eseguibile esterno che ARGUS-PR avvia e con cui parla su una pipe.

---

## 1. Il processo `argus-vision`

### 1.1 Linguaggio e dipendenze

Python 3.10 o superiore. È l'unico ambiente dove i modelli di visione funzionano senza attriti su Windows, Linux e ARM.

```
onnxruntime>=1.17          # motore di inferenza, licenza MIT
opencv-python-headless     # decodifica, trasformazioni, YuNet, SFace
numpy
```

Queste dipendenze stanno **nel worker**, in un `requirements.txt` dentro `vision/`. Non toccano il `package.json` di ARGUS-PR, che resta a due dipendenze. È lo stesso rapporto che il progetto ha già con ffmpeg.

Installazione dal lato Node: una funzione gemella di `provisionMediaTools()`, che crea un ambiente virtuale in `<dataDir>/vision/venv` e installa i requisiti. L'autoinstaller Linux installa `python3-venv`. Su Windows si usa il Python di sistema o si scarica un embeddable.

### 1.2 I modelli, e la questione delle licenze

Questo repository è MIT e pubblico. **Un modello con licenza AGPL contamina la ridistribuzione.** Verifica sempre prima di includere.

| Compito | Modello consigliato | Licenza | Dimensione |
|---|---|---|---|
| Oggetti (persone, veicoli, animali) | **YOLOX-nano** o **NanoDet-Plus** | Apache 2.0 | 4–8 MB |
| Oggetti, alternativa | YOLOv8n / YOLO11n di Ultralytics | **AGPL-3.0** ⚠️ | 6 MB |
| Volti, rilevamento | **YuNet** (`face_detection_yunet_2023mar.onnx`) | permissiva, verifica | ~340 kB |
| Volti, riconoscimento | **SFace** (`face_recognition_sface_2021dec.onnx`) | permissiva, verifica | ~37 MB |
| Targhe, rilevamento | modello LPD dedicato, oppure YOLOX addestrato su targhe | dipende | 4–8 MB |
| Targhe, lettura | **PaddleOCR** riconoscimento inglese | Apache 2.0 | ~10 MB |

**Non includere i pesi nel repository.** Scaricali al primo avvio, con **verifica SHA-256**, esattamente come fa già `src/platform/dependencies/catalog.js` per ffmpeg. Quel codice è già scritto e collaudato: riusalo. Così il repository resta leggero e la licenza dei modelli resta un problema di chi li scarica, non di chi ridistribuisce.

YuNet e SFace sono la scelta giusta per i volti: sono dentro OpenCV (`cv2.FaceDetectorYN`, `cv2.FaceRecognizerSF`), non richiedono altro codice, girano su CPU e sono veloci. La soglia di somiglianza documentata per SFace è **0.363 in similarità coseno**.

### 1.3 Come arrivano i fotogrammi

ARGUS-PR avvia ffmpeg e ne collega l'uscita allo `stdin` del worker:

```
ffmpeg -rtsp_transport tcp -i <substream>
       -an -vf "fps=5,scale=640:360" -f rawvideo -pix_fmt bgr24 pipe:1
```

`640 × 360 × 3 = 691200 byte` per fotogramma. Il worker legge blocchi di esattamente quella dimensione e li converte in un array NumPy con `np.frombuffer(...).reshape(360, 640, 3)`. `bgr24` è già l'ordine dei canali che OpenCV si aspetta: nessuna conversione.

Il worker non conosce l'URL RTSP e non ha le credenziali della telecamera. Riduce la superficie d'attacco e semplifica: se il flusso cade, è ARGUS a gestirlo, con la logica di riconnessione che ha già.

**Contropressione.** Se l'inferenza è più lenta del flusso, la pipe si riempie. Il worker deve leggere tutti i fotogrammi disponibili e **elaborare solo l'ultimo**, scartando gli altri. Analizzare fotogrammi vecchi è inutile e trasforma un ritardo in un ritardo crescente.

### 1.4 Il protocollo di uscita

JSON su riga singola, uno per fotogramma, su **stdout**:

```json
{"t":1788372369123,"seq":4412,"dets":[
  {"cls":"person","conf":0.91,"box":[0.12,0.34,0.08,0.22],"track":17},
  {"cls":"plate","conf":0.86,"box":[0.55,0.61,0.09,0.03],"track":21,"text":"AB123CD","textConf":0.79}
]}
```

`box` è `[x, y, w, h]` **normalizzato 0–1**, così resta valido a qualunque risoluzione.

**I log vanno su stderr, mai su stdout.** Stdout è il canale dati: una riga di log lì dentro rompe il parser. È l'errore più comune in questo tipo di integrazione.

Dal lato Node, in `src/features/vision/vision_worker.js`: leggi stdout riga per riga, `JSON.parse` dentro un `try/catch` — è un confine di I/O, quindi il try/catch è ammesso dalle convenzioni — e scarta le righe malformate registrando un avviso.

### 1.5 Worker remoto

Se il worker gira su un'altra macchina, invia gli stessi oggetti JSON a `POST /api/detections` con una chiave API per sorgente (§5). Il formato è identico: cambia solo il trasporto.

---

## 2. Rilevamento oggetti

Ciclo minimo, sul lato Python:

1. Ridimensiona con **letterbox** a 416×416 o 640×640 mantenendo le proporzioni. Se deformi l'immagine la precisione crolla, ed è un errore che non dà messaggi: il modello semplicemente sbaglia di più.
2. Normalizza come richiede il modello (spesso `/255`, a volte media e deviazione standard di ImageNet). Leggi la scheda del modello: sbagliare la normalizzazione produce rilevamenti casuali, che sembrano un bug del modello e invece sono un bug del pre-processing.
3. `session.run()`.
4. Filtra per confidenza (`0.35` è un buon punto di partenza) e applica **Non-Maximum Suppression** con IoU 0.45.
5. Riporta le coordinate dal riquadro letterbox all'immagine originale, poi normalizza 0–1.
6. Mappa gli indici di classe COCO sui nomi che servono: `person`, `car`, `truck`, `bus`, `motorcycle`, `bicycle`, `dog`, `cat`, `bird`. Ignora il resto: un NVR non ha bisogno di sapere che c'è una sedia.

**Provider di esecuzione**, in ordine di preferenza:

```python
providers = ["CUDAExecutionProvider", "DmlExecutionProvider",
             "OpenVINOExecutionProvider", "CPUExecutionProvider"]
session = ort.InferenceSession(path, providers=providers)
```

ONNX Runtime usa il primo disponibile. Su una CPU moderna YOLOX-nano a 416×416 sta sotto i 30 ms: cinque fotogrammi al secondo su quattro telecamere sono alla portata di un i5 di qualche anno fa.

---

## 3. Riduzione del carico

Non analizzare tutti i fotogrammi di tutte le telecamere sempre. Due accorgimenti che tagliano il costo di un ordine di grandezza:

- **Analizza solo dove c'è movimento.** Il rilevatore di movimento del documento precedente costa quasi niente e dice quando vale la pena svegliare la rete neurale. Su una telecamera che guarda un cortile vuoto, il risparmio è del 95%.
- **Riduci la frequenza quando non succede niente.** 1 fotogramma al secondo a riposo, 5 quando c'è movimento.

---

## 4. Inseguimento (tracking)

Senza inseguimento, una persona che attraversa l'inquadratura per trenta secondi a 5 fps genera **150 rilevamenti**. Con l'inseguimento genera **un evento** con durata.

### 4.1 Algoritmo

IoU greedy, sufficiente per la videosorveglianza e scrivibile in un centinaio di righe pure e testabili. Va in **Node**, non nel worker: così resta testabile con i test del progetto e il worker rimane un puro esecutore di modelli.

```js
export function intersectionOverUnion(a, b) {
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
    const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const inter = w * h;
    const union = a[2] * a[3] + b[2] * b[3] - inter;
    return union > 0 ? inter / union : 0;
}
```

Per ogni fotogramma:

1. Calcola la IoU fra ogni traccia attiva e ogni rilevamento della stessa classe.
2. Abbina in ordine di IoU decrescente, accettando solo sopra **0.3**.
3. I rilevamenti non abbinati diventano nuove tracce.
4. Le tracce non abbinate per **5 fotogrammi consecutivi** si chiudono.
5. Una traccia diventa "confermata" dopo **3 fotogrammi**: le tracce non confermate non generano eventi. Elimina la gran parte dei falsi positivi isolati.

### 4.2 Cosa emettere

Un evento per traccia, non per fotogramma: classe, istante di inizio e fine, confidenza massima, riquadro nel fotogramma migliore, percorso del ritaglio salvato. Il ritaglio si sceglie sul fotogramma con **confidenza più alta e riquadro più grande**: è quello in cui il soggetto si vede meglio.

---

## 5. L'ingresso dei rilevamenti in ARGUS-PR

La porta comune a movimento, visione e telecamere con analitica di bordo.

### 5.1 Modello dati

```sql
CREATE TABLE IF NOT EXISTS detection_events (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    source TEXT NOT NULL,
    class_name TEXT NOT NULL,
    track_id TEXT,
    confidence REAL NOT NULL,
    box_x REAL, box_y REAL, box_w REAL, box_h REAL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    snapshot_path TEXT,
    plate_text TEXT,
    person_id TEXT,
    match_score REAL,
    zone_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_camera_time ON detection_events(camera_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_class ON detection_events(class_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_plate ON detection_events(plate_text);
```

Un evento per traccia, non per fotogramma: gli ordini di grandezza restano gestibili da SQLite. Se un giorno non bastasse, la strada è la stessa dell'indice dei segmenti: file JSONL per giorno.

I **ritagli vanno su disco**, in `<mediaDir>/snapshots/<camera>/<giorno>/`, con il percorso relativo nel database. Mai base64 in una colonna.

### 5.2 La rotta

`POST /api/detections`, autenticata con una **chiave API per sorgente**, non con la sessione utente: chi scrive è una macchina.

```sql
CREATE TABLE IF NOT EXISTS detection_sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    camera_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    last_seen_at TEXT,
    created_at TEXT NOT NULL
);
```

Della chiave si salva **solo l'hash SHA-256**, come già si fa per i token di sessione. Si mostra in chiaro una volta sola, al momento della creazione.

Validazione in `guards.js`, senza eccezioni:

- `class_name` deve stare in un elenco chiuso. Non accettare stringhe libere: finiscono nell'interfaccia e nelle regole.
- `confidence` fra 0 e 1.
- Le coordinate del riquadro fra 0 e 1.
- L'istante entro pochi minuti da adesso: un evento datato 2027 sballa l'archivio.
- La telecamera deve esistere, e se la sorgente è legata a una telecamera deve essere quella.
- Limite di frequenza generoso ma presente: 600 al minuto per sorgente.

Questa rotta è anche ciò che permette di collegare **l'analitica di bordo delle telecamere**. Molti modelli Hikvision, Dahua e Axis fanno già rilevamento persone e veicoli, e alcuni leggono le targhe, senza costare niente in CPU. Un piccolo ponte che riceve i loro eventi ONVIF e li inoltra qui è spesso la soluzione migliore in assoluto: nessuna GPU, nessun modello, riconoscimento vero.

---

## 6. Targhe (ANPR)

La differenza fra una dimostrazione e un sistema che funziona sta quasi tutta nel punto 4.

**1. Trova la targa.** O direttamente con un modello addestrato sulle targhe, o in due passi: veicolo → targa dentro il riquadro del veicolo. Due passi costano di più ma sbagliano meno.

**2. Raddrizza il ritaglio.** Una targa ripresa di sbieco si legge male. Se il modello dà i quattro angoli, applica `cv2.getPerspectiveTransform` e `cv2.warpPerspective` verso un rettangolo fisso, per esempio 192×48. Questo passaggio da solo migliora l'OCR in modo netto.

**3. Leggi.** PaddleOCR sul ritaglio raddrizzato. Normalizza subito: maiuscolo, via tutto ciò che non è `A-Z0-9`.

**4. Vota su più fotogrammi.** **È il punto decisivo.** Non fidarti mai di una singola lettura. Accumula le letture della stessa traccia e, quando la traccia si chiude, scegli la stringa vincente pesando per confidenza:

```js
export function voteOnPlate(readings, minVotes = 3) {
    const scores = new Map();
    for (const { text, confidence } of readings) {
        scores.set(text, (scores.get(text) ?? 0) + confidence);
    }
    let best = null;
    for (const [text, score] of scores) {
        if (!best || score > best.score) best = { text, score };
    }
    if (!best || readings.length < minVotes) return null;
    return { text: best.text, confidence: best.score / readings.length, samples: readings.length };
}
```

Un veicolo che passa dà 10–20 letture. Alcune saranno `A8123CD` invece di `AB123CD`, perché `8` e `B` si confondono. Il voto le corregge. Senza voto, l'ANPR sembra funzionare in ufficio e fallisce sul cancello.

**5. Valida il formato.** Per l'Italia `^[A-Z]{2}[0-9]{3}[A-Z]{2}$` per le targhe ordinarie dal 1994. Una lettura che non rispetta nessun formato noto va scartata, o segnata come incerta. Rendi i formati configurabili: un impianto vicino al confine vede targhe straniere.

Funzione pura, quindi testabile: dai in pasto letture note e verifica il vincitore.

---

## 7. Volti

### 7.1 La catena, con OpenCV

```python
detector = cv2.FaceDetectorYN.create(yunet_path, "", (640, 360), 0.7, 0.3, 5000)
recognizer = cv2.FaceRecognizerSF.create(sface_path, "")

_, faces = detector.detect(frame)
for face in (faces if faces is not None else []):
    aligned = recognizer.alignCrop(frame, face)
    embedding = recognizer.feature(aligned)     # 128 float, vero
```

`alignCrop` usa i cinque punti di riferimento che YuNet restituisce per raddrizzare il volto prima di calcolare l'embedding. Saltare l'allineamento peggiora molto la precisione.

### 7.2 Filtro di qualità

Prima di calcolare o confrontare un embedding, scarta i volti inutilizzabili. Senza questo filtro il sistema accumula embedding di volti sfocati e comincia a confondere le persone:

- Volto più piccolo di **80 pixel** di lato → scarta.
- Sfocatura: varianza del Laplaciano sotto **100** → scarta.
- Posa estrema: se la distanza fra gli occhi è meno del 25% della larghezza del volto, il soggetto è girato → scarta.

### 7.3 Confronto

Similarità coseno, con soglia **0.363** per SFace. La matematica è quella che il vecchio programma aveva già scritta correttamente in `cosineSimilarity`: quella funzione puoi copiarla, è l'unica parte vera di quel modulo. Quello che non devi copiare è `generateSimulatedEmbedding`, che fabbricava il vettore da un hash.

Il confronto va fatto **in Node**, non nel worker: è una decisione, e le decisioni stanno in ARGUS-PR. Con qualche centinaio di persone iscritte, un confronto lineare in JavaScript costa meno di un millisecondo.

### 7.4 Iscrizione di una persona

Da 3 a 5 foto per persona, con espressioni e illuminazioni diverse. Calcola gli embedding e conservane il **centroide**, normalizzato. La funzione `mergeEmbeddings` del vecchio programma faceva esattamente questo ed era corretta.

Mostra all'utente, al momento dell'iscrizione, la somiglianza fra le foto che ha caricato: se due foto della stessa persona danno 0.2, una delle due è sbagliata, e vale la pena dirlo subito invece di scoprirlo quando il riconoscimento non funziona.

### 7.5 Privacy

Il dato biometrico è una categoria particolare ai sensi del GDPR. Conseguenze pratiche da mettere nel codice, non solo nella documentazione:

- Ritenzione **separata e più breve** per volti ed embedding rispetto al video.
- Cancellazione completa di una persona e dei suoi eventi, in una sola operazione.
- Esportazione dei dati di una persona.
- Ogni accesso agli embedding tracciato in `audit_log`.
- Il riconoscimento facciale **disattivato per impostazione predefinita**, con un avviso esplicito all'attivazione.

### 7.6 Come si verifica che sia vero

| Prova | Risultato atteso |
|---|---|
| Fotogramma nero | Nessun volto |
| Fotogramma con rumore casuale | Nessun volto, o pochissimi con confidenza bassissima |
| Due foto della stessa persona | Similarità sopra 0.363 |
| Due persone diverse | Similarità sotto 0.363 |
| La stessa foto confrontata con sé stessa | Similarità ~1.0 |
| Foto ruotata di 15° | Ancora sopra soglia: è ciò che `alignCrop` deve garantire |
| Soglia abbassata a 0.1 | Compaiono falsi abbinamenti. Se non compaiono, la soglia non è collegata |

L'ultima riga è il test che il vecchio programma non avrebbe mai potuto superare.
