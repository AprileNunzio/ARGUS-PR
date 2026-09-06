# Contributing to ARGUS-PR / Linee Guida per i Collaboratori

[English Version](#english-version) | [Versione Italiana](#versione-italiana)

---

## English Version

Thank you for your interest in contributing to **ARGUS-PR** (*Autonomous Resilient Guard for Universal Surveillance - Production Ready*), created and maintained by **Nunzio Aprile / NunzioTech**.

To preserve system reliability, architectural purity, and long-term maintainability, all contributions must strictly adhere to the guidelines set forth in this document.

### 1. Core Architectural Principles

1. **Zero Cloud & Full Autonomy**: The system must run indefinitely in air-gapped environments. No module may introduce outbound telemetry or unauthorized external calls.
2. **Clean Architecture & Separation of Concerns (SoC)**:
   - Clear decoupling between domain logic, data persistence, video pipelines, and HTTP/WebSocket transport.
   - Every module strictly adheres to the Single Responsibility Principle (SRP).
3. **Source Code Purity**:
   - **Zero comments in source code**: Code must be self-explanatory, readable, and structured with precise naming conventions.
   - **File size constraint**: No source file (`.js`, `.css`, etc.) may exceed **500 lines of code**. Large modules must be decomposed into cohesive submodules.
4. **Zero-Trust Security**:
   - All input paths must be strictly validated against path traversal (`resolveInside`), command injection, and abnormal payloads.
   - All endpoints default to least-privilege exposure policies (private/protected).
5. **Zero Non-Essential Runtime Dependencies**:
   - The core Node.js runtime relies exclusively on essential native dependencies (`better-sqlite3`, `ws`). Do not introduce extra NPM packages without maintainer approval.

### 2. Workflow & PR Process

1. **Fork & Branch**: Create a feature or bugfix branch with a descriptive name (`feature/my-feature` or `fix/my-fix`).
2. **Testing**: Run the automated test suite before opening a PR:
   ```bash
   npm test
   ```
   All test cases must pass 100% without regressions.
3. **Commit Messages**: Follow standard Conventional Commits (`feat(...)`, `fix(...)`, `refactor(...)`, `docs(...)`).
4. **Pull Requests**: Fill out `.github/PULL_REQUEST_TEMPLATE.md` completely.

---

## Versione Italiana

Ti ringraziamo per l'interesse nel contribuire ad **ARGUS-PR** (*Autonomous Resilient Guard for Universal Surveillance - Production Ready*), ideato e curato da **Nunzio Aprile / NunzioTech**.

Per preservare l'estrema affidabilità, la purezza architetturale e la manutenibilità del sistema, tutti i contributi devono attenersi rigorosamente ai criteri stabiliti in questo documento.

### 1. Principi Architetturali Fondamentali

1. **Zero Cloud & Piena Autonomia**: Il sistema deve poter funzionare a tempo indeterminato in reti completamente isolate da Internet (air-gapped). Nessun modulo deve introdurre telemetrie o chiamate esterne non autorizzate.
2. **Clean Architecture & Separation of Concerns (SoC)**:
   - Separazione netta tra logica di dominio, persistenza dati, pipeline video ed esposizione HTTP/WebSocket.
   - Ogni modulo rispetta il Single Responsibility Principle (SRP).
3. **Purezza del Codice Sorgente**:
   - **Assenza assoluta di commenti nel codice sorgente**: Il codice deve essere auto-esplicativo, leggibile, con nomi di funzioni e variabili rigorosi.
   - **Limite dimensionale**: Nessun file sorgente (`.js`, `.css`, ecc.) deve superare le **500 righe di codice**.
4. **Zero-Trust Security**:
   - Qualsiasi input deve essere validato contro path traversal (`resolveInside`), injection e payload anomali.
   - Tutti gli endpoint applicano per impostazione predefinita il principio del privilegio minimo.
5. **Zero Dipendenze Runtime Non Essenziali**:
   - Il runtime Node.js include esclusivamente le dipendenze native indispensabili (`better-sqlite3`, `ws`).

### 2. Flusso di Lavoro

1. **Fork & Branch**: Crea un ramo dedicato (`feature/nome-funzionalita` o `fix/descrizione-bug`).
2. **Test**: Esegui l'intera suite di test prima di proporre la modifica:
   ```bash
   npm test
   ```
   Tutti i test devono risultare verdi al 100%.
3. **Commit**: Utilizza lo standard Conventional Commits (`feat(...)`, `fix(...)`, `refactor(...)`, `docs(...)`).
4. **Pull Request**: Compila integralmente il modello `.github/PULL_REQUEST_TEMPLATE.md`.
