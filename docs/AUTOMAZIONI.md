# Regole, varchi, notifiche, ricerca, planimetria

Quello che sta a valle del riconoscimento: le decisioni. Qui non c'è inferenza, c'è logica — e la logica va scritta pura e testata, perché decide se un cancello si apre.

---

## 1. Regole di accesso targhe

### 1.1 Modello dati

```sql
CREATE TABLE IF NOT EXISTS access_rules (
    id TEXT PRIMARY KEY,
    plate_pattern TEXT NOT NULL,
    plate_normalised TEXT NOT NULL,
    label TEXT NOT NULL,
    list_type TEXT NOT NULL CHECK(list_type IN ('whitelist','blacklist','monitored')),
    is_active INTEGER NOT NULL DEFAULT 1,
    valid_from TEXT,
    valid_to TEXT,
    created_at TEXT NOT NULL
);
```

`plate_normalised` è la targa ripulita, solo `A-Z0-9`. Confrontare stringhe grezze fa fallire il riscontro per un trattino o uno spazio.

### 1.2 Il valutatore

`src/features/access/access_rules.js`, **funzione pura**. È il codice che decide se un cancello si apre: deve essere leggibile in trenta secondi e coperto da test.

```js
export function normalisePlate(text) {
    return String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function matchesPattern(plate, pattern) {
    if (!pattern.includes('*') && !pattern.includes('?')) return plate === pattern;
    const expression = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '[A-Z0-9]*')
        .replace(/\?/g, '[A-Z0-9]');
    return new RegExp(`^${expression}$`).test(plate);
}

export function evaluateAccess(plate, rules, now) {
    const normalised = normalisePlate(plate);
    const applicable = rules.filter((rule) =>
        rule.isActive
        && matchesPattern(normalised, rule.plateNormalised)
        && (!rule.validFrom || rule.validFrom <= now)
        && (!rule.validTo || rule.validTo >= now));

    const blacklisted = applicable.find((rule) => rule.listType === 'blacklist');
    if (blacklisted) return { decision: 'deny', rule: blacklisted, plate: normalised };

    const allowed = applicable.find((rule) => rule.listType === 'whitelist');
    if (allowed) return { decision: 'allow', rule: allowed, plate: normalised };

    const watched = applicable.find((rule) => rule.listType === 'monitored');
    return { decision: 'log', rule: watched ?? null, plate: normalised };
}
```

**La lista nera vince sempre**, anche se la stessa targa è in lista bianca. Se qualcuno riesce a inserire un veicolo in entrambe, il comportamento sicuro è negare. In assenza di regole si registra e basta: mai aprire per difetto.

### 1.3 Test da scrivere

Regola scaduta ieri; regola che comincia domani; regola disattivata; targa con trattini e spazi; carattere jolly `AB*`; targa in lista bianca **e** nera insieme, che deve dare `deny`; targa sconosciuta, che deve dare `log` e non `allow`.

---

## 2. Varchi

Un cancello che si apre da solo è l'operazione più delicata dell'intero sistema. Un falso positivo qui non è una notifica di troppo: è un estraneo che entra.

```sql
CREATE TABLE IF NOT EXISTS gates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gate_type TEXT NOT NULL,
    relay_url_encrypted TEXT NOT NULL,
    pulse_seconds INTEGER NOT NULL DEFAULT 3,
    min_confidence REAL NOT NULL DEFAULT 0.85,
    dry_run INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
```

Cinque protezioni, tutte necessarie:

1. **`dry_run` attivo per impostazione predefinita.** All'inizio il sistema scrive nel registro cosa *avrebbe* fatto, senza farlo. L'utente guarda per qualche giorno e solo dopo disattiva la simulazione. Senza questa modalità, il primo giorno di esercizio è anche il primo collaudo, sul cancello vero.
2. **Confidenza minima**, distinta e più alta di quella usata per registrare un evento. Registrare una targa incerta va bene; aprire un cancello no.
3. **Limite di frequenza**: al massimo un'apertura ogni N secondi per varco. Blocca sia i malfunzionamenti sia un attacco con una targa mostrata in ciclo.
4. **Ogni apertura in `audit_log`**: quale targa, quale regola, quale confidenza, quale telecamera, quale istante. È la prima cosa che si guarda quando qualcosa va storto.
5. **URL del relè cifrato** con `encryptSecret`: spesso contiene una password nella forma `http://admin:pass@192.168.1.50/relay/on`.

