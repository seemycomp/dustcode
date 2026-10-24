# Dustcode

Dustcode to otwartoźródłowy agent programistyczny AI wyłącznie dla **VS Code**. Ten fork utrzymuje tylko rozszerzenie i dołączony backend, bez osobnego CLI, wtyczki JetBrains ani produktu chmurowego.

## Instalacja

1. Uruchom `bun run build:vscode` w katalogu głównym repozytorium lub pobierz artefakt swojej platformy z udanego uruchomienia **VS Code** w GitHub Actions tego repozytorium.
2. W razie potrzeby rozpakuj artefakt i wybierz `dustcode-<target>.vsix` przez **Extensions: Install from VSIX...** w VS Code.
3. Otwórz Dustcode i osobno skonfiguruj dostawcę modeli.

Identyfikator rozszerzenia to `dustcode.dustcode`. Ustawienia używają `dustcode.*`, a stan projektu jest w `.dustcode/`. Dane logowania i sesje Kilo Code nie są importowane. Nie skonfigurowano automatycznej publikacji ani potwierdzonej strony Dustcode w Marketplace.

[Główny README](../README.md) zawiera obowiązujące informacje o konfiguracji i rozwoju. Budowanie VSIX i artefakty CI opisuje [RELEASING.md](../RELEASING.md).

## Pochodzenie I Licencja

Dustcode jest forkiem [Kilo Code](https://github.com/Kilo-Org/kilocode), którego backend pochodzi z [OpenCode](https://github.com/anomalyco/opencode).

MIT. Możesz używać, modyfikować i dystrybuować ten kod, również komercyjnie, o ile zachowasz informacje o autorstwie i licencji. Zobacz [License](../LICENSE). Zachowaj też informacje o prawach autorskich i licencjach komponentów zewnętrznych.
