# Dustcode

Dustcode est un agent de programmation IA open source réservé à **VS Code**. Ce fork maintient uniquement l'extension et son backend intégré, sans distribuer de CLI autonome, de plugin JetBrains ni de produit cloud.

## Installation

1. Exécutez `bun run build:vscode` à la racine du dépôt ou téléchargez l'artefact de votre plateforme depuis une exécution réussie de **VS Code** dans GitHub Actions de ce dépôt.
2. Décompressez l'artefact si nécessaire, puis sélectionnez `dustcode-<target>.vsix` avec **Extensions: Install from VSIX...** dans VS Code.
3. Ouvrez Dustcode et configurez séparément un fournisseur de modèles.

L'identifiant est `dustcode.dustcode`. Les paramètres utilisent `dustcode.*` et l'état du projet est stocké dans `.dustcode/`. Les identifiants et sessions Kilo Code ne sont pas importés. Aucune publication automatique ni page Marketplace Dustcode confirmée n'est configurée.

Le [README principal](../README.md) fait référence pour la configuration et le développement. Consultez [RELEASING.md](../RELEASING.md) pour les builds VSIX et les artefacts CI.

## Origine Et Licence

Dustcode est un fork de [Kilo Code](https://github.com/Kilo-Org/kilocode), dont le backend dérive d'[OpenCode](https://github.com/anomalyco/opencode).

MIT. Vous pouvez utiliser, modifier et distribuer ce code, y compris commercialement, tant que vous conservez les mentions d'attribution et de licence. Voir [License](../LICENSE). Conservez également les mentions de copyright et licences des composants tiers.
