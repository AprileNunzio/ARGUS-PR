# Sicurezza: MFA, firma delle release, integrità, cifratura a riposo

Come costruire le quattro difese ancora mancanti. Ordine di priorità: **§1 MFA TOTP**, poi §2 firma degli aggiornamenti, §3 catene di integrità, §4 cifratura del disco.

Leggi prima [AGENTS.md](../AGENTS.md) §0 (regola zero) e [HANDOVER.md](../HANDOVER.md) §3.

Ogni sezione dice: **cosa costruire**, **con quali primitive già presenti nel progetto**, e **come dimostrare che funziona**. Non aggiungere dipendenze: tutto ciò che serve è in `node:crypto` e in `src/security/`.

---

## 1. MFA TOTP

### 1.1 Perché per prima

Il sistema può essere esposto a internet con `access.publicAccess`. Con la sola password, una credenziale rubata è un impianto perso: telecamere in diretta in mano a un estraneo. Le altre tre difese di questo documento proteggono da attacchi più rari; questa protegge dall'attacco più comune che esista.

### 1.2 Il modulo `src/security/totp.js`

RFC 6238, implementato con `node:crypto`. Nessuna libreria: sono quaranta righe.

```
periodo        30 secondi
cifre          6
algoritmo      SHA-1
finestra       ±1 periodo (accetta il codice precedente e il successivo)
segreto        20 byte casuali, in Base32 senza padding
```

SHA-1 qui **non è una debolezza**: è ciò che Google Authenticator, Aegis, 1Password e Bitwarden supportano davvero. TOTP usa HMAC-SHA1, e HMAC non è vulnerabile alle collisioni di SHA-1. Non "migliorarlo" a SHA-256 senza verificare le app dei clienti: otterresti codici che nessuno riesce a generare.

Funzioni da esportare:

| Funzione | Compito |
|---|---|
| `generateSecret()` | 20 byte da `crypto.randomBytes`, restituiti in Base32 |
| `deriveCode(secret, counter)` | HMAC-SHA1 del contatore big-endian a 8 byte, troncamento dinamico RFC 4226 |
| `verifyCode(secret, code, now)` | prova i contatori `t-1`, `t`, `t+1`; confronto **a tempo costante** con `crypto.timingSafeEqual` |
| `otpauthUri(secret, username, issuer)` | `otpauth://totp/ARGUS-PR:<utente>?secret=...&issuer=ARGUS-PR&algorithm=SHA1&digits=6&period=30` |

Il troncamento dinamico, che è il punto dove si sbaglia:

```
offset = hmac[19] & 0x0f
binary = ((hmac[offset]   & 0x7f) << 24)
       | ((hmac[offset+1] & 0xff) << 16)
       | ((hmac[offset+2] & 0xff) << 8)
       |  (hmac[offset+3] & 0xff)
code   = String(binary % 1000000).padStart(6, '0')
```

Base32 va scritto a mano (alfabeto RFC 4648 `A-Z2-7`, gruppi da 5 bit). Sono venti righe, ed evita una dipendenza.

### 1.3 Dove vivono i segreti

Il seed **non entra mai in chiaro nel database**. Usa il vault che esiste già:

```js
import { encryptSecret, decryptSecret } from './vault.js';
```

`encryptSecret()` è AES-256-GCM con la chiave master. Lo stesso meccanismo che protegge le password delle telecamere: non inventarne un altro.

I **codici di recupero** non sono segreti recuperabili, sono password monouso: vanno salvati come `hashPassword()` (scrypt), esattamente come le password utente, e consumati con `verifyPassword()`. Mostrali **una volta sola** al momento della generazione. Se l'utente li perde, si rigenerano; non si "rileggono".

### 1.4 Migrazione 008

```sql
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_confirmed_at TEXT;

CREATE TABLE IF NOT EXISTS recovery_codes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);
```

Registrala in `src/storage/migrations/index.js` come le precedenti. `totp_secret` resta popolato ma con `totp_enabled = 0` fra la generazione e la conferma: un segreto generato e mai confermato non deve bloccare l'accesso.

### 1.5 Il flusso di arruolamento

Tre passi, tre rotte. Tutte `Exposure.PRIVATE` (default), permesso: l'utente su sé stesso.

