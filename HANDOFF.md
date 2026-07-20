# HANDOFF — deník stavu: domlov

Append-only. Nejnovější záznam nahoru. Slouží k pokračování z jiného počítače / po pauze.

## 2026-07-20 — vlastní doména + favicon + oponenturní docs
- **Custom domain:** aplikace nově na **https://domlov.maxferit.cz** (Workers Custom Domain na zóně
  maxferit.cz, stejný účet bass443). Přidáno přes dashboard (Worker → Domains → Add Domain), NE do
  wrangler.jsonc — aby CI (token jen „Edit Workers") zůstal nedotčený. `bass443.workers.dev` běží dál
  souběžně (lze později vypnout v Domains). Ověřeno `200`: health `{ok,ai,web:true}`, version 3d61580.
  URL přepsána v README, project-status, OPONENTURA (workers.dev zůstal jen v historických HANDOFF záznamech).
- **Favicon:** brandové modré ◎ (inline SVG data-URI v public/index.html) místo defaultního globusu na oušku.
- **Oponenturní dokumentace:** `docs/OPONENTURA.md` (+ vizuální HTML verze u uživatele v Downloads,
  `domlov-oponentura.html`, s tiskem/PDF). Po posudku doplněno: testovací přístup (7.2), monitoring (7.3),
  předávání secretů do CI (6.1), KV vs D1 pro perzistenci (10).

## 2026-07-20 — CI opraveno + web stopa: Google → Brave Search
- **CI deploy opraven:** `.github/workflows/deploy.yml` padal ze dvou důvodů →
  (1) Node 20 → **22** (wrangler 4.112 vyžaduje Node ≥22), (2) doplněn GitHub repo secret
  `CLOUDFLARE_API_TOKEN` (Edit Workers, účet bass443). Od teď push na `main` = auto-deploy zeleně.
- **Web stopa přepsána z Google Custom Search na Brave Search API.** Důvod: Google ruší
  „prohledávat celý web“ — u nově vytvořených CSE už nejde zapnout, úplný konec **1. 1. 2027**.
  Stavět na tom nemá smysl. Ověřeno živě (přepínač „Vyhledávat na celém internetu“ = „funkce ukončena“).
  - Nový secret **`BRAVE_API_KEY`** (místo `GOOGLE_API_KEY` + `GOOGLE_CX`). `hasWeb()` = jen tento klíč.
  - Metrika: Brave nevrací celkový počet výsledků → `webFootprint()` počítá, kolik z top ~20 výsledků
    obsahuje jméno jako slovo (0 = čisté, 12+ = běžné slovo → `webScore` 0). Endpoint
    `api.search.brave.com/res/v1/web/search`, hlavička `X-Subscription-Token`, limit 50 req/s.
  - Přejmenováno napříč: API `web`/`webEnabled` (dřív `google`/`googleEnabled`), health `{ok,ai,web}`,
    frontend sloupec **Web**, health tečka **Web**, i18n + docs (README/ARCHITECTURE/BUILD/status page).
  - **Cena/limit Brave:** metered (od 02/2026 zrušen čistě free tarif) → ~$5 kreditu/měsíc zdarma
    (≈1000 dotazů), pak ~$5/1000. Bez klíče appka jede dál, skóre jen z domén.
- **Zbývá (volitelné):** nastavit `BRAVE_API_KEY` přes `wrangler secret put BRAVE_API_KEY` → zapne sloupec Web.
  (Nepoužitý Google CSE vyhledávač `b3c06bf316d1345f6` lze v Google účtu smazat.)

## 2026-07-18 — dokumentace + status page
- Přidán **docs/project-status.html** (manažerská vrstva dle standardu: stav, milníky, stack, náklady;
  AXIMA styl, dark/light + tisk v light, CZ/EN).
- README doplněn o live URL + odkaz na status page. README/ARCHITECTURE/BUILD aktuální k nasazení.
- Vše zacommitováno na `main` a pushnuto na GitHub.

## 2026-07-18 — NASAZENO naživo ✅
- **Live:** https://domlov.bass443.workers.dev (účet bass443). Ověřeno v produkci: version/health/statika 200,
  RDAP kontrola i Workers AI generátor fungují.
- **Repo:** https://github.com/Anamax443/domlov (public).
- **Zbývá (volitelné):** Google klíče (`GOOGLE_API_KEY` + `GOOGLE_CX` přes `wrangler secret put`) → zapne sloupec Google.
  Bez nich appka jede, skóre jen z domén.

## 2026-07-18 — MVP hotové, lokálně ověřené
- **Hotové:**
  - Cloudflare Worker (`src/index.ts`): `/api/hunt`, `/api/check`, `/api/health`, `/api/version` + statika.
  - **RDAP** dostupnost domén — autoritativně `.com/.net` (Verisign), `.cz` (CZ.NIC), `.io` (IdentityDigital),
    `.app/.dev/.org` přes rdap.org (+ `User-Agent`, jinak blokoval → to způsobovalo `unknown`).
  - **Workers AI** generátor názvů — model `@cf/meta/llama-3.3-70b-instruct-fp8-fast`
    (původní `llama-3.1-8b-instruct` byl 2026-05-30 deprecated). Robustní parsování (string i pole).
  - **Skóre** = domény (váha .com/.cz) + nízká Google stopa. Bez Google klíče jede jen z domén.
  - **Frontend** `public/index.html` dle AXIMA UI (archetyp A, modrá): dark/light/print, CZ/EN,
    servisní řádek (health · commit · živé hodiny), 3 taby (Generátor / Rychlá kontrola / Dokumentace).
  - Ověřeno `wrangler dev`: clashio → com/net/org zabraná, cz/io/app/dev volná ✓; generátor vrací tematické názvy ✓.
- **Rozpracované / zbývá:**
  - Push do veřejného repa `Anamax443/domlov`.
  - Google klíče (`GOOGLE_API_KEY` + `GOOGLE_CX`) — zatím nevyplněné → sloupec Google vypnutý. Návod v docs/BUILD.md.
  - Deploy na Cloudflare (`npm run deploy`) + volitelně `CLOUDFLARE_API_TOKEN` do GitHub secrets pro auto-deploy.

## 2026 — start
- Projekt založen podle standardu (scaffold).
- **Hotové:** základní soubory.
- **Rozpracované:** —
- **Zbývá:** vyplnit README, ověřit jádro funkce, sepsat docs/BUILD.md.
