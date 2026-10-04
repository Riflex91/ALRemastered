# ALRemastered – Verbindliche Entwicklungsroadmap

> Adventure-Land-Client mit ressourcenschonendem Headless-Betrieb, optionalem Browser-/HD-Modus, anfängerfreundlichem lokalem Dashboard, visueller Dashboard-Anpassung und sicherem Community-Script-System.

## 0. Verbindliche Projektregeln

Diese Regeln gelten für die gesamte Entwicklung:

- **Während der gesamten Entwicklung wird kein Codex verwendet.**
- **Die gesamte Benutzeroberfläche ist ausschließlich Englisch.** Das gilt für Dashboard, Installer, Browser-Modus, Dialoge, Buttons, Tooltips, Benachrichtigungen, Fehlertexte, Update-Hinweise und benutzerseitige Logs. Interne Entwicklerdokumentation darf davon unabhängig sein.
- Ein echter Installer ist von Anfang an Teil der Produktentwicklung und nicht erst ein spätes Packaging-Thema.
- Der Installer muss dem Benutzer einen frei wählbaren Installationspfad anbieten.
- Jeder für den Benutzer bestimmte Windows- und Linux-Testbuild soll über denselben Installer-/Upgrade-Pfad testbar sein, der später auch für Releases verwendet wird.
- Beim Download/Release wählt der Benutzer zuerst **Windows** oder **Linux** und erhält danach den passenden Installer für das gewählte Betriebssystem.
- ALRemastered prüft automatisch auf neue Client-Versionen. Updates werden niemals ungefragt installiert.
- Wird eine neue Version gefunden, muss sie im Client deutlich sichtbar angezeigt werden und genau die primären Aktionen **“Install update”**, **“Skip this version”** und **“Remind me tomorrow”** anbieten.
- **“Skip this version”** unterdrückt nur die exakt angebotene Version; eine spätere Version wird wieder angezeigt.
- **“Remind me tomorrow”** unterdrückt die angebotene Version für 24 Stunden und zeigt sie danach erneut an, sofern sie noch aktuell ist.
- Entwicklung erfolgt in **kleinen, testbaren Slices**.
- Jeder Slice folgt strikt: **implementieren → prüfen → PR → mergen → Benutzer-Livetest → erst danach nächster Slice**.
- Kein Folge-Slice wird begonnen, solange der vorherige Slice im realen Test noch einen ungeklärten Fehler hat.
- Jeder neue Funktionsbereich muss vor oder zusammen mit seiner Funktion ausreichendes strukturiertes Logging bekommen.
- Der Benutzer kann bei Problemen jederzeit über die Debug-Konsole **„Gesamten Log kopieren“** verwenden und den Log zur Fehleranalyse schicken.
- Secrets, Session-Tokens, Passwörter und vergleichbare sensible Daten dürfen niemals im kopierten Diagnose-Log erscheinen.
- Adventure Land und dessen Serverzustand bleiben für Gameplay und Netzwerk autoritativ.
- Headless- und Browser-Modus benutzen denselben Character-/Bot-Core.
- Headless-Betrieb lädt keine Render-/HD-Assets.
- Browser-Modus verwendet bevorzugt die HD-Grafiken aus `Riflex91/Riflex91-Repo/Adventure Land HD`.
- Nicht vorhandene oder technisch ungeeignete HD-Assets fallen automatisch auf originale Adventure-Land-Assets zurück.
- Anfängerfreundlichkeit ist eine Kernanforderung der Architektur.
- Fortgeschrittene Benutzer erhalten trotzdem vollständigen JavaScript-/TypeScript-Zugriff.
- Spielwissen wird möglichst aus der aktuellen Adventure-Land-Version geladen, nicht hart codiert.
- Kritische Aktionen benötigen sichere Defaults und nachvollziehbare Berechtigungen.

---

# 1. Entwicklungs- und Testzyklus

Jeder Roadmap-Slice ist eine eigene abgeschlossene Einheit.

## Standardablauf pro Slice

1. aktuellen `main` frisch lesen
2. neuen Arbeitsbranch vom aktuellen `main` erstellen
3. nur den beschriebenen Slice implementieren
4. Unit-/Integrations-/Buildtests ausführen
5. Logging und Diagnose für den neuen Bereich prüfen
6. Pull Request erstellen
7. PR gegen aktuellen `main` prüfen
8. nur bei sauberem Stand mergen
9. Benutzer aktualisiert den installierten Client über **Install update** auf den gemergten/releasten Teststand
10. Benutzer startet den vorgesehenen Livetest über genau **einen** primären **Start test**-Button
11. der Test-Harness stellt erforderliche sichere Spielsituationen selbst her oder wählt sie aus frischem Live-State aus, führt die bounded Testkette selbst aus und kopiert nach terminalem Ergebnis automatisch den vollständigen strukturierten Testbericht inklusive sanitisiertem Diagnose-Log in die Zwischenablage
12. bei `BLOCKED`, `FAILED` oder unklarem Ergebnis wird **keine manuelle Gameplay-Vorbereitung** an den Benutzer delegiert; der kopierte Bericht wird analysiert und der Fehler/fehlende Harness-Schritt in einem Fix-Slice behoben
13. erst nach bestandenem Livetest den nächsten geplanten Slice freigeben

### Verbindlicher Livetest-Bedienstandard

Für normale ALRemastered-Entwicklungstests ist der Benutzer-Workflow:

```text
Install update
→ Start test
→ automatisch kopierten Bericht an ChatGPT senden
```

Der Benutzer soll insbesondere **nicht** Monster/Targets/Items/Chests manuell beschaffen oder auswählen, den Character für einen Test manuell positionieren, einzelne Gameplay-Testaktionen nacheinander auslösen oder Diagnose-Logs manuell zusammensuchen müssen. Externe bewusste Freigaben, die technisch zwingend beim Benutzer liegen (z. B. erstmaliger Account-Login oder die explizite Update-Installation), bleiben davon getrennt. Testautomation darf Safety-, Live-Revalidation-, Action-Gateway-, Serverkorrelations- oder No-Blind-Retry-Regeln niemals umgehen.

## Definition of Done für jeden Slice

Ein Slice ist erst abgeschlossen, wenn:

- Code gemerged ist,
- automatisierte Tests erfolgreich sind,
- relevante Logs vorhanden sind,
- Fehlermeldungen verständlich dargestellt werden,
- keine Secrets im Diagnose-Log landen,
- der Benutzer den gemergten Stand praktisch getestet hat,
- bekannte Fehler entweder behoben oder ausdrücklich dokumentiert sind.

## Fix-Slices

Fehler aus einem Livetest bekommen **keinen Sammel-Fix irgendwann später**.

Beispiel:

```text
Slice 4.2 implementieren
        ↓
merge
        ↓
Livetest
        ↓
Fehler
        ↓
Slice 4.2-FIX-1
        ↓
merge
        ↓
erneuter Livetest
        ↓
bestanden
        ↓
Slice 4.3
```

---

# 2. Zielarchitektur

```text
Adventure Land Server
        │
        ▼
┌────────────────────────────┐
│       Character Core       │
│ Transport / Live State     │
│ Script Runtime             │
│ Scheduler / Action Gateway │
│ Navigation / Recovery      │
└─────────────┬──────────────┘
              │
       Event / State Bus
              │
      ┌───────┼───────────────┐
      │       │               │
      ▼       ▼               ▼
 Headless   Browser       Dashboard
            Renderer      Local Web UI
              │
              ▼
        ALHD Asset Layer
```

Ein Character existiert logisch nur einmal. Renderer und Bedienoberflächen werden daran angekoppelt.

---

# 3. Slices

## Slice 0.1 – Repository-Basis + Release-/Installer-Grundlage

**Status: VERIFIED**

### Inhalt

- TypeScript-/Node-Projekt initialisieren
- klare Verzeichnisstruktur:
  - `core/`
  - `runtime/`
  - `dashboard/`
  - `renderer/`
  - `packages/`
  - `installer/`
  - `updater/`
  - `tests/`
- Build
- Lint
- Format
- Test-Runner
- semantische Versionsinformation
- zentrale Konfiguration
- CI-Grundlage
- reproduzierbarer Windows- und Linux-Build
- erster echter Installer-Build für Windows und Linux statt ZIP-/Copy-only-Verteilung
- **English-only User Interface Contract** als Test-/Review-Regel

### Installer-Mindestumfang ab dem ersten Testbuild

- Windows und Linux werden ab Slice 0.1 gleichwertig unterstützt
- Installationspfad auf beiden Systemen frei auswählbar
- sinnvoller Standardpfad vorgeschlagen
- Startmenü-Eintrag
- optionaler Desktop-Shortcut
- sauberer Uninstaller
- Programmdateien und veränderliche Benutzerdaten getrennt
- bestehende Benutzerkonfiguration bei Upgrade nicht überschreiben
- keine separate Node.js-Installation durch den Endbenutzer erforderlich

### Test

- Windows-Installer auf sauberer Windows-Umgebung
- Linux-Installer auf sauberer Linux-Umgebung
- Installation in Standardpfad auf beiden Systemen
- Installation in frei gewählten benutzerdefinierten Pfad auf beiden Systemen
- Programm auf beiden Systemen starten/stoppen
- auf beiden Systemen deinstallieren
- CI baut und testet beide Installer
- Build und Tests
- prüfen, dass alle sichtbaren Installer-Texte Englisch sind

### Freigabe

Erst nach Benutzer-Livetest → Slice 0.2.

---

## Slice 0.2 – Cross-Platform Installer-Upgradepfad und Versionsmodell

**Status: VERIFIED**

### Inhalt

- Upgrade über eine bereits installierte Version auf Windows und Linux
- eindeutige App-Version
- Release Channel zunächst `stable`
- lokale installierte Version abrufbar
- Update-/Installer-Metadatenformat
- atomare Upgrade-Strategie
- Rollback-/Fehlerpfad vorbereiten
- Benutzerdaten, Scripts, Dashboard-Layouts und Konfiguration beim Upgrade erhalten
- Installer- und Upgrade-Ereignisse strukturiert loggen

### Test

- Version A installieren
- Version B darüber installieren
- alternativen Installationspfad beibehalten
- Benutzerdaten unverändert prüfen
- Deinstallation separat prüfen

### Freigabe

Erst nach Benutzer-Livetest → Slice 0.3.

---

## Slice 0.3 – Logging-Core und Secret-Sanitizer

**Status: VERIFIED**

**Dieser Slice kommt absichtlich sehr früh.**

### Inhalt

Zentraler strukturierter Logger mit:

- Timestamp
- Level
- Component
- Character-ID, wenn vorhanden
- Session-/Request-Korrelation
- strukturierte Context-Daten
- Ringbuffer
- Log-Rotation
- Secret-Sanitizer
- Fehler-/Stacktrace-Unterstützung
- benutzerseitige Logtexte auf Englisch

Log-Level:

- TRACE
- DEBUG
- INFO
- WARN
- ERROR
- FATAL

### Test

Testdaten mit absichtlich eingebetteten:

- Tokens
- Passwörtern
- Session-Secrets
- Cookies
- Authorization-Headern

Im ausgegebenen Diagnose-Log dürfen sie nicht lesbar sein.

### Freigabe

Erst nach Benutzer-Livetest → Slice 0.4.

---

## Slice 0.4 – Minimales lokales Dashboard + Debug-Konsole

**Status: VERIFIED**

### Inhalt

Lokales Dashboard mit zunächst nur englischen UI-Texten:

- Core status
- Client version
- Uptime
- Debug Console
- Live log stream
- Level filter
- Search
- Auto-scroll
- Pause
- **“Copy full log”**
- **“Copy filtered log”**
- **“Download log”**
- **“Clear log”**

### “Copy full log”

Der Button kopiert den vollständigen aktuell gehaltenen Diagnose-Log nach Secret-Sanitizing in die Zwischenablage.

Zusätzlich zeigt der Client auf Englisch:

- copy succeeded/failed
- number of copied log lines
- covered time range
- client version
- platform
- confirmation that secrets were sanitized

### Test

Der Benutzer erzeugt Testlogs und schickt einmal den kopierten Gesamtlauf zurück. Damit wird der Diagnoseweg selbst validiert.

### Freigabe

Ab diesem Slice ist die Debug-Konsole Teil **jedes** folgenden Livetests.

---

## Slice 0.5 – Automatische Update-Erkennung + Update-Banner

**Status: VERIFIED**

### Inhalt

- automatische Prüfung auf neue ALRemastered-Versionen beim Programmstart
- erneute periodische Prüfung während langer Laufzeit
- manuelle Aktion **“Check for updates”**
- Release-Metadaten mit Version, Veröffentlichungsdatum, Download, Integritätsdaten und Release Notes
- klar sichtbares persistentes Update-Banner, wenn eine neuere Version verfügbar ist
- aktuelle und neue Versionsnummer anzeigen
- optional Release Notes öffnen
- exakt diese primären Benutzeraktionen:
  - **“Install update”**
  - **“Skip this version”**
  - **“Remind me tomorrow”**
- **“Skip this version”** speichert exakt die übersprungene Version
- **“Remind me tomorrow”** setzt einen 24-Stunden-Snooze für diese Version
- eine neuere als die übersprungene/verschobene Version hebt die alte Entscheidung auf
- keine automatische Installation ohne Benutzeraktion
- Downloadfortschritt sichtbar
- Integrität/Signatur vor Installation prüfen
- Updatefehler landen strukturiert in der Debug-Konsole

### Update-Ablauf

```text
New version available
        ↓
prominent update banner
        ↓
┌──────────────────────┬──────────────────────┬────────────────────────┐
│ Install update       │ Skip this version    │ Remind me tomorrow     │
└──────────────────────┴──────────────────────┴────────────────────────┘
```

### Test

Mindestens:
- Bootstrap-Test: erste updater-fähige Version einmal manuell installieren, danach nächste reine Testversion vollständig über den In-Client-Updater erkennen und installieren

- keine neue Version
- neue Version vorhanden
- “Skip this version”
- danach höhere Version verfügbar
- “Remind me tomorrow”
- 24h-Snooze
- Downloadfehler
- Integritätsfehler
- erfolgreicher Updatepfad

### Freigabe

Erst nach Benutzer-Livetest → Slice 0.6.

---

## Slice 0.6 – Diagnose-Grundlage

**Status: VERIFIED**

### Inhalt

- verständliche englische Fehlermeldungen
- technisches Detailpanel
- letzte Fehler hervorheben
- Health-Status pro Komponente
- Diagnose-Snapshot
- optionales Diagnosepaket
- **“Copy full log”** direkt von Fehlerkarten aus

### Test

Gezielt mehrere künstliche Fehler erzeugen und prüfen, ob sie sowohl verständlich als auch technisch vollständig geloggt werden.

---

# Phase 1 – Adventure-Land-Daten ohne Character-Verbindung

## Slice 1.1 – Game-Version-Erkennung

**Status: VERIFIED**

> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.12`. Production `data.js` / `G.version` reported `17397`, the dashboard showed game version `17397` as `Current`, and `game-version` diagnostics were healthy.

- aktuelle Adventure-Land-Version erkennen
- lokale Version speichern
- Versionsabweichung erkennen
- Status im Dashboard anzeigen
- passende Logs

### Livetest

Onlineprüfung gegen Adventure Land und Logkontrolle.

---

## Slice 1.2 – Game-Daten laden

**Status: VERIFIED**

> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.12`. All 14 data families loaded from production `data.js` at version `17397`; `game-data` and `game-version` diagnostics were both healthy, reload succeeded, and no recent errors were reported.

Zentral verfügbar machen:

- `G.items`
- `G.monsters`
- `G.maps`
- `G.geometry`
- `G.skills`
- `G.classes`
- `G.npcs`
- relevante Drops/Recipes/Conditions

### Test

Dashboard-Diagnose zeigt Anzahl und Ladezustand der Datenfamilien.

---

## Slice 1.3 – Game-Daten-Cache

**Status: VERIFIED**

> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.13`. Online load, cache restore after restart, offline cache fallback, live reload recovery, corrupted-cache rejection/replacement, dashboard cache state and Debug Console logging all passed the live test.

- persistenter Cache
- Cache-Version
- Invalidierung bei Update
- atomarer Austausch
- Fallback bei beschädigtem Cache

### Livetest

Start online, Neustart mit Cache, simuliert beschädigten Cache testen.

---

# Phase 2 – Account und Single-Character Headless

## Slice 2.1 – Account-Verbindungsgrundlage

**Status: VERIFIED**

> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.14`. Real-account connect, disconnect and reconnect all succeeded. The diagnostic export confirmed secrets sanitized, with no password or Adventure Land auth/session token exposed in the log.

- sichere Account-/Session-Anbindung
- keine Secrets im Log
- Verbindungsstatus im Dashboard
- explizite Fehlerzustände

### Livetest

Login/Verbindung auf echtem Account.

---

## Slice 2.2 – Character-Liste und Serverauswahl

**Status: VERIFIED**

> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.15`. The live account loaded 8 characters and 13 servers, refresh succeeded, server selection was exercised repeatedly across EU I/II, and every selection confirmed `characterStarted:false`. The same live run also confirmed automatic post-update restart into `0.1.0-alpha.15`.

- Charaktere anzeigen
- Klasse/Level, soweit verfügbar
- Serverliste
- Server wählen
- noch **keinen** Character starten

### Livetest

Abgleich Dashboard ↔ tatsächlicher Account.

---

## Slice 2.3 – Erster Headless-Character-Connect

**Status: VERIFIED**

> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.17`. A real merchant character connected headlessly to EU II and disconnected cleanly from the dashboard. Start, connected and disconnect diagnostics all retained the same canonical `CH_…` character ID, confirmed `automation:false`, and the diagnostic export remained sanitized. This re-test also verified the stable-character-ID fix introduced after the alpha.16 live test.

- exakt einen Character starten
- Socket/Transport
- Disconnect
- kontrolliertes Stoppen
- keine Automation

### Livetest

Character verbinden, einige Minuten stehen lassen, stoppen; bei Problemen Gesamten Log kopieren.

---

## Slice 2.4 – Basis-Live-State

**Status: VERIFIED**

