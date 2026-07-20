/**
 * domlov — lov volných domén + generátor značkových názvů
 * Cloudflare Worker: RDAP (dostupnost domén) + Workers AI (návrhy názvů) + Brave Search (stopa na webu).
 * Skóre: volná .com/.cz + minimum výskytů jména na webu = ideál (faxxar-level).
 * Pozn.: Google Custom Search „prohledávej celý web“ Google ruší (mrtvé 1.1.2027) → nahrazeno Brave Search API.
 */
import version from "./version.json";

export interface Env {
  AI: any;              // Workers AI binding
  ASSETS: Fetcher;      // statický frontend (public/)
  BRAVE_API_KEY?: string; // Brave Search API token (volitelný — bez něj se stopa na webu nepočítá)
}

// Váha TLD ve skóre — .com a .cz jsou pro Milana klíčové.
const TLD_WEIGHTS: Record<string, number> = {
  com: 3, cz: 3, net: 1.5, io: 1.5, app: 1, dev: 1, org: 1,
};
const DEFAULT_TLDS = ["com", "cz"];
// Jen TLD se spolehlivým RDAP (rozliší volná/zabraná). .eu/.sk RDAP nemají → vynechány.
const CHECK_TLDS = ["com", "cz", "net", "io", "app", "dev", "org"];

// Autoritativní RDAP endpointy (spolehlivější než bootstrap); zbytek přes rdap.org (app/dev/org).
const RDAP_BASE: Record<string, string> = {
  com: "https://rdap.verisign.com/com/v1/domain/",
  net: "https://rdap.verisign.com/net/v1/domain/",
  cz: "https://rdap.nic.cz/domain/",
  io: "https://rdap.identitydigital.services/rdap/domain/",
};

// Slušný User-Agent — bez něj některé RDAP servery (rdap.org) odpověď blokují/limitují.
const RDAP_UA = "domlov/0.1 domain-availability-checker";

// Workers AI model pro generování názvů (aktuální; starší llama-3.1-8b byl deprecated 2026-05).
const AI_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Web stopa (Brave Search): kolik top výsledků vzorkujeme a od kolika shod považujeme jméno za „obsazené“.
const WEB_SAMPLE = 20;  // count dotazu na Brave (1 dotaz = 1 request bez ohledu na count)
const WEB_HEAVY = 12;   // 12+ shod jména v top výsledcích → webScore = 0 (běžné slovo / existující značka)

type Avail = "free" | "taken" | "unknown";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === "/api/version") return json(version);
      if (p === "/api/health") {
        return json({ ok: true, ai: true, web: hasWeb(env) });
      }
      if (p === "/api/hunt" && request.method === "POST") return await handleHunt(request, env);
      if (p === "/api/check" && request.method === "POST") return await handleCheck(request, env);
    } catch (err: any) {
      return json({ error: String(err?.message ?? err) }, 500);
    }
    // vše ostatní = statický frontend
    return env.ASSETS.fetch(request);
  },
};

/* ----------------------------- Endpointy ----------------------------- */

async function handleHunt(request: Request, env: Env): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const theme = String(body.theme ?? "").trim().slice(0, 200);
  if (!theme) return json({ error: "Chybí zaměření (theme)." }, 400);

  let tlds = sanitizeTlds(body.tlds, DEFAULT_TLDS);
  // Rozpočet subrequestů (Free plan ~50/request). Autoritativní RDAP (com/net/cz/io) neretryuje,
  // ostatní (rdap.org) můžou 1× retryovat → počítáme je 2×. + 1 Brave dotaz na název.
  const bootstrap = tlds.filter((t) => !RDAP_BASE[t]).length;
  const perName = tlds.length + bootstrap + 1;
  const maxNames = Math.max(1, Math.floor(45 / perName));
  const requested = clamp(Number(body.count) || 8, 1, 12);
  const count = Math.min(requested, maxNames);
  const exclude = sanitizeExclude(body.exclude);

  const names = await generateNames(theme, count, env, exclude);
  const results = await Promise.all(names.map((name) => evaluate(name, tlds, env)));
  results.sort((a, b) => b.score - a.score);

  return json({ theme, tlds, webEnabled: hasWeb(env), requested, maxNames, results });
}