Il relè si comanda con `fetch`, timeout breve (3 secondi), e **l'esito non deve mai bloccare** registrazione o analisi.

---

## 3. Notifiche

### 3.1 Telegram

Nessuna dipendenza: `fetch` nativo.

```js
const url = `https://api.telegram.org/bot${token}/sendMessage`;
await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    signal: AbortSignal.timeout(8000)
});
```

Per la foto, `sendPhoto` con `FormData` e un `Blob` costruito dal ritaglio: `FormData` e `Blob` sono globali in Node 20.

Il token va nel **vault**, cifrato. Non deve mai comparire nei log né nelle risposte API: `redactCredentials` esiste già.

Metti un limite: al massimo N notifiche al minuto, con raggruppamento. Un sistema che manda cinquanta messaggi in un minuto viene silenziato dall'utente, e da quel momento non serve più a niente.

### 3.2 Webhook

`fetch` con metodo, intestazioni e corpo configurabili, timeout, e **al massimo 2 tentativi** con attesa crescente. Convalida l'URL con la stessa severità di `requireStreamUrl`: solo `http`/`https`, e valuta di vietare gli indirizzi interni se il webhook è configurabile da un operatore non amministratore, altrimenti diventa uno strumento per sondare la rete interna dall'interfaccia.

### 3.3 MQTT senza aggiungere dipendenze

MQTT 3.1.1 su TCP è un protocollo binario semplice. Un client minimale che sappia connettersi e pubblicare sta in circa 200 righe con il modulo `net`, e rispetta il vincolo delle due dipendenze.

Struttura dei pacchetti che servono:

- **Intestazione fissa**: primo byte = tipo di pacchetto nei 4 bit alti più i flag; poi la lunghezza rimanente, codificata a 7 bit per byte con bit di continuazione.
- **CONNECT** (tipo 1): nome protocollo `"MQTT"` preceduto dalla lunghezza a 2 byte, livello `4`, byte di flag (utente, password, clean session), keepalive a 2 byte, poi client id, utente e password, ciascuno preceduto dalla lunghezza.
- **PUBLISH** (tipo 3): topic preceduto dalla lunghezza, identificativo del pacchetto solo se QoS > 0, poi il payload.
- **PINGREQ** (tipo 12): due byte, `0xC0 0x00`, ogni keepalive/2 secondi.
- **DISCONNECT** (tipo 14): `0xE0 0x00`.

Con QoS 0 non serve gestire conferme: per le notifiche di videosorveglianza è sufficiente. Scrivi la codifica della lunghezza variabile come funzione pura e testala con i valori limite (0, 127, 128, 16383, 16384): è l'unico punto dove è facile sbagliare.

Se il proprietario preferisce una libreria, **chiediglielo prima**: il vincolo delle due dipendenze è suo.

---

## 4. Anagrafica persone

Riprendi lo schema `people` del vecchio programma: nome, ruolo (`employee`, `visitor`, `supplier`, `vip`, `blacklisted`), reparto, contatti, note, foto, embedding, conteggio visite, primo e ultimo avvistamento.

Due accorgimenti che il vecchio non aveva:

- **La foto su disco**, non in una colonna.
- **L'embedding solo se vero**, cioè calcolato dal worker su un'immagine reale. Una persona senza foto valide ha embedding nullo e semplicemente non viene riconosciuta: è il comportamento corretto.

Il conteggio visite si aggiorna alla chiusura di una traccia riconosciuta, non a ogni fotogramma.

---

## 5. Ricerca forense

Una sola vista che interroga `detection_events` incrociando: intervallo temporale, telecamera, classe, targa (anche parziale), persona, zona, confidenza minima.

Tre accorgimenti che la rendono usabile:

- **Impagina sempre.** Un impianto con otto telecamere accumula centinaia di migliaia di eventi.
- **Miniature nei risultati**, servite da una rotta dedicata con `resolveInside`, come già fa la riproduzione dell'archivio.
- **Da un risultato si salta al video.** L'evento ha un istante; l'archivio sa già posizionarsi su un istante. Collegare le due cose trasforma un elenco in uno strumento di indagine.

Gli indici indicati in [VISIONE.md](VISIONE.md) §5.1 coprono queste interrogazioni. Aggiungine altri solo dopo aver misurato con `EXPLAIN QUERY PLAN`.

---

## 6. Planimetria e barriere virtuali

### 6.1 Dati

```sql
CREATE TABLE IF NOT EXISTS floor_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    image_path TEXT,
    scale_meters REAL NOT NULL DEFAULT 20,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS floor_plan_cameras (
    id TEXT PRIMARY KEY,
    floor_plan_id TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    pos_x REAL NOT NULL, pos_y REAL NOT NULL,
    rotation_deg REAL NOT NULL DEFAULT 0,
    fov_deg REAL NOT NULL DEFAULT 75,
    range_meters REAL NOT NULL DEFAULT 15
);

