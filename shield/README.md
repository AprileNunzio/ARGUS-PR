# ARGUS-SHIELD

Firewall perimetrale e risposta automatica agli attacchi per un impianto ARGUS-PR.

È un **applicativo autonomo**: proprio `package.json`, zero dipendenze esterne, propria unità systemd, proprio stato su disco. Può girare anche senza ARGUS-PR installato.

## Il principio: lo scudo legge, il NVR non comanda

La comunicazione fra i due programmi è a **senso unico**. Il NVR scrive in append ogni rifiuto su `security-events.jsonl`; ARGUS-SHIELD segue quel file e decide da solo. Non esiste alcuna API, socket o segnale con cui il NVR possa ordinare qualcosa allo scudo.

È voluto: se il NVR venisse compromesso, l'attaccante **non** eredita il controllo del firewall.

## Cosa fa

**Ruleset nftables** (`table inet argus_shield`), applicato in modo atomico e validato con `nft -c` prima di essere installato — se non compila, non si applica e la configurazione precedente resta intatta.

- Politica `drop` su input e forward; output libero (servono le telecamere e gli aggiornamenti).
- Pacchetti in stato `invalid` scartati.
- Scansioni NULL, XMAS, FIN/SYN, SYN/RST, FIN/RST rifiutate.
- ICMP echo limitato a 5/s.
- Connessioni contemporanee per sorgente e nuove connessioni al minuto limitate sulle porte pubbliche.
- SSH raggiungibile solo dalle reti locali.
- DHCP client sempre consentito (senza quella regola la macchina perde l'indirizzo al riavvio).

**Punteggio con decadimento esponenziale.** Ogni evento pesa; il punteggio si dimezza ogni 10 minuti. Superata la soglia scatta il blocco, e la recidiva quadruplica la durata fino al tetto di 7 giorni.

| Evento | Peso |
|---|---|
| `auth.admin_from_wan` | blocco immediato |
| `auth.locked` | 6 |
| `zone.denied` | 5 |
| `origin.rejected` | 4 |
| `route.probe` | 4 |
| `auth.failure` | 3 |
| `rate.limited` | 2 |
| `auth.success` | −4 |

**Rete locale e allowlist non vengono mai bloccate.** Bloccare la propria LAN significa chiudersi fuori da un impianto che sta registrando.

I blocchi sopravvivono al riavvio e vengono riapplicati all'avvio.

## Comandi

```bash
argus-shield apply      # applica il ruleset e ripristina i blocchi salvati
argus-shield watch      # applica e resta in ascolto degli eventi
argus-shield status     # backend, ruleset, indirizzi bloccati e sorvegliati
argus-shield ruleset    # stampa il ruleset senza applicarlo
argus-shield ban <ip> [secondi]
argus-shield unban <ip>
argus-shield flush      # rimuove ogni regola di ARGUS-SHIELD
```

Opzioni: `--backend <nftables|netsh|report-only>`, `--config <file>`, `--dry-run`, `--from-beginning`, `--verbose`.

## Configurazione

`/etc/argus-pr/shield.json`, oppure le variabili `ARGUS_SHIELD_*`.

| Chiave | Default | Significato |
|---|---|---|
| `publicPorts` | `[443, 80]` | porte aperte a chiunque |
| `localOnlyPorts` | `[22]` | porte riservate alle reti locali |
| `wireguardPort` | `0` | porta UDP di WireGuard, `0` la lascia chiusa |
| `lanNetworks` | RFC1918 + ULA | reti considerate locali |
| `allowlist` | `[]` | indirizzi mai bloccati |
| `scoreThreshold` | `10` | punteggio oltre il quale scatta il blocco |
| `scoreHalfLifeSeconds` | `600` | dimezzamento del punteggio |
| `banSeconds` | `900` | durata del primo blocco |
| `maxBanSeconds` | `604800` | tetto della durata |
| `banLocalNetworks` | `false` | se bloccare anche gli indirizzi locali |
| `eventsFile` | `/var/lib/argus-pr/security-events.jsonl` | flusso in ingresso |

## Backend

- **nftables** su Linux: il backend reale.
- **netsh** su Windows: sottoinsieme funzionante, senza scadenza automatica dei blocchi.
- **report-only**: calcola, registra e non tocca la rete. Se `status` mostra questo backend, **il sistema non è protetto**.

## Test

```bash
node --test shield/test/*.test.js
```

La suite gira interamente sul backend `report-only` e non modifica il firewall della macchina.