> 2026-10-02: Base live state merged in `0.1.0-alpha.18`. The headless character API/dashboard now exposes HP/MP, level/XP, map, position, direction, target, death state, and measured server ping from read-only Adventure Land events. Automated Windows/Linux CI passed. Real-account live validation is still required before VERIFIED.
>
> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.18`. A real ranger character connected headlessly to EU II for almost three minutes and disconnected cleanly from the dashboard. Live diagnostics retained the canonical `CH_…` character ID, showed HP changing from 4182 to 4135 while level/XP/map/position/death state remained coherent, measured 12 ms server ping, confirmed `automation:false`, and reported `Secrets sanitized: yes`. Target was unset and no direction value was emitted by the server during this stationary live run; both target transitions and direction updates from `player`/`new_map` events are covered by the passing automated transport tests.

- HP / MP
- Level / XP
- Map
- Position
- Richtung
- Target
- Death State
- Verbindung/Ping

### Livetest

Werte mit normalem Spielzustand vergleichen.

---

## Slice 2.5 – Inventory und Equipment State

**Status: VERIFIED**

> 2026-10-02: Read-only inventory, equipment, gold, and active-condition state merged for `0.1.0-alpha.19`. Initial state is read from Adventure Land `start` data and refreshed through `player` updates; trade listing slots are excluded from equipment. Automated Windows/Linux CI and alpha.18 → alpha.19 installer upgrade smokes passed. Real-account item/state validation is still required before VERIFIED.

> 2026-10-02: VERIFIED on Windows with `0.1.0-alpha.19`. The live test connected the same canonical `CH_…` character twice on EU II with `automation:false` throughout. Read-only inventory/equipment state reflected the official-game changes between sessions (inventory used 25 → 27; equipment used 11 → 9), while gold and active conditions were exposed in both snapshots. Controlled disconnects succeeded, ping was measured, and the diagnostic export reported `Secrets sanitized: yes`.

- Inventory
- Equipment
- Gold
- Conditions

### Livetest

Items im offiziellen Spiel verändern und State-Abgleich prüfen.

---

## Slice 2.6 – Entities und Party State

**Status: VERIFIED**

> 2026-10-02: Read-only nearby entity and party state merged for `0.1.0-alpha.20`. The headless character state consumes the server's embedded `start.entities` snapshot plus live `entities`, `disappear`, `death`, and `party_update` events, distinguishes nearby players/monsters and server-reported types, clears stale entities on map changes, and exposes party leader/member details without gameplay actions. Automated Windows/Linux CI and alpha.19 → alpha.20 installer upgrade smokes passed. Real-account movement/entity/party validation is still required before VERIFIED.

> 2026-10-03: VERIFIED on Windows with `0.1.0-alpha.20`. The same canonical `CH_…` merchant connected headlessly on EU II with `automation:false`; the initial embedded entity snapshot was present immediately, live entity counts changed continuously, and a real movement/reconnect test changed position from about `(-1262.7, -195.8)` to `(-1091.5, 859.5)` while the visible world changed from crab/squig-type mobs to a distinct 12-type set including frog, kitty, puppy, squig/squigtoad, and tortoise. Controlled disconnects and ping measurement succeeded, and the diagnostic export reported `Secrets sanitized: yes`. A separate real-account party-members snapshot cannot be reproduced in this read-only slice because Adventure Land removes the character from its party when that character logs out before the headless connection; therefore the server `party_update` member/leader path is accepted from the passing automated transport tests, which cover leader/member parsing and party-state retention.

- Entities in relevanter Umgebung
- Monster/Player-Typen
- Party-State

### Livetest

Bewegen/Party betreten und Logs/State vergleichen.

---

# Phase 3 – Character-Steuerung

## Slice 3.1 – Action Gateway

**Status: VERIFIED**

> 2026-10-03: Central Action Gateway merged for `0.1.0-alpha.21`. Every gateway request receives a correlation/request ID and origin, passes a per-action rate guard, runs with a bounded timeout/AbortSignal, returns a structured success/error/timeout/rate-limited result, and is logged through the existing sanitizer without arbitrary action input. The dashboard exposes only a fixed local-only gateway probe for live validation; no move/xmove/attack/skill/loot/item/party gameplay command exists yet. Automated Windows/Linux CI and alpha.20 → alpha.21 installer upgrade smokes passed. Installed-client gateway-probe validation is still required before VERIFIED.

> 2026-10-03: VERIFIED on Windows with `0.1.0-alpha.21`. The installed client restarted automatically after update and the diagnostic export reported `Secrets sanitized: yes`. Three local-only `gateway.probe` requests completed successfully with unique `act-…` request IDs, `origin:"dashboard"`, the configured 1000 ms timeout/rate interval, and correlated start/completion log records. Rapid repeated probes exercised the live rate guard four times with `outcome:"rate_limited"`, `errorCode:"ACTION_RATE_LIMITED"`, and concrete `retryAfterMs` values (844, 49, 173, and 39 ms). No Adventure Land gameplay action was emitted by the probe.

Zentrale Schicht für alle spielverändernden Aktionen:

- Request ID
- Ursprung
- Rate Guard
- Timeout
- Ergebnis
- Fehler
- Logging

Noch keine komplexe Botlogik.

---

## Slice 3.2 – Move / XMove

**Status: VERIFIED**

> 2026-10-03: Slice 3.2 merged via PR #46 for release target `0.1.0-alpha.22`. The dashboard now exposes only fixed 32-unit Move/XMove test steps. Every gameplay mutation runs through the central Action Gateway with request ID, dashboard origin, character ID, shared movement rate guard, timeout, structured outcome, and sanitized correlated logging. Direct movement is validated against the loaded Adventure Land map geometry before the official `move` socket packet is emitted with current position and movement sequence. Blocked Move requests are rejected before transport; XMove executes the direct path only and returns `XMOVE_PATH_REQUIRED` rather than silently introducing the later smart/pathfinding navigation stack.
>
> Automated evidence on the exact PR #46 head `bbc3ef8e7e72190a31e16a65095df41b870cacbb`: Ubuntu verify success, Windows verify success, Linux alpha.21 → alpha.22 installer upgrade smoke success, and Windows alpha.21 → alpha.22 installer upgrade smoke success. Unit/transport/dashboard tests cover the movement packet, collision rejection, missing state/geometry, dead-character rejection, shared rate limiting, fixed dashboard input validation, and absence of an arbitrary action endpoint.
>
> Real-account movement through the installed dashboard is still required. Do not mark this slice VERIFIED until the user supplies the live evidence recorded in `LIVE_TEST_QUEUE.md`.

>
> 2026-10-03 live evidence: the first installed-client Slice 3.2 attempt on Windows `0.1.0-alpha.22` FAILED as designed by the stop conditions. Dashboard request `act-52ffce2f-9b0f-47fd-b11d-e984384e34b4` completed as `character.move` / `origin:"dashboard"` with gateway `outcome:"success"` after 3 ms, but the real character remained at `(-1272.1555957426249, -32.26522650442442)` throughout the captured post-request live state. The diagnostic export reported `Secrets sanitized: yes`. XMove was intentionally not tested after this failure.
>
> PR #52 fixes the false-success path for correction release `0.1.0-alpha.25`: `new_map.m` now refreshes the Adventure Land movement sequence, movement completion requires observed server-state position progress toward the requested target, and missing confirmation is surfaced as `MOVE_NOT_CONFIRMED` rather than success. Automated evidence on exact PR #52 head `5e0c995930bb7e7e0024145aea36d823146ecd17`: Ubuntu verify success, Windows verify success, Linux alpha.24 → alpha.25 installer upgrade smoke success, and Windows alpha.24 → alpha.25 installer upgrade smoke success (CI run `37106293803`). Slice 3.2 remains AWAITING USER TEST and must be retested on the corrected release before proceeding to Slice 3.3.
>
> 2026-10-03 alpha.25 retest: the client updated and restarted automatically into `0.1.0-alpha.25`, and the diagnostic export remained sanitized. Four bounded dashboard `character.move` requests were attempted; all correctly returned `MOVE_NOT_CONFIRMED` instead of the earlier false success, while the observed live position stayed at `(-1272.1555957426249, -64.26522650442442)`. No XMove was attempted. This proves the false-success guard works but does not yet verify real movement.
>
> PR #54 targets correction release `0.1.0-alpha.26`: Adventure Land entity snapshots now retain `moving`, `going_x`, `going_y`, and `move_num`; the character connection can issue the official read-only `send_updates` event; and each bounded movement request asks for authoritative snapshots immediately and after 250/650/1000 ms while still requiring real positional progress before success. Automated evidence on exact PR #54 head `dae297e8be7c0c2f9f6901851092e3a69f5a617c`: Ubuntu verify success, Windows verify success, Linux alpha.25 → alpha.26 installer upgrade smoke success, and Windows alpha.25 → alpha.26 installer upgrade smoke success (CI run `37107581171`). Slice 3.2 remains AWAITING USER TEST and must be retested on alpha.26 before Slice 3.3 begins.
>
> 2026-10-03 alpha.26 retest: the updater restarted successfully into `0.1.0-alpha.26` and the diagnostic export remained sanitized. Four bounded dashboard `character.move` requests (`act-09673a4b-7724-479c-b8db-edc833878f7a`, `act-78720058-9a10-4ec0-be85-2dd5b401d129`, `act-ad8e9159-d1be-41dc-93ad-48eb6965c770`, `act-85e4dacb-ca13-4ddd-bd49-7e784b98bdc3`) all completed with `origin:"dashboard"` and `outcome:"success"` after authoritative server observation, but the canonical character state exposed to the dashboard/log remained at `(-1225.4472875234312, -42.474173958785244)`. XMove was not tested. This proves server-side movement observation is working while canonical character-state synchronization is still incomplete.
>
> PR #56 targets `0.1.0-alpha.27`: the authenticated player's Adventure Land entity snapshot now feeds authoritative position changes back into the canonical connected-character state, with regression coverage that requires `liveState.character.x/y` to update from the own-player entity. The same PR also migrates Linux CI from deprecated `ubuntu-22.04` to pinned `ubuntu-24.04`; after the 22.04 jobs remained queued without a runner or steps, the corresponding 24.04 verify and installer jobs started immediately and passed. Exact PR #56 head `d485507f71a8b2bfca7342c054a0eb679ff70609`, CI run `37109436866`: Ubuntu 24.04 verify success, Windows verify success, Linux alpha.26 → alpha.27 installer upgrade smoke success, Windows alpha.26 → alpha.27 installer upgrade smoke success. Slice 3.2 remains AWAITING USER TEST and must be retested on alpha.27 before Slice 3.3 begins.
>
> 2026-10-03 alpha.27 retest: updater restart into `0.1.0-alpha.27` succeeded and the diagnostic export remained sanitized. After the headless character connected, one bounded dashboard Move request `act-79e98b75-ef51-402f-9d88-c5077035cb48` completed as `character.move` / `origin:"dashboard"` / `outcome:"success"` in 281 ms. Canonical position advanced from `(-1193.4472875234312, -42.474173958785244)` through `y=-30.26117455512309` to the exact 32-unit target `y=-10.474173958785244`, proving canonical movement synchronization now works. A later in-flight own-player entity snapshot then rolled canonical y back to `-30.26117455512309` and it remained there through the end of the captured log. XMove was intentionally not tested.
>
> PR #58 targets `0.1.0-alpha.28`: own-player entity movement snapshots remain available to confirm live movement, but `moving:true` snapshots no longer overwrite canonical `character.x/y`; direct player updates and non-moving entity snapshots may still advance canonical position. Regression coverage reproduces start → intermediate → target → late-intermediate ordering and requires the late moving snapshot not to roll back the target. Exact PR #58 head `feb36d4c2fb45284b1065896f81e85582d388be8`, CI run `37110673856`: Ubuntu 24.04 verify success, Windows verify success, Linux alpha.27 → alpha.28 installer upgrade smoke success, Windows alpha.27 → alpha.28 installer upgrade smoke success. Slice 3.2 remains AWAITING USER TEST and must be retested on alpha.28 before direct-path XMove or Slice 3.3.

> 2026-10-03 alpha.28 verification: the installed Windows client updated and restarted automatically into `0.1.0-alpha.28`, and the diagnostic export reported `Secrets sanitized: yes`. One bounded dashboard Move request `act-7a255dec-8779-49a2-8890-4e0b89dd56d7` completed as `character.move` / `origin:"dashboard"` / `outcome:"success"` in 334 ms and moved canonical position from `(168, -134)` to `(168, -102)`, exactly 32 units, with no later rollback in the captured log. After Move passed, one direct-path dashboard XMove request `act-4abd98ad-837b-4f10-9c77-0233e65c2488` completed as `character.xmove` / `origin:"dashboard"` / `outcome:"success"` in 329 ms and moved canonical position from `(168, -102)` through the observed intermediate `y=-82.01300097592767` to the exact 32-unit target `(168, -70)`. No rollback, autonomous movement, unexpected map change, crash, or disconnect was observed in the supplied log. Slice 3.2 is therefore VERIFIED on the corrected release; Slice 3.3 may now begin in ROADMAP order.
>
- einfache Bewegung
- Validierung
- Action-Logging

### Livetest

Bewegung ausschließlich über Dashboard-Testkontrollen.

---

## Slice 3.3 – Attack

**Status: MERGED – AWAITING USER TEST**

> 2026-10-03: Slice 3.3 merged via PR #48 for release target `0.1.0-alpha.23`. The dashboard exposes a bounded manual attack test that accepts only a currently visible monster from the live entity state. Before mutation the action layer validates connected/dead state, target visibility, target liveness, map consistency, live coordinates, character range, local attack cooldown, and the central Action Gateway rate guard. The transport emits the official `attack` socket event with the selected monster ID and waits for Adventure Land's correlated `game_response` with `place:"attack"` before the gateway request completes. Server cooldown failures propagate as structured `ATTACK_COOLDOWN` results with `retryAfterMs`; range, disabled, missing-target, timeout, and generic rejection paths remain explicit and logged.
>
> Automated evidence on the exact PR #48 head `eb88e52c77314219147ea1bb99413271218f9593`: Ubuntu verify success, Windows verify success, Linux alpha.22 → alpha.23 installer upgrade smoke success, and Windows alpha.22 → alpha.23 installer upgrade smoke success. Tests cover numeric monster IDs, visible-target validation, range rejection, dead character/target guards, local and server cooldown handling, one-pending-attack transport protection, correlated server acceptance/rejection, dashboard input restrictions, and continued absence of an arbitrary action endpoint.
>
> Real-account combat through the installed dashboard is still required. Do not mark this slice VERIFIED until the user supplies the live evidence recorded in `LIVE_TEST_QUEUE.md`.

- Target
- Range-Prüfung
- Attack
- Cooldown-/Result-Logging

### Livetest

Ein ausgewähltes Monster manuell über Testaktion angreifen.

---

## Slice 3.4 – Skills

**Status: MERGED – AWAITING USER TEST**

> 2026-10-03: Slice 3.4 merged via PR #50 for release target `0.1.0-alpha.24`. The dashboard now exposes a bounded manual skill test sourced from the currently loaded Adventure Land `G.skills` data. Only simple non-hostile skill payloads with official `{name}` or `{name,id}` shapes are allowed. Hostile, movement, item-consuming, multi-target, passive, special-argument, global, unsupported target-shape, and other risky skill forms are excluded from the Slice 3.4 dashboard surface.
>
> The action layer validates connected/dead state, character class and level, MP, visible target type/range when required, local skill cooldown, and the central Action Gateway rate guard before mutation. The transport emits the official `skill` socket event, tracks matching `skill_timeout` cooldowns, permits only one pending skill request at a time, and completes only after the matching Adventure Land `game_response`.
>
> Automated evidence on the exact PR #50 head `ee5be11d64b65ff9f6ed16c88ab63c97ef9a9da7`: Ubuntu verify success, Windows verify success, Linux alpha.23 → alpha.24 installer upgrade smoke success, and Windows alpha.23 → alpha.24 installer upgrade smoke success (CI run `37103723486`). Tests cover safe skill discovery, class filtering, no-target and targeted skill payloads, visible-target/range checks, MP/dead-state rejection, local/server cooldown retry hints, gateway rate limiting, correlated transport completion, and the fixed dashboard skill routes.
>
> Real-account skill execution through the installed dashboard is still required. Do not mark this slice VERIFIED until the user supplies the live evidence recorded in `LIVE_TEST_QUEUE.md`.

- Skill-Aufruf
- Target
- Cooldowns
- Fehlerzustände

### Livetest

Unkritische Skills kontrolliert testen.

---

## Slice 3.5 – Loot und Consumables

**Status: MERGED – AWAITING USER TEST**

> 2026-10-03: Slice 3.5 merged via PR #63 and is published as prerelease `v0.1.0-alpha.29`. The installed dashboard surface is intentionally bounded: it exposes only currently visible loot chests and exact inventory slots validated from current Adventure Land game data as single-resource HP or MP consumables. There is no auto-loot loop, auto-potion loop, free-form item ID, arbitrary socket payload, or generic action endpoint.
>
> The loot path tracks real `drop` events, emits the official `open_chest {id}` request for the selected currently visible chest, and completes only from the matching `chest_opened` server event. The consumable path re-validates the selected inventory slot immediately before mutation, emits the official `equip {num, consume:true}` request, and completes only from Adventure Land `game_response` with `place:"equip"`. Connected/dead state, resource-full state, item identity/type, potion cooldown, and the central Action Gateway rate guard are checked before mutation.
>
> Automated feature evidence: PR #63 head `9f759f89f819c5c0438986854e534c19b514456c` passed Ubuntu verify, Windows verify, Linux alpha.28 → alpha.29 installer upgrade smoke, and Windows alpha.28 → alpha.29 installer upgrade smoke in CI run `37114998556`. Exact post-merge main `cc662cc205349f6ece311bfa8bd0d61b89b7148b` also passed 4/4 in run `37115143310`.
>
> Release infrastructure was separately corrected in PR #64 so the publish workflow uses `ubuntu-24.04` instead of the obsolete `ubuntu-22.04` runner. PR #64 and exact post-merge main `bfdfa7cd48eeaccf2a2901990476064777c35d3b` both passed 4/4 CI. Publish run `37115894376` completed Linux, Windows, and release jobs successfully; `v0.1.0-alpha.29` targets that exact main SHA and contains the Linux installer, Windows installer, and update manifest.
>
> Real installed-client evidence for both one consumable use and one visible-chest loot remains required. Do not mark Slice 3.5 VERIFIED until the user supplies the complete sanitized diagnostic evidence defined in `LIVE_TEST_QUEUE.md`.

- Loot
- HP-/MP-Items
- sichere Actions

### Livetest

Kurzer manueller Farmtest.

---

# Phase 4 – Script Runtime

## Slice 4.1 – Isolierte Script Runtime

- Script laden
- starten
- pausieren
- stoppen
- Crash-Isolation
- Timer-Lifecycle
- Script Logs separat markiert

---

## Slice 4.2 – Adventure-Land Kern-API

Erste kompatible APIs:

- `character`
- `G`
- Entities
- `get_nearest_monster()`
- `is_in_range()`
- `can_attack()`
- `move()`
- `xmove()`
- `attack()`
- `loot()`

### Livetest

Minimaler Farmer gegen ein ungefährliches Ziel.

---

## Slice 4.3 – Event API

- relevante Game Events
- Script Listener
- Listener Cleanup
- Event-Logging

---

## Slice 4.4 – Storage und Script State

- lokaler Script-Speicher
- sichere Namespaces
- Persistenz über Restart

---

## Slice 4.5 – Simple Farmer Template

Erste offizielle anfängerfreundliche Vorlage.

Konfigurierbar ohne Code:

- Monster
- HP-Schwelle
- MP-Schwelle
- Loot
- Respawn

### Livetest

Erster echter automatisierter Farmtest.

---

# Phase 5 – Recovery und stabiler Dauerbetrieb

## Slice 5.1 – Heartbeats

- Core
- Character
- Script

---

## Slice 5.2 – Disconnect / Reconnect

- sauber erkennen
- Backoff
- Reconnect
- Log-Sequenz vollständig nachvollziehbar

### Livetest

Verbindung gezielt unterbrechen.

---

## Slice 5.3 – Character Death / Respawn

- Death State
- Respawn
- Script-Weiterlauf kontrolliert

---

## Slice 5.4 – Watchdog und Restart-Schutz

- Hänger erkennen
- kontrollierter Restart
- Restart-Budget
- keine Endlosschleifen

---

# Phase 6 – Navigation

## Slice 6.1 – Map-/Geometry-Modell

- Maps
- Grenzen
- Türen/Transitions
- Collision-relevante Geometrie

---

## Slice 6.2 – einfacher Path Planner

- erreichbare Route
- Wegpunkte
- Diagnose der geplanten Route

---

## Slice 6.3 – Smart-Move-Kompatibilität

- erste `smart_move()`-kompatible API
- klare Fehlergründe

---

## Slice 6.4 – Movement Trail und geplante Route im Dashboard

- tatsächlicher Movement-Trail
- geplante Route
- Debuganzeige

---

# Phase 7 – Mehrere Charaktere und Party

## Slice 7.1 – Multi-Character Session Manager

- mehrere Character Sessions
- isolierte Fehler
- gemeinsame statische Daten
- Character-Limits respektieren

---

## Slice 7.2 – Local Character Messaging

- lokale schnelle Kommunikation
- kompatible `send_cm()`-Abstraktion

---

## Slice 7.3 – Party Coordinator

- Rollen
- gemeinsames Target
- Tank / Healer / DPS Status

---

## Slice 7.4 – Party Templates

- Warrior Tank
- Priest Healer
- DPS
- einfache Rollenzuweisung

---

# Phase 8 – Anfänger-Dashboard

## Slice 8.1 – Character Cards

- Start
- Pause
- Stop
- HP/MP
- Map
- Target
- Script
- Health

---

## Slice 8.2 – Setup Wizard

Alle sichtbaren Texte Englisch.

1. Account
2. Character
3. Server
4. Task / Template
5. Configuration
6. Start

---

## Slice 8.3 – Config UI für Templates

Scripts benötigen für normale Einstellungen keine Codeänderung.

---

## Slice 8.4 – „Warum macht der Bot das?“

Anzeige:

- aktuelles Ziel
- Auswahlgrund
- verworfene Ziele
- Range
- Cooldowns
- Movement-Ziel
- nächste Aktion
- Strategy
- Sperrgründe

---

# Phase 9 – Frei gestaltbares Dashboard

## Slice 9.1 – Dashboard Edit Mode

- **“Edit dashboard”**
- Drag & Drop
- Resize
- Raster/Snapping
- Widgets hinzufügen/entfernen

---

## Slice 9.2 – Widget-Konfiguration

- Character wählen
- Felder anzeigen/verbergen
- Darstellungsoptionen
- Widget duplizieren

---

## Slice 9.3 – Seiten und Tabs

Beispiele:

- Übersicht
- Combat
- Party
- Merchant
- Logs
- Debugging

---

## Slice 9.4 – Layout-Persistenz und Profile

- speichern
- Undo/Redo
- Reset
- mehrere Profile
- Desktop-/kleine Bildschirmprofile

---

## Slice 9.5 – Dashboard Import/Export

- exportierbares Layout
- importierbares Layout
- Rollen-Mapping statt fester Charakternamen

---

# Phase 10 – Headless ↔ Browser

## Slice 10.1 – Renderer Bridge

Core liefert State/Event-Stream an einen separaten Renderer.

---

## Slice 10.2 – Browser-Ansicht ohne Bot-Neustart

- Browser öffnen
- aktuellen Character-State darstellen
- Browser schließen
- Core läuft unverändert weiter

### Abnahme

Kein Script-/Character-Neustart durch Öffnen oder Schließen des Renderers.

---

## Slice 10.3 – Control Modes

- AUTOMATIK
- ASSIST
- MANUELL

User-Aktionen laufen ebenfalls durch das Action Gateway.

---

## Slice 10.4 – Headless ↔ Browser Live-Wechsel

- Renderer dynamisch an-/abkoppeln
- Scripts laufen weiter
- Socket bleibt wenn technisch möglich bestehen

Falls eine echte öffentliche Adventure-Land-Browserübernahme später technisch einen Reconnect verlangt, erfolgt ein **Soft Handoff**, nicht ein Neustart des Botprozesses.

---

# Phase 11 – Adventure Land HD

Quelle:

`Riflex91/Riflex91-Repo/Adventure Land HD`

## Slice 11.1 – ALHD Asset Provider

- vorhandene ALHD-Manifeste lesen
- presentation-only
- originale Spielsemantik unverändert
- Original-Fallback

---

## Slice 11.2 – GPU-/Texture Guard

Vorhandene ALHD-Schutzlogik integrieren:

- WebGL `MAX_TEXTURE_SIZE`
- HD blockieren, wenn Hardware ungeeignet
- Original automatisch verwenden
- Diagnose über Dashboard

---

## Slice 11.3 – HD Browser Default

Browser-Modus:

- bevorzugt HD
- Headless lädt keine HD-Assets
- Status:
  - available
  - applied
  - missing
  - blocked
  - texture limit

---

## Slice 11.4 – Grafikprofile

- Original
- HD Performance
- HD Auto
- HD Maximum

Renderer darf bei Grafikprofilwechsel neu initialisiert werden; Character Core und Scripts laufen weiter.

---

# Phase 12 – Script-Pakete und Community-Austausch

## Slice 12.1 – Paketformat

Eigenes Paketformat mit:

- Manifest
- Scripts
- Config Schema
- README
- Version
- Autor
- Kompatibilität
- Berechtigungen
- Hashes

---

## Slice 12.2 – Permission System

Mindestens:

- combat
- movement
- inventory.read
- inventory.use
- inventory.sell
- inventory.destroy
- trade
- gold.send
- item.send
- bank
- merchant
- character.communication
- storage
- network.external

Gefährliche Rechte sind standardmäßig nicht erlaubt.

---

## Slice 12.3 – Paket-Datei importieren

- Vorschau
- Beschreibung
- Rechte
- Konfiguration
- Code anzeigen
- importieren

---

## Slice 12.4 – Link-/GitHub-Import

Ein Benutzer kann einen freigegebenen Paket-Link oder unterstützte GitHub-Quelle einfügen.

Keine fremde ausführbare Logik wird vor Bestätigung gestartet.

---

## Slice 12.5 – Script Library

- Meine Scripts
- Importiert
- Versionen
- Aktiv/Inaktiv
- Konfiguration

---

## Slice 12.6 – Updates und Rollback

- verfügbare Version anzeigen
- Changelog
- Update
- vorherige Version wiederherstellen
- neue Permissions immer erneut bestätigen

---

# Phase 13 – Kombinierte Community Packs

## Slice 13.1 – Dashboard-Pakete

Dashboard-Layouts über dasselbe Paketsystem teilen.

---

## Slice 13.2 – Script + Dashboard Pack

Ein Paket darf enthalten:

- mehrere Scripts
- Dashboard Layout
- Rollen
- Config Schema
- Assets
- Permissions

---

## Slice 13.3 – Party Pack Wizard

Beispiel:

```text
4-Man Boss Party Pack

