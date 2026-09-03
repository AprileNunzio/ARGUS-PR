# Regole, varchi, notifiche, ricerca, planimetria

Quello che sta a valle del riconoscimento: le decisioni. Qui non c'è inferenza, c'è logica — e la logica va scritta pura e testata, perché decide se un cancello si apre.

**Stato al 2026-09-03 (v0.12.0).** Non ricostruire ciò che esiste:

| Sezione | Stato |
|---|---|
| §1 Regole di accesso targhe | **fatta**, con test |
| §4 Anagrafica persone | **fatta** |
| §8 Diagnostica | **parziale**: esistono lo stallo del flusso e lo stato di riconnessione, mancano gli allarmi |
| §2 Varchi, §3 Notifiche, §5 Ricerca forense, §6 Planimetria, §7 Preset RTSP, §9 PTZ | da costruire |

Leggi il §0 prima di tutto: lega queste funzioni ai meccanismi introdotti nelle versioni 0.11.0 e 0.12.0.

---

## 0. Come queste funzioni si agganciano all'architettura attuale

Questo capitolo è stato scritto prima delle versioni 0.11.0 e 0.12.0. Il resto del documento resta valido, ma **ogni funzione qui descritta va costruita dentro i meccanismi che nel frattempo esistono**. Se li ignori, ottieni codice che funziona in sviluppo e che in produzione è irraggiungibile o pericoloso.

### 0.1 Le rotte nuove nascono chiuse

Ogni rotta registrata senza `exposure` è `Exposure.PRIVATE`: raggiungibile solo da loopback e rete locale. **Per tutto quello che c'è in questo documento è la scelta giusta e non va cambiata.**

Varchi, notifiche, planimetrie, barriere, preset, diagnostica: nessuna di queste funzioni deve essere raggiungibile da internet. Chi guarda da fuori vede le telecamere, non apre cancelli. Se ti viene la tentazione di marcare `Exposure.PUBLIC` una rotta per far funzionare qualcosa dall'app remota, fermati: stai aprendo un comando fisico a internet.

L'unica eccezione plausibile — e va discussa con il proprietario prima, non decisa da te — è la **lettura** dello stato di un varco. L'apertura no, mai.

### 0.2 Ogni interruttore va in `settings_schema.js`

Dalla 0.12.0 le impostazioni non si inventano più caso per caso: si dichiarano in `src/features/settings/settings_schema.js` con tipo, limiti, aiuto e valore predefinito, e arrivano da sole nel pannello con validazione e audit.

Voci da aggiungere, con i gruppi già esistenti o nuovi:

| Chiave | Tipo | Predefinito | Nota |
|---|---|---|---|
| `gates.enabled` | boolean | `false` | interruttore generale dei varchi |
| `gates.dryRun` | boolean | `true` | vedi §2, non invertirlo |
| `gates.minConfidence` | integer 50–100 | `85` | percentuale, più alta di quella di registrazione |
| `gates.cooldownSeconds` | integer 3–600 | `10` | intervallo minimo fra due aperture dello stesso varco |
| `notifications.enabled` | boolean | `false` | |
| `notifications.maxPerMinute` | integer 1–60 | `6` | oltre il quale si raggruppa |
| `notifications.quietHoursStart` / `End` | time | `23:00` / `07:00` | silenzia il non urgente |
| `diagnostics.freeSpaceWarnPercent` | integer 5–50 | `15` | allarme **prima** che la ritenzione cancelli |
| `diagnostics.cameraOfflineMinutes` | integer 1–120 | `5` | |
| `diagnostics.segmentShortfallPercent` | integer 10–90 | `50` | vedi §8, il controllo che conta davvero |

I **segreti non vanno qui**: token Telegram, password MQTT e URL dei relè stanno cifrati nel vault (`encryptSecret`), non nella tabella `settings`, che è leggibile in chiaro da chiunque legga il database. Nel pannello si mostra solo se un segreto è impostato, mai il suo valore.

### 0.3 Le due regole opposte sugli indirizzi di destinazione

`src/security/net_zones.js` espone `classify()`, che dice se un indirizzo è `local`, `lan` o `wan`. Usalo per validare le destinazioni, con **due regole che vanno in direzioni opposte** e che è facile confondere:

- **Un relè di varco deve essere in rete locale.** Se l'URL configurato risolve fuori dalla LAN, rifiuta: un comando di apertura non ha alcuna ragione di uscire su internet, e se ce l'ha è perché qualcuno ha configurato male o è stato indotto a farlo.
- **Un webhook deve essere fuori dalla rete locale.** Se punta a `127.0.0.1`, a `192.168.x.x` o alla rete delle telecamere, rifiuta: altrimenti l'interfaccia diventa uno strumento per sondare la rete interna e per raggiungere i metadata dei provider cloud. È la classe di attacco SSRF, e qui si chiude in cinque righe.

La risoluzione va fatta **al momento dell'uso**, non solo al salvataggio: un nome DNS che oggi punta fuori domani può puntare dentro. Risolvi con `dns.promises.lookup`, classifica l'indirizzo ottenuto, e solo dopo apri la connessione.

### 0.4 Il traffico in uscita passa da ARGUS-SHIELD

Il ruleset attuale ha `output policy accept`, quindi Telegram, MQTT e webhook funzionano senza fare niente. Ma se un giorno l'uscita verrà ristretta — ed è la direzione giusta per un apparato di sicurezza — queste funzioni sono le prime a rompersi.

Quando aggiungi un canale di uscita, **documenta host e porta** in `shield/README.md`. Il giorno che si stringe l'uscita, quella lista è ciò che evita un'ora di diagnosi.

### 0.5 Audit e ritenzione

Ogni azione fisica o verso l'esterno va in `audit_log` con `recordAudit()`: apertura di un varco, invio di una notifica, spostamento di una telecamera PTZ. Le azioni nuove seguono la nomenclatura esistente: `gate.opened`, `gate.simulated`, `notification.sent`, `ptz.moved`.

E ogni tabella nuova che cresce nel tempo — `system_metrics`, gli eventi delle barriere, le miniature su disco — **deve avere una politica di ritenzione fin dal primo giorno**. Un impianto che riempie il disco con le proprie metriche smette di registrare video, che è esattamente il fallimento che non deve accadere.

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

---

## 9. PTZ: brandeggio, preset di posizione, ronda

Attenzione a non confondere: il §7 parla di **preset di URL RTSP**, cioè i modelli per marca che compilano l'indirizzo del flusso. Questa sezione parla di **preset di posizione PTZ**, cioè punti di vista memorizzati sulla telecamera. Sono due cose diverse con lo stesso nome, ed è la ragione per cui vale la pena dirlo.

### 9.1 Il pezzo che manca: un client SOAP ONVIF

Oggi il progetto parla ONVIF solo per la scoperta: `src/features/discovery/onvif_discovery.js` fa WS-Discovery, che è un messaggio UDP in multicast. Per muovere una telecamera serve altro: **SOAP su HTTP**, con autenticazione WS-Security.

Un client minimale in `src/features/ptz/onvif_soap.js`, senza dipendenze, con quattro pezzi:

**Autenticazione WS-Security `UsernameToken` con digest.** È la parte dove si sbaglia:

```
nonce    = 16 byte casuali
created  = istante ISO 8601 in UTC
digest   = base64( sha1( nonce_raw || created_utf8 || password_utf8 ) )
```

Il nonce viaggia in Base64 nell'intestazione, ma **nel calcolo entra grezzo**, non codificato. Invertire le due cose produce un `401` che sembra una password sbagliata e fa perdere ore.

**Buste SOAP costruite a mano.** Sono quattro chiamate, non serve un generatore:

| Operazione | Serve per |
|---|---|
| `GetCapabilities` | trovare l'indirizzo del servizio PTZ e di quello dei dispositivi |
| `GetProfiles` (Media) | ottenere il `ProfileToken`, obbligatorio in ogni chiamata PTZ |
| `GetPresets` / `GotoPreset` / `SetPreset` | i preset di posizione |
| `ContinuousMove` + `Stop` | il brandeggio manuale |

**Parsing della risposta senza un parser XML.** Le risposte che ci servono contengono pochi campi: estrai con espressioni regolari mirate su nomi di tag noti, e **non fidarti mai** del contenuto — è testo che arriva da un dispositivo di rete, quindi passa da `stripControlCharacters()` e da un limite di lunghezza prima di finire nel database o in una risposta HTTP.