**`POST /api/account/mfa/setup`** — genera il segreto, lo cifra, lo salva con `totp_enabled = 0`, restituisce `{ secret, uri }`. Se esiste già un segreto **confermato**, rispondi `409`: per cambiarlo bisogna prima disattivarlo.

**`POST /api/account/mfa/confirm`** — corpo `{ code }`. Verifica il codice contro il segreto salvato. Solo se torna, imposta `totp_enabled = 1`, `totp_confirmed_at`, genera i 10 codici di recupero e li restituisce **in chiaro, questa unica volta**. Audit: `mfa.enabled`.

**`POST /api/account/mfa/disable`** — corpo `{ password, code }`. Richiede **entrambi**: la password corrente e un codice valido. Azzera segreto, flag e codici di recupero. Audit: `mfa.disabled`. Un admin non può disattivarlo se la politica lo impone (vedi §1.6): rispondi `403`.

Il QR va disegnato **lato client**, in SVG, a partire dal solo `uri`. Un encoder QR minimale (versione 4, correzione L, solo byte mode) sono circa 150 righe in `web/features/account/qr.js`. Non aggiungere una libreria per questo, e non generare l'immagine sul server: il segreto non deve attraversare la rete più del necessario.

### 1.6 L'aggancio al login

Qui sta la parte delicata. `login()` in `src/features/auth/auth_service.js` oggi restituisce una sessione. Con MFA deve poter restituire uno **stato intermedio**.

Sequenza:

