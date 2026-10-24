# Dustcode

Dustcode je AI agent za programiranje otvorenog koda isključivo za **VS Code**. Ovaj fork održava samo ekstenziju i ugrađeni backend, bez zasebnog CLI-ja, JetBrains dodatka ili proizvoda u oblaku.

## Instalacija

1. Pokrenite `bun run build:vscode` iz korijena repozitorija ili preuzmite artefakt za svoju platformu iz uspješnog **VS Code** pokretanja u GitHub Actions ovog repozitorija.
2. Raspakujte artefakt po potrebi i odaberite `dustcode-<target>.vsix` putem **Extensions: Install from VSIX...** u VS Codeu.
3. Otvorite Dustcode i zasebno podesite pružaoca modela.

ID ekstenzije je `dustcode.dustcode`, postavke koriste `dustcode.*`, a stanje projekta je u `.dustcode/`. Podaci za prijavu i sesije iz Kilo Codea se ne uvoze. Automatsko objavljivanje i potvrđena Dustcode Marketplace stranica nisu podešeni.

[Glavni README](../README.md) je mjerodavan za podešavanje i razvoj. Za VSIX buildove i CI artefakte pogledajte [RELEASING.md](../RELEASING.md).

## Porijeklo I Licenca

Dustcode je fork projekta [Kilo Code](https://github.com/Kilo-Org/kilocode), čiji backend potiče iz projekta [OpenCode](https://github.com/anomalyco/opencode).

MIT. Možete koristiti, mijenjati i distribuirati ovaj kod, uključujući komercijalno, dok god zadržite atribuciju i obavijesti o licenci. Pogledajte [License](../LICENSE). Sačuvajte i autorska i licencna obavještenja komponenti trećih strana.
