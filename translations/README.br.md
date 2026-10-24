# Dustcode

Dustcode é um agente de programação com IA de código aberto exclusivo para **VS Code**. Este fork mantém apenas a extensão e seu backend integrado, sem distribuir CLI independente, plugin JetBrains ou produto na nuvem.

## Instalação

1. Execute `bun run build:vscode` na raiz do repositório ou baixe o artefato da sua plataforma em uma execução bem-sucedida de **VS Code** no GitHub Actions deste repositório.
2. Extraia o artefato se necessário e selecione `dustcode-<target>.vsix` com **Extensions: Install from VSIX...** no VS Code.
3. Abra o Dustcode e configure um provedor de modelos separadamente.

O ID é `dustcode.dustcode`; as configurações usam `dustcode.*` e o estado do projeto fica em `.dustcode/`. Credenciais e sessões do Kilo Code não são importadas. Não há publicação automática nem página confirmada do Dustcode no Marketplace configuradas.

O [README principal](../README.md) é a referência para configuração e desenvolvimento. Veja [RELEASING.md](../RELEASING.md) para builds VSIX e artefatos de CI.

## Origem E Licença

Dustcode é um fork do [Kilo Code](https://github.com/Kilo-Org/kilocode), cujo backend deriva do [OpenCode](https://github.com/anomalyco/opencode).

MIT. Você pode usar, modificar e distribuir este código, inclusive comercialmente, desde que mantenha os avisos de atribuição e licença. Consulte [License](../LICENSE). Preserve também os avisos de copyright e as licenças dos componentes de terceiros.