async function handleCheck(request: Request, env: Env): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const name = normalizeName(String(body.name ?? ""));
  if (!name) return json({ error: "Neplatný název." }, 400);
  const tlds = sanitizeTlds(body.tlds, CHECK_TLDS);
  const res = await evaluate(name, tlds, env);
  return json({ webEnabled: hasWeb(env), result: res });
}

/* ----------------------------- Jádro ----------------------------- */

async function evaluate(name: string, tlds: string[], env: Env) {
  const avail: Record<string, Avail> = {};
  await Promise.all(
    tlds.map(async (t) => {
      avail[t] = await checkDomain(name, t);
    })
  );
  const web = await webFootprint(name, env);
  const scored = scoreName(avail, tlds, web);
  return { name, avail, web, ...scored };
}

/** RDAP: 404 = volná, 200 = zabraná. Retry 1× na 429/5xx/síťovou chybu. */
async function checkDomain(name: string, tld: string): Promise<Avail> {
  const base = RDAP_BASE[tld];
  const url = base ? `${base}${name}.${tld}` : `https://rdap.org/domain/${name}.${tld}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: "application/rdap+json", "User-Agent": RDAP_UA },
        redirect: "follow",
      });
      if (r.status === 404) return "free";
      if (r.status === 200) return "taken";
      if (attempt === 0 && (r.status === 429 || r.status >= 500)) continue; // transientní → zkus znovu
      return "unknown";
    } catch {
      if (attempt === 0) continue;
      return "unknown";
    }
  }
  return "unknown";
}

/**
 * Brave Search — stopa značky na webu. Brave nevrací celkový počet výsledků,
 * tak měříme sílu stopy: kolik z top výsledků reálně obsahuje dané jméno jako slovo.
 * Vymyšlené unikátní jméno → ~0 shod (čisté), běžné slovo/značka → hodně shod. Méně = líp.
 * Vrací 0..WEB_SAMPLE, nebo null když klíč chybí / dotaz selže (graceful).
 */
async function webFootprint(query: string, env: Env): Promise<number | null> {
  if (!hasWeb(env)) return null;
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query);
  u.searchParams.set("count", String(WEB_SAMPLE));
  u.searchParams.set("safesearch", "off");
  const headers = {
    Accept: "application/json",
    "Accept-Encoding": "gzip",
    "X-Subscription-Token": env.BRAVE_API_KEY!,
  };
  // 1× retry na 429/5xx/síťovou chybu — při huntu jde víc Brave dotazů naráz a burst občas dostane 429.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(u.toString(), { headers, cf: { cacheTtl: 3600, cacheEverything: true } as any });
      if (attempt === 0 && (r.status === 429 || r.status >= 500)) continue; // transientní → zkus znovu
      if (!r.ok) return null; // 401/jiné → stopa neznámá, appka běží dál
      const data: any = await r.json();
      const results: any[] = Array.isArray(data?.web?.results) ? data.web.results : [];
      if (!results.length) return 0;
      const re = new RegExp("\\b" + escapeRegex(query) + "\\b", "i");
      let hits = 0;
      for (const it of results) {
        const hay = `${it?.title ?? ""} ${it?.description ?? ""} ${it?.url ?? ""}`;
        if (re.test(hay)) hits++;
      }
      return hits;
    } catch {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

/** Generátor názvů přes Workers AI (Llama). Vrací normalizovaná, unikátní jména; vynechává `exclude`. */
async function generateNames(theme: string, count: number, env: Env, exclude: string[] = []): Promise<string[]> {
  const avoid = exclude.slice(0, 40); // do promptu jen rozumný vzorek už použitých
  const system =
    "Jsi generátor značkových názvů (brand names). Vymýšlíš krátká, dobře vyslovitelná, VYMYŠLENÁ slova " +
    "vhodná jako název firmy/appky a zároveň jako doména. Preferuj unikátní neologismy (jako 'faxxar', 'zovix', 'maxferit'), " +
    "ne běžná slovníková slova ani existující značky. Bez diakritiky, bez mezer, jen malá písmena a-z.";
  const user =
    `Zaměření: ${theme}\n` +
    (avoid.length ? `NEPOUŽÍVEJ tyto už navržené názvy (vymysli jiné): ${avoid.join(", ")}.\n` : "") +
    `Vygeneruj ${count + 6} kandidátů. Délka 4–14 znaků. ` +
    `Vrať POUZE JSON pole řetězců, nic jiného. Příklad formátu: ["faxxar","zovix","brelly"]`;

  let text = "";
  try {
    const resp: any = await env.AI.run(AI_MODEL, {
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 400,
      temperature: 0.9,
    });
    const raw = resp?.response ?? resp?.choices?.[0]?.message?.content ?? "";
    text = typeof raw === "string" ? raw : JSON.stringify(raw); // model občas vrátí rovnou pole/objekt
  } catch {
    text = "";
  }

  let out = parseNames(text);
  if (out.length < count) out = out.concat(fallbackNames(theme)); // pojistka když AI selže
  // dedup + oříznout na count; `seen` předvyplněné vyloučenými → už použité jména se přeskočí
  const seen = new Set<string>(exclude);
  const final: string[] = [];
  for (const n of out) {
    if (n && !seen.has(n)) {
      seen.add(n);
      final.push(n);
    }
    if (final.length >= count) break;
  }
  return final;
}

/* ----------------------------- Skóre ----------------------------- */

function scoreName(avail: Record<string, Avail>, tlds: string[], web: number | null) {
  let got = 0;
  let max = 0;
  for (const t of tlds) {
    const w = TLD_WEIGHTS[t] ?? 1;
    max += w;
    if (avail[t] === "free") got += w;
  }
  const domainScore = max ? got / max : 0; // 0..1

  // Web stopa: méně výskytů jména v top výsledcích = čistší značka. 0 shod -> 1.0, WEB_HEAVY+ shod -> 0.
  let webScore: number | null = null;
  if (web != null) {
    webScore = clamp(1 - web / WEB_HEAVY, 0, 1);
  }

  const score =
    webScore == null
      ? Math.round(domainScore * 100)
      : Math.round((0.55 * domainScore + 0.45 * webScore) * 100);

  return { domainScore: round2(domainScore), webScore: webScore == null ? null : round2(webScore), score };
}

/* ----------------------------- Helpery ----------------------------- */

function hasWeb(env: Env): boolean {
  return !!env.BRAVE_API_KEY;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeExclude(input: any): string[] {
  const arr = Array.isArray(input) ? input : [];
  const clean = arr.map((x: any) => normalizeName(String(x))).filter(Boolean);
  return [...new Set(clean)].slice(0, 200); // strop, ať prompt/dedup nenaroste donekonečna
}

function sanitizeTlds(input: any, fallback: string[]): string[] {
  const arr = Array.isArray(input) ? input : [];
  const clean = arr
    .map((t: any) => String(t).toLowerCase().replace(/[^a-z]/g, ""))
    .filter((t: string) => t.length >= 2 && t.length <= 10);
  const uniq = [...new Set(clean)].slice(0, 8);
  return uniq.length ? uniq : fallback;
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diakritika pryč
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function parseNames(text: string): string[] {
  if (!text) return [];
  // 1) zkus JSON pole
  const m = text.match(/\[[\s\S]*?\]/);
  if (m) {
    try {
      const arr = JSON.parse(m[0]);
      if (Array.isArray(arr)) {
        return arr.map((x) => normalizeName(String(x))).filter((x) => x.length >= 3 && x.length <= 20);
      }
    } catch {
      /* spadne do fallbacku */
    }
  }
  // 2) fallback: rozděl podle nepísmen
  return text
    .split(/[^a-zA-Z0-9]+/)
    .map((x) => normalizeName(x))
    .filter((x) => x.length >= 3 && x.length <= 20);
}

// Nouzový algoritmický generátor, když Workers AI vrátí prázdno.
function fallbackNames(theme: string): string[] {
  const stem = normalizeName(theme).slice(0, 6) || "brand";
  const suf = ["ly", "io", "ix", "ora", "aro", "ify", "eo", "ka", "os", "ar"];
  return suf.map((s) => normalizeName(stem + s)).filter((x) => x.length >= 3);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
