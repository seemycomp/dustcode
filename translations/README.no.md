# Dustcode

Dustcode er en AI-kodeagent med åpen kildekode kun for **VS Code**. Denne forken vedlikeholder bare utvidelsen og dens innebygde backend, ikke en frittstående CLI, en JetBrains-plugin eller et skyprodukt.

## Installasjon

1. Kjør `bun run build:vscode` fra roten av repositoriet, eller last ned artefakten for din plattform fra en vellykket **VS Code**-kjøring i dette repositoriets GitHub Actions.
2. Pakk ut artefakten ved behov, og velg `dustcode-<target>.vsix` med **Extensions: Install from VSIX...** i VS Code.
3. Åpne Dustcode og konfigurer en modelltilbyder separat.

Utvidelsens ID er `dustcode.dustcode`. Innstillinger bruker `dustcode.*`, og prosjektstatus ligger i `.dustcode/`. Innloggingsinformasjon og økter fra Kilo Code importeres ikke. Automatisk publisering og en bekreftet Dustcode-side på Marketplace er ikke konfigurert.

[Hoved-README](../README.md) er den gjeldende referansen for konfigurasjon og utvikling. Se [RELEASING.md](../RELEASING.md) for VSIX-bygg og CI-artefakter.

## Opphav Og Lisens

Dustcode er en fork av [Kilo Code](https://github.com/Kilo-Org/kilocode), der backend stammer fra [OpenCode](https://github.com/anomalyco/opencode).

MIT. Du kan bruke, endre og distribuere denne koden, også kommersielt, så lenge du beholder attribusjons- og lisensmerknadene. Se [License](../LICENSE). Behold også opphavsretts- og lisensmerknader fra tredjepartskomponenter.
