# Dustcode

Dustcode è un agente di programmazione IA open source esclusivo per **VS Code**. Questo fork mantiene solo l'estensione e il backend integrato, senza distribuire una CLI autonoma, un plugin JetBrains o un prodotto cloud.

## Installazione

1. Esegui `bun run build:vscode` dalla radice del repository oppure scarica l'artefatto della tua piattaforma da un'esecuzione riuscita di **VS Code** in GitHub Actions di questo repository.
2. Estrai l'artefatto se necessario e seleziona `dustcode-<target>.vsix` tramite **Extensions: Install from VSIX...** in VS Code.
3. Apri Dustcode e configura separatamente un fornitore di modelli.

L'ID è `dustcode.dustcode`, le impostazioni usano `dustcode.*` e lo stato del progetto è in `.dustcode/`. Credenziali e sessioni di Kilo Code non vengono importate. Non sono configurate pubblicazioni automatiche né una pagina Marketplace Dustcode confermata.

Il [README principale](../README.md) è il riferimento per configurazione e sviluppo. Vedi [RELEASING.md](../RELEASING.md) per build VSIX e artefatti CI.

## Origine E Licenza

Dustcode è un fork di [Kilo Code](https://github.com/Kilo-Org/kilocode), il cui backend deriva da [OpenCode](https://github.com/anomalyco/opencode).

MIT. Puoi usare, modificare e distribuire questo codice, anche commercialmente, purché mantieni le note di attribuzione e licenza. Vedi [License](../LICENSE). Conserva anche gli avvisi di copyright e le licenze dei componenti di terze parti.
