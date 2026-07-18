# BUILD — jak postavit domlov od nuly

> **Test hotovosti:** dostane se nový člověk (nebo já po výměně PC) JEN z tohoto dokumentu
> k běžící aplikaci? Když ne, doplň, co chybělo.

## 1. Závislosti
- **Node.js 18+** (vyvíjeno na 24.x).
- **npm** (součást Node).
- **Cloudflare účet** + přihlášený Wrangler (`npx wrangler login`).
- Vše ostatní (`wrangler`, `@cloudflare/workers-types`) doinstaluje `npm install`.

## 2. Získání kódu
```bash
git clone https://github.com/Anamax443/domlov.git
cd domlov
npm install
```

## 3. Konfigurace a secrety

Appka běží i **bez** klíčů — jen bez sloupce „Google“ (skóre je pak jen podle domén).
Pro počty výsledků v Googlu potřebuješ dvě hodnoty:

### 3a. Google API klíč (zdarma)
1. https://console.cloud.google.com → nový projekt (nebo existující).
2. **APIs & Services → Library → „Custom Search API“ → Enable.**
3. **APIs & Services → Credentials → Create credentials → API key.** Zkopíruj klíč → `GOOGLE_API_KEY`.

### 3b. Programmable Search Engine (CX)
1. https://programmablesearchengine.google.com → **Add** (nový vyhledávač).
2. Zvol **„Search the entire web“** (prohledávat celý web).
3. Po vytvoření otevři **Overview** → zkopíruj **Search engine ID** → `GOOGLE_CX`.

### 3c. Lokálně
```bash
cp .dev.vars.example .dev.vars   # (Windows: copy)
# vyplň GOOGLE_API_KEY a GOOGLE_CX
```
`.dev.vars` je v `.gitignore` — nikdy se necommitne.

> **Limit:** Google CSE free tier = **100 dotazů/den**. Každý zkontrolovaný název = 1 dotaz.

## 4. Build
Bundluje a typuje Wrangler (esbuild) automaticky. Ověření bez nasazení:
```bash
npx wrangler deploy --dry-run --outdir .wrangler/dry
```

## 5. Spuštění lokálně
```bash
npm run dev        # orazítkuje src/version.json + spustí wrangler dev
# → http://127.0.0.1:8787
```
> Workers AI binding jede i v `dev` proti **vzdáleným** zdrojům (potřeba `wrangler login`).
> Může čerpat free neuronovou kvótu i v lokálním dev.

## 6. Nasazení do produkce
```bash
# volitelně produkční secrety pro Google (jinak appka běží bez Google sloupce):
npx wrangler secret put GOOGLE_API_KEY
npx wrangler secret put GOOGLE_CX

npm run deploy     # orazítkuje verzi + wrangler deploy
```
- **Cíl:** Cloudflare Workers (účet dle `wrangler whoami`).
- **Ověření běhu:** otevři URL Workeru → v hlavičce svítí health tečky (Backend/AI/Google),
  commit hash sedí s `git rev-parse --short HEAD`, hodiny tikají.
- **Automaticky:** push na `main` spouští `.github/workflows/deploy.yml` (potřebuje GitHub secret
  `CLOUDFLARE_API_TOKEN` s právem „Edit Workers“; secrety Google se nastavují přes `wrangler secret`, ne v Action).

## 7. Certifikáty / přístupy / práva
- **Cloudflare API token** (pro GitHub Action): Dashboard → My Profile → API Tokens → *Edit Cloudflare Workers*.
  Ulož jako GitHub repo secret `CLOUDFLARE_API_TOKEN`.
- Žádné podpisové certifikáty ani servisní účty nejsou potřeba.