Tank:     [Warrior ▼]
Healer:   [Priest ▼]
DPS:      [Ranger ▼]
Merchant: [Merchant ▼]

[Set up]
```

---

# Phase 14 – Erweiterte Spielfunktionen

Diese Bereiche werden jeweils wieder in kleine Merge/Test-Slices zerlegt:

- Merchant
- Bank
- Exchange
- Buy/Sell
- Item Transfer
- Gold Transfer
- Upgrade
- Compound
- Craft
- Dismantle
- Fishing
- Mining
- Events
- Boss Automation

Für irreversible oder wirtschaftlich riskante Aktionen gelten besonders strenge Berechtigungen, Dry-Run-/Preview-Optionen und Logs.

---

# Phase 15 – Distribution, Update-Härtung und zusätzliche Paketformate

Der Windows-Installer und die Update-Erkennung existieren bereits seit Phase 0. Diese Phase härtet die inzwischen produktionsreife Distribution.

## Slice 15.1 – Windows Installer Hardening

- Upgrade über viele Versionen
- Repair-Modus, soweit sinnvoll
- saubere Deinstallation
- Installationspfadänderungen kontrolliert behandeln
- Code Signing / Vertrauenskette vorbereiten bzw. aktivieren
- Benutzerdaten niemals unbeabsichtigt löschen
- Installer-UI vollständig Englisch

---

## Slice 15.2 – Updater Hardening

- Recovery nach unterbrochenem Download
- Recovery nach fehlgeschlagenem Update
- atomarer Austausch
- Integritäts-/Signaturprüfung
- Update-Rollback
- klare englische Fehleranzeigen
- Update-Historie in Diagnoseinformationen

---

## Slice 15.3 – Zusätzliche Linux-Paketformate / Docker

Die Linux-Unterstützung selbst existiert bereits seit Slice 0.1. Hier kommen zusätzliche Distributionswege wie AppImage, .deb/.rpm, soweit sinnvoll, sowie Docker für Server-/VPS-Nutzer hinzu.

---

# Phase 16 – Performance und Langzeitstabilität

Wieder in einzeln testbare Slices zerlegen:

- CPU-Profiling
- RAM-Profiling
- Shared Game Data
- Scheduler-Tuning
- Entity-State-Deltas
- Renderer Lazy Loading
- HD Memory Budget
- Log-Retention
- 24h-Test
- 72h-Test
- Multi-Character-Stresstest

---

# 4. Debug-Log als verbindlicher Teil jedes Tests

Ab Slice 0.4 gilt bei jedem Livetest:

## Wenn alles funktioniert

Kurze Rückmeldung genügt; nächster Slice wird freigegeben.

## Wenn ein Fehler auftritt

1. Fehler möglichst nicht durch hektisches Neustarten verwischen.
2. Debug-Konsole öffnen.
3. **“Copy full log”** drücken.
4. Log vollständig zur Analyse schicken.
5. Wenn relevant kurz dazuschreiben:
   - was wurde angeklickt/getan?
   - was wurde erwartet?
   - was ist stattdessen passiert?
6. Fix-Slice erstellen.
7. Fix mergen.
8. denselben Test erneut durchführen.

Dadurch besitzt jeder Fehler einen möglichst klaren reproduzierbaren Entwicklungsstand.

---

# 5. Roadmap-Status

Verwendete Zustände:

- `PLANNED`
- `IN PROGRESS`
- `PR OPEN`
- `MERGED – AWAITING USER TEST`
- `USER TEST FAILED`
- `FIX IN PROGRESS`
- `VERIFIED`

**Nur `VERIFIED` bedeutet vollständig abgeschlossen.**

Ein Merge allein schließt einen Slice ausdrücklich **nicht** ab.

---

# 6. Sprach- und UX-Vertrag

Alle vom Benutzer sichtbaren Texte des Clients sind Englisch. Das umfasst insbesondere:

- Installer / Uninstaller
- First-run wizard
- Dashboard
- Debug Console
- Browser mode
- Character controls
- Script/package import
- Permissions
- Notifications
- update banner / update dialogs
- errors and recovery messages
- tooltips and empty states
- downloadable/copied diagnostic headers

Neue UI-Komponenten gelten als unvollständig, solange sichtbarer nicht-englischer Text enthalten ist. Automatisierte String-/Snapshot-Checks sollen offensichtliche Verstöße früh erkennen.

---

# 7. Projektziel

Ein Anfänger soll langfristig:

```text
Installieren
→ Account verbinden
→ Character auswählen
→ Vorlage auswählen
→ Start
```

können.

Ein fortgeschrittener Benutzer soll gleichzeitig:

- eigenen JS/TS-Code schreiben,
- mehrere Charaktere koordinieren,
- Navigation anpassen,
- Dashboards frei gestalten,
- Scripts/Packs teilen,
- Browser- und Headless-Modus live wechseln,
- HD-Grafiken verwenden,
- vollständige Diagnoseinformationen erhalten

können, ohne einen separaten Client benutzen zu müssen.

Die zentrale Entwicklungsregel bleibt dabei von Anfang bis Ende:

> **Build small. Merge. Test the merged build. Read the log. Only then continue.**

---

## Append-only verification record — Slice 3.3 Attack — 2026-10-03

**Canonical status update: Slice 3.3 = VERIFIED. Slice 3.4 remains MERGED – AWAITING USER TEST until this verification documentation is merged and post-merge main CI is green.**

Live environment:

- Windows client: `0.1.0-alpha.28`
- Character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- Server: EU II
- Diagnostic export: `Secrets sanitized: yes`
- alpha.28 is the installed current sequential-test build and already contains Slice 3.3; the original alpha.22 → alpha.23 release-path requirement above remains historical evidence and is not retroactively rewritten.

Guard attempt retained as failure evidence:

- Request: `act-4762192d-52bb-4b30-bf3d-6b4207200b0b`
- Action/origin: `character.attack` / `dashboard`
- Result: `ATTACK_OUT_OF_RANGE`
- Measured distance/range: `576.4 > 142.0`
- Gateway rejected in 1 ms before mutation; no server-accepted attack was claimed.

Successful live attempt:

- Exactly one manual dashboard click produced request `act-ab766aa5-32fb-46b2-b0c0-ffeccfe4e628`.
- Action/origin: `character.attack` / `dashboard`.
- Canonical character ID: `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`.
- Selected live monster: target ID `4990598`, type `goo`.
- Preflight/server-confirmed distance: `119.7`; attack range: `142`.
- Server response: `serverAccepted:true`; reported cooldown: `1045 ms`.
- Gateway completion: `outcome:"success"`, duration `15 ms`.
- The live state immediately switched target to `4990598`; XP subsequently increased from `20310734` to `20311229`.
- No second `character.attack` request followed this click through the end of the supplied log at `2026-10-03T09:21:10.153Z`.
- No autonomous combat loop, crash, disconnect, or unsanitized secret was observed in the captured window.

Result: the bounded dashboard Attack path passed the required real-user live test. The request remained correlated through Adventure Land server acceptance rather than treating socket send as success, and the prior out-of-range attempt demonstrated the range guard. **Slice 3.3 is VERIFIED.**


---

## Append-only verification record — Slice 3.4 Skills — 2026-10-03

**Canonical status update: Slice 3.4 = VERIFIED.**

Live environment:

- Windows client: `0.1.0-alpha.28`
- Character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- Server: EU II
- Diagnostic export: `Secrets sanitized: yes`
- alpha.28 is the installed current sequential-test build and contains Slice 3.4; the original alpha.23 → alpha.24 release-path requirement above remains historical evidence and is not retroactively rewritten.

Successful bounded live attempt:

- Safe dashboard skill selected by the user: `Track` / `track`.
- Displayed requirement before execution: `80 MP`, `1600 ms` cooldown.
- Exactly one manual click on **Use selected skill once** produced request `act-b17ad8fc-b150-403d-b0f8-48e3161b1708`.
- Action/origin: `character.skill` / `dashboard`.
- Canonical character ID: `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`.
- Live MP changed `868 → 788`, exactly matching the recorded `mpCost:80`.
- Adventure Land server response confirmed `skillName:"track"`, `mpCost:80`, `cooldownMs:1541`, and `serverAccepted:true`.
- Gateway completion: `outcome:"success"`, duration `88 ms`.
- The complete diagnostic log contains only the three correlated `character.skill` records for this single request (gateway start, server confirmation, gateway completion); no second skill request or hidden repeat action is present through log end `2026-10-03T09:34:51.660Z`.
- No crash, disconnect, or unsanitized secret was observed in the captured window.

Result: the bounded dashboard Skills path passed the required real-user live test with the exact selected safe skill and Adventure Land server acceptance. **Slice 3.4 is VERIFIED.**



---

## Append-only live-test correction record — Slice 3.5 Loot / Consumables — 2026-10-03

**Status remains: MERGED – AWAITING USER TEST.**

Historical alpha.29 evidence is retained:

- Windows client updated successfully to `0.1.0-alpha.29` through the dashboard and restarted automatically.
- The real account/server/headless character connection succeeded for `My_Ranger1` on EU II.
- Consumable Test A passed with exactly one `character.consume` request, request `act-27dd4e7c-94aa-4715-977e-742704091af9`, `origin:"dashboard"`, exact inventory slot 10 / `mpot0`, `serverAccepted:true`, gateway `outcome:"success"`, and live MP `833 → 1065`.
- The complete supplied alpha.29 diagnostic export reported `Secrets sanitized: yes`.

The alpha.29 manual Loot Test B workflow is **not accepted as the final user test UX**. Preparing a chest in a separate browser character session and then switching to the headless session loses that ephemeral chest observation, while asking the user to generate/position/select the chest manually violates the now-explicit one-click Livetest Bedienstandard.

Correction target: `0.1.0-alpha.30`.

The correction adds:

- ephemeral in-memory update handoff for the already connected Adventure Land session, selected server, and active headless character; no password/auth is persisted to disk and the handoff environment value is deleted immediately by the restarted client;
- one dashboard **Start test** action for Slice 3.5;
- automatic bounded safe-state preparation using the existing Action Gateway services only;
- preference for an already observed headless-session chest before any combat preparation;
- bounded safe loot preparation when no chest exists, with fresh live-state checks and no retry after an uncertain mutation;
- automatic validated HP/MP consumable selection; when necessary, a bounded non-hostile no-target skill may create an MP deficit before the one consumable use;
- terminal `PASSED`, `BLOCKED`, or `FAILED` result generation;
- automatic clipboard copy of the complete structured test result plus sanitized diagnostic export after completion;
- old individual Phase 3 controls retained only under collapsed **Developer manual controls**, not as the normal user test path.

The alpha.30 real-user retest must use only **Install update → Start test → paste the automatically copied report**. Slice 3.5 must not be marked VERIFIED until that real report is reviewed.


---

## Append-only live-test failure record — Slice 3.5 alpha.30 bootstrap handoff — 2026-10-03

**The real alpha.30 one-click test did not pass. Slice 3.5 remains unverified.**

Observed installed client:

- version: `0.1.0-alpha.30`
- platform: Windows
- test ID: `live35-6dded20e-78ce-45a8-a7e7-c4e13e87dd74`
- terminal outcome: `BLOCKED`
- error: `LIVE_TEST_CHARACTER_NOT_CONNECTED`
- stopped in `preflight` before any gameplay mutation
- diagnostic export: 10 lines, `Secrets sanitized: yes`

The post-update diagnostic log contained normal alpha.30 startup/game-data records and the one-click test start/stop records, but **no account-session restore, selected-server restore, or headless-character restore record**.

Root cause: the update source build was alpha.29. The ephemeral session-handoff implementation itself first shipped in alpha.30, so alpha.29 could not prepare the handoff environment before launching the alpha.30 installer. The already-lost in-memory auth session cannot be reconstructed after the restart because ALRemastered intentionally does not persist passwords/auth tokens.

This is a bootstrap/release-path gap, not a user-action failure.

Correction target: `0.1.0-alpha.31`.

The alpha.31 correction strengthens evidence rather than weakening credential safety:

- every `--post-update` startup logs a secret-free handoff status with `present`, `decoded`, `consumed`, and `secretPersisted:false`;
- Windows and Linux detached-updater smokes now verify that an environment value survives the source-client exit;
- the real Windows and Linux installer upgrade smokes inject a non-secret invalid handoff probe, verify that it reaches the automatically restarted client, verify `present:true`, `decoded:false`, `consumed:true`, and verify the raw probe never appears in `client.log`;
- installer smoke advances from alpha.30 to alpha.31 and keeps Linux pinned to `ubuntu-24.04`.

Because alpha.30 is the first handoff-capable installed source build, the alpha.30 → alpha.31 bridge can exercise the real source-side handoff. After that bridge, the intended normal sequential-test UX remains **Install update → Start test → paste automatically copied report**.


---

## Append-only verification record — Slice 3.5 Loot / Consumables — 2026-10-03

**Canonical status update: Slice 3.5 = VERIFIED.**

Real live environment:

- Windows client: `0.1.0-alpha.31`
- Character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- Server: EU II / `SR_EUII`
- One-click test ID: `live35-2b341b26-64cd-4cec-95d4-b2d863bf4d48`
- Test result: `passed`
- Test window: `2026-10-03T11:38:27.976Z → 2026-10-03T11:38:29.172Z`
- Complete diagnostic export: 211 structured records, `Secrets sanitized: yes`

Update/session handoff evidence:

- alpha.31 post-update startup recorded `present:true`, `decoded:true`, `consumed:true` for the ephemeral update-session handoff.
- Adventure Land account session restored from `update_handoff`.
- EU II was selected automatically.
- `My_Ranger1` was automatically reconnected headlessly.
- No password/auth value appeared in the supplied diagnostic export.

Automated bounded setup evidence:

- Exactly one unique `character.attack` request was issued by the one-click harness:
  - request `act-60b6d584-98db-4eb2-ab33-1b0eec09fcf9`
  - origin `dashboard`
  - target `5076043`, type `crab`
  - distance `39.9`, range `142`
  - `serverAccepted:true`
  - cooldown `1039 ms`
- The complete 211-record diagnostic contains only the correlated start/server-confirm/completion records for that attack request and no second attack request.

Loot evidence:

- A real live chest appeared after the bounded setup: `qBf4PJTGWHhTKbv0fsfbnTlaqGFo1l`.
- Exactly one unique `character.loot` request was issued:
  - request `act-923e6ff3-dc15-48ec-803b-f4655acdc873`
  - origin `dashboard`
  - current canonical character ID
  - map `main`
  - distance `41.5`
  - `serverAccepted:true`
  - gateway `outcome:"success"`, duration `16 ms`
- The chest was present in current headless live state before the action and absent immediately after confirmation.
- Gold changed from `1192921` to `1193098`; the harness recorded `chestGone:true`, `goldChanged:true`, `inventoryChanged:false`.
- The complete diagnostic contains only the correlated start/server-confirm/completion records for this loot request and no second loot request.

Consumable evidence:

- Exactly one unique `character.consume` request was issued:
  - request `act-46c0a7e7-1da6-4e30-8001-e62119f0a7b2`
  - origin `dashboard`
  - exact inventory slot `4`
  - item `hpot0` / HP Potion
  - kind `hp`
  - quantity before `7257`
  - configured restore amount `200`
  - `serverAccepted:true`
  - gateway `outcome:"success"`, duration `14 ms`
- Live HP increased `4168 → 4182`.
- Exact inventory quantity decreased `7257 → 7256`.
- The complete diagnostic contains only the correlated start/server-confirm/completion records for this consumable request and no second consume request.

Whole-run safety/result:

- The diagnostic contains zero WARN, ERROR, or FATAL records.
- No crash, disconnect, hidden repeat, auto-loot loop, auto-potion loop, or uncontrolled combat loop was observed.
- The final diagnostic record is `Slice 3.5 one-click live test passed.`
- The user performed only the intended one-click live-test action after the update bridge; target/chest/item selection and safe preparation were handled by the harness.

Result: both required Slice 3.5 live mutation paths are now proven against real Adventure Land server confirmation and observed live postconditions. **Slice 3.5 is VERIFIED.**

Phase 4 may be considered for the next planned slice only after this append-only verification record is merged and the resulting `main` CI is fully green.


---

## Append-only verification record — Slice 4.1 Isolated Script Runtime — 2026-10-03

**Canonical status update: Slice 4.1 = VERIFIED.**

Real live environment:

- Windows client: `0.1.0-alpha.32`
- platform: `win32`
- one-click test ID: `live41-7df34dc6-b7e4-4f4d-8bdc-18f5a338da08`
- test result: `passed`
- test window: `2026-10-03T13:31:42.078Z → 2026-10-03T13:31:42.567Z`
- complete diagnostic export: 28 structured records, `Secrets sanitized: yes`

Script load/start/logging evidence:

- `slice-4-1-live-timers` loaded and started in the isolated runtime.
- runtime reached `running`.
- the script log component was separately marked as `script:slice-4-1-live-timers`.
- repeated timer-backed script logs were observed.
- the running state reported one active timer.

Pause/timer-lifecycle evidence:

- pause reached `paused`.
- active timers fell to `0`.
- script log count was unchanged across the post-pause observation window (`6 → 6`), proving the interval no longer executed.

Restart/stop evidence:

- the paused script started a fresh isolated run and returned to `running`.
- stop reached `stopped`.
- active timers were `0` after stop.

Crash-isolation evidence:

- `slice-4-1-live-crash` intentionally threw `slice41-intentional-crash`.
- the runtime reported `crashed`.
- the crash was recorded under the script-specific component, with `coreIsolated:true`.
- this ERROR record is intentional test evidence, not an unexpected client failure.

Post-crash recovery evidence:

- `slice-4-1-live-recovery` loaded after the intentional crash.
- the recovery script reached `running`.
- the separately marked `slice41:recovered` script log was observed.
- final runtime state reached `stopped` with `activeTimers:0`.

Whole-run result:

- all five required live-test steps passed:
  - `load-start-and-script-logging`
  - `pause-clears-timers`
  - `restart-and-stop`
  - `crash-isolation`
  - `post-crash-recovery`
- the final runtime state was stopped and resource-clean.
- the final diagnostic record was `Slice 4.1 one-click live test passed.`
- no Adventure Land gameplay preparation or gameplay mutation was required for this runtime-only slice.

Result: the real Windows alpha.32 run proves script load/start/pause/stop, timer cleanup, isolated crash containment, post-crash recovery, and separately marked script logging. **Slice 4.1 is VERIFIED.**

Slice 4.2 may begin only after this append-only verification record is merged and the resulting `main` CI is fully green.

---

## Append-only verification record — Slice 4.2 Adventure Land Core API — 2026-10-03

**Canonical status update: Slice 4.2 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.37`
- release target / tested implementation main: `503d320403c78f05f6d86f314de74f8172140609`
- Windows client: `0.1.0-alpha.37`
- platform: `win32`
- Character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- Server: EU II / `SR_EUII`
- one-click test ID: `live42-cfa353b4-ed33-48b3-b979-6dfd0fce0c0c`
- test result: `passed`
- test window: `2026-10-03T15:26:54.970Z → 2026-10-03T15:26:59.214Z`
- diagnostic export: 148 log lines, `Secrets sanitized: yes`

