# Architektura — domlov

## Přehled
Jeden Cloudflare Worker dělá dvě věci: servíruje statický frontend (`public/`) a obsluhuje `/api/*`.
Žádná databáze, žádný build krok navíc — stav je bezstavový, vše se počítá za běhu z externích služeb.

## Komponenty
- **`src/index.ts`** — Worker: router + jádro (RDAP kontrola, Workers AI generátor, Google počty, skóre).
- **`public/index.html`** — celý frontend (HTML+CSS+JS v jednom), AXIMA UI standard archetyp A (IT-ops, modrá),
  dark/light/print, CZ/EN i18n, servisní řádek (health · commit · živé hodiny).
- **`src/version.json`** — commit/branch/čas buildu; plní `scripts/stamp-version.mjs` před `dev`/`deploy`.
- **Bindingy** (`wrangler.jsonc`): `AI` (Workers AI), `ASSETS` (statika).
- **Secrety** (mimo git): `GOOGLE_API_KEY`, `GOOGLE_CX`.

## API
| Endpoint | Metoda | Co dělá |
|---|---|---|
| `/api/version` | GET | `{commit, branch, builtAt}` (servisní řádek) |
| `/api/health` | GET | `{ok, ai, google}` (health tečky) |
| `/api/hunt` | POST | `{theme, count, tlds}` → generuje názvy + hodnotí |
| `/api/check` | POST | `{name, tlds}` → jen dostupnost + Google pro jeden název |
| `/*` | GET | statický frontend (binding `ASSETS`) |

## Datový tok (hunt)
1. Frontend pošle `POST /api/hunt {theme, count, tlds}`.
2. **Workers AI** (Llama) vygeneruje kandidáty → normalizace (malá písmena, bez diakritiky, dedup).
   Pojistka: když AI selže, naskočí algoritmický `fallbackNames`.
3. Pro každý název paralelně: **RDAP** dostupnost per TLD + **Google** počet výsledků.
4. **Skóre** = `0.55 × dostupnost domén` (váha `.com`/`.cz` = 3) `+ 0.45 × nízká Google stopa`
   (log škála: 0 výsledků → plný bod). Bez Google klíče = skóre jen z domén.
5. Seřadit sestupně, vrátit JSON, frontend vykreslí tabulku (nejlepší = ★).

## RDAP detail
- Autoritativní endpointy (spolehlivé): Verisign `.com/.net`, CZ.NIC `.cz`, IdentityDigital `.io`.
- Ostatní (`.app/.dev/.org`) přes `rdap.org` bootstrap — nutný slušný `User-Agent`, jinak blokuje.
- `404` = volná, `200` = zabraná, jinak `unknown` (retry 1× na 429/5xx).
- `.eu/.sk` vynechány — nemají použitelný RDAP (vracely by falešné „volná“).

## Externí závislosti
- **Cloudflare Workers AI** — generování názvů (free neuronová kvóta).
- **RDAP servery** — Verisign, CZ.NIC, IdentityDigital, rdap.org (zdarma, bez klíče).
- **Google Custom Search JSON API** — počty výsledků (volitelné, free 100/den).

## Limity a rozhodnutí
- **Subrequesty** (Free plan ~50/request): `hunt` omezuje počet názvů podle počtu TLD
  (`maxNames = floor(45 / (tlds+1))`), TLD max 8.
- Bezstavové — žádná perzistence, žádné rate-limity vlastní; ochrana je hlavně přes Google denní kvótu.
