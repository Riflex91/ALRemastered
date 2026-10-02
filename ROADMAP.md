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
9. Benutzer testet den **gemergten `main`**
10. bei Fehler:
    - Debug-Konsole öffnen
    - **Gesamten Log kopieren**
    - Log zur Analyse schicken
    - Fehler in einem Fix-Slice beheben
11. erst nach bestandenem Livetest den nächsten geplanten Slice freigeben

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

**Status: MERGED – AWAITING USER TEST**

> 2026-10-02: Persistent versioned game-data cache merged in `0.1.0-alpha.13`. Automated Windows/Linux CI passed. Live validation is still required before this slice can be marked VERIFIED.

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

- sichere Account-/Session-Anbindung
- keine Secrets im Log
- Verbindungsstatus im Dashboard
- explizite Fehlerzustände

### Livetest

Login/Verbindung auf echtem Account.

---

## Slice 2.2 – Character-Liste und Serverauswahl

- Charaktere anzeigen
- Klasse/Level, soweit verfügbar
- Serverliste
- Server wählen
- noch **keinen** Character starten

### Livetest

Abgleich Dashboard ↔ tatsächlicher Account.

---

## Slice 2.3 – Erster Headless-Character-Connect

- exakt einen Character starten
- Socket/Transport
- Disconnect
- kontrolliertes Stoppen
- keine Automation

### Livetest

Character verbinden, einige Minuten stehen lassen, stoppen; bei Problemen Gesamten Log kopieren.

---

## Slice 2.4 – Basis-Live-State

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

- Inventory
- Equipment
- Gold
- Conditions

### Livetest

Items im offiziellen Spiel verändern und State-Abgleich prüfen.

---

## Slice 2.6 – Entities und Party State

- Entities in relevanter Umgebung
- Monster/Player-Typen
- Party-State

### Livetest

Bewegen/Party betreten und Logs/State vergleichen.

---

# Phase 3 – Character-Steuerung

## Slice 3.1 – Action Gateway

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

- einfache Bewegung
- Validierung
- Action-Logging

### Livetest

Bewegung ausschließlich über Dashboard-Testkontrollen.

---

## Slice 3.3 – Attack

- Target
- Range-Prüfung
- Attack
- Cooldown-/Result-Logging

### Livetest

Ein ausgewähltes Monster manuell über Testaktion angreifen.

---

## Slice 3.4 – Skills

- Skill-Aufruf
- Target
- Cooldowns
- Fehlerzustände

### Livetest

Unkritische Skills kontrolliert testen.

---

## Slice 3.5 – Loot und Consumables

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
