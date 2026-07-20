# domlov

> Lov volných domén + generátor značkových názvů. Zadáš zaměření → dostaneš názvy s kontrolou dostupnosti domén a stopou na webu.

**🌐 Běží naživo:** <https://domlov.bass443.workers.dev> · **Stav projektu:** [docs/project-status.html](docs/project-status.html)

## Co to dělá

- **Generátor názvů** — podle zaměření (klidně česky) vymyslí značkové, vymyšlené názvy (Cloudflare Workers AI / Llama).
- **Kontrola domén** — u každého názvu ověří dostupnost přes **RDAP** (`.com`, `.cz`, `.net`, `.io`, `.app`, `.dev`, `.org`).
- **Stopa na webu** — kolik z top výsledků Brave Search obsahuje to jméno. **Méně = čistší značka** (ideál „faxxar“ = skoro nula).
- **Skóre** — kombinuje volné domény (váha na `.com`/`.cz`) a nízkou stopu na webu. Nejlepší kandidát dostane ★.
- **Rychlá kontrola** — vlož konkrétní název (např. `clashio`) a zkontroluj domény napříč TLD bez generování.

## Stack

- **Cloudflare Worker** (TypeScript) — API i servírování statiky.
- **Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) — generování názvů.
- **RDAP** — autoritativní registry (Verisign `.com/.net`, CZ.NIC `.cz`, IdentityDigital `.io`) + `rdap.org` bootstrap pro zbytek.
- **Brave Search API** — web stopa (volitelné). Nahradilo Google Custom Search (Google ruší „prohledávat celý web“, konec 1. 1. 2027).
- Frontend: jeden `public/index.html`, vlastní CSS (AXIMA UI standard, archetyp A — IT-ops), bez frameworku.

## Požadavky

- Node.js 18+ (vyvíjeno na 24), účet Cloudflare (`wrangler login`).
- Volitelně: Brave Search API klíč (pro sloupec Web).

## Spuštění / build

```bash
npm install
npm run dev        # http://127.0.0.1:8787  (orazítkuje verzi + wrangler dev)
```

## Konfigurace

Tajemství nikdy do gitu — zkopíruj `.dev.vars.example` → `.dev.vars` a vyplň lokálně:

```
BRAVE_API_KEY=…
```

Bez této hodnoty appka funguje taky — jen se nepočítá stopa na webu a skóre je jen podle domén.
Získání klíče: [docs/BUILD.md](docs/BUILD.md).

## Nasazení

```bash
npx wrangler secret put BRAVE_API_KEY    # produkční secret (volitelné)
npm run deploy
```

Postup od nuly viz [docs/BUILD.md](docs/BUILD.md).

## Dokumentace

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — jak je to poskládané
- [docs/BUILD.md](docs/BUILD.md) — jak postavit od nuly (výrobní, včetně Brave klíče)
- [docs/OPONENTURA.md](docs/OPONENTURA.md) — obhajobová dokumentace (zadání, rozhodnutí, ověření, limity)
- [HANDOFF.md](HANDOFF.md) — deník stavu

## Bezplatné?

Převážně: Cloudflare Worker (100k req/den) + Workers AI (denní neuronová kvóta) + RDAP (zdarma). Brave Search je metered — ~$5 kreditu/měsíc zdarma (≈1000 dotazů), pak ~$5/1000; bez Brave klíče jede appka jen na doménách.
