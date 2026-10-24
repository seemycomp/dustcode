# Dustcode

Dustcode ist ein quelloffener KI-Coding-Agent ausschließlich für **VS Code**. Dieser Fork pflegt nur die Erweiterung und ihr eingebettetes Backend, keine eigenständige CLI, kein JetBrains-Plugin und kein Cloud-Produkt.

## Installation

1. Führe im Repository-Stamm `bun run build:vscode` aus oder lade das passende Plattform-Artefakt aus einem erfolgreichen **VS Code**-Lauf in GitHub Actions dieses Repositorys herunter.
2. Entpacke das Artefakt bei Bedarf und wähle `dustcode-<target>.vsix` über **Extensions: Install from VSIX...** in VS Code.
3. Öffne Dustcode und richte einen Modellanbieter separat ein.

Die Erweiterungs-ID lautet `dustcode.dustcode`. Einstellungen verwenden `dustcode.*`, der Projektzustand liegt in `.dustcode/`. Zugangsdaten und Sitzungen von Kilo Code werden nicht importiert. Automatische Veröffentlichung und ein bestätigter Dustcode-Marketplace-Eintrag sind nicht eingerichtet.

Die [Haupt-README](../README.md) ist maßgeblich für Konfiguration und Entwicklung. Details zu VSIX-Builds und CI-Artefakten stehen in [RELEASING.md](../RELEASING.md).

## Herkunft Und Lizenz

Dustcode ist ein Fork von [Kilo Code](https://github.com/Kilo-Org/kilocode); das Backend stammt von [OpenCode](https://github.com/anomalyco/opencode) ab.

MIT. Du darfst diesen Code verwenden, ändern und verbreiten, auch kommerziell, solange du die Attribution und Lizenzhinweise beibehältst. Siehe [License](../LICENSE). Urheberrechts- und Lizenzhinweise von Drittanbietern bleiben erhalten.