Core API evidence:

- the isolated script exercised `character`, `G`, `Entities`, `get_nearest_monster()`, `is_in_range()`, and `can_attack()`;
- bounded target: crab `5218826`, HP `400`, attack `24`, preflight distance `119.4`;
- no preflight wait was needed in the passing run (`targetWaitMs:0`);
- the isolated farmer issued exactly one successful bounded attack in the final report;
- attack request: `act-e3e04fac-81be-4611-b1af-01d7e14d12e5`;
- loot request: `act-43609d07-0882-43d6-9fac-1cab838adb8a`;
- direct `move()` request: `act-83c55bfa-2665-4741-90a0-7420dfc76de5`;
- direct-path `xmove()` request: `act-d45b8815-fadc-477d-8829-83a7a7b4b1ff`;
- the report confirms the farmer actions ran with script origin through the central Action Gateway;
- movement evidence reported `moveConfirmed:true` and `xmoveConfirmed:true`.

Runtime/result evidence:

- all required live-test steps passed:
  - `preflight`
  - `globals-and-helpers`
  - `script-farmer-actions`
  - `script-movement`
- final script runtime state: `stopped`;
- final active timers: `0`;
- the worker resources were released cleanly.

Historical alpha.33 through alpha.36 BLOCKED/FAILED reports remain valid append-only evidence of the target-selection, gateway-rate-limit, and movement-state races that were fixed before the passing alpha.37 run. They are not rewritten or replaced by this record.

Result: the real Windows alpha.37 run proves the first Adventure Land-compatible script globals/helpers plus bounded `attack()`, `loot()`, `move()`, and direct-path `xmove()` through the central Action Gateway. **Slice 4.2 is VERIFIED.**

Slice 4.3 may begin only after this append-only verification record is merged and the resulting `main` CI is fully green.

---

## Append-only verification record — Slice 4.3 Event API — 2026-10-03

**Canonical status update: Slice 4.3 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.39`
- release target / tested implementation main: `e4c2ef7a2b894325f169baa6bcf1c1dee5913c5f`
- Windows client: `0.1.0-alpha.39`
- platform: `win32`
- Character: `My_Ranger2`
- Server: EU II / `SR_EUII`
- one-click test ID: `live43-de9d8881-ebbc-4226-bfcb-f21cf811ac2c`
- test result: `passed`
- test window: `2026-10-03T16:44:22.546Z → 2026-10-03T16:44:24.632Z`
- diagnostic export: 51 log lines, `Secrets sanitized: yes`
- observed real game event: `entities`

Event delivery and listener evidence:

- a fresh server `entities` event reached the isolated script worker as a safe snapshot;
- the worker event payload exposed no transport object and retained sanitizer protection;
- `off()` removed the registered listener and active event listeners fell to zero;
- subsequent read-only refreshes produced no callback after `off()` or script stop.

Lifecycle evidence:

- pause removed all registered event listeners and the paused worker remained silent;
- restart created a fresh isolated run with a fresh listener;
- the restarted worker received fresh `entities` events;
- final runtime state reached `stopped` with `activeEventListeners:0` and `activeTimers:0`.

Crash-isolation evidence:

- the intentional handler crash probe threw `Slice 4.3 handler crash probe`;
- the script runtime reached the expected isolated crash state;
- listener cleanup still completed;
- the connected headless character/core remained active;
- the later final stop released the worker resources.

Whole-run result:

- all five required live-test steps passed:
  - `subscribe-real-event-and-off`
  - `off-and-stop-suppress-callbacks`
  - `pause-and-restart-cleanup`
  - `handler-crash-isolation`
  - `final-runtime-cleanup`
- the final diagnostic record was `Slice 4.3 one-click live test passed.`;
- the test used read-only live-state refreshes and performed no gameplay mutation.

Historical alpha.38 evidence remains append-only: its Slice 4.3 run was `BLOCKED` because the harness assumed the read-only `send_updates` refresh would reliably yield a `player` event. The real server supplied refresh-backed `entities` events instead. Alpha.39 corrected only that live-test assumption; the Event API itself remained unchanged.

Result: the real Windows alpha.39 run proves controlled `on()/off()` event delivery, safe event snapshots, listener lifecycle cleanup across off/pause/stop/restart, event logging, and isolated handler-crash containment. **Slice 4.3 is VERIFIED.**

Slice 4.4 may begin only after this append-only verification record is merged and the resulting `main` CI is fully green.

---

## Append-only verification record — Slice 4.4 Storage und Script State — 2026-10-03

**Canonical status update: Slice 4.4 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.40`
- release target / tested implementation main: `a2e32a94e3da32413bfe994b18146be8b40a657a`
- Windows client: `0.1.0-alpha.40`
- platform: `win32`
- one-click test ID: `live44-28913d1c-0fe7-43a2-9f7d-bf71bfe94f09`
- outcome: `passed`
- test window: `2026-10-03T17:18:23.284Z → 2026-10-03T17:18:24.120Z`
- diagnostic export: 38 log lines, `Secrets sanitized: yes`

Storage and restart evidence:

- `set()` persisted JSON state and `get()` returned the same snapshot immediately;
- a fresh isolated worker for the same script restored its namespace from local disk;
- two different script names used separate hashed namespaces and could not read or overwrite each other's state;
- `del()` removed the persisted state;
- both bounded test namespaces finished empty.

Isolation and logging evidence:

- the primary script restarted with `storedValues:1`, proving the persisted state was reloaded for the same script;
- the secondary script started with `storedValues:0`, proving it did not inherit the primary namespace;
- storage mutation logs reported `valueLogged:false`;
- the test performed no gameplay mutation.

Lifecycle evidence:

- all five required steps passed:
  - `write-and-immediate-read`
  - `persist-across-worker-restart`
  - `safe-namespace-isolation`
  - `delete-and-test-cleanup`
  - `final-runtime-cleanup`
- final runtime state was `stopped`;
- final `activeTimers:0`;
- final `activeEventListeners:0`;
- final primary and secondary test namespace entry counts were zero.

Result: the real Windows alpha.40 run proves local per-script state, safe namespace separation, persistence across isolated worker restart, explicit delete/cleanup, lifecycle cleanup, and sanitized storage logging. **Slice 4.4 is VERIFIED.**

Slice 4.5 may begin only after this append-only verification record is merged and the resulting exact `main` CI is fully green.

---

## Append-only verification record — Slice 4.5 Simple Farmer Template — 2026-10-03

**Canonical status update: Slice 4.5 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.42`
- release target / tested implementation main: `c40b811658d83c05bdc8a9d4edbbe43253f2eb1f`
- Windows client: `0.1.0-alpha.42`
- platform: `win32`
- one-click test ID: `live45-dcfdcaea-dd09-4875-b642-75193c2b9284`
- character: `My_Ranger2`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T18:22:54.058Z → 2026-10-03T18:22:55.333Z`
- diagnostic export: 82 log lines, `Secrets sanitized: yes`

No-code template evidence:

- the harness automatically selected low-risk visible monster type `crab`;
- selected target `5330035` reported HP `400`, attack `24`, distance `22.3`;
- the target was already inside attack range, so the bounded preflight approach capability was not required in this specific live run: `approachMoveCount:0`;
- template configuration used only bounded no-code settings:
  - monster: `crab`
  - HP threshold: `1%`
  - MP threshold: `1%`
  - Loot: `true`
  - Respawn: `false`
- the normal Simple Farmer performed no navigation; bounded direct preflight navigation remained available only to the live-test harness.

Real farm evidence:

- one server-confirmed script-origin `character.attack` completed through the central Action Gateway:
  - `act-8a1035d5-5906-4d6e-add8-8c2e9689e962`
- one server-confirmed script-origin `character.loot` completed through the central Action Gateway:
  - `act-fdcb5c96-8873-47ac-a1f3-c2cb9d0f6779`
- the structured result reported `attackCount:1` and `lootCount:1`;
- the worker finished `stopped` with `activeTimers:0` and `activeEventListeners:0`;
- all five terminal steps passed:
  - `preflight`
  - `no-code-template-config`
  - `automated-farm-action`
  - `automated-loot`
  - `bounded-stop-cleanup`

Historical evidence is preserved append-only:

- alpha.41 produced a real `BLOCKED` result because the previous harness required a safe untargeted monster to already be in attack range;
- alpha.42 added bounded direct preflight approach through the existing MovementService / central Action Gateway and removed that harness-only prerequisite;
- the successful alpha.42 live run did not need an approach move because its selected crab was already at distance `22.3`; this record does not rewrite the earlier blocked run.

Result: the real Windows alpha.42 run proves the official no-code Simple Farmer Template can automatically select a suitable visible monster, execute a bounded real script-origin attack + loot cycle through the central Action Gateway, and release worker resources cleanly. **Slice 4.5 is VERIFIED.**

Phase 5 / Slice 5.1 may begin only after this append-only verification record is merged and the resulting exact `main` CI is fully green.

---

## Append-only verification record — Slice 5.1 Heartbeats — 2026-10-03

**Canonical status update: Slice 5.1 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.43`
- release target / tested implementation main: `7a05b80c5be84425208e957a115d5964bdfbf8bc`
- Windows client: `0.1.0-alpha.43`
- platform: `win32`
- one-click test ID: `live51-f53397ab-161c-4cae-bc15-86eb02d314f9`
- character: `My_Merchant`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T18:46:50.249Z → 2026-10-03T18:46:51.492Z`
- diagnostic export: 26 log lines, `Secrets sanitized: yes`

Heartbeat evidence:

- Core heartbeat advanced from sequence `24` to `25`;
- Character heartbeat advanced from sequence `65` to `69` from real headless transport activity, with `pingMs:13`;
- isolated Script worker heartbeat advanced from sequence `1` to `3`;
- Script heartbeat advanced while `activeTimers:0`, proving the host-observed worker heartbeat does not depend on script sandbox timers;
- final Character state reported heartbeat sequence `78` with a fresh heartbeat timestamp;
- final Script state retained heartbeat sequence `3`.

Passive-scope and cleanup evidence:

- all four required steps passed:
  - `core-heartbeat`
  - `character-heartbeat`
  - `script-heartbeat`
  - `final-cleanup`
- final Script runtime: `stopped`;
- final `activeTimers:0`;
- final `activeEventListeners:0`;
- no reconnect was triggered;
- no restart/watchdog recovery was triggered;
- no gameplay mutation was performed;
- the diagnostic completion record explicitly reported `gameplayMutation:false` and `recoveryAction:false`.

Result: the real Windows alpha.43 run proves passive liveness heartbeats for Core, connected Character transport, and isolated Script worker, with clean resource release and no recovery/gameplay side effects. **Slice 5.1 is VERIFIED.**

Slice 5.2 may begin only after this append-only verification record is merged and the resulting exact `main` CI is fully green.

---

## Append-only verification record — Slice 5.2 Disconnect / Reconnect — 2026-10-03

**Canonical status update: Slice 5.2 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.44`
- release branch / tested implementation main: `6f87ccaab851c1a8d134b9f0d7dc69c1808c10be`
- Windows client: `0.1.0-alpha.44`
- platform: `win32`
- one-click test ID: `live52-862cca46-3984-40fc-843b-8787b0e715ce`
- character: `My_Merchant` / `CH_wHJMcgKCsCoQxQbkCHx5rWQB3o3O7`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T19:16:39.025Z → 2026-10-03T19:16:39.875Z`
- diagnostic export: 295 log lines, `Secrets sanitized: yes`

Disconnect and deterministic backoff evidence:

- preflight confirmed a connected character and no active script automation;
- the unexpected transport close was detected with `errorCode:"socket_closed"`;
- `lastDisconnectAt` was `2026-10-03T19:16:39.038Z`;
- the first reconnect attempt was exposed as `reconnectAttempt:1`;
- deterministic bounded backoff scheduled the first retry after `500 ms`;
- `reconnectScheduledAt` was `2026-10-03T19:16:39.539Z`.

Ordered recovery-log evidence:

1. log record 291: `Adventure Land headless character connection closed unexpectedly.`
2. log record 292: `Adventure Land character reconnect scheduled.`
3. log record 293: `Adventure Land character reconnect attempt started.`
4. log record 294: `Adventure Land headless character reconnected.`

Reconnect and fresh-state evidence:

- the same selected character `My_Merchant` reconnected on EU II;
- `reconnectCount` increased from `2` before the test to `3` after reconnect;
- `lastReconnectAt` was `2026-10-03T19:16:39.780Z`;
- post-reconnect heartbeat advanced from `708` to `709`;
- final connected character state reported heartbeat sequence `709`, a fresh heartbeat timestamp, and `pingMs:12`;
- the completion record reported `gameplayMutation:false` and confirmed the ordered log sequence;
- the recovery action was transport reconnect only; no gameplay mutation was performed.

Repository/release gate evidence before this verification write:

- implementation PR #87 was already merged into exact main `6f87ccaab851c1a8d134b9f0d7dc69c1808c10be`;
- post-merge workflow run `37146892506` completed with all four required jobs successful;
- `release/v0.1.0-alpha.44` was verified commit-identical to that implementation main before this append-only verification record was created.

Result: the real Windows alpha.44 run proves unexpected Character transport disconnect detection, deterministic bounded reconnect scheduling, reconnect of the same selected Character, correctly ordered structured recovery logs, and fresh live-state heartbeat delivery after reconnect without gameplay mutation. **Slice 5.2 is VERIFIED.**

Slice 5.3 may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.

---

## Append-only verification record — Slice 5.3 Character Death / Respawn — 2026-10-03

**Canonical status update: Slice 5.3 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.45`
- release branch / tested implementation main: `4369e661692f0ffc6926eb38bebf115d2978aeac`
- Windows client: `0.1.0-alpha.45`
- platform: `win32`
- one-click test ID: `live53-e366a683-1782-4765-94df-89d98e339db9`
- character: `My_Rogue` / `CH_TQTrIfkU6DEnJBl0kXUArLVTw1ht6`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T19:51:17.664Z → 2026-10-03T19:51:18.063Z`
- diagnostic export: 74 log lines, `Secrets sanitized: yes`

Death-state evidence:

- the Character connected while genuinely dead with `dead:true`, `hp:0`, and `deathCount:1`;
- `lastDeathAt` was `2026-10-03T19:51:10.444Z`;
- structured log record 15 was `Adventure Land headless character death state observed.`;
- the bounded recovery worker observed `character.rip` itself via log record 48 `slice53:death-observed`;
- the script had no direct transport/raw-socket access.

Respawn and Action Gateway evidence:

- the isolated script requested `character.respawn` through the script bridge and central Action Gateway;
- Action Gateway request ID: `act-b04923c7-2a16-4a9f-8407-80196e8c3fbb`;
- action origin: `script`;
- Action Gateway outcome: `success`;
- server confirmation was logged before completion;
- `respawnCount` increased to `1`;
- `lastRespawnAt` was `2026-10-03T19:51:17.948Z`;
- final Character state was alive with `dead:false`, `hp:1101/1101`, heartbeat sequence `91`, and `pingMs:20`.

Controlled script-continuation evidence:

- recovery script run ID before respawn: `script-f1e730bb-a079-440e-87c8-1991f5098cc1`;
- recovery script run ID after respawn: `script-f1e730bb-a079-440e-87c8-1991f5098cc1`;
- the unchanged run ID proves the same isolated worker continued after the Character returned alive;
- continuation log record 72 was `slice53:continued-after-respawn`;
- final runtime state: `stopped`;
- final `activeTimers:0`;
- final `activeEventListeners:0`;
- completion evidence explicitly recorded `gameplayMutation:"character.respawn"` and `rawSocketAccess:false`.

Repository/release gate evidence before this verification write:

- implementation PR #89 was merged into exact main `4369e661692f0ffc6926eb38bebf115d2978aeac`;
- exact post-merge main CI run `37148900780` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- release publish run `37149125597` completed successfully;
- GitHub release `v0.1.0-alpha.45` targets exact commit `4369e661692f0ffc6926eb38bebf115d2978aeac`;
- published release assets include the Windows x64 installer, Linux x64 installer, and `ALRemastered-update.json`.

Result: the real Windows alpha.45 run proves a genuine server-observed Character death state, server-confirmed respawn through the script bridge and central Action Gateway, and controlled continuation of the same isolated script worker after respawn, followed by clean worker resource release. **Slice 5.3 is VERIFIED.**

Slice 5.4 may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.

---

## Append-only verification record — Slice 5.4 Watchdog und Restart-Schutz — 2026-10-03

**Canonical status update: Slice 5.4 = VERIFIED.**

Release/live environment:

- release: `v0.1.0-alpha.46`
- release branch / tested implementation main: `6fe751cf94bd8e69f4726b85c7a35563658f8940`
- Windows client: `0.1.0-alpha.46`
- platform: `win32`
- one-click test ID: `live54-49181429-0f48-4118-b04d-fbdb8be54555`
- character: `My_Ranger1` / `CH_denPIHA05KxLLQqVOad9h9vr9KPrL`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T20:16:50.727Z → 2026-10-03T20:16:55.471Z`
- diagnostic export: 144 log lines, `Secrets sanitized: yes`

Healthy-heartbeat and stall evidence:

- the isolated Script probe established heartbeat sequence `3` before fault injection;
- initial Script run ID: `script-c7b87ec5-7a3d-47bb-8cd0-4cc7c9c75402`;
- host-observed Script heartbeat suppression was enabled through the bounded test-only hook;
- diagnostic log record 96 reported `Watchdog detected a stale component heartbeat.`;
- the first stale observation measured `heartbeatAgeMs:1792` against `staleAfterMs:1500`;
- the live-test start record explicitly reported `gameplayMutation:false`, `rawSocketAccess:false`, and stall injection `host-observed-script-heartbeat-suppression`.

Controlled restart evidence:

- diagnostic log record 97: first `Watchdog controlled restart started.`;
- diagnostic log record 102: first `Watchdog controlled restart completed.`;
- first restart moved the Script from run ID `script-c7b87ec5-7a3d-47bb-8cd0-4cc7c9c75402` to `script-5eeb3182-8f3e-4b6a-8a34-f62556157289`;
- restart count became `1`, budget usage `1/2`;
- diagnostic log record 109: second controlled restart started;
- diagnostic log record 116: second controlled restart completed;
- restart count became `2`, budget usage `2/2`.

Restart-budget and no-loop evidence:

- diagnostic log record 121 was `Watchdog restart budget exhausted.`;
- exhaustion context recorded `budgetUsed:2`, `budgetLimit:2`, `restartWindowMs:30000`, and `noRestartLoop:true`;
- the structured result entered `blocked:true` after the second restart;
- during the explicit `1200 ms` confirmation window, `restartCount` stayed exactly `2 → 2`;
- restart-start log count stayed exactly `2 → 2`;
- this proves the watchdog stopped restarting after the budget was exhausted instead of entering a restart loop.

Final recovery and cleanup evidence:

- heartbeat observation was restored after the no-loop confirmation;
- the Script restart budget was reset;
- final watchdog state remained `running`;
- final Script component state was `blocked:false`, `budgetUsed:0`, total restart count `2`;
- Core remained monitored, non-stale, non-blocked, with restart count `0`;
- Character remained monitored, non-stale, non-blocked, with restart count `0`;
- final Character remained connected and alive with heartbeat sequence `172` and `pingMs:18`;
- final Script runtime was `stopped` with `activeTimers:0` and `activeEventListeners:0`;
- diagnostic completion record 144 reported `scriptRestarts:2`, `budgetLimit:2`, `restartLoopPrevented:true`, `gameplayMutation:false`, and `rawSocketAccess:false`.

Repository/release gate evidence before this verification write:

- implementation PR #91 was merged into exact main `6fe751cf94bd8e69f4726b85c7a35563658f8940`;
- exact post-merge main CI run `37150612046` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- release publish run `37150759804` completed successfully;
- GitHub release `v0.1.0-alpha.46` targets exact commit `6fe751cf94bd8e69f4726b85c7a35563658f8940`;
- published release assets include the Windows x64 installer, Linux x64 installer, and `ALRemastered-update.json`.

Result: the real Windows alpha.46 run proves production watchdog stall detection, component-local controlled Script restart, bounded rolling restart budget, explicit budget exhaustion, and protection against endless restart loops, followed by clean recovery and worker resource release without gameplay mutation or raw socket access. **Slice 5.4 is VERIFIED.**

Phase 6 / Slice 6.1 may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.

---

## Append-only verification record — Slice 6.1 Map-/Geometry-Modell — 2026-10-03

**Canonical status update: Slice 6.1 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.48`
- tested implementation main / release target: `f3f8ca882d70aa47f3a59b24abe67e48e84c2b66`
- Windows client: `0.1.0-alpha.48`
- platform: `win32`
- one-click test ID: `live61-7f653b0b-fc41-4da7-845b-e57600a7d178`
- outcome: `passed`
- test window: `2026-10-03T21:02:09.425Z → 2026-10-03T21:02:09.579Z`
- Character connection: not required; disconnected before and after the test
- diagnostic export: 20 log lines, `Secrets sanitized: yes`

Live map-model coverage:

