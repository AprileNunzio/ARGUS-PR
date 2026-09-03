# Pianificazione oraria e rilevamento movimento

Due funzioni che non richiedono modelli, GPU né dipendenze nuove. Il rilevamento movimento è **aritmetica su byte**.

> **Stato al 2026-09-03 (v0.12.0): §1 e §2 sono costruiti e in esercizio.** Questo documento resta come spiegazione del *perché* le cose sono fatte così — soglie, isteresi, guardia anti-abbagliamento, point-in-polygon — e va letto prima di modificarle. Non è più un piano di lavoro.
>
> | Sezione | Stato |
> |---|---|
> | §1 Pianificazione oraria | **fatta**: `src/features/scheduling/`, griglia 7×48 con eccezioni, test in `test/schedule.test.js` |
> | §2 Rilevamento movimento con zone | **fatta**: `src/features/motion/`, modelli di sfondo su fotogrammi 160×90, zone poligonali, editor web |
> | §3 Registrazione su evento | **parziale**: la ritenzione differenziata sui segmenti con evento esiste (`retention.js`, `test/retention_events.test.js`); l'avvio e l'arresto della registrazione guidati dall'evento **no**, la registrazione resta continua |
>
> Se ti serve la registrazione su evento vera, il §3 è ancora la specifica giusta. Valuta però con il proprietario se la vuole davvero: la registrazione continua con ritenzione differenziata non perde mai nulla, quella su evento sì, ogni volta che il rilevatore sbaglia.

---

## 1. Pianificazione oraria

### 1.1 Modello dati

Migrazione `003_schedules.js`:

```sql
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'continuous',
    week_mask TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    day TEXT NOT NULL,
    mode TEXT NOT NULL,
    week_mask TEXT,
    note TEXT,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_camera ON schedules(camera_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exception_day ON schedule_exceptions(camera_id, day);
```

`mode`: `continuous` (sempre), `scheduled` (segue la maschera), `motion` (solo su evento), `off`.

`week_mask`: 336 caratteri `0`/`1`, uno per ogni mezz'ora della settimana (7 × 48). Testo, non bitmap binaria: si legge a occhio quando si debugga, e 336 byte non sono un problema.

### 1.2 Il valutatore, puro e testabile

`src/features/scheduling/schedule.js`. **Nessun I/O qui dentro**, come `retention.js`.

```js
export function slotIndex(date) {
    const day = date.getDay();
    const slot = date.getHours() * 2 + (date.getMinutes() >= 30 ? 1 : 0);
    return day * 48 + slot;
}

export function isActive(schedule, exception, date) {
    const effective = exception ?? schedule;
    if (effective.mode === 'continuous') return true;
    if (effective.mode === 'off') return false;
    if (effective.mode === 'motion') return false;
    const mask = effective.weekMask ?? schedule.weekMask;
    return mask[slotIndex(date)] === '1';
}
```

**Attenzione all'ora legale.** Usa `getDay`, `getHours`, `getMinutes` sull'ora **locale**, mai aritmetica su millisecondi UTC. Nella notte del cambio ora una fascia dura 0 o 2 ore: è il comportamento corretto, ed è quello che l'utente si aspetta guardando l'orologio a muro.

### 1.3 Test da scrivere

- Lunedì 09:15 con maschera che ha `1` nello slot 18 (9×2) → attivo.
- Lunedì 09:45 → slot 19, deve leggere il carattere giusto.
- Un'eccezione per una data specifica ha la precedenza sulla settimana tipo.
- `mode: 'off'` vince su qualunque maschera.
- Domenica è indice 0 (`getDay()` restituisce 0 per domenica): sbagliare questo sposta tutta la settimana.
- Ultimo slot della settimana, sabato 23:30 → indice 335.

### 1.4 Aggancio

