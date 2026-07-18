# HANDOFF — deník stavu: domlov

Append-only. Nejnovější záznam nahoru. Slouží k pokračování z jiného počítače / po pauze.

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
