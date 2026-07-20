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

Appka běží i **bez** klíče — jen bez sloupce „Web“ (skóre je pak jen podle domén).
Stopa na webu (kolik top výsledků obsahuje dané jméno) jede přes **Brave Search API** — potřebuješ jednu hodnotu.

> **Proč Brave a ne Google?** Google ruší u Custom Search „prohledávat celý web“
> (u nových vyhledávačů už nejde zapnout, úplný konec 1. 1. 2027), takže na měření
> webové stopy se nedá spolehnout. Brave Search API je nezávislá náhrada.

### 3a. Brave Search API klíč
1. https://api-dashboard.search.brave.com → registrace / přihlášení.
2. Vyber plán (free kredit ~$5/měsíc ≈ 1000 dotazů; může chtít kartu) a vytvoř **API key**.
3. Zkopíruj token → `BRAVE_API_KEY`.

### 3b. Lokálně
```bash
cp .dev.vars.example .dev.vars   # (Windows: copy)
# vyplň BRAVE_API_KEY
```
`.dev.vars` je v `.gitignore` — nikdy se necommitne.

> **Limit/cena:** Brave zrušil čistě free tarif (únor 2026) → metered, ~$5 kreditu/měsíc zdarma
> (≈ 1000 dotazů), pak ~$5/1000. Každý zkontrolovaný název = 1 dotaz (1 hunt 8 jmen = 8 dotazů).
> Limit 50 req/s. Když dotaz selže (429/klíč chybí), stopa je „–“ a appka běží dál.

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
# volitelně produkční secret pro stopu na webu (jinak appka běží bez sloupce Web):
npx wrangler secret put BRAVE_API_KEY

npm run deploy     # orazítkuje verzi + wrangler deploy
```
- **Cíl:** Cloudflare Workers (účet dle `wrangler whoami`).
- **Ověření běhu:** otevři URL Workeru → v hlavičce svítí health tečky (Backend/AI/Web),
  commit hash sedí s `git rev-parse --short HEAD`, hodiny tikají.
- **Automaticky:** push na `main` spouští `.github/workflows/deploy.yml` (potřebuje GitHub secret
  `CLOUDFLARE_API_TOKEN` s právem „Edit Workers“; secret `BRAVE_API_KEY` se nastavuje přes `wrangler secret`, ne v Action).

## 7. Certifikáty / přístupy / práva
- **Cloudflare API token** (pro GitHub Action): Dashboard → My Profile → API Tokens → *Edit Cloudflare Workers*.
  Ulož jako GitHub repo secret `CLOUDFLARE_API_TOKEN`.
- Žádné podpisové certifikáty ani servisní účty nejsou potřeba.