- live Adventure Land data version: `17397`;
- `54` maps normalized into one versioned navigation model;
- `49` geometry maps loaded;
- all `54 / 54` modeled maps exposed finite bounds;
- `5` map keys had no direct geometry family entry: `batcave`, `d2`, `old_bank`, `old_main`, `original_main`;
- the model still derived usable bounds for all maps.

Collision-geometry evidence:

- total normalized collision-line count: `13342`;
- representative live map: `main`;
- representative `main` collision geometry contained `760` x-lines and `763` y-lines, total `1523`;
- representative bounds were `minX:-1616`, `minY:-1040`, `maxX:2320`, `maxY:2232`, source `geometry`;
- the same canonical collision representation is the geometry source used by movement consumers.

Door/transition evidence:

- total normalized door/transition count: `98`;
- raw invalid transition references: `2`;
- blocking invalid transition references on active maps: `0`;
- ignored/non-blocking invalid transition references: `2`;
- both non-blocking dangling references belong only to ignored prototype map data and remain visible as diagnostics rather than being silently discarded;
- representative valid transition: `main:door:0`;
- representative source rectangle: `x:-965`, `y:-176`, `width:24`, `height:30`, source spawn `1`;
- representative target resolved to map `woffice`, spawn `0`, coordinates `x:-24`, `y:83`, direction `3`;
- the representative transition was `valid:true` with no problems.

Passive one-click verification evidence:

- no headless Character was required;
- Character status stayed `disconnected → disconnected`;
- no movement was performed;
- no pathfinding was performed;
- no gameplay mutation was performed;
- no raw socket access was used;
- diagnostic completion record explicitly reported `characterRequired:false`, `blockingInvalidTransitionCount:0`, `ignoredInvalidTransitionCount:2`, `gameplayMutation:false`, `rawSocketAccess:false`, and `pathfinding:false`.

Historical alpha.47 blocked evidence and corrective action:

- the first real `alpha.47` Slice 6.1 report was blocked before execution because the initial harness unnecessarily required a connected headless Character;
- that report also exposed two dangling transition references;
- investigation showed both references originated exclusively from ignored prototype map `d2`, whose doors target unavailable prototype maps `d1` and `d3`;
- PR #94 changed these ignored-map references from blocking to non-blocking diagnostics and removed the unnecessary Character precondition;
- the successful `alpha.48` run verifies both corrections with real live data.

Repository/release gate evidence:

- original Slice 6.1 implementation PR #93 merged at main `75e99f0f35e271e747de8efab3afd826aae38421`;
- exact post-merge main CI run `37152440103` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- original release publish run `37152590260` published `v0.1.0-alpha.47`;
- corrective PR #94 merged at exact main `f3f8ca882d70aa47f3a59b24abe67e48e84c2b66`;
- exact post-hotfix main CI run `37153288628` completed with all four required jobs successful;
- release publish run `37153415634` completed successfully;
- GitHub release `v0.1.0-alpha.48` targets exact commit `f3f8ca882d70aa47f3a59b24abe67e48e84c2b66`;
- the release branch and current `main` were verified commit-identical to that target before this documentation write;
- published assets:
  - Windows x64 installer SHA-256 `ec525d75cb6672ad4e5c154642ecaa317e64ddd94f5953623a0af39bf29ac3fa`
  - Linux x64 installer SHA-256 `b48c4adf6a8a355ef36efff8434e8a66821480c547991c758b46149a3a2c0281`
  - updater manifest SHA-256 `bac873d69245147c90317611571d7dd5040d7ea6aac3680b96c0d8df7671f1ae`.

Result: the real Windows alpha.48 run proves the canonical Slice 6.1 map/geometry model against current live Adventure Land data: maps, finite map boundaries, collision-relevant geometry, door/transition target-spawn resolution, explicit handling of ignored prototype transition gaps, and character-independent passive validation. **Slice 6.1 is VERIFIED.**

Slice 6.2 – einfacher Path Planner may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.

---

## Append-only verification record — Slice 6.2 einfacher Path Planner — 2026-10-03

**Canonical status update: Slice 6.2 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.49`
- tested implementation main / release target: `c99b4e9f05431813b9fbc7d6d37a2ff1b99dc402`
- Windows client: `0.1.0-alpha.49`
- platform: `win32`
- one-click test ID: `live62-2a6c8bd1-3f5b-40e6-ab71-c1fe207ea77d`
- outcome: `passed`
- test window: `2026-10-03T21:28:21.705Z → 2026-10-03T21:28:22.060Z`
- Character connection: not required; remained disconnected
- diagnostic export: 25 log lines, `Secrets sanitized: yes`

Live navigation-model precondition:

- fresh live Adventure Land game-data version `17397` was manually reloaded during the test;
- the verified Slice 6.1 navigation model contained `54` maps, `98` transitions, and `13342` collision lines;
- blocking invalid transition count was `0`;
- ignored/non-blocking invalid transition count remained `2`;
- the planner therefore operated on the same canonical live geometry and transition model already verified by Slice 6.1.

Reachable-route evidence:

- the passive probe evaluated live cross-map candidates rather than assuming the first transition was reachable;
- several candidates were correctly rejected as `PATH_NO_ROUTE` before the successful route was found;
- selected live transition: `main:door:7`;
- source map: `main`;
- source spawn index: `11`;
- target map: `level1`;
- target spawn index: `1`;
- route status: `reachable`;
- map hops: `1`;
- leg count: `2`;
- ordered route:
  1. start: `main` at `1937,-12`
  2. door: `main:door:7` at `1936,-23`
  3. arrival: `level1` at `0,9`.

Waypoint and leg validation evidence:

- waypoint count: `3`;
- one real walk leg was independently revalidated against the canonical collision geometry;
- walk distance: `11.045361017187261`;
- one real transition leg was independently revalidated against the canonical live transition target;
- transition metadata was empty, proving the selected edge was unconditional;
- the transition resolved exactly from `main:door:7` to `level1` spawn `1` at `0,9`.

Planner-diagnostic evidence:

- candidate node count: `226`;
- directed walk edge count: `68`;
- transition edge count: `82`;
- direct collision checks: `1145`;
- expanded graph nodes: `4`;
- map hops: `1`;
- total walk distance: `11.045361017187261`;
- total route cost: `59.04536101718726`;
- skipped ignored maps: `5`;
- skipped invalid transitions: `0`;
- skipped conditional transitions: `9`;
- visited maps: `main → level1`;
- planner service state after the probe reported `plannedRoutes:8` and `reachableRoutes:1`, consistent with rejected unreachable candidates followed by one validated reachable route.

Passive-safety evidence:

- Character status remained `disconnected → disconnected`;
- `characterRequired:false`;
- `movementExecution:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- the test therefore verified route planning and diagnostics without executing the route or mutating gameplay state.

Repository/release gate evidence:

- implementation PR #96 merged into exact main `c99b4e9f05431813b9fbc7d6d37a2ff1b99dc402`;
- implementation PR CI run `37154637884` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- exact post-merge main CI run `37154817728` completed with all four required jobs successful;
- release publish run `37154978975` completed successfully;
- GitHub release `v0.1.0-alpha.49` targets exact commit `c99b4e9f05431813b9fbc7d6d37a2ff1b99dc402`;
- release branch `release/v0.1.0-alpha.49`, tag `v0.1.0-alpha.49`, and implementation `main` were verified commit-identical;
- published assets:
  - Windows x64 installer SHA-256 `f0ea0ec85d20a7915df27e7e2c6e4ec7986342f58ada93ce2e08dc55d84a14df`
  - Linux x64 installer SHA-256 `40df903c4866bd5a05186b58ed4f553e84149a048226afbe82f740978a5784d4`
  - updater manifest SHA-256 `0bce1eca90ef74f89c4a4fc7989411238b5482e2601a48b2ed8a682af01d323d`.

Result: the real Windows alpha.49 run proves that the Slice 6.2 planner can derive a structurally reachable cross-map route from current live Adventure Land data, emit ordered map-aware waypoints, distinguish unreachable candidates, independently validate collision-safe walk legs and unconditional map transitions, and expose reproducible planner diagnostics without executing movement. **Slice 6.2 is VERIFIED.**

Slice 6.3 – Smart-Move-Kompatibilität may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.

---

## Append-only verification record — Slice 6.3 Smart-Move-Kompatibilität — 2026-10-04

**Canonical status update: Slice 6.3 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.50`
- tested implementation main / release target: `14b80c34b3803b46fd2ff4bce70026b2eef68aac`
- Windows client: `0.1.0-alpha.50`
- platform: `win32`
- one-click test ID: `live63-ba01676e-106d-4eb1-8b01-96663b19c3bf`
- outcome: `passed`
- test window: `2026-10-03T22:06:35.139Z → 2026-10-03T22:06:35.388Z`
- live Character: `My_Merchant` on `EU II`, map `main`, position `-25,-478`
- diagnostic export: 32 log lines, `Secrets sanitized: yes`

Smart-move compatibility evidence:

- the isolated script worker exposed `smart_move()`;
- an Adventure Land-style coordinate destination matching the current Character position completed with status `already_there`;
- the successful probe planned a reachable zero-leg route on `main`;
- smart-move service counters changed by exactly two requests and one completed request;
- the successful route contained no movement leg and no map hop;
- an intentionally unsupported string selector was returned to the script as stable explicit error code `SMART_MOVE_TARGET_UNSUPPORTED`;
- the SmartMove service retained that exact error as its final diagnostic state;
- the script runtime stopped cleanly after the probe with zero active timers and zero active event listeners.

Passive-safety evidence:

- Character position remained `main -25,-478 → main -25,-478`;
- Character remained connected;
- `movementExecution:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- action-gateway records during the probe: `0`;
- the compatibility proof therefore exercised the real isolated-worker API and error propagation without hidden movement or gameplay mutation.

Navigation precondition evidence:

- live Adventure Land game-data version: `17397`;
- canonical navigation model status: `ready`;
- map count: `54`;
- transition count: `98`;
- collision-line count: `13342`;
- blocking invalid transition count: `0`;
- the SmartMove service and Slice 6.2 path planner both reported `ready`.

Repository/release gate evidence:

- implementation PR #98 merged with method `merge` at exact main `14b80c34b3803b46fd2ff4bce70026b2eef68aac`;
- final implementation PR CI run `37156623042` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- exact post-implementation-main CI run `37156789360` completed with all four required jobs successful;
- release publish run `37156936073` completed successfully;
- GitHub release `v0.1.0-alpha.50` targets exact commit `14b80c34b3803b46fd2ff4bce70026b2eef68aac`;
- release branch `release/v0.1.0-alpha.50`, tag `v0.1.0-alpha.50`, and implementation `main` were verified commit-identical;
- published assets:
  - Windows x64 installer SHA-256 `71df41d0353b50dc62cc6c62c075ee42679cf0e0bb55e399d6d12dd02139f5b6`
  - Linux x64 installer SHA-256 `22fa0038bf921cb2c95e7049aed9a0b6e253817b2cd9dedd5205b9fb26ceac29`
  - updater manifest SHA-256 `cf7940825bc6059bf00f7a00f268b91611b31a334445c51b9a75431f9717687e`.

Result: the real Windows alpha.50 run proves the first `smart_move()`-compatible API inside the isolated worker, including a successful coordinate destination, planner-backed already-at-target semantics, stable explicit error propagation, and preservation of the existing Action Gateway safety boundary. **Slice 6.3 is VERIFIED.**

Slice 6.4 – Movement Trail und geplante Route im Dashboard may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.



---

## Append-only verification record — Slice 6.4 Movement Trail und geplante Route im Dashboard — 2026-10-04

**Canonical status update: Slice 6.4 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.52`
- tested implementation/fix main / release target: `00269af70beab88e09213ff1800ffdeb6f645cfc`
- Windows client: `0.1.0-alpha.52`
- platform: `win32`
- one-click test ID: `live64-8811129f-260e-4b20-a51d-e770b029380a`
- outcome: `passed`
- test window: `2026-10-03T22:57:24.310Z → 2026-10-03T22:57:26.158Z`
- live Character: `My_Ranger2` on EU II / `SR_EUII`
- map: `main`
- diagnostic export: 76 log lines, `Secrets sanitized: yes`

Planned-route evidence:

- original server-observed position: `main -1163.5698084909386,-87.06988736141028`;
- the existing Simple Path Planner produced one `reachable` same-map route;
- route leg count: `1`;
- map hops: `0`;
- total walk distance: `32`;
- planned target: `main -1131.5698084909386,-87.06988736141028`;
- movement-debug telemetry retained the exact route;
- `plannedRouteCount` advanced from `0 → 1`.

Actual movement-trail evidence:

- the outbound movement ran through the central Action Gateway with dashboard origin:
  - request `act-eadf552b-29f4-474d-ab0a-34ab30ff530e`
  - server-confirmed position `-1131.5698084909386,-87.06988736141028`;
- the exact-coordinate return also ran through the central Action Gateway with dashboard origin:
  - request `act-25adac2d-4056-4e93-abb1-c201c5981f05`
  - server-confirmed position `-1163.5698084909386,-87.06988736141028`;
- movement count delta: `2`;
- trail point count: `0 → 3`;
- retained trail contained the original start point plus both server-confirmed movement observations;
- final Character position exactly matched the original position.

Runtime/safety evidence:

- user Script runtime remained `unloaded → unloaded`;
- `userScriptInterrupted:false`;
- `actionGatewayRequired:true`;
- intended bounded gameplay mutation was limited to the two movement requests;
- `gameplayMutation:true`;
- `rawSocketAccess:false`;
- final Action Gateway state was ready with no active request and the return movement recorded `outcome:"success"`, `path:"direct"`, and `serverConfirmed:true`.

Historical alpha.51 failure remains append-only evidence:

- `v0.1.0-alpha.51` targeted implementation main `0a380d6e2170365971a58490a571f79804061989`;
- real test `live64-c0c65f09-452f-45de-b787-83103488b4fa` failed during `movement-trail` with `MOVE_TARGET_INVALID`;
- the outbound movement had been treated as confirmed at an intermediate server-observed position while the canonical Character coordinates intentionally still represented the original position during active interpolation;
- the immediate exact-coordinate return therefore validated against stale coordinates and was rejected as a no-op target;
- PR #101 corrected the central confirmation semantics so `sendDirectMovement()` resolves only after the server-observed position reaches the requested target within the bounded tolerance;
- the alpha.52 run above proves the correction on the real Windows client.

Repository/release gate evidence:

- implementation PR #100 merged with method `merge` at exact main `0a380d6e2170365971a58490a571f79804061989`;
- final implementation PR CI run `37158757766` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- exact post-implementation-main CI run `37158929260` completed successfully;
- alpha.51 release publish run `37159067914` completed successfully;
- corrective PR #101 merged with method `merge` at exact main `00269af70beab88e09213ff1800ffdeb6f645cfc`;
- corrective PR CI run `37159608659` completed with all four required jobs successful;
- exact post-fix-main CI run `37159753137` completed with all four required jobs successful;
- release publish run `37159899297` completed successfully;
- GitHub release `v0.1.0-alpha.52` targets exact commit `00269af70beab88e09213ff1800ffdeb6f645cfc`;
- release branch `release/v0.1.0-alpha.52`, tag `v0.1.0-alpha.52`, and tested `main` were verified commit-identical;
- published assets:
  - Windows x64 installer SHA-256 `6f587129575aa43033227136f7b8cf1b8fbcbd5d2647d4c05d3ece14e4e8e68a`
  - Linux x64 installer SHA-256 `0ca0ac37e52addb1b5a19bc7d98fddbe3e9159c07f9080a1d16554366e7925e0`
  - updater manifest SHA-256 `24f1f37231718876fe51e0719d6bf660f9ed0d1cca010ca6c6b2e4f95d268fd0`.

Result: the real Windows alpha.52 run proves that the dashboard retains both the actual server-confirmed Movement Trail and the route produced by the existing planner, while all gameplay mutation remains bounded behind the central Action Gateway and the user Script runtime remains untouched. **Slice 6.4 is VERIFIED.**

Phase 7 / Slice 7.1 – Multi-Character Session Manager may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.


---

## Append-only verification record — Slice 7.1 Multi-Character Session Manager — 2026-10-04

**Canonical status update: Slice 7.1 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.53`
- tested implementation main / release target: `25d13a769501c502e6d2ad65456c0bdf02a3b634`
- Windows client: `0.1.0-alpha.53`
- platform: `win32`
- one-click test ID: `live71-ad99db70-9c18-405e-b7d2-40ba7bb5b070`
- primary Character: `My_Merchant`
- managed test Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-03T23:27:11.423Z → 2026-10-03T23:27:11.635Z`
- diagnostic export: 56 log lines, `Secrets sanitized: yes`.

Multi-character session evidence:

- preflight began with one active primary Character session and three available slots under the hard session limit of `4`;
- the manager started `My_Ranger1` as a separate managed headless session without replacing or mutating the existing primary `My_Merchant` session;
- both Character sessions were simultaneously connected on EU II;
- concurrent state reached exactly `activeSessionCount:2` with `managedSessionCount:1`;
- the primary session remained the compatibility anchor for existing single-Character services;
- the added Character remained isolated as a managed session.

Shared static-data evidence:

- process-level Adventure Land game-data version was `17397`;
- preflight manager state reported `sharedStaticDataMode:"shared"`;
- parallel managed-session state reported the same `sharedGameDataVersion:17397`;
- final state retained game-data version `17397 → 17397`;
- no per-session duplicate static-game-data load was required.

Isolation and limit evidence:

- a second start request for the already managed Character was rejected with stable local error `SESSION_CHARACTER_ALREADY_ACTIVE`;
- after that rejection, active session count remained exactly `2`;
- managed session count remained exactly `1`;
- primary session remained `connected`;
- Character session limit stayed `4`;
- the diagnostic lifecycle confirms the manager reported `activeSessionCount:2`, `sessionLimit:4`, and `sharedStaticData:true` after the second Character connected.

Bounded cleanup and safety evidence:

- only the managed `My_Ranger1` test session was stopped;
- the managed Character disconnect was controlled with reason `slice71_live_test`;
- final state returned to `activeSessionCount:1` and `managedSessionCount:0`;
- primary `My_Merchant` remained connected;
- user Script runtime stayed `unloaded → unloaded`;
- `userScriptInterrupted:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- the final diagnostic record explicitly reported Slice 7.1 PASS with shared static data, session limit `4`, no gameplay mutation, no raw socket access, and no Script interruption.

Repository/release gate evidence:

- implementation PR #103 exact feature head: `b1442654481786131d1bce45a5a698687608f76a`;
- implementation PR CI run `37161318643` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #103 merged with method `merge` into exact implementation main `25d13a769501c502e6d2ad65456c0bdf02a3b634`;
- exact post-implementation-main CI run `37161460939` completed with all four required jobs successful;
- release publish run `37161609474` completed successfully for Linux, Windows, and release;
- release branch `release/v0.1.0-alpha.53`, tag `v0.1.0-alpha.53`, release target, and tested implementation main were verified commit-identical;
- published assets:
  - Windows x64 installer SHA-256 `b3db93e374273c0eeeff90db7d162b2185e9a0aa74073d1b44bbde282ac40d12`
  - Linux x64 installer SHA-256 `871577f951569461287782e7989bf857532dffbc8cbba4b4a734e43c33ae3a8e`
  - updater manifest SHA-256 `7843f593d72efbe0190c36844705fb1e5a9c03632e865ed826eb5f1bf9549fbe`.

Result: the real Windows alpha.53 run proves that ALRemastered can keep the existing primary Character session alive while adding a second isolated managed Character session, share static game data across sessions, enforce duplicate/Character-limit guards, isolate lifecycle cleanup, and return to the original single-session state without gameplay mutation, raw socket bypass, or user Script interruption. **Slice 7.1 is VERIFIED.**

Slice 7.2 – Local Character Messaging may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.


---

## Append-only verification record — Slice 7.2 Local Character Messaging — 2026-10-04

**Canonical status update: Slice 7.2 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.54`
- tested implementation main / release target: `6c8fc1d548341413695ff5facd597c588c863afd`
- Windows client: `0.1.0-alpha.54`
- platform: `win32`
- one-click test ID: `live72-992e8382-2e17-4987-885b-b9ea8cb7f77a`
- primary Character: `My_Merchant`
- managed test Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T00:00:33.309Z → 2026-10-04T00:00:33.696Z`
- diagnostic export: 61 log lines, `Secrets sanitized: yes`.

Local messaging evidence:

- preflight began with one active primary Character session and three free managed-session slots;
- messaging service reported `localOnly:true` and `rawSocketAccess:false`;
- the test started exactly one temporary managed Character, `My_Ranger1`, producing two concurrent active Character sessions;
- the primary isolated probe worker called `send_cm()` with `My_Ranger1` plus one intentionally missing recipient;
- the primary-to-managed message was delivered locally as sequence `1`;
- compatible `send_cm()` result was exactly `receivers:["My_Ranger1"]`, `locals:["My_Ranger1"]`;
- the unavailable local recipient was omitted from those arrays and counted exactly once in telemetry;
- the managed Character sent one local reply back to `My_Merchant` as sequence `2`;
- the reply was dispatched into the primary worker as Adventure Land event `cm`;
- the worker received it through compatible `character.on("cm")` payload shape `{name, message}`;
- no global/server CM route was used.

Worker/runtime evidence:

- the messaging probe ran in a separate isolated `slice72-local-cm-probe` worker;
- the existing user Script runtime was never replaced or interrupted;
- user Script runtime stayed `unloaded → unloaded`;
- the probe worker logged the successful `send_cm()` result;
- runtime diagnostics logged event dispatch with `eventName:"cm"`;
- the probe logged the matching receive marker from `character.on("cm")`;
- the isolated probe then stopped cleanly with zero active timers.

