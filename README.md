# domlov

> Lov volných domén + generátor značkových názvů. Zadáš zaměření → dostaneš názvy s kontrolou dostupnosti domén a stopou v Googlu.

**🌐 Běží naživo:** <https://domlov.bass443.workers.dev> · **Stav projektu:** [docs/project-status.html](docs/project-status.html)

## Co to dělá

- **Generátor názvů** — podle zaměření (klidně česky) vymyslí značkové, vymyšlené názvy (Cloudflare Workers AI / Llama).
- **Kontrola domén** — u každého názvu ověří dostupnost přes **RDAP** (`.com`, `.cz`, `.net`, `.io`, `.app`, `.dev`, `.org`).
- **Stopa v Googlu** — počet výsledků z Google Custom Search. **Méně = čistší značka** (ideál „faxxar“ = skoro nula).
- **Skóre** — kombinuje volné domény (váha na `.com`/`.cz`) a nízkou stopu v Googlu. Nejlepší kandidát dostane ★.
- **Rychlá kontrola** — vlož konkrétní název (např. `clashio`) a zkontroluj domény napříč TLD bez generování.

## Stack

- **Cloudflare Worker** (TypeScript) — API i servírování statiky.
- **Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) — generování názvů.
- **RDAP** — autoritativní registry (Verisign `.com/.net`, CZ.NIC `.cz`, IdentityDigital `.io`) + `rdap.org` bootstrap pro zbytek.
- **Google Custom Search JSON API** — počty výsledků (volitelné).
- Frontend: jeden `public/index.html`, vlastní CSS (AXIMA UI standard, archetyp A — IT-ops), bez frameworku.

## Požadavky

- Node.js 18+ (vyvíjeno na 24), účet Cloudflare (`wrangler login`).
- Volitelně: Google API klíč + Programmable Search Engine ID (pro sloupec Google).

## Spuštění / build

```bash
npm install
npm run dev        # http://127.0.0.1:8787  (orazítkuje verzi + wrangler dev)
```

## Konfigurace

Tajemství nikdy do gitu — zkopíruj `.dev.vars.example` → `.dev.vars` a vyplň lokálně:

```
GOOGLE_API_KEY=…
GOOGLE_CX=…
```

Bez těchto hodnot appka funguje taky — jen se nepočítá stopa v Googlu a skóre je jen podle domén.
Získání klíčů: [docs/BUILD.md](docs/BUILD.md).

## Nasazení

```bash
npx wrangler secret put GOOGLE_API_KEY    # produkční secrety (volitelné)
npx wrangler secret put GOOGLE_CX
npm run deploy
```

Postup od nuly viz [docs/BUILD.md](docs/BUILD.md).

## Dokumentace

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — jak je to poskládané
- [docs/BUILD.md](docs/BUILD.md) — jak postavit od nuly (výrobní, včetně Google klíče)
- [HANDOFF.md](HANDOFF.md) — deník stavu

## Bezplatné?

Ano, v rámci free tierů: Cloudflare Worker (100k req/den) + Workers AI (denní neuronová kvóta) + RDAP (zdarma) + Google CSE (100 dotazů/den zdarma).
