# Dustcode

Dustcode es un agente de programación con IA de código abierto exclusivo para **VS Code**. Este fork mantiene solo la extensión y su backend integrado; no distribuye una CLI independiente, un plugin de JetBrains ni un producto en la nube.

## Instalación

1. Ejecuta `bun run build:vscode` desde la raíz del repositorio o descarga el artefacto de tu plataforma de una ejecución correcta de **VS Code** en GitHub Actions de este repositorio.
2. Descomprime el artefacto si es necesario y selecciona `dustcode-<target>.vsix` con **Extensions: Install from VSIX...** en VS Code.
3. Abre Dustcode y configura un proveedor de modelos por separado.

El ID es `dustcode.dustcode`; la configuración usa `dustcode.*` y el estado del proyecto se guarda en `.dustcode/`. No se importan credenciales ni sesiones de Kilo Code. No hay publicación automática ni una página confirmada de Dustcode en Marketplace configuradas.

El [README principal](../README.md) contiene la información de referencia sobre configuración y desarrollo. Consulta [RELEASING.md](../RELEASING.md) para las compilaciones VSIX y los artefactos de CI.

## Origen Y Licencia

Dustcode deriva de [Kilo Code](https://github.com/Kilo-Org/kilocode), cuyo backend deriva de [OpenCode](https://github.com/anomalyco/opencode).

MIT. Puedes usar, modificar y distribuir este código, incluso comercialmente, siempre que conserves los avisos de atribución y licencia. Consulta [License](../LICENSE). Conserva también los avisos de copyright y las licencias de terceros.
