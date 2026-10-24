# Dustcode

Dustcode er en open source AI-kodningsagent udelukkende til **VS Code**. Denne fork vedligeholder kun udvidelsen og dens indbyggede backend, ikke en selvstændig CLI, et JetBrains-plugin eller et cloudprodukt.

## Installation

1. Kør `bun run build:vscode` fra repositoryets rod, eller hent artefaktet til din platform fra en vellykket **VS Code**-kørsel i dette repositorys GitHub Actions.
2. Pak om nødvendigt artefaktet ud, og vælg `dustcode-<target>.vsix` med **Extensions: Install from VSIX...** i VS Code.
3. Åbn Dustcode, og konfigurer en modeludbyder separat.

Udvidelsens ID er `dustcode.dustcode`. Indstillinger bruger `dustcode.*`, og projekttilstand ligger i `.dustcode/`. Loginoplysninger og sessioner fra Kilo Code importeres ikke. Automatisk publicering og en bekræftet Dustcode-side på Marketplace er ikke konfigureret.

[Hoved-README](../README.md) er den gældende reference for konfiguration og udvikling. Se [RELEASING.md](../RELEASING.md) for VSIX-builds og CI-artefakter.

## Oprindelse Og Licens

Dustcode er en fork af [Kilo Code](https://github.com/Kilo-Org/kilocode), hvis backend stammer fra [OpenCode](https://github.com/anomalyco/opencode).

MIT. Du kan bruge, ændre og distribuere denne kode, også kommercielt, så længe du beholder attribution og licensmeddelelser. Se [License](../LICENSE). Bevar også tredjepartskomponenters ophavsrets- og licensmeddelelser.