`recording_hub.js` ha già `applyRecordingPolicy()`. Aggiungi un timer che la richiama **ogni 30 secondi** (non ogni minuto: gli slot sono di mezz'ora e vuoi che la transizione sia precisa al secondo, non al minuto). La policy legge la pianificazione e avvia o ferma il registratore.

Nell'interfaccia: una griglia 7×48 cliccabile con trascinamento, in `web/features/scheduling/`. Il pattern è lo stesso della timeline dell'archivio, che disegna già su canvas.

---

## 2. Rilevamento movimento con zone

### 2.1 Perché non usare i filtri di ffmpeg

`-vf "select='gt(scene,0.02)'"` restituisce un punteggio **globale** di cambio scena, pensato per trovare i tagli di montaggio. Non dà zone, non distingue una persona che attraversa un angolo dell'inquadratura da una nuvola che passa, e reagisce male ai cambi di luce.

Serve un modello di sfondo, e va fatto sui pixel. In JavaScript, su immagini piccole, costa niente.

### 2.2 La sorgente dei fotogrammi

Un processo ffmpeg dedicato per telecamera, sul **sotto-flusso**, a bassa risoluzione e bassa frequenza:

```
ffmpeg -rtsp_transport tcp -stimeout 8000000 -i <substream>
       -an -vf "fps=5,scale=160:90,format=gray"
       -f rawvideo -pix_fmt gray pipe:1
```

Ogni fotogramma è esattamente **160 × 90 = 14400 byte**. A 5 fotogrammi al secondo sono 72 kB/s per telecamera: irrilevante.

**Perché un processo separato e non un secondo output del registratore.** Aggiungere un'uscita filtrata al processo che registra costringerebbe quel processo a decodificare il video, mentre oggi lo copia e basta. Se il filtro va in errore, cade la registrazione. In un videoregistratore la registrazione è sacra: se deve rompersi qualcosa, che si rompa l'analisi. Il costo è un processo in più; il beneficio è che la prova video non si perde mai per colpa di una funzione accessoria.

**Accumulo dei fotogrammi.** `stdout` consegna pezzi di dimensione arbitraria. Devi accumulare in un buffer e ritagliare esattamente 14400 byte per volta:

```js
let pending = Buffer.alloc(0);

child.stdout.on('data', (chunk) => {
    pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
    while (pending.length >= FRAME_BYTES) {
        onFrame(pending.subarray(0, FRAME_BYTES));
        pending = pending.subarray(FRAME_BYTES);
    }
});
```

Se `pending` supera qualche decina di fotogrammi significa che l'analisi non sta al passo: scarta tutto tranne l'ultimo e registra un avviso.

### 2.3 L'algoritmo, passo per passo

`src/features/motion/motion_detector.js`. La parte di calcolo va in un file puro e testabile, separata dal processo ffmpeg.

**Passo 1 — modello di sfondo.** Media mobile esponenziale, un byte per pixel:

```
B[i] = (1 - alpha) * B[i] + alpha * F[i]        alpha = 0.02
```

Con `alpha = 0.02` a 5 fps lo sfondo si adatta in circa dieci secondi. Un'ombra che si sposta lentamente viene assorbita; una persona che cammina no. Il primo fotogramma inizializza `B = F`.

**Passo 2 — differenza e binarizzazione.**

```
D[i] = |F[i] - B[i]|
M[i] = D[i] > pixelThreshold       pixelThreshold = 25
```

25 su 255 è circa il 10%: sotto quella soglia è rumore del sensore, soprattutto di notte.

**Passo 3 — guardia sui cambi di luce.** Se più del **60%** dei pixel dell'intero fotogramma è cambiato, non è movimento: è qualcuno che ha acceso la luce, il sole uscito da una nuvola, o l'infrarosso che si è attivato. In quel caso **azzera lo sfondo a `F` e non emettere niente**. Senza questa guardia il sistema manda notifiche tutte le sere al tramonto, e l'utente lo spegne dopo tre giorni.

**Passo 4 — conteggio per zona.** Precalcola una maschera: per ognuno dei 14400 pixel, quali zone lo contengono.

```js
export function buildZoneMask(zones, width, height) {
    const mask = new Uint32Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const px = (x + 0.5) / width;
            const py = (y + 0.5) / height;
            let bits = 0;
            zones.forEach((zone, index) => {
                if (pointInPolygon(px, py, zone.points)) bits |= (1 << index);
            });
            mask[y * width + x] = bits;
        }
    }
    return mask;
}
```

Si ricalcola solo quando l'utente modifica le zone. A tempo di esecuzione il costo per pixel è una AND.

Se non ci sono zone definite, la zona implicita è tutto il fotogramma.

**Passo 5 — decisione.**

```
ratio[z] = pixelCambiatiNellaZona[z] / areaZona[z]
attivo[z] = ratio[z] > sensibilita[z]         sensibilita di default 0.015
```

L'1,5% dell'area è un valore di partenza ragionevole: una persona a media distanza occupa molto di più, il rumore molto meno.

**Passo 6 — isteresi.** Non emettere sul primo fotogramma sopra soglia: richiedi **2 fotogrammi consecutivi** per far partire l'evento e **10 fotogrammi sotto soglia** (2 secondi a 5 fps) per chiuderlo. Senza isteresi un uccello che passa genera un evento, e una persona ferma un attimo ne genera tre.

**Passo 7 — attesa.** Dopo un evento, silenzio di almeno 15 secondi per quella zona, configurabile. Serve a non trasformare una persona che lavora in giardino in duecento notifiche.

### 2.4 Point-in-polygon

Ray casting, algoritmo classico, funzione pura:

```js
export function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const intersects = (yi > y) !== (yj > y)
            && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersects) inside = !inside;
    }
    return inside;
}
```

Le coordinate dei poligoni sono **normalizzate 0–1**, così le zone restano valide se cambi risoluzione di analisi o se la telecamera cambia flusso.

### 2.5 Modello dati

```sql
CREATE TABLE IF NOT EXISTS motion_zones (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    name TEXT NOT NULL,
    points_json TEXT NOT NULL,
    sensitivity REAL NOT NULL DEFAULT 0.015,
    cooldown_seconds INTEGER NOT NULL DEFAULT 15,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
```

Massimo **32 zone per telecamera**: la maschera usa un `Uint32Array`, un bit per zona. Validalo in `guards.js`, non lasciarlo implicito.

### 2.6 Interfaccia per disegnare le zone

`web/features/motion/zone_editor.js`. Un `<canvas>` sopra il riquadro della diretta: si clicca per aggiungere vertici, doppio clic per chiudere il poligono, trascinamento per spostarli. Le coordinate si normalizzano dividendo per la dimensione del canvas.

Utile e poco costoso: una **mappa di calore** che mostra in tempo reale quali pixel stanno cambiando, ottenuta rimandando al browser la maschera `M` ridotta. Rende evidente perché una zona scatta o non scatta, e permette all'utente di tarare la sensibilità guardando invece di indovinare.

### 2.7 Come si verifica che sia vero

Questi controlli sono il motivo per cui questa funzione va fatta per prima: sono tutti eseguibili senza attrezzatura.

| Prova | Risultato atteso |
|---|---|
| Stesso fotogramma ripetuto per un minuto | **Zero eventi.** Se ne genera, l'algoritmo è rotto o inventato |
| Fotogramma nero fisso | Zero eventi |
| Rumore casuale su ogni pixel | Zero eventi con soglia 25, perché il rumore è sotto soglia |
| Un rettangolo bianco che appare in zona A | Evento sulla zona A, **niente** sulla zona B |
| Tutto il fotogramma da nero a bianco | Zero eventi, guardia sul cambio di luce attiva |
| Rettangolo che occupa lo 0,5% della zona | Nessun evento con sensibilità 0.015 |
| Rettangolo che occupa il 5% | Evento |
| Sensibilità portata a 0.001 | Molti più eventi. Se non cambia niente, la soglia non è collegata |

Costruisci i fotogrammi di prova direttamente in memoria con `Buffer.alloc(14400)`: non serve nemmeno un file video. Sono test unitari veri, veloci, in `test/motion.test.js`.

Poi, una volta soli, la prova sul campo: cammina davanti alla telecamera, accendi e spegni la luce, e guarda il registro.

---

## 3. Registrazione su evento

Con il movimento funzionante, questa è breve.

**Pre-registrazione.** Il valore sta nei secondi **prima** dell'evento: senza, l'utente vede la persona già dentro l'inquadratura. Il registratore deve tenere un buffer circolare degli ultimi 10 secondi.

Realizzazione semplice e robusta: **registra sempre in segmenti** come già fa, e alla chiusura di ogni segmento decidi se tenerlo. Se in quel segmento, o nel successivo, c'è stato un evento, marcalo `protected` nell'indice; altrimenti lascialo alla ritenzione, che lo cancellerà per primo.

Questo capovolge il problema: invece di far partire e fermare ffmpeg — operazione lenta, che perde fotogrammi e stressa la telecamera — registri sempre e **conservi selettivamente**. Il disco si riempie di più, ma non perdi mai l'inizio di un evento, e non c'è nessun rischio di non far partire la registrazione al momento giusto.

Aggiungi in `retention.js` una politica separata: i segmenti senza evento si cancellano dopo N giorni, quelli con evento dopo M giorni, con M molto maggiore di N. La funzione è già pura e testata: estendila lì, con nuovi test.