CREATE TABLE IF NOT EXISTS virtual_barriers (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    name TEXT NOT NULL,
    barrier_type TEXT NOT NULL CHECK(barrier_type IN ('line_crossing','perimeter_zone')),
    points_json TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'both',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
```

`image_path`, non `image_data`: il vecchio programma teneva la planimetria in base64 dentro il database, e su Adestio quella scelta contribuiva a rendere ogni scrittura costosa.

### 6.2 Attraversamento di una linea

Le barriere si valutano sulle **tracce**, non sui singoli rilevamenti: serve un prima e un dopo.

Data la linea `A→B` e il centro del riquadro `P`, il segno del prodotto vettoriale dice da che parte sta:

```js
export function sideOfLine(a, b, p) {
    return Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
}
```

Un attraversamento è un **cambio di segno** fra due posizioni consecutive della stessa traccia. La direzione è data dal verso del cambio: da negativo a positivo è un verso, l'opposto è l'altro. Il campo `direction` (`in`, `out`, `both`) filtra quale interessa.

Funzione pura, quindi testabile: traccia che attraversa, traccia che sfiora senza attraversare, traccia che attraversa e torna indietro, traccia che nasce già oltre la linea — quest'ultimo caso non è un attraversamento e va escluso, altrimenti ogni persona che compare in inquadratura oltre la linea genera un falso allarme.

### 6.3 Disegno

Canvas. Le telecamere come icone orientabili con un cono di campo visivo disegnato con `arc()` fra `rotation - fov/2` e `rotation + fov/2`. Il trascinamento aggiorna le coordinate normalizzate. `scale_meters` serve solo a convertire `range_meters` in pixel: chiedi all'utente di indicare due punti di cui conosce la distanza reale, ed è tarata.

---

## 7. Preset telecamere

La funzione più piccola e fra le più utili: evita all'utente di cercare su un forum l'URL RTSP del proprio modello.

```sql
CREATE TABLE IF NOT EXISTS camera_presets (
    id TEXT PRIMARY KEY,
    brand TEXT NOT NULL,
    model_name TEXT,
    rtsp_main TEXT NOT NULL,
    rtsp_sub TEXT,
    default_port INTEGER NOT NULL DEFAULT 554,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
```

I modelli usano segnaposto `{user}`, `{pass}`, `{host}`, `{port}`, `{channel}`. La sostituzione va fatta **codificando** utente e password con `encodeURIComponent`: una password con `@` o `/` dentro rompe l'URL, ed è un problema frequentissimo che genera segnalazioni incomprensibili.

Precarica come preset di sistema i pattern delle marche più diffuse (Hikvision, Dahua, Reolink, Axis, TP-Link Tapo, Foscam, Ubiquiti), marcati `is_system = 1` e non cancellabili. Nel form telecamera: scelta marca e modello, e l'URL si compila da solo.

---

## 8. Diagnostica e watchdog

**Metriche** in `system_metrics`: fotogrammi al secondo in ingresso e in analisi, latenza, per telecamera. Aggregale — un valore ogni minuto, non ogni fotogramma — e conservale per un periodo breve.

**Watchdog.** Parte dell'infrastruttura esiste già: `STALL_TIMEOUT_MS` in `stream_session.js` e lo stato `reconnecting` in `recorder.js`. Mancano:

- Allarme se una telecamera è irraggiungibile da più di N minuti.
- Allarme se lo spazio libero scende sotto soglia, **prima** che la ritenzione inizi a cancellare.
- Allarme se un registratore è in `reconnecting` da troppo tempo.
- Un controllo periodico che confronti i segmenti attesi con quelli presenti nell'indice: se una telecamera dovrebbe produrre 60 segmenti l'ora e ne produce 12, c'è un problema che nessun log segnalerebbe.

Quest'ultimo è il controllo che distingue un NVR affidabile da uno che sembra funzionare finché non serve il filmato.