Messaging telemetry evidence:

- final `requestCount:2`;
- final `localDeliveryCount:2`;
- final `unavailableRecipientCount:1`;
- final `listenerCount:0`;
- final deltas were exactly two requests, two local deliveries, and one unavailable recipient;
- last delivery was `My_Ranger1 → My_Merchant`;
- messaging remained `localOnly:true`;
- `rawSocketAccess:false`.

Cleanup and safety evidence:

- only the temporary managed `My_Ranger1` session was disconnected;
- managed disconnect reason was controlled: `slice72_live_test`;
- final session state returned to `activeSessionCount:1`, `managedSessionCount:0`, `availableSlots:3`;
- primary `My_Merchant` remained connected;
- `userScriptInterrupted:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- `serverRoutingUsed:false`;
- no Action Gateway bypass or hidden gameplay action was used.

Repository/release gate evidence:

- implementation PR #105 final feature head: `64605f34d3ddddf1c4a915534c3f387d638bc910`;
- final implementation PR CI run `37162978790` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #105 merged with method `merge` into exact implementation main `6c8fc1d548341413695ff5facd597c588c863afd`;
- exact post-implementation-main CI run `37163145066` completed with all four required jobs successful;
- release publish run `37163273306` completed successfully for Linux, Windows, and release;
- release branch `release/v0.1.0-alpha.54`, tag `v0.1.0-alpha.54`, release target, and tested implementation main were verified commit-identical;
- published assets:
  - Windows x64 installer SHA-256 `b820dee62c979a6db12aaaf0bdda447c5ae87b263f138e25fc8bb96a84a03c97`
  - Linux x64 installer SHA-256 `d089027ff36818198332c4db45a350c78560fbbc2e3ab91b1298e560492e31cd`
  - updater manifest SHA-256 `30966331837085610a6c304138886b673bc343db3461559b36457d5098189761`.

Result: the real Windows alpha.54 run proves fast local Character-to-Character messaging through the new in-process path, Adventure Land-compatible `send_cm()` return semantics, compatible `character.on("cm")` receive events, unavailable-target omission, complete local-only telemetry, and bounded cleanup without gameplay mutation, raw socket/server routing, or user Script interruption. **Slice 7.2 is VERIFIED.**

Slice 7.3 – Party Coordinator may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.



---

## Slice 7.3 Verification Record — Party Coordinator

**Canonical status update: Slice 7.3 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.55`
- tested implementation main / release target: `eca584e5af4d5bd7d79c26f0cc62bbcea610af63`
- Windows client: `0.1.0-alpha.55`
- platform: `win32`
- one-click test ID: `live73-a3aecc82-6240-4958-93b2-881d0b074c6f`
- primary Character: `My_Merchant`
- managed test Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T00:39:54.747Z → 2026-10-04T00:39:54.982Z`
- diagnostic export: 54 log lines, `Secrets sanitized: yes`.

Party Coordinator evidence:

- one active primary Character and one temporary managed Character participated as local Coordinator members;
- `My_Merchant` was assigned Tank and `My_Ranger1` was assigned Healer around one shared logical Coordinator target;
- Tank and Healer aggregates both reached `ready`;
- `My_Ranger1` then changed from Healer to DPS, Healer returned to `unassigned`, and DPS reached `ready`;
- clearing the shared target made both active members explicitly report `no-target`;
- target state was restored before cleanup;
- managed-member removal pruned only `My_Ranger1` and its DPS assignment;
- after removal, exactly the primary member remained and DPS assigned count returned to zero;
- the pre-test Coordinator configuration was restored;
- no stale role or member state leaked across the session lifecycle.

Isolation and safety evidence:

- Coordinator communication used `coordinationTransport:"shared-process-state"`;
- `localMessagingRequired:false`;
- local messaging request delta: `0`;
- local messaging delivery delta: `0`;
- messaging remained `localOnly:true`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- `partyTemplatesActive:false`;
- the user Script runtime remained unloaded and `userScriptInterrupted:false`;
- only the temporary managed session was removed;
- final session state returned to `activeSessionCount:1` and `managedSessionCount:0`;
- primary `My_Merchant` remained connected.

Repository/release gate evidence:

- implementation PR #107 final feature head: `469b0213f168068f7854e0ea265e6b1721bd3ba4`;
- final implementation PR CI run `37164949495` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #107 merged with method `merge` into exact implementation main `eca584e5af4d5bd7d79c26f0cc62bbcea610af63`;
- exact post-implementation-main CI run `37165070088` completed successfully;
- release publish run `37165210493` completed successfully;
- release branch `release/v0.1.0-alpha.55`, tag `v0.1.0-alpha.55`, release target, and tested implementation main were verified commit-identical at `eca584e5af4d5bd7d79c26f0cc62bbcea610af63`;
- published assets:
  - Windows x64 installer SHA-256 `0f85d4bee480a36663fdc15e08d56cdead687fbddb0b4087c9e1b23341f94c9a`
  - Linux x64 installer SHA-256 `ed0a38c728fca7d62185755356204e3b8e4baf70f5c16b89f965dc1b85d34c2d`
  - updater manifest SHA-256 `8199b54449fe643579a04d25db6546fd73971c6c1a70cad4eac08b138d53f841`.

Result: the real installed Windows alpha.55 run proves technical local Party Coordinator behavior for role assignment and change, one shared target, Tank/Healer/DPS status, explicit no-target state, managed-member removal, session isolation, configuration restoration, and read-only coordination without gameplay mutation, raw sockets, Party Templates, local messaging traffic, or user Script interruption. **Slice 7.3 is VERIFIED.**

Slice 7.4 – Party Templates may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.


---

## Slice 7.4 Verification Record — Party Templates

**Canonical status update: Slice 7.4 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.56`
- tested implementation main / release target: `95cdc12d7948322585dd71c2e14d32329278016b`
- Windows client: `0.1.0-alpha.56`
- platform: `win32`
- one-click test ID: `live74-7c8190e0-ca2c-4d1a-bb29-302f478ad7a4`
- primary Character: `My_Merchant`
- managed template Characters: `My_Warrior`, `My_Priest`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T07:21:15.300Z → 2026-10-04T07:21:15.726Z`
- diagnostic export: 68 log lines, `Secrets sanitized: yes`.

Party Templates evidence:

- the primary Merchant was recommended as DPS;
- the temporary Warrior was recommended as Tank;
- the temporary Priest was recommended as Healer;
- applying recommended roles produced three matched local assignments:
  - `My_Merchant → dps`
  - `My_Warrior → tank`
  - `My_Priest → healer`;
- Tank, Healer, and DPS Coordinator aggregates all reached `ready` with one assigned and one ready member each;
- the template layer reported `templateLayerActive:true`;
- Party Templates reused the existing Party Coordinator as the coordination path rather than creating a second role-state authority;
- manual role assignment was validated by overriding the DPS member to Healer;
- the override explicitly reported `override`;
- clearing the same role produced `needs-assignment`;
- applying recommendations again restored DPS with `matched`;
- removing both temporary managed sessions removed their template assignments with no stale managed-member state;
- after cleanup the template layer again reflected only the primary member;
- the pre-test Coordinator configuration was restored, leaving no temporary role/target configuration behind.

Isolation and safety evidence:

- `coordinationTransport:"party-coordinator"`;
- `localMessagingRequired:false`;
- local messaging request delta: `0`;
- local messaging delivery delta: `0`;
- messaging remained `localOnly:true`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- the user Script runtime remained unloaded and `userScriptInterrupted:false`;
- only the two temporary managed sessions were removed;
- final session state returned to `activeSessionCount:1`, `managedSessionCount:0`, `availableSlots:3`;
- primary `My_Merchant` remained connected;
- `coordinatorConfigurationRestored:true`.

Repository/release gate evidence:

- implementation PR #109 final feature head: `12ac5449f52455c2eb3aed211fe5fe3c4488a0d8`;
- final implementation PR CI run `37185032816` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #109 merged with method `merge` into exact implementation main `95cdc12d7948322585dd71c2e14d32329278016b`;
- exact post-implementation-main CI run `37185171997` completed with all four required jobs successful;
- release publish run `37185333404` completed successfully;
- release branch `release/v0.1.0-alpha.56`, tag `v0.1.0-alpha.56`, GitHub release target, and tested implementation main were verified commit-identical at `95cdc12d7948322585dd71c2e14d32329278016b`;
- published assets:
  - Windows x64 installer SHA-256 `b0ef6102db5a7b7919f5cfaf8d972f91587119a7741951fe8767d6aa63121c79`
  - Linux x64 installer SHA-256 `3dc247e5f8c31c8a41fc860f4a861fdce75c92a5d4729f354807fbfdb6dae038`
  - updater manifest SHA-256 `0499650cfc42da2a75089686c6563944b0be8a5257f4963c88a084d408ea18f4`.

Result: the real installed Windows alpha.56 run proves the complete Slice 7.4 Party Templates scope: Warrior Tank, Priest Healer, DPS recommendation, simple manual role assignment, recommendation restore, managed-member cleanup, and stateless integration over the existing Party Coordinator without gameplay mutation, raw sockets, local messaging traffic, user Script interruption, or stale template-role state. **Slice 7.4 is VERIFIED.**

Phase 8 / Slice 8.1 – Character Cards may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.


---

## Slice 8.1 Verification Record — Character Cards

**Canonical status update: Slice 8.1 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.57`
- tested implementation main / release target: `620763ca56978a883b0973db5c4126137091ae06`
- Windows client: `0.1.0-alpha.57`
- platform: `win32`
- one-click test ID: `live81-7b50f7cd-fe27-4fc5-9578-3e8bbabde016`
- primary Character: `My_Merchant`
- temporary managed Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T07:52:06.842Z → 2026-10-04T07:52:07.219Z`
- diagnostic export: 148 log lines, `Secrets sanitized: yes`.

Character Cards evidence:

- the primary Card exposed HP `3035/3079` and MP `1838/1915`;
- Map was displayed as `main`;
- Target was explicitly represented as no current target;
- Script status was displayed as `unloaded`;
- Health was `healthy` while the primary session was connected and receiving live state;
- the primary Card correctly disabled Start while connected and exposed Stop;
- managed Start created `My_Ranger1` through the existing multi-character session manager;
- the managed Card reported `sessionRole:"managed"`, `connectionStatus:"connected"`, and Health `healthy`;
- managed Script status remained explicitly `not-available`, preserving the existing single primary Script-runtime architecture;
- Pause was validated against the isolated `slice81-pause-probe` bound to the primary Card;
- the probe transitioned to `paused` and the Pause control disabled after the transition;
- the actual user Script runtime remained untouched;
- managed Stop removed only `My_Ranger1`;
- after Stop the managed Card returned to offline Health and Start-ready state;
- final active state returned to one primary session and zero managed sessions.

Isolation and safety evidence:

- user Script status before and after remained `unloaded`;
- `userScriptInterrupted:false`;
- `managedSessionCountAfter:0`;
- primary `My_Merchant` remained `connected`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- no independent per-managed-Character Script runtime was introduced by Slice 8.1.

Repository/release gate evidence:

- implementation PR #111 final feature head: `12767199ae6d916f4e2f724d046f16b983ad33c3`;
- final implementation PR CI run `37186531446` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #111 merged with method `merge` into exact implementation main `620763ca56978a883b0973db5c4126137091ae06`;
- exact post-implementation-main CI run `37186688516` completed with all four required jobs successful;
- release publish run `37186845177` completed successfully;
- release branch `release/v0.1.0-alpha.57`, tag `v0.1.0-alpha.57`, GitHub release target, and tested implementation main were verified commit-identical at `620763ca56978a883b0973db5c4126137091ae06`;
- published assets:
  - Windows x64 installer SHA-256 `714eaf46ba9c4d4586a240f916ea3c6fe66407e1e2e06429a692dea06a2787db`
  - Linux x64 installer SHA-256 `e73d7d991dee142f3418e11b47052c35f75d7bfc13a3fcd2cef5c9276569db38`
  - updater manifest SHA-256 `55431886b8aa1095014bd62fe83c200e47d84440374fd31d82e94118cd570b9a`.

Result: the real installed Windows alpha.57 run proves the complete Slice 8.1 Character Cards scope: Start, Pause, Stop, HP/MP, Map, Target, Script, and Health, while preserving the established primary/managed session model, the single primary Script runtime, user-script isolation, and the no-gameplay-mutation/no-raw-socket safety boundary. **Slice 8.1 is VERIFIED.**

Slice 8.2 – Setup Wizard may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.


---

## Slice 8.2 Verification Record — Setup Wizard

**Canonical status update: Slice 8.2 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.58`
- tested implementation main / release target: `b14379f607029de039075d8f596d08633b003693`
- Windows client: `0.1.0-alpha.58`
- platform: `win32`
- one-click test ID: `live82-1da77edd-3ef4-426d-8b60-af9605fb24de`
- primary Character: `My_Merchant`
- temporary managed Character: `My_Ranger1`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T08:21:39.932Z → 2026-10-04T08:21:40.145Z`
- diagnostic export: 33 log lines, `Secrets sanitized: yes`.

Setup Wizard evidence:

- Account stage used the already connected Adventure Land account without reconnecting or persisting credentials;
- Character stage selected offline `My_Ranger1`;
- Server stage reused EU II / `SR_EUII`;
- Task / Template selected `connect-only`;
- Configuration correctly required no additional fields for Connect only;
- Start reused the existing Character Cards/session-control path;
- one temporary managed session was created and reached `connected`;
- `taskStarted:false`, proving no task/template automation was started by the live-test path;
- all six visible Wizard stages were present in English:
  - Account
  - Character
  - Server
  - Task / Template
  - Configuration
  - Start;
- cleanup removed only the temporary managed Character and preserved the primary session.

Isolation and safety evidence:

- primary `My_Merchant` remained `connected`;
- `managedSessionCountAfter:0`;
- final user Script status remained `unloaded`;
- `userScriptInterrupted:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- the live-test path used Connect only, so it did not execute Simple Farmer or Custom Script automation;
- earlier BLOCKED runs due missing account/primary preconditions remain historical diagnostics and are not failures.

Repository/release gate evidence:

- implementation PR #113 final feature head: `511d5741e00537231a8ef6bf22a7f134bb599c78`;
- final implementation PR CI run `37188104304` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #113 merged with method `merge` into exact implementation main `b14379f607029de039075d8f596d08633b003693`;
- exact post-implementation-main CI run `37188248936` completed with all four required jobs successful;
- release publish run `37188397711` completed successfully;
- release branch `release/v0.1.0-alpha.58`, tag `v0.1.0-alpha.58`, GitHub release target, and tested implementation main were verified commit-identical at `b14379f607029de039075d8f596d08633b003693`;
- published assets:
  - Windows x64 installer SHA-256 `00377cd384f17265478086f22508c0b2d440014ceb5e2f28596f3765140624fe`
  - Linux x64 installer SHA-256 `5f14c03eece98031b49e3f649e362e9371cfc411304e5d2bf810ff816e33eb5a`
  - updater manifest SHA-256 `e217fd029449d43e971bc52bb1b8a3e5faf2cd6280faa56808a2b306ea24f372`.

Result: the real installed Windows alpha.58 run proves the complete Slice 8.2 Setup Wizard scope: Account → Character → Server → Task / Template → Configuration → Start, with all visible Wizard text in English and with the bounded live-test path preserving user-script isolation, primary-session continuity, zero leftover managed sessions, and the no-gameplay-mutation/no-raw-socket safety boundary. **Slice 8.2 is VERIFIED.**

Slice 8.3 – Config UI für Templates may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.


---

## Slice 8.3 Verification Record — Template Configuration UI

**Canonical status update: Slice 8.3 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.59`
- tested implementation main / release target: `1195c22956f9b29e02fbe4675d890913098fa86b`
- Windows client: `0.1.0-alpha.59`
- platform: `win32`
- one-click test ID: `live83-be56e02c-d4c7-40b7-8dfa-52dc6ab30a5f`
- primary Character: `My_Merchant`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T08:49:43.893Z → 2026-10-04T08:49:43.895Z`
- diagnostic export: 215 log lines, `Secrets sanitized: yes`.

Template Configuration evidence:

- the schema-driven UI exposed normal Simple Farmer settings without requiring JavaScript/source edits;
- exposed fields were exactly:
  - Monster
  - HP threshold %
  - MP threshold %
  - Loot
  - Respawn;
- `normalSettingsRequireCodeChanges:false`;
- save changed HP `50 → 49`, MP `30 → 29`, Loot `true → false`, while retaining monster `bee` and Respawn `true`;
- configuration changes round-tripped through the existing Template Configuration / Simple Farmer service path;
- restore returned the exact pre-test draft state;
- no saved draft existed before the test and none remained afterward;
- the live-test path did not start the configured gameplay template.

Isolation and safety evidence:

- primary `My_Merchant` remained `connected`;
- final user Script status remained `unloaded`;
- `userScriptInterrupted:false`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- normal settings remain configurable without code changes;
- the existing template executor and Script runtime remain the only execution paths.

Repository/release gate evidence:

- implementation PR #115 final feature head: `6aee3f376774f6d8ffc5d353a9d97c5c4e8ffe03`;
- final implementation PR CI run `37189640249` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #115 merged with method `merge` into exact implementation main `1195c22956f9b29e02fbe4675d890913098fa86b`;
- exact post-implementation-main CI run `37189763784` completed with all four required jobs successful;
- release publish run `37189914134` completed successfully;
- release branch `release/v0.1.0-alpha.59`, tag `v0.1.0-alpha.59`, GitHub release target, and tested implementation main were verified commit-identical at `1195c22956f9b29e02fbe4675d890913098fa86b`;
- published assets:
  - Windows x64 installer SHA-256 `e514bc820ca55b09373e41e41cedfca7a40917e5fa2c7e3d8f554d58023ef405`
  - Linux x64 installer SHA-256 `8c3bbf1065f750302af11fa0d2aaeaa2471b6f16382310181ce2b9b619081d15`
  - updater manifest SHA-256 `4637c5eec7e53b94712c45375a3dae93cfb0cf3c22a1d0510763ab615d9f952a`.

Result: the real installed Windows alpha.59 run proves the complete Slice 8.3 Config UI für Templates scope: normal Simple Farmer settings can be exposed, changed, validated, saved, and restored through the dashboard without editing Script source, while preserving the primary Character, user Script runtime, and no-gameplay-mutation/no-raw-socket safety boundary. **Slice 8.3 is VERIFIED.**

Before Slice 8.4 begins, the agreed dashboard-maintenance cleanup may hide historical one-click verification controls from the normal dashboard while retaining their services, APIs, automated CI coverage, and historical evidence. Only the currently required verification test should remain visible in the normal workflow.


---

## Slice 8.4 Verification Record — “Why is the bot doing this?”

**Canonical status update: Slice 8.4 = VERIFIED.**

Release/live environment:

- verified release: `v0.1.0-alpha.60`
- tested implementation main / release target: `cfb203e199f5f89733d8174e213e3d39ffdfb445`
- Windows client: `0.1.0-alpha.60`
- platform: `win32`
- one-click test ID: `live84-186baff7-0dec-49a2-98ea-f4af7236bc09`
- primary Character: `My_Merchant`
- server: EU II / `SR_EUII`
- outcome: `passed`
- test window: `2026-10-04T09:38:12.483Z → 2026-10-04T09:38:12.485Z`
- diagnostic export: 35 log lines, `Secrets sanitized: yes`.

Explainability evidence:

- the dashboard exposed the full Slice 8.4 scope in English:
  - Current target
  - Selection reason
  - Rejected targets
  - Range
  - Cooldowns
  - Movement target
  - Next action
  - Strategy
  - Blockers;
- Strategy identified `Simple Farmer`, with configured monster `bee`, runtime status `idle`, and active state `false`;
- current target preview selected visible bee `5757471` at distance `375.3`, with attack range `70` and `inRange:false`;
- selection reason was explicit and correctly stated that this was a read-only preview because the template was not running;
- rejected targets were surfaced with concrete per-target reasons;
- range explanation reported `375.3 > 70`;
- cooldowns reported Attack / HP / MP at `0 ms`;
- Movement target reported none and explained that Simple Farmer itself does not navigate;
- Next action reported `Start template`;
- blockers correctly described the inactive template and the out-of-range target.

Isolation and safety evidence:

- both live-test steps, `explainability` and `isolation`, passed;
- primary `My_Merchant` remained `connected`;
- user Script remained `unloaded`;
- Action Gateway total request count remained exactly `0 → 0`;
- `readOnly:true`;
- `gameplayMutation:false`;
- `rawSocketAccess:false`;
- the explainability layer only mirrors existing Character state, Template Configuration, Simple Farmer state, Action Gateway state, and Movement Debug telemetry;
- no new target-selection engine, movement controller, gameplay mutation path, Script execution path, or raw-socket shortcut was introduced.

Repository/release gate evidence:

- implementation PR #118 final feature head: `25c144b4ec134c1c05ece7d02c6507eccc343848`;
- final implementation PR CI run `37191850363` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #118 merged with method `merge` into exact implementation main `cfb203e199f5f89733d8174e213e3d39ffdfb445`;
- exact post-implementation-main CI run `37191997325` completed with all four required jobs successful;
- release publish run `37192184994` completed successfully;
- release branch `release/v0.1.0-alpha.60`, tag `v0.1.0-alpha.60`, GitHub release target, and tested implementation main were verified commit-identical at `cfb203e199f5f89733d8174e213e3d39ffdfb445`;
- published assets:
  - Windows x64 installer SHA-256 `bf0d147424d9881656c21d0cb5ebdba3132fd6fcf7733d1ee5b5d1535ccbcaaa`
  - Linux x64 installer SHA-256 `dddd576cd25ff0968a992a4aa2e087ec4cff899075087bbe75c0357e694a4f74`
  - updater manifest SHA-256 `1af34f4310df1f07ef01b7c8c45967ce98c42cff980cc2d2c5a35257f11c774b`.

Dashboard verification workflow evidence:

- `Current verification` showed Slice 8.4 as the single active manual one-click test;
- historical one-click controls remain retained in code/API/CI/evidence while hidden from the normal dashboard workflow.

Result: the real installed Windows alpha.60 run proves the complete Slice 8.4 “Why is the bot doing this?” scope and confirms that explainability is observability-only: it exposes target choice, rejection reasons, range, cooldowns, movement context, next action, strategy, and blockers without dispatching gameplay actions or altering the Script/runtime state. **Slice 8.4 is VERIFIED.**

**Phase 8 is complete through Slice 8.4.**

Phase 9 / Slice 9.1 – Dashboard Edit Mode may begin only after this append-only verification record is merged and the resulting exact post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 9.1 Dashboard Edit Mode

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.61`. The real installed one-click test `live91-8e196f02-0e2e-4d61-bfdd-e725d8eaf058` passed Edit dashboard mode, drag-and-drop reordering, resize, 12-column / 48 px grid snapping, widget remove/add, and return to normal mode. The test remained transient by design (`Persistence: false`), made no gameplay mutation, issued zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime. The sanitized diagnostic export contained 11 lines and reported `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #120 final feature head: `ac10b06123ebceee458bfefb7ad9b413c16e01b7`;
- final implementation PR CI run `37193902258` completed with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #120 merged with method `merge` into exact implementation main `9345ddbd9be81a17e993b766de2b0819cf6c0804`;
- exact post-implementation-main CI run `37194083144` completed with all four required jobs successful;
- release publish run `37194244198` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.61`, tag `v0.1.0-alpha.61`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `9345ddbd9be81a17e993b766de2b0819cf6c0804`;
- published assets:
  - Windows x64 installer SHA-256 `512bb62f79133c34b728546731a0678c9c0b5bd6e4ebd3101f55773554f41379`
  - Linux x64 installer SHA-256 `253a69dcf0e8fb082027344fac2282cdf41dd810f16cf97332cad2b4114fbb0f`
  - updater manifest SHA-256 `e49658e6031e8d0c154b7b4b3db068f2ed03fcc73905df7f6a81e7e6de58c31b`.

**Canonical roadmap status: Slice 9.1 = VERIFIED.**

Slice 9.2 – Widget-Konfiguration may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 9.2 Widget Configuration

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.62`. The real installed one-click test `live92-8a073263-f52e-4ccb-afcb-f2308e63c1b3` passed Character selection, field visibility, display options, widget duplication, independent duplicate configuration, and return to normal mode. Configuration persistence remained intentionally disabled for Slice 9.2 (`Configuration persistence: false`), the test made no gameplay mutation, issued zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime. The sanitized diagnostic export contained 11 lines and reported `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #122 final feature head: `818d1991f35c7197395c2f160b5146cf7a69a2c8`;
- final implementation PR CI run `37195674745` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #122 merged with method `merge` into exact implementation main `cf6770f10758638dcc5a6fc8f55549b4f9f7c2c8`;
- exact post-implementation-main CI run `37195822122` completed with all four required jobs successful;
- release publish run `37195955048` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.62`, tag `v0.1.0-alpha.62`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `cf6770f10758638dcc5a6fc8f55549b4f9f7c2c8`;
- published assets:
  - Windows x64 installer SHA-256 `6062c13ca9a198447792872a04e5ecf46dc45bb61a13fbf621e6597cf32c1469`
  - Linux x64 installer SHA-256 `660829fd2c014914cf5989088cacb57d349ea854406e6376d257cb74041c6fbb`
  - updater manifest SHA-256 `b241d85b38c06016bf440e3d4a949a4febac240abf6d394196a924c239d5f60c`.

**Canonical roadmap status: Slice 9.2 = VERIFIED.**

Slice 9.3 may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green. Persistence/restart/undo-redo/profiles remain reserved for Slice 9.4.

---

## Verification Evidence — Slice 9.3 Dashboard Pages and Tabs

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.63`. The real installed one-click test `live93-31e93fd2-d0de-44d7-bce5-eda4cc1fee4a` passed the page catalog, Overview, Combat, Party, Merchant, Logs, Debugging, and return-to-Overview checks. Page selection remained intentionally transient for Slice 9.3 (`Page selection persistence: false`), the test made no gameplay mutation, issued zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime. The sanitized diagnostic export contained 11 lines and reported `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #124 final feature head: `6fea7902ec7076d5bb67033a610143e64f134ab0`;
- final implementation PR CI run `37196889016` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #124 merged with method `merge` into exact implementation main `8c752243892c8123df2b5a7c69e417655ba04a62`;
- exact post-implementation-main CI run `37197051999` completed with all four required jobs successful;
- release publish run `37197211506` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.63`, tag `v0.1.0-alpha.63`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `8c752243892c8123df2b5a7c69e417655ba04a62`;
- published assets:
  - Windows x64 installer SHA-256 `4ccd0c505f3680656cf02f2773bfe59809ae4f7fb3f663d65e0ca7489c17a08d`
  - Linux x64 installer SHA-256 `f475fad1d1b29675a77755601ce6673b9aa697d51a506b628078890a1856974e`
  - updater manifest SHA-256 `ef123174d592b75b0d426fb7ac42255edb8d72d781e8620f7055c47477dd9388`.

**Canonical roadmap status: Slice 9.3 = VERIFIED.**

Slice 9.4 – Layout Persistence and Profiles may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.



---

## Verification Evidence — Slice 9.4 Layout Persistence and Profiles

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.64`. The real installed one-click test `live94-f5e11f90-b74d-40a4-bbe0-9d0acba4da2e` passed save-to-disk, restart/reload, separate Desktop/Small-screen layouts, multiple profiles, Undo/Redo, and Reset. Persistence was enabled and disk reload was explicitly verified. The test made no gameplay mutation, issued zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime. The sanitized diagnostic export contained 11 lines and reported `Secrets sanitized: yes`.

Live verification evidence:

- client: `0.1.0-alpha.64`;
- platform: `win32`;
- test ID: `live94-f5e11f90-b74d-40a4-bbe0-9d0acba4da2e`;
- outcome: `PASSED`;
- test window: `2026-10-04T11:37:28.749Z → 2026-10-04T11:37:28.773Z`;
- `save-to-disk: PASSED`;
- `restart-reload: PASSED`;
- `desktop-small-profiles: PASSED`;
- `multiple-profiles: PASSED`;
- `undo-redo: PASSED`;
- `reset: PASSED`;
- `Persistence: true`;
- `Disk reload: true`;
- `Profiles: multiple`;
- `Viewport layouts: Desktop / Small`;
- `Gameplay mutation: false`;
- `Action Gateway requests: 0`;
- `Raw socket access: false`;
- `User Script touched: false`.

Repository/release evidence:

- canonical implementation PR #126 final feature head: `bf3de36980df8934277b5dbbd95d01004f23e78f`;
- final implementation PR CI run `37198816249` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #126 merged with method `merge` into exact implementation main `b466c9258263b7d6622a812a6c9b9c8c0bcf3de5`;
- exact post-implementation-main CI run `37198968039` completed with all four required jobs successful;
- release publish run `37199122283` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.64`, tag `v0.1.0-alpha.64`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `b466c9258263b7d6622a812a6c9b9c8c0bcf3de5`;
- published assets:
  - Windows x64 installer SHA-256 `40bd9cad8dd6c895e3ed06b244e0b143d44e9ee2fc08d7b64c661490d9761109`
  - Linux x64 installer SHA-256 `4d44af6331cb458a4f500fd7c8afff339bc0ee6e9a13ec0c807e7b10534011ae`
  - updater manifest SHA-256 `6cc3eb0c3c049af86377e67548f4a8875673cec9520af1c0dcfd54928b9a716f`.

**Canonical roadmap status: Slice 9.4 = VERIFIED.**

Slice 9.5 may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 9.5 Dashboard Import/Export

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.65`. The real installed one-click test `live95-2655abcc-7452-471a-ae26-5a848df2ce0a` passed role-neutral export, JSON roundtrip validation, explicit Character role mapping, persistent import/reload, and cleanup. Portable exports contained no fixed Character IDs and no Character names. The imported profile was persisted and successfully reloaded. The test made no gameplay mutation, issued zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime. The sanitized diagnostic export contained 11 lines and reported `Secrets sanitized: yes`.

Live verification evidence:

- client: `0.1.0-alpha.65`;
- platform: `win32`;
- test ID: `live95-2655abcc-7452-471a-ae26-5a848df2ce0a`;
- outcome: `PASSED`;
- test window: `2026-10-04T12:14:43.273Z → 2026-10-04T12:14:43.300Z`;
- `role-neutral-export: PASSED`;
- `json-roundtrip: PASSED`;
- `role-mapping: PASSED`;
- `import-persist-reload: PASSED`;
- `cleanup: PASSED`;
- `Portable export: true`;
- `Fixed Character IDs exported: false`;
- `Character names exported: false`;
- `Role mapping: explicit`;
- `Imported profile persisted: true`;
- `Gameplay mutation: false`;
- `Action Gateway requests: 0`;
- `Raw socket access: false`;
- `User Script touched: false`.

Repository/release evidence:

- implementation PR #129 final feature head: `4f48b7093b0350b9c85ed5f37a019fa3da17d32c`;
- final implementation PR CI run `37200740807` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #129 merged with method `merge` into exact implementation main `de11b27a1b5f5c07b31894edc852104ec9375488`;
- exact post-implementation-main CI run `37200892391` completed with all four required jobs successful;
- release publish run `37201066274` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.65`, tag `v0.1.0-alpha.65`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `de11b27a1b5f5c07b31894edc852104ec9375488`;
- published assets:
  - Windows x64 installer SHA-256 `eef21e2336079612495a511b4eafce4678464270ca0005e47bd831e4a3a43577`
  - Linux x64 installer SHA-256 `30d964e88aa7e4d49ebde4ab65e7d075e5e9dae3226a04ffb2c4d8b356b4d071`
  - updater manifest SHA-256 `6a8dc504f77d04ef153f4a5218fd46495d4223129e6bf1e569358f4511fa3317`.

**Canonical roadmap status: Slice 9.5 = VERIFIED.**

Phase 9 – Dashboard Editor is complete through Slice 9.5 once this verification documentation is merged and the exact resulting post-merge `main` CI is fully green. Phase 10 / Slice 10.1 – Renderer Bridge must not begin before that closure gate is complete.

---

## Verification Evidence — Slice 10.1 Renderer Bridge

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.66`. The real installed one-click test `live101-247ec65e-21fd-4b1a-bf84-262448bc5559` passed snapshot schema validation, SSE stream connection, sequenced state events, Core continuity, Character continuity, Script continuity, read-only Action Gateway verification, and subscriber cleanup. The renderer transport remained read-only: no renderer mutation API was exposed, no Core/Character/Script restart occurred, the test made no gameplay mutation, issued zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime. The sanitized diagnostic export contained 11 lines and reported `Secrets sanitized: yes`.

Live verification evidence:

- client: `0.1.0-alpha.66`;
- platform: `win32`;
- test ID: `live101-247ec65e-21fd-4b1a-bf84-262448bc5559`;
- outcome: `PASSED`;
- test window: `2026-10-04T12:43:11.325Z → 2026-10-04T12:43:11.394Z`;
- `snapshot-schema: PASSED`;
- `stream-connect: PASSED`;
- `sequenced-state-event: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-action-gateway: PASSED`;
- `subscriber-cleanup: PASSED`;
- `Renderer transport: SSE`;
- `Renderer mutation API: false`;
- bridge sequence: `15 → 16 → 16`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- `Action Gateway requests: 0`;
- `Raw socket access: false`;
- `User Script touched: false`.

Repository/release evidence:

- implementation PR #131 final feature head: `d65739616fdcb8476d298458c60771379feece63`;
- final implementation PR CI run `37202446668` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #131 merged with method `merge` into exact implementation main `8db64892c53ff1b9bd83186f598b87f73dbe7950`;
- exact post-implementation-main CI run `37202594289` completed with all four required jobs successful;
- release publish run `37202757672` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.66`, tag `v0.1.0-alpha.66`, GitHub release target, publish-run head, and tested implementation `main` were verified commit-identical at `8db64892c53ff1b9bd83186f598b87f73dbe7950`;
- published assets:
  - Windows x64 installer SHA-256 `c9c6f7afffdedb75da9a9dedc3ce9005c1f090f729418eed78e649c404b94c85`
  - Linux x64 installer SHA-256 `ffa078a0fb3402f66d35bdaa1ccafc2d28dfc213264e82416aaba52478c3fc3a`
  - updater manifest SHA-256 `6b56f9c5e7a0ed7797764d7a72547f82bf0e4f42dfbaeeb7da2bc1e103f18d54`.

**Canonical roadmap status: Slice 10.1 = VERIFIED.**

Slice 10.2 – Browser View may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 10.2 Browser View

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.67`. The real installed one-click test `live102-033065dd-80d4-4dd6-ba73-2379b7bfb539` passed Browser View open, current Character-state rendering, Browser View close, Core continuity, Character continuity, Script continuity, and read-only Action Gateway verification. The Browser View reused the Slice 10.1 read-only Renderer Bridge over SSE, the renderer subscriber count returned from `0 → 1 → 0`, no Core/Character/Script restart occurred, the test made no gameplay mutation, issued zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime. The sanitized diagnostic export contained 11 lines and reported `Secrets sanitized: yes`.

Live verification evidence:

- client: `0.1.0-alpha.67`;
- platform: `win32`;
- test ID: `live102-033065dd-80d4-4dd6-ba73-2379b7bfb539`;
- outcome: `PASSED`;
- test window: `2026-10-04T13:09:38.967Z → 2026-10-04T13:09:39.045Z`;
- `browser-open: PASSED`;
- `character-state-rendered: PASSED`;
- `browser-close: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-action-gateway: PASSED`;
- `Browser View opened: true`;
- `Browser View closed: true`;
- `Renderer transport: SSE`;
- `Character state rendered: true`;
- renderer subscribers: `0 → 1 → 0`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- `Action Gateway requests: 0`;
- `Raw socket access: false`;
- `User Script touched: false`;
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #133 final feature head: `379c2b85a837192740b2ed9ba211466668006a94`;
- final implementation PR CI run `37204077360` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #133 merged with method `merge` into exact implementation main `0da5b42cb5e9b2c68f65261d13f66622bd51c0f3`;
- exact post-implementation-main CI run `37204255045` completed with all four required jobs successful;
- release publish run `37204416740` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.67`, tag `v0.1.0-alpha.67`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `0da5b42cb5e9b2c68f65261d13f66622bd51c0f3`;
- published assets:
  - Windows x64 installer SHA-256 `ab441f7d67dbdfa3ecf16117f6dde126a3d780c4e207b5441dfa1a276fa804a7`
  - Linux x64 installer SHA-256 `ab9c0fe01a777e3f64c5761d5f9928042d3aaa5c34a57a77a3fe0522c4bfccab`
  - updater manifest SHA-256 `9e6085f14f5e51bb5622dcfe4b3301ec1c2aabe3cbdad9017d3c52f9cb6b0441`.

Scope/safety evidence:

- Browser View is read-only and is served by the existing local dashboard server;
- Character state is sourced through the existing Slice 10.1 Renderer Bridge snapshot/SSE transport;
- opening and closing the Browser View does not restart Core, Character, or Script runtime;
- no Renderer mutation API, gameplay mutation route, Action Gateway bypass, raw-socket shortcut, or user Script replacement was introduced;
- Slice 10.3 Control Modes and Slice 10.4 live Headless/Browser handoff remain explicitly out of scope.

**Canonical roadmap status: Slice 10.2 = VERIFIED.**

Slice 10.3 – Control Modes may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 10.3 Control Modes

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.68`. The real installed one-click test `live103-f0b2d8de-1475-4875-8718-2fdc21c7a523` passed Automatic, Assist, and Manual control-mode policy, explicit user-action routing through the Action Gateway, starting-mode restoration, and Core/Character/Script continuity. The test used eight non-gameplay Action Gateway verification probes, caused no gameplay mutation, performed no raw socket access, did not touch the user Script runtime, and did not restart Core, Character, or Script. The sanitized diagnostic export contained 28 lines and reported `Secrets sanitized: yes`.

Live verification evidence:

- client: `0.1.0-alpha.68`;
- platform: `win32`;
- test ID: `live103-f0b2d8de-1475-4875-8718-2fdc21c7a523`;
- outcome: `PASSED`;
- test window: `2026-10-04T13:37:22.826Z → 2026-10-04T13:37:22.860Z`;
- `automatic-policy: PASSED`;
- `assist-policy: PASSED`;
- `manual-policy: PASSED`;
- `user-actions-through-gateway: PASSED`;
- `mode-restored: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- modes verified: `Automatic / Assist / Manual`;
- starting mode: `automatic`;
- restored mode: `automatic`;
- `User actions through Action Gateway: true`;
- Action Gateway verification probes: `8`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- `Raw socket access: false`;
- `User Script touched: false`;
- diagnostic export: 28 log lines, `Secrets sanitized: yes`.

Observed policy evidence:

- Automatic accepted script-origin and explicit dashboard-origin verification probes;
- Assist blocked script-origin verification with `CONTROL_MODE_SCRIPT_BLOCKED` while accepting system-origin and explicit dashboard-origin probes;
- Manual blocked script-origin verification with `CONTROL_MODE_SCRIPT_BLOCKED` and system-origin verification with `CONTROL_MODE_SYSTEM_BLOCKED` while accepting the explicit dashboard-origin probe;
- all accepted verification probes were explicitly non-gameplay and passed through the Action Gateway;
- the control mode was restored to `automatic` after verification without interrupting the user Script or Character.

Repository/release evidence:

- implementation PR #135 final feature head: `aa96d830b4979241d46d9c7dd7cbf8852723b9f1`;
- final implementation PR CI run `37205646028` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #135 merged with method `merge` into exact implementation main `1214cda8e62d318824f60cea51d9b60009c629c7`;
- exact post-implementation-main CI run `37205869011` completed with all four required jobs successful;
- release publish run `37206002263` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.68`, tag `v0.1.0-alpha.68`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `1214cda8e62d318824f60cea51d9b60009c629c7`;
- published assets:
  - Windows x64 installer SHA-256 `4c3bdf534fdd2fed2e8c0419de5574a8e3152edf9ecc6b0e8fb54adf10385971`
  - Linux x64 installer SHA-256 `4a706050fd07f940fdaad2a5216a29c5610546cc1ea9d78f71c1a1007cc89cdd`
  - updater manifest SHA-256 `b7cfc02eaaa08eee125ee984d8538a133c43e5ac53c0b125b1cdf2cd265c7e87`.

Scope/safety evidence:

- control-mode enforcement is centralized in the existing Action Gateway;
- explicit user gameplay actions continue to flow through the Action Gateway;
- changing modes does not stop, replace, or restart the running user Script or Character;
- no new gameplay mutation route, raw-socket shortcut, renderer ownership transfer, or Socket handoff was introduced;
- Slice 10.4 Headless ↔ Browser Live Handoff remains explicitly out of scope.

**Canonical roadmap status: Slice 10.3 = VERIFIED.**

Slice 10.4 – Headless ↔ Browser Live Handoff may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 10.4 Headless ↔ Browser Live Handoff

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.69`. The accepted real installed one-click test `live104-a0d81974-84de-46ae-8171-e3e92e1e3a75` passed dynamic Browser renderer attach/detach, live headless Character socket continuity, running user Script continuity, Core/Character/Script continuity, soft-handoff policy, and zero test-generated gameplay actions. The Browser renderer used the existing Renderer Bridge over SSE, renderer subscribers and attached renderers returned cleanly from `0 → 1 → 0`, the headless Character socket remained Core-owned and preserved, no Core/Character/Script restart occurred, and the test used no raw-socket shortcut.

Live verification evidence:

- client: `0.1.0-alpha.69`;
- platform: `win32`;
- test ID: `live104-a0d81974-84de-46ae-8171-e3e92e1e3a75`;
- outcome: `PASSED`;
- test window: `2026-10-04T14:22:04.712Z → 2026-10-04T14:22:04.799Z`;
- `headless-socket-ready: PASSED`;
- `renderer-attach: PASSED`;
- `socket-continuity-browser: PASSED`;
- `script-continuity-browser: PASSED`;
- `renderer-detach: PASSED`;
- `socket-preserved: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `soft-handoff-policy: PASSED`;
- `no-gameplay-action: PASSED`;
- renderer transport: `SSE`;
- renderer mode: `headless → browser → headless`;
- renderer subscribers: `0 → 1 → 0`;
- attached renderers: `0 → 1 → 0`;
- socket ownership: `headless-core`;
- socket strategy: `preserve`;
- `Socket preserved: true`;
- reconnect fallback: `soft-handoff`;
- `Soft handoff used: false`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- test-generated Action Gateway requests: `0`;
- `Raw socket shortcut: false`;
- `User Script touched: false`;
- diagnostic export: 34 log lines, `Secrets sanitized: yes`.