1. Password verificata → se `totp_enabled = 0`, comportati come oggi.
2. Se `totp_enabled = 1`, **non emettere la sessione**. Restituisci `{ mfaRequired: true, challenge }` dove `challenge` è un token opaco a 32 byte, valido **5 minuti**, legato a utente, indirizzo e zona, tenuto in memoria (non serve una tabella: se il servizio riparte, l'utente rifà il login).
3. `POST /api/auth/mfa` con `{ challenge, code }` → verifica, poi emette la sessione con `issueSession()` passando **la stessa zona** del passo 1.

Regole che non si negoziano:

- **Il blocco per account vale anche qui.** Un codice sbagliato chiama `recordFailure(username, lockoutThresholds())` esattamente come una password sbagliata. Senza questo, MFA diventa un oracolo da forzare a 10⁶ tentativi.
- **Un codice usato non si riusa.** Tieni gli ultimi contatori consumati per utente (in memoria, finestra di 90 secondi): senza questo, chi intercetta un codice lo replica entro i 30 secondi.
- **Il codice di recupero è alternativo al codice TOTP** sulla stessa rotta: se non è un numero di sei cifre, prova a consumarlo come codice di recupero.
- **`admin` da WAN resta rifiutato comunque.** MFA non è un lasciapassare: la regola di `enforceSessionZone()` viene prima e non si tocca.
- **Nessun messaggio distingue** "password sbagliata" da "utente senza MFA": la risposta al passo 1 è identica in forma per un utente inesistente.

Impostazione nuova in `settings_schema.js`, gruppo `security`:

```
security.mfaRequiredForAdmin    boolean, default true
```

Con `true`, un admin senza MFA attiva viene forzato all'arruolamento al primo accesso, con lo stesso meccanismo di `mustChangePassword`: la sessione viene emessa ma le rotte sono chiuse tranne quelle di arruolamento. Riusa `allowWhilePasswordPending` come modello, non inventare un secondo meccanismo.

### 1.7 Come si dimostra che funziona

- **Vettori RFC 6238.** Con il segreto ASCII `12345678901234567890` e SHA-1:

  | `T` (secondi) | 8 cifre (tabella della RFC) | 6 cifre (quello che useremo) |
  |---|---|---|
  | 59 | 94287082 | `287082` |
  | 1111111109 | 07081804 | `081804` |
  | 1111111111 | 14050471 | `050471` |
  | 1234567890 | 89005924 | `005924` |
  | 2000000000 | 69279037 | `279037` |

  **Attenzione:** la tabella pubblicata nella RFC è a otto cifre. Con `digits = 6` i valori attesi sono quelli della terza colonna — sono le ultime sei cifre, perché il troncamento è un modulo. Confrontare con la colonna sbagliata manda a caccia di un bug che non esiste. I valori qui sopra sono stati calcolati, non copiati.

  Se questi non tornano, l'implementazione è sbagliata e nient'altro conta.
- Codice del periodo precedente e successivo accettati, quello di due periodi prima rifiutato.
- **Riuso rifiutato**: lo stesso codice due volte di fila non passa.
- Codice di recupero consumato una sola volta; il secondo tentativo con lo stesso codice fallisce.
- Dieci codici sbagliati fanno scattare il blocco dell'account.
- Il segreto **non compare** in nessuna risposta HTTP dopo l'arruolamento, né nei log: aggiungi un test che cerca il segreto nel corpo di `GET /api/auth/session` e nel giornale.
- Un admin da WAN resta rifiutato anche con codice corretto.

---

## 2. Firma delle release

### 2.1 Cosa esiste già

`verify_signature()` in `deploy/linux/pre-start.sh` è **scritta e collegata**: importa una chiave pubblica in un `GNUPGHOME` temporaneo e chiama `git verify-tag`. Se la firma non torna, l'aggiornamento viene rifiutato e la fase diventa `failed`.

È inerte per una sola ragione: non esiste una chiave in `/etc/argus-pr/update-key.asc`. Con la chiave assente lo script **procede** e scrive un avviso nel journal. Questa è una scelta consapevole di compatibilità, non una svista, e va chiusa.

### 2.2 Il rischio, detto senza ammorbidirlo

L'aggiornamento automatico è attivo su ogni impianto e scarica l'ultimo tag da GitHub. **Chi ottiene l'account GitHub ottiene tutti gli impianti installati, simultaneamente, con esecuzione di codice come root via `pre-start.sh`.** Non è un rischio teorico: è il vettore con cui si compromettono le flotte di dispositivi. La firma è ciò che lo chiude, perché sposta il segreto necessario dall'account (che vive online) alla chiave privata (che vive offline).

### 2.3 Cosa fare

**Generare la chiave di firma**, ed è l'unico passo che va fatto su una macchina fidata:

```bash
gpg --quick-generate-key "ARGUS-PR Release Signing <...>" ed25519 sign 5y
gpg --armor --export <KEYID> > update-key.asc
```

Ed25519, non RSA: chiavi corte, verifica veloce, nessun parametro da sbagliare. **La chiave privata non entra mai nel repository, in CI, o in una variabile d'ambiente.** Se un giorno la firma verrà fatta da un runner, quella è una macchina che va trattata come la chiave stessa.

**Firmare ogni tag** — `git tag -s vX.Y.Z -m "..."`, poi `git push origin vX.Y.Z`. Aggiungi la firma al ciclo di rilascio di HANDOVER.md §1: un tag non firmato, da quel momento, è un tag che gli impianti rifiuteranno.

**Distribuire la chiave pubblica**: `update-key.asc` va nel repository (è pubblica) e l'autoinstaller la copia in `/etc/argus-pr/update-key.asc` con permessi `0644`, di proprietà di root. Aggiungi il passo in `autoinstaller.sh`, accanto a `write_environment()`.

**Rendere obbligatoria la verifica** quando la chiave è presente: già così. Il passo successivo è togliere il fallback — quando ogni impianto ha la chiave, la mancanza del keyring deve diventare un errore, non un avviso. Fallo in una release separata e dichiaralo nelle note, altrimenti blocchi gli aggiornamenti degli impianti installati prima.

### 2.4 La rotazione

È la parte che si dimentica e che poi fa male.

La chiave scade fra cinque anni. Un impianto installato oggi e mai toccato ha, alla scadenza, una chiave pubblica che non verifica più nulla: **si blocca sull'ultima versione**, il che è il comportamento sicuro ma va previsto.

Procedura: genera la nuova chiave, firma il tag di transizione con **entrambe** le chiavi (`git tag -s` accetta una sola firma, quindi il tag di transizione va firmato con la vecchia e deve *contenere* la nuova chiave nel repository), pubblica una release che aggiorna `/etc/argus-pr/update-key.asc`, e solo dalla release successiva firma con la sola chiave nuova. Documenta la finestra in cui entrambe sono valide.

### 2.5 Come si dimostra che funziona

Non basta un test unitario: serve una prova end-to-end su un repository git locale.

- Tag firmato con la chiave giusta → `verify_signature()` esce 0.
- Tag non firmato → esce 1, la fase diventa `failed`, la versione installata resta quella di prima.
- Tag firmato con una chiave **diversa** → esce 1.
- Keyring assente → esce 0 con l'avviso nel journal (finché il fallback esiste).
- `GNUPGHOME` temporaneo rimosso in tutti i rami, anche in quelli d'errore: verificalo, perché una directory con una chiave importata lasciata in `/tmp` è essa stessa un problema.

---

## 3. Catene di integrità

### 3.1 Il principio

Per la videosorveglianza, **dimostrare che un filmato non è stato alterato conta più della riservatezza**. Un video riservato che non si può portare in giudizio non serve a niente.

Il progetto ha già metà del lavoro: `src/features/export/custody.js` costruisce un manifesto con `digest()`, `chainSources()` e `sealManifest()` (HMAC con chiave derivata dal vault). **Quel codice va riusato, non riscritto.** Manca la catena *a monte*, sui segmenti registrati, e sull'audit.

### 3.2 Catena sui segmenti

L'indice esiste: `appendSegment()` in `src/features/recording/segment_index.js` scrive un record JSONL per segmento chiuso, un file per telecamera e per giorno. `segment_watcher.js` pubblica `Topic.SEGMENT_CLOSED` nello stesso momento.

Aggiungi al record, prima della scrittura:

```
sha256      digest del file del segmento
prevHash    hash della riga precedente dello stesso giorno
chainHash   sha256(prevHash || sha256 || startedAt || cameraId)
```

Dove `prevHash` della prima riga del giorno è il `chainHash` dell'ultima riga del giorno precedente, così la catena non si spezza a mezzanotte. Il primo giorno in assoluto usa 64 zeri.

**Il calcolo dello sha256 non va fatto nel thread principale.** Un segmento è decine di megabyte e il processo serve flussi video in diretta: usa uno stream (`crypto.createHash` alimentato da `fs.createReadStream`) e aggancialo all'evento `SEGMENT_CLOSED`, aggiornando la riga dopo. Se preferisci la semplicità, un `worker_thread` dedicato è accettabile; un `readFileSync` non lo è.

**Il problema vero: la ritenzione.** `planRetention()` cancella i segmenti scaduti, e cancellare un anello rompe la catena. La soluzione non è conservare tutto: è conservare **le testimonianze**. Quando la ritenzione elimina un segmento, la sua riga di indice **non si cancella**: si sostituisce il campo del file con `"pruned": true` e si mantengono `sha256` e `chainHash`. La catena resta verificabile; il contenuto no, ed è corretto così. `rewriteDay()` esiste già e fa esattamente questo tipo di riscrittura.

Rotta nuova, permesso `Permission.ARCHIVE_VIEW`:

```
GET /api/archive/integrity?camera=<id>&day=YYYY-MM-DD
→ { day, records, verified, brokenAt }
```

`verified` è vero se ogni `chainHash` ricalcolato coincide; `brokenAt` è l'indice della prima riga incoerente, o `null`. Per i segmenti ancora sul disco, verifica anche che lo sha256 del file corrisponda: è la differenza fra "l'indice è coerente" e "il filmato è quello di allora".

### 3.3 Catena sull'audit

Oggi `audit_log` è una tabella SQLite ordinaria: un amministratore compromesso cancella le proprie tracce con una `DELETE`.

Migrazione 009:

```sql
ALTER TABLE audit_log ADD COLUMN prev_hash TEXT;
ALTER TABLE audit_log ADD COLUMN entry_hash TEXT;
```

In `recordAudit()`, dentro la stessa transazione dell'inserimento: leggi l'`entry_hash` dell'ultima riga, calcola `entry_hash = sha256(prev_hash || at || actor_id || action || target || outcome || detail)` con `canonicalJson()` di `custody.js` per la serializzazione, e scrivi entrambi. Una riga cancellata o modificata rompe la catena in modo rilevabile.

Questo **rileva** la manomissione, non la impedisce: chi ha accesso al file può ricalcolare l'intera catena. Per impedirla serve una copia fuori dalla macchina. Due strade, entrambe accettabili:

- **Inoltro syslog** verso un host esterno (`ARGUS_SYSLOG_HOST`, RFC 5424 su TCP+TLS). Semplice, standard, e l'host esterno è la prova.
- **Sigillo periodico**: ogni ora, `sealManifest()` sull'ultimo `entry_hash` con la chiave del vault. Non protegge da chi ha la chiave, quindi è più debole; usalo solo se il syslog non è praticabile.

Rotta `GET /api/system/audit/integrity`, permesso `Permission.AUDIT_VIEW`, che ricalcola la catena e restituisce `{ verified, entries, brokenAt }`.

### 3.4 Come si dimostra che funziona

- Catena di dieci segmenti sintetici: verifica positiva.
- Modifica un byte di un file di segmento → `verified: false` con `brokenAt` sull'indice giusto.
- Modifica un `sha256` nell'indice → verifica negativa.
- Segmento eliminato dalla ritenzione → riga marcata `pruned`, catena **ancora** verificabile.
- Riga di audit cancellata a mano con SQL → catena rotta e rilevata.
- La catena attraversa la mezzanotte senza spezzarsi: due giorni consecutivi, verifica su entrambi.

---

## 4. Cifratura del disco a riposo

### 4.1 Cosa protegge, e cosa no

`<dataDir>/secrets/master.key` e `<dataDir>/secrets/pki/*.key` stanno a `0600`. I permessi POSIX proteggono dagli altri utenti della macchina accesa. **Non proteggono da chi si porta via il mini PC**, che è lo scenario realistico per un impianto in un negozio o in un capannone: chi prende il disco ottiene le credenziali RTSP di tutte le telecamere e tutte le registrazioni.

Un archivio di videosorveglianza rubato è prima di tutto un problema GDPR, e poi un problema tecnico.

Questa sezione **non è codice**: è una guida operativa da scrivere in `docs/INSTALLAZIONE-SICURA.md` e da richiamare dal README.

### 4.2 La configurazione da documentare

LUKS2 sul volume dati, con sblocco automatico al boot via **TPM 2.0**, altrimenti l'avvio non presidiato smette di funzionare e l'impianto non riparte dopo un blackout.

I punti che la guida deve coprire:

- `cryptsetup luksFormat --type luks2` sul volume che ospita `<dataDir>` e `<mediaDir>`; non sull'intero disco di sistema, così `/opt/argus-pr` resta leggibile e il servizio si diagnostica anche con il volume dati chiuso.
- `systemd-cryptenroll --tpm2-device=auto --tpm2-pcrs=7` per il sigillo. **PCR 7** lega la chiave allo stato di Secure Boot: un attaccante che avvia da USB non ottiene la chiave.
- Voce in `/etc/crypttab` e dipendenza `RequiresMountsFor=` nell'unità `argus-pr.service`, altrimenti il servizio parte prima che il volume sia montato e crea un secondo `dataDir` vuoto — errore silenzioso e molto sgradevole da diagnosticare.
- **Passphrase di recupero** stampata e conservata fuori dalla macchina: un aggiornamento del firmware cambia i PCR e invalida il sigillo TPM. Senza passphrase, il volume è perso.
- Cosa fare quando i PCR cambiano: `systemd-cryptenroll --wipe-slot=tpm2` e nuovo enroll.

### 4.3 Come si dimostra che funziona

Va provato su hardware, e finché non lo è va dichiarato non provato.

- Riavvio a freddo: il volume si apre da solo, `argus-pr` parte, `argus cert` mostra la stessa impronta di prima.
- Disco collegato a un'altra macchina: il volume non si apre.
- Avvio da USB con Secure Boot disattivato: il TPM non rilascia la chiave.
- Passphrase di recupero: apre il volume.

---

## 5. L'ordine, e perché

1. **MFA TOTP** — protegge dall'attacco che accadrà davvero.
2. **Firma delle release** — protegge dall'attacco che, se accade, li compromette tutti insieme.
3. **Catene di integrità** — rende utilizzabile in giudizio ciò che il sistema registra.
4. **Cifratura a riposo** — protegge da un furto fisico.

Le prime due sono codice, hanno test deterministici e si chiudono. La terza tocca il percorso caldo della registrazione: misura l'impatto prima di darla per fatta. La quarta non è codice ed è la sola che dipende dall'hardware del cliente.

Quando ne finisci una: entrambe le suite verdi, `AGENTS.md` aggiornato nello stesso commit, tag firmato, release con le note che dicono anche **cosa manca ancora**.
