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

