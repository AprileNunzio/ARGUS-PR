# Come costruire le funzioni mancanti, per davvero

Guida operativa per chi implementa. Non descrive un'idea: descrive **cosa scrivere, con quali strumenti, e come dimostrare che funziona**.

Leggi prima [AGENTS.md](../AGENTS.md) per i vincoli e [HANDOVER.md](../HANDOVER.md) per il quadro generale.

> **Stato al 2026-09-03 (v0.12.0).** I punti da 1 a 8 dell'ordine di lavoro qui sotto **sono stati costruiti**. Restano il 9 in parte e dal 10 in poi. La tabella è aggiornata con lo stato di ciascuno.
>
> I capitoli §4 (come si accerta che una funzione sia vera) e §5 (cosa non fare) **non invecchiano**: valgono per ogni funzione nuova, comprese quelle di sicurezza descritte in [SICUREZZA.md](SICUREZZA.md). Se leggi un solo capitolo di questo documento, leggi quei due.

| Documento | Contenuto |
|---|---|
| Questo file | Il principio, l'architettura dell'inferenza, l'ordine di lavoro |
| [MOVIMENTO.md](MOVIMENTO.md) | Pianificazione oraria e rilevamento movimento con zone |
| [VISIONE.md](VISIONE.md) | Il processo di visione: oggetti, targhe, volti |
| [AUTOMAZIONI.md](AUTOMAZIONI.md) | Regole, varchi, Telegram, MQTT, planimetria |

---

## 1. Il principio: cosa distingue il vero dal simulato

Il vecchio programma dichiarava di riconoscere volti e targhe. Non lo faceva: restituiva un riquadro fisso e un vettore ricavato da un hash. La differenza fra quel codice e un sistema vero non è la quantità di codice, sono **tre proprietà misurabili**:

1. **L'uscita dipende dall'ingresso.** Se cambio l'immagine e il risultato non cambia, non sto riconoscendo niente. È il test più semplice e il vecchio programma lo falliva.
2. **Il sistema può sbagliare.** Un riconoscitore vero ha falsi positivi e falsi negativi, e una soglia che li bilancia. Un simulatore ha confidenza 0.96 sempre.
3. **Il risultato è riproducibile.** Stesso video in ingresso, stessi rilevamenti in uscita. Se non è riproducibile non è testabile, e se non è testabile non si può dire che funziona.

**Regola pratica per ogni funzione che scrivi:** prima di dichiararla finita, prepara un file video di prova con contenuto noto, passalo nel sistema e verifica che l'uscita sia quella attesa. Se non riesci a costruire quel test, la funzione non è finita.

---

## 2. Dove sta l'inferenza: fuori dal processo Node

Il vincolo del progetto è due dipendenze soltanto, `better-sqlite3` e `ws`. Nessuna libreria di reti neurali entra nel processo Node. Ma questo **non** significa rinunciare al riconoscimento: significa trattarlo come è già trattato ffmpeg.

```
┌──────────────────────────────────────────────┐
│  ARGUS-PR (Node, 2 dipendenze)               │
│                                              │
│  registrazione · diretta · archivio · regole │
└───────┬───────────────────────┬──────────────┘
        │ spawn + pipe          │ spawn + pipe
┌───────▼────────┐      ┌───────▼──────────────┐
│  ffmpeg        │      │  argus-vision        │
│  (binario)     │      │  (processo separato) │
│  decodifica    │      │  onnxruntime, OpenCV │
└────────────────┘      └──────────────────────┘
```

Tre conseguenze importanti.

- **Il cuore resta leggero.** Chi non vuole il riconoscimento non installa niente: l'NVR registra lo stesso. Il riconoscimento è un componente aggiuntivo, non un requisito.
- **Un crash della visione non ferma la registrazione.** È la proprietà più importante di un videoregistratore: se deve cadere qualcosa, che cada l'analisi, mai la registrazione.
- **La visione può stare su un'altra macchina.** Un vecchio PC registra, una macchina con GPU analizza. Il protocollo è lo stesso.

### Il confine fra i due mondi

| | ARGUS-PR (Node) | argus-vision (Python) |
|---|---|---|
| Fa | regole, persone, varchi, archivio, interfaccia | solo inferenza su fotogrammi |
| Riceve | rilevamenti in JSON | fotogrammi grezzi |
| Non fa mai | inferenza | decisioni, accesso al database |

Il processo di visione **non decide niente**. Non sa cosa sia una lista nera, non apre cancelli, non scrive nel database. Dice soltanto "in questo fotogramma, in questa posizione, c'è un oggetto di questa classe con questa confidenza". Tutte le decisioni restano in ARGUS-PR, dove sono verificabili e tracciate.

Questa separazione non è estetica: è ciò che permette di sostituire il motore di inferenza senza toccare la logica di sicurezza, e di testare la logica di sicurezza senza avere una GPU.

---

## 3. Ordine di lavoro consigliato

Ogni riga è una release. Non passare alla successiva finché la precedente non è verificata.