Running-script evidence:

- the real headless Character `My_Ranger1` connected on `SR_EUII` before the handoff;
- user Script `simple-farmer-template` was loaded and started with run ID `script-df4b578d-148f-4236-8daa-8aa29b257a6d`;
- the Script continued issuing successful `character.attack` requests through the Action Gateway immediately before the one-click handoff verification;
- the one-click snapshot checks then verified the same Script run across Browser attach and detach with no Script restart;
- the user explicitly accepted this installed Alpha.69 run as the canonical fully-passed Slice 10.4 live verification.

Repository/release evidence:

- implementation PR #137 final feature head: `e36f51b90a05ee90f0426e5584abe0106ba83b15`;
- final implementation PR CI run `37207707303` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #137 merged with method `merge` into exact implementation main `14d5f4e3cc8e33e69aefa620a115f0ba35fe5d39`;
- exact post-implementation-main CI run `37207876721` completed with all four required jobs successful;
- release publish run `37208027223` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.69`, tag `v0.1.0-alpha.69`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `14d5f4e3cc8e33e69aefa620a115f0ba35fe5d39`;
- published assets:
  - Windows x64 installer SHA-256 `c8313024a53cad9cd239a860ec8840d5ee743b27bac803bc7696d4def20ba431`
  - Linux x64 installer SHA-256 `4f64783d5cb1af1561af105c28d590264bc5dff1c04790c4001ffae941d41e02`
  - updater manifest SHA-256 `69852fd6948642780818f7c97de2b52df4d34c5dfc35ef32a8b98f1801df9a9b`.

Scope/safety evidence:

- Browser renderer attach/detach is bound to the existing read-only Renderer Bridge SSE lifecycle;
- the Adventure Land Character socket remains owned by the headless Core and is not transferred to Browser JavaScript;
- the active Character connection remained intact without reconnect during the accepted test;
- the running user Script remained on the same runtime/run across the live renderer transition;
- if a future public-browser takeover technically requires reconnect, the recorded fallback is a soft handoff rather than a Bot-process restart;
- no new gameplay mutation route, Action Gateway bypass, browser raw-socket ownership, forced Character reconnect, or user Script replacement was introduced;
- superseded follow-up PR #138 was closed unmerged after the canonical active-socket Alpha.69 test passed.

**Canonical roadmap status: Slice 10.4 = VERIFIED.**

Phase 11 / Slice 11.1 – ALHD Asset Provider may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 11.1 ALHD Asset Provider

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.70`. Real installed one-click test `live111-9ad30e4e-66b4-49e6-a1cc-c6a79225688a` passed ALHD manifest loading, presentation-only semantics, original-asset fallback for known missing-HD and unknown entries, and Core/Character/Script/Action-Gateway continuity. The test used dashboard GET-only reads, caused no gameplay mutation, dispatched zero Action Gateway requests, used no raw socket access, and did not touch the user Script runtime.

Live verification evidence:

- client: `0.1.0-alpha.70`;
- platform: `win32`;
- test ID: `live111-9ad30e4e-66b4-49e6-a1cc-c6a79225688a`;
- outcome: `PASSED`;
- test window: `2026-10-04T14:57:05.063Z → 2026-10-04T14:57:05.071Z`;
- `manifest-loaded: PASSED`;
- `presentation-only: PASSED`;
- `known-original-fallback: PASSED`;
- `unknown-original-fallback: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- provider status: `ready`;
- manifest status: `loaded`;
- manifest: `hd-assets.json`;
- manifest schema: `1`;
- manifest phase: `4-vertical-pilot`;
- manifest source: `Riflex91/Riflex91-Repo@43bcdee99ab12a92f7cbf8e7bcdac8f0e99983f2/Adventure Land HD/manifests/hd-assets.json`;
- replacements: `2`;
- active replacements: `2`;
- packaged HD files available: `0`;
- missing packaged HD files: `2`;
- `Presentation only: true`;
- `Original fallback: true`;
- `Gameplay semantic changes: false`;
- known source resolution: `original / hd-file-missing`;
- unknown source resolution: `original / not-in-manifest`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Dashboard GET only: true`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`;
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #140 final feature head: `fa69a8e50d7f145b77e5b59705f6d63f2e333831`;
- final implementation PR CI run `37210560345` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #140 merged with method `merge` into exact implementation main `6f5f8c47510b353646860048e3278d5fcfc3e269`;
- exact post-implementation-main CI run `37210737660` completed with all four required jobs successful;
- release publish run `37210929441` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.70`, tag `v0.1.0-alpha.70`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `6f5f8c47510b353646860048e3278d5fcfc3e269`;
- published assets:
  - Windows x64 installer SHA-256 `b87009f767aa20c37948210ab333ad49d7b59fbd965a48a65fdb4924b8cc176d`
  - Linux x64 installer SHA-256 `7562cf7a17fba4b05423dfa6c85b756ce3824a652e50545d50ac653583d94fc1`
  - updater manifest SHA-256 `2678ed35e79cff1a862e95d71dd777c681a30427674537da354f72485f0a7627`.

Scope/safety evidence:

- ALHD integration is manifest-backed and read-only;
- provider output is presentation-only and does not modify gameplay data or game semantics;
- original Adventure Land asset paths remain the fallback whenever HD data is unavailable, absent, or invalid;
- packaged Alpha.70 intentionally contains the manifest but no HD replacement files yet; this correctly exercises the required original fallback;
- no WebGL texture-size guard, HD-by-default Browser application, graphics profiles, gameplay mutation route, raw socket access, or user Script replacement was introduced.

**Canonical roadmap status: Slice 11.1 = VERIFIED.**

Slice 11.2 – WebGL Texture-Size Guard may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.

---

## Verification Evidence — Slice 11.2 GPU / Texture Guard

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.71`. Real installed one-click test `live112-9079e8e2-8a63-4e67-9a7d-d1747fdd2dfb` passed real WebGL `MAX_TEXTURE_SIZE` detection, temporary-context cleanup, texture-guard diagnostics, deterministic oversized-HD original fallback, actual-hardware resolution, and Core/Character/Script/Action-Gateway continuity.

Live verification evidence:

- client: `0.1.0-alpha.71`;
- platform: `win32`;
- test ID: `live112-9079e8e2-8a63-4e67-9a7d-d1747fdd2dfb`;
- outcome: `PASSED`;
- test window: `2026-10-04T15:22:59.614Z → 2026-10-04T15:22:59.625Z`;
- `webgl-max-texture-size: PASSED`;
- `texture-guard-diagnostics: PASSED`;
- `oversized-original-fallback: PASSED`;
- `actual-hardware-resolution: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- WebGL context: `webgl`;
- detected `MAX_TEXTURE_SIZE: 16384`;
- `WEBGL_lose_context available: true`;
- `Temporary context released: true`;
- guard available assets: `2`;
- guard eligible assets: `2`;
- guard blocked assets on actual hardware: none;
- `Hardware suitable for active ALHD assets: true`;
- forced guard limit: `1024`;
- forced oversized resolution: `original / texture-too-large`;
- actual hardware resolution: `original / hd-file-missing`;
- `Presentation only: true`;
- `Original fallback: true`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Dashboard GET only: true`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`;
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #142 final feature head: `f222a797cf596f99ab88bf407c2a53f47590a812`;
- final implementation PR CI run `37212162287` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #142 merged with method `merge` into exact implementation main `37cdd90027e697e6df642e44e13be9d37a94b4c0`;
- exact post-implementation-main CI run `37212357296` completed with all four required jobs successful;
- release publish run `37212538843` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.71`, tag `v0.1.0-alpha.71`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `37cdd90027e697e6df642e44e13be9d37a94b4c0`;
- published assets:
  - Windows x64 installer SHA-256 `2fdab267a373aaa6320e387a152753e2aefbe3d4ae855d142f7156aadc42b88f`
  - Linux x64 installer SHA-256 `0361bae4a1e4df00fe9a473266a441095e734c525374a5e6f961b74175e91e29`
  - updater manifest SHA-256 `0d080173f53a663a2fb9422b8bf756fe77b9c11f65cf3ce472ab65a4acd00860`.

Scope/safety evidence:

- WebGL capability detection uses only a temporary browser context and releases it when `WEBGL_lose_context` is available;
- active ALHD entries are checked against their `hdPixels` dimensions before HD resolution;
- oversized HD entries fail closed to the original Adventure Land asset path;
- diagnostics are GET-only and presentation-only;
- no HD-by-default Browser application, graphics profiles, gameplay mutation route, raw socket access, or user Script replacement was introduced.

**Canonical roadmap status: Slice 11.2 = VERIFIED.**

Slice 11.3 – HD Standard im Browser-Renderer may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.



---

## Verification Evidence — Slice 11.3 HD Browser Default

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.72`. Real installed one-click test `live113-97ffa307-040f-42c1-bcf4-42b36d34fccb` passed HD-by-default Browser rendering, real HD payload application, original fallback for a missing HD asset, GPU texture guarding, strict Headless metadata-only behavior, Renderer Bridge attach/detach continuity, and Core/Character/Script/Action-Gateway continuity.

Live verification evidence:

- client: `0.1.0-alpha.72`;
- platform: `win32`;
- test ID: `live113-97ffa307-040f-42c1-bcf4-42b36d34fccb`;
- outcome: `PASSED`;
- test window: `2026-10-04T16:00:27.921Z → 2026-10-04T16:00:28.134Z`;
- `headless-no-hd-payload: PASSED`;
- `browser-hd-default: PASSED`;
- `browser-hd-status: PASSED`;
- `browser-hd-payload-loaded: PASSED`;
- `browser-renderer-attached: PASSED`;
- `runtime-continuity-browser: PASSED`;
- `browser-renderer-detached: PASSED`;
- `headless-stays-metadata-only: PASSED`;
- `core-character-script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- Browser graphics mode: `HD`;
- available HD assets: `2`;
- applied HD assets: `1`;
- applied path: `images/tiles/characters/jubchan_1.png`;
- missing HD path: `images/tiles/map/doors.png`;
- GPU-blocked assets: none;
- detected `MAX_TEXTURE_SIZE: 16384`;
- WebGL context: `webgl`;
- `Temporary context released: true`;
- Headless payload reads before Browser: `0`;
- Headless payload reads stable before Browser: `0`;
- Browser HD payload reads: `1`;
- Browser HD payload bytes: `761458`;
- `Headless loads HD assets: false`;
- `Presentation only: true`;
- `Original fallback: true`;
- Renderer subscribers: `0 → 1 → 0`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`;
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #144 final feature head: `e4fc6ae797f0c94c530848a56a54768a57b28581`;
- final implementation PR CI run `37214393644` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #144 merged with method `merge` into exact implementation main `b421164b3b5435e0e9be0e95f2d1e977c742e662`;
- exact post-implementation-main CI run `37214595244` completed with all four required jobs successful;
- release publish run `37214841618` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.72`, tag `v0.1.0-alpha.72`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `b421164b3b5435e0e9be0e95f2d1e977c742e662`;
- published assets:
  - Windows x64 installer SHA-256 `e0edce0dcca48d4fc8556df2cee776bba36bab6dabdb6ea0885067109f8f54b4`
  - Linux x64 installer SHA-256 `4d06d6363f9d798e2a8013279f920ddc6ae3adf9a04de9c1891b93d85c8bcbb4`
  - updater manifest SHA-256 `8474ca73072d0b976a82c8661e91f484086b253476169a7d2470aa8bdd39a67f`.

Scope/safety evidence:

- Browser mode defaults to HD and applies only verified, available, GPU-suitable ALHD payloads;
- the packaged Jubchan pilot was actually requested and applied while preserving logical dimensions;
- the intentionally missing doors HD payload remained on the original Adventure Land asset path;
- Headless remained metadata-only before, during, and after Browser use and loaded no HD image payloads;
- Browser attach/detach returned Renderer Bridge subscribers to baseline without Core, Character, or Script restart;
- GPU/texture guarding from Slice 11.2 remained active;
- no gameplay semantic change, gameplay mutation, Action Gateway request, raw socket access, or user Script replacement occurred;
- Slice 11.4 graphics profiles were not introduced.

**Canonical roadmap status: Slice 11.3 = VERIFIED.**

Slice 11.4 – Graphics Profiles may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.


---

## Verification Evidence — Slice 11.4 Graphics Profiles

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.73`. Real installed one-click test `live114-b5ffdb37-4d41-4ffc-aaa6-a3e317f0c6b0` passed all four Browser graphics profiles, deterministic profile texture policy, Browser graphics-layer reinitialization, strict Headless metadata-only behavior, original fallback, and Core/Character/Script/Action-Gateway continuity.

Live verification evidence:

- client: `0.1.0-alpha.73`;
- platform: `win32`;
- test ID: `live114-b5ffdb37-4d41-4ffc-aaa6-a3e317f0c6b0`;
- outcome: `PASSED`;
- test window: `2026-10-04T16:31:45.732Z → 2026-10-04T16:31:45.968Z`;
- `headless-no-hd-payload: PASSED`;
- `browser-profile-default-auto: PASSED`;
- `profile-original: PASSED`;
- `profile-hd-performance: PASSED`;
- `profile-hd-auto: PASSED`;
- `profile-hd-maximum: PASSED`;
- `profile-switch-renderer-reinitialized: PASSED`;
- `core-character-script-continuity-during-switch: PASSED`;
- `browser-renderer-detached: PASSED`;
- `headless-stays-metadata-only: PASSED`;
- `core-character-script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- profile sequence: `hd-auto → original → hd-performance → hd-auto → hd-maximum → hd-auto`;
- Renderer generations: `1 → 2 → 3 → 4 → 5 → 6`;
- detected hardware texture limit: `16384`;
- Original applied HD assets: `0`;
- HD Performance applied assets: `1`;
- HD Auto applied assets: `1`;
- HD Maximum applied assets: `1`;
- Original texture limit: `original-only`;
- HD Performance effective texture limit: `2048`;
- HD Auto effective texture limit: `4096`;
- HD Maximum effective texture limit: `16384`;
- Original payload read delta: `0`;
- Browser HD payload reads: `5`;
- Browser HD payload bytes: `3807290`;
- `Headless loads HD assets: false`;
- `Presentation only: true`;
- `Original fallback: true`;
- Renderer subscribers: `0 → 1 → 1 → 0`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`;
- diagnostic export: 11 log lines, `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #146 final feature head: `2f84574a772fb7ab50996129032ca4c656f58a1e`;
- final implementation PR CI run `37216602521` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #146 merged with method `merge` into exact implementation main `7477bb26967164e46372a420b73be6673d6b0931`;
- exact post-implementation-main CI run `37216749104` completed with all four required jobs successful;
- release publish run `37216917511` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.73`, tag `v0.1.0-alpha.73`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `7477bb26967164e46372a420b73be6673d6b0931`;
- published assets:
  - Windows x64 installer SHA-256 `fede5369662a05d8ff75b77e70a6d84a3c33adba972f20968ac9f4665224fc0f`
  - Linux x64 installer SHA-256 `d305e472c41d724a7ea964f1f8a116f4ba407f5f2f2c149e9afb88fd9c78a76f`
  - updater manifest SHA-256 `3229985b38256d6ba37fdb6b2bb10932253d384d2dd7091218bee0f48a3ce87b`.

Scope/safety evidence:

- Browser graphics profiles are exactly Original, HD Performance, HD Auto, and HD Maximum;
- Original loads no HD image payloads;
- HD Performance caps effective texture size at `2048`, HD Auto at `4096`, and HD Maximum uses the detected hardware maximum while retaining the GPU texture guard;
- each profile switch reinitialized only the Browser graphics layer, evidenced by monotonically increasing Renderer generations while the Renderer Bridge subscriber remained attached;
- the Browser renderer returned to the original Headless subscriber baseline after close;
- Headless remained metadata-only and loaded no HD payload data outside Browser rendering;
- original Adventure Land assets remain authoritative fallback for unavailable or unsuitable HD assets;
- no Core, Character, or Script restart occurred during or after the profile switches;
- no gameplay semantic change, gameplay mutation, Action Gateway request, raw socket access, or user Script replacement occurred.

**Canonical roadmap status: Slice 11.4 = VERIFIED. Phase 11 = VERIFIED.**

Phase 12 / Slice 12.1 – Paketformat may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.


---

## Verification Evidence — Slice 12.1 Script Package Format

**Status: VERIFIED**

> 2026-10-04: VERIFIED on Windows with `0.1.0-alpha.74`. Real installed one-click test `live121-c164210e-ccfd-42a4-9965-d9f8de887f35` passed the deterministic `.alrpkg` package descriptor, required manifest metadata, Scripts, Config Schema, README, compatibility, permission declarations, SHA-256 integrity verification, deliberate tamper rejection, and Core/Character/Script/Action-Gateway continuity without importing or executing a package.

Live verification evidence:

- client: `0.1.0-alpha.74`;
- platform: `win32`;
- test ID: `live121-c164210e-ccfd-42a4-9965-d9f8de887f35`;
- outcome: `PASSED`;
- test window: `2026-10-04T16:58:04.685Z → 2026-10-04T16:58:04.694Z`;
- `package-format-descriptor: PASSED`;
- `manifest-required-fields: PASSED`;
- `package-structure-valid: PASSED`;
- `sha256-integrity: PASSED`;
- `tamper-rejected: PASSED`;
- `config-readme-scripts: PASSED`;
- `metadata-compatibility-permissions: PASSED`;
- `declaration-only-no-import-execution: PASSED`;
- `core-continuity: PASSED`;
- `character-continuity: PASSED`;
- `script-continuity: PASSED`;
- `read-only-runtime: PASSED`;
- package format: `alremastered-script-package`;
- file extension: `.alrpkg`;
- schema version: `1`;
- hash algorithm: `sha256`;
- package sections: `manifest, files, hashes`;
- required manifest fields: `id, name, version, author, compatibility, permissions, scripts, configSchema, readme`;
- fixture package ID: `org.alremastered.slice121-fixture`;
- fixture version: `1.0.0`;
- fixture author: `ALRemastered Verification`;
- fixture minimum ALRemastered: `0.1.0-alpha.74`;
- declared permissions: `movement, combat`;
- script count: `2`;
- entry script: `scripts/main.js`;
- Config Schema: `config.schema.json`;
- README: `README.md`;
- file count: `4`;
- package text bytes: `266`;
- manifest SHA-256: `58409b23fb92d2c13e70cb46f2337ab97087aef03ae48c2e386120472c8b88d2`;
- `Tamper rejected: true`;
- tamper error: `PACKAGE_HASH_MISMATCH`;
- `Permission enforcement: false`;
- `Package import attempted: false`;
- `Package execution attempted: false`;
- `Core restart: false`;
- `Character restart: false`;
- `Script restart: false`;
- `Dashboard GET only: true`;
- `Gameplay mutation: false`;
- Action Gateway requests: `0`;
- `Raw socket access: false`;
- `User Script touched: false`;
- diagnostic export: 12 log lines, `Secrets sanitized: yes`.

Repository/release evidence:

- implementation PR #148 final feature head: `628fa59ac35104a4fc6470595c28ad1de6e613ad`;
- final implementation PR CI run `37218200401` completed on that exact head with Ubuntu Verify, Windows Verify, Linux installer upgrade smoke, and Windows installer upgrade smoke all successful;
- PR #148 merged with method `merge` into exact implementation main `ace18295bf85b5459171c7261c1ea119a8b7c2e1`;
- exact post-implementation-main CI run `37218346069` completed with all four required jobs successful;
- release publish run `37218502852` completed successfully for Linux, Windows, and GitHub Release;
- release branch `release/v0.1.0-alpha.74`, tag `v0.1.0-alpha.74`, GitHub Release target, publish-run head, and tested implementation `main` were verified commit-identical at `ace18295bf85b5459171c7261c1ea119a8b7c2e1`;
- published assets:
  - Windows x64 installer SHA-256 `0a0e0b39238b8a1fea5eee3947f77e8e59b2fc866a79d3384ea90e255031ad44`
  - Linux x64 installer SHA-256 `a4085e128ba62a4801dbb487c5b06180e5053fcd294f12a4ca9b88a765649c2f`
  - updater manifest SHA-256 `493c75814fa8e129c3d1a9f59b8c2ccfb91691de31a31ea3b6608991788acafd`.

Scope/safety evidence:

- Slice 12.1 defines and validates the package format only;
- package metadata includes Manifest, Scripts, Config Schema, README, Version, Author, Compatibility, permission declarations, and SHA-256 hashes;
- package paths are normalized and unsafe traversal is rejected by implementation tests;
- modified package content is rejected with `PACKAGE_HASH_MISMATCH`;
- permission declarations are metadata only; enforcement remains reserved for Slice 12.2;
- no package import, installation, or execution path was exercised or introduced for this slice;
- Dashboard verification uses GET-only package-format diagnostics;
- no Core, Character, or Script restart occurred;
- no gameplay mutation, Action Gateway request, raw socket access, or user Script replacement occurred.

**Canonical roadmap status: Slice 12.1 = VERIFIED.**

Slice 12.2 – Permission System may begin only after this verification documentation is merged and the exact resulting post-merge `main` CI is fully green.