**Timeout brevi e nessun blocco.** Tre secondi, e l'esito non deve mai fermare registrazione o analisi. Una telecamera che non risponde al PTZ deve continuare a registrare.

### 9.2 Modello dati

```sql
CREATE TABLE IF NOT EXISTS ptz_presets (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    onvif_token TEXT NOT NULL,
    name TEXT NOT NULL,
    is_home INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ptz_patrols (
    id TEXT PRIMARY KEY,
    camera_id TEXT NOT NULL,
    name TEXT NOT NULL,
    stops_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptz_presets_camera_token ON ptz_presets(camera_id, onvif_token);
```

**La posizione la memorizza la telecamera, non noi.** `onvif_token` è il riferimento che il dispositivo restituisce; noi teniamo solo il nome leggibile e il legame con la telecamera. Salvare le coordinate pan/tilt/zoom nel nostro database sembra più controllabile ed è invece una fonte di divergenza: la telecamera viene riavviata o riconfigurata e i nostri numeri non corrispondono più a niente.

`stops_json` è un elenco di `{ presetId, dwellSeconds }`. Validalo con `requireNumberRange` e un tetto (dieci soste, `dwellSeconds` fra 5 e 600): un ciclo di ronda con soste da un secondo produce una telecamera che si muove in continuazione e non registra nulla di utile.

### 9.3 Rotte

Tutte `Exposure.PRIVATE`, permesso `Permission.CAMERA_MANAGE` per la scrittura e `Permission.LIVE_VIEW` per la lettura dell'elenco.

```
GET    /api/cameras/:id/ptz/presets      elenco
POST   /api/cameras/:id/ptz/presets      crea dalla posizione corrente
POST   /api/cameras/:id/ptz/goto         { presetId }
POST   /api/cameras/:id/ptz/move         { pan, tilt, zoom } fra -1 e 1
POST   /api/cameras/:id/ptz/stop
DELETE /api/cameras/:id/ptz/presets/:presetId
```

`/ptz/move` va limitato in frequenza — dieci richieste al secondo bastano per un joystick — e **ogni movimento va in audit**. Sapere chi ha girato una telecamera, e quando, è esattamente il genere di domanda che nasce dopo un incidente.

`ContinuousMove` senza uno `Stop` lascia la telecamera in rotazione perpetua: imposta sempre un `Timeout` nella busta SOAP (`PT1S` è ragionevole) **oltre** a chiamare `Stop`, così una richiesta persa non manda la telecamera a girare per sempre.

### 9.4 Il legame con il resto

Un preset PTZ diventa utile quando qualcosa lo richiama da solo:

- **Barriera attraversata** (§6) → vai al preset che inquadra quella zona.
- **Targa in blacklist** (§1) → vai al preset del varco e alza la priorità di registrazione.
- **Pianificazione oraria** → ronda attiva di notte, posizione fissa di giorno.

Qui c'è una trappola da prevedere: se una telecamera è in ronda e un evento la richiama, deve **sospendere** la ronda per un tempo definito e poi riprenderla. Senza questo, il preset di allarme dura fino alla sosta successiva e la telecamera si gira via nel momento peggiore.

### 9.5 Come si dimostra che funziona

- Il digest WS-Security calcolato su nonce e istante **noti** deve corrispondere a un valore atteso fissato nel test: è l'unico punto realmente delicato ed è una funzione pura.
- La costruzione della busta SOAP con caratteri speciali nel nome del preset non produce XML rotto: verifica l'escape di `&`, `<`, `>`.
- Il parsing di una risposta `GetPresets` di esempio estrae i token attesi; una risposta malformata non lancia, restituisce elenco vuoto.
- Un `ContinuousMove` senza `Stop` non lascia stato pendente nel nostro processo.
- Validazione della ronda: undici soste rifiutate, sosta da un secondo rifiutata.
- **Su hardware vero non è mai stato provato**, e finché non lo è va dichiarato: le implementazioni ONVIF delle marche reali divergono, e questa è la funzione dove divergono di più.