| # | Cosa | Stato | Documento |
|---|---|---|---|
| 1 | Pianificazione oraria | **fatta** | [MOVIMENTO.md](MOVIMENTO.md) §1 |
| 2 | Rilevamento movimento con zone | **fatta** | [MOVIMENTO.md](MOVIMENTO.md) §2 |
| 3 | Ingresso rilevamenti + tabella eventi | **fatta** | [VISIONE.md](VISIONE.md) §5 |
| 4 | Registrazione su evento | **parziale**: solo la ritenzione differenziata | [MOVIMENTO.md](MOVIMENTO.md) §3 |
| 5 | Processo di visione: oggetti | **fatta** | [VISIONE.md](VISIONE.md) §1-3 |
| 6 | Inseguimento (tracking) | **fatta** | [VISIONE.md](VISIONE.md) §4 |
| 7 | Targhe | **fatta** | [VISIONE.md](VISIONE.md) §6 |
| 8 | Anagrafica persone e volti | **fatta** | [VISIONE.md](VISIONE.md) §7 |
| 9 | Regole di accesso e varchi | **parziale**: le regole sì, i varchi no | [AUTOMAZIONI.md](AUTOMAZIONI.md) §1-2 |
| 10 | Notifiche Telegram, webhook, MQTT | da fare | [AUTOMAZIONI.md](AUTOMAZIONI.md) §3 |
| 11 | Ricerca forense | da fare | [AUTOMAZIONI.md](AUTOMAZIONI.md) §5 |
| 12 | Planimetria e barriere virtuali | da fare | [AUTOMAZIONI.md](AUTOMAZIONI.md) §6 |
| 13 | Preset RTSP, PTZ, diagnostica, watchdog | da fare | [AUTOMAZIONI.md](AUTOMAZIONI.md) §7-9 |

**L'ordine è cambiato.** Questa scaletta è stata scritta quando mancava il riconoscimento. Oggi il rilevamento c'è e il sistema può stare su internet, quindi la priorità non è più la riga 10: è **[SICUREZZA.md](SICUREZZA.md) §1, l'autenticazione a due fattori**. Le funzioni di questa tabella vengono dopo, nell'ordine indicato da [HANDOVER.md](../HANDOVER.md) §3.

**Perché il punto 2 era quello che cambiava tutto**, e perché la lezione vale ancora: il rilevamento movimento non richiede modelli, GPU né dipendenze, è aritmetica su byte, ed è vero al 100%. Averlo fatto per primo ha dato eventi reali con cui provare tutto il resto senza aspettare la visione artificiale. Quando pianifichi una funzione nuova, cerca il suo equivalente: il pezzo più semplice che produce dati veri.

---

## 4. Come si accerta che una funzione sia vera

Metti questi controlli in `test/` o in una procedura scritta. Valgono per ogni funzione di rilevamento.

**Il test dell'ingresso costante.** Manda al sistema lo stesso fotogramma ripetuto per un minuto. Un rilevatore di movimento vero non produce **nessun** evento. Se ne produce, sta inventando.

**Il test dell'ingresso nero.** Manda fotogrammi completamente neri. Nessun volto, nessuna targa, nessuna persona. Se il sistema riconosce qualcosa in un'immagine nera, è simulato.

**Il test della clip di riferimento.** Committa nel repository una clip corta (pochi secondi, poche centinaia di kB) con contenuto noto, e un file con i rilevamenti attesi. Il test passa la clip nella pipeline e confronta. Questo è l'unico modo per accorgersi di una regressione senza avere una telecamera collegata.

**Il test della soglia.** Abbassa la soglia di confidenza a 0.05: devono comparire molti falsi positivi. Alzala a 0.95: devono quasi sparire. Se il numero di rilevamenti non cambia al variare della soglia, la soglia non è collegata a niente.

**La prova sul campo.** Alla fine serve comunque: una telecamera vera, una persona che cammina, una targa vera. Nessun test automatico sostituisce questa, ma i quattro sopra evitano di arrivarci con codice che non poteva funzionare.

---

## 5. Cosa NON fare

- **Non generare embedding da hash.** È esattamente l'errore del vecchio programma. Un embedding deve uscire da una rete neurale che ha guardato dei pixel.
- **Non riempire il database con dati di esempio.** Il vecchio programma aveva una lista `BANNED_FAKES` per nascondere targhe finte seminate durante lo sviluppo: significa che i dati di prova erano finiti in produzione e qualcuno ha dovuto filtrarli. Se ti servono dati di prova, mettili in un database separato.
- **Non far decidere niente al processo di visione.** Se un giorno il worker apre un cancello, la sicurezza del sistema dipende da un processo Python che nessuno sta verificando.
- **Non mettere immagini nel database.** Ritagli, foto e planimetrie vanno su disco, nel database solo il percorso. Vale la stessa ragione per cui l'indice dei segmenti è su file: SQLite non è un archivio di file binari.
- **Non dichiarare completa una funzione che non hai eseguito.** Le note di rilascio di questo progetto distinguono sempre fra verificato e non verificato. Continua a farlo.
