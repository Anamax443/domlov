/**
 * domlov — lov volných domén + generátor značkových názvů
 * Cloudflare Worker: RDAP (dostupnost domén) + Workers AI (návrhy názvů) + Google Custom Search (stopa v Googlu).
 * Skóre: volná .com/.cz + minimum Google výsledků = ideál (faxxar-level).
 */
import version from "./version.json";

export interface Env {
  AI: any;              // Workers AI binding
  ASSETS: Fetcher;      // statický frontend (public/)
  GOOGLE_API_KEY?: string;
  GOOGLE_CX?: string;
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

type Avail = "free" | "taken" | "unknown";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === "/api/version") return json(version);
      if (p === "/api/health") {
        return json({ ok: true, ai: true, google: hasGoogle(env) });
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
  // Ochrana proti limitu subrequestů (Free plan ~50): names * (tlds + 1 google) <= 45
  const maxNames = Math.max(1, Math.floor(45 / (tlds.length + 1)));
  let count = clamp(Number(body.count) || 8, 1, Math.min(12, maxNames));

  const names = await generateNames(theme, count, env);
  const results = await Promise.all(names.map((name) => evaluate(name, tlds, env)));
  results.sort((a, b) => b.score - a.score);

  return json({ theme, tlds, googleEnabled: hasGoogle(env), results });
}

async function handleCheck(request: Request, env: Env): Promise<Response> {
  const body: any = await request.json().catch(() => ({}));
  const name = normalizeName(String(body.name ?? ""));
  if (!name) return json({ error: "Neplatný název." }, 400);
  const tlds = sanitizeTlds(body.tlds, CHECK_TLDS);
  const res = await evaluate(name, tlds, env);
  return json({ googleEnabled: hasGoogle(env), result: res });
}

/* ----------------------------- Jádro ----------------------------- */

async function evaluate(name: string, tlds: string[], env: Env) {
  const avail: Record<string, Avail> = {};
  await Promise.all(
    tlds.map(async (t) => {
      avail[t] = await checkDomain(name, t);
    })
  );
  const google = await googleCount(name, env);
  const scored = scoreName(avail, tlds, google);
  return { name, avail, google, ...scored };
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

/** Google Custom Search — odhad počtu výsledků (searchInformation.totalResults). */
async function googleCount(query: string, env: Env): Promise<number | null> {
  if (!hasGoogle(env)) return null;
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", env.GOOGLE_API_KEY!);
  u.searchParams.set("cx", env.GOOGLE_CX!);
  u.searchParams.set("q", `"${query}"`); // přesná fráze = reálná stopa značky
  u.searchParams.set("num", "1");
  u.searchParams.set("fields", "searchInformation/totalResults");
  try {
    const r = await fetch(u.toString(), { cf: { cacheTtl: 3600, cacheEverything: true } as any });
    if (!r.ok) return null;
    const data: any = await r.json();
    const total = data?.searchInformation?.totalResults;
    return total != null ? Number(total) : null;
  } catch {
    return null;
  }
}

/** Generátor názvů přes Workers AI (Llama). Vrací normalizovaná, unikátní jména. */
async function generateNames(theme: string, count: number, env: Env): Promise<string[]> {
  const system =
    "Jsi generátor značkových názvů (brand names). Vymýšlíš krátká, dobře vyslovitelná, VYMYŠLENÁ slova " +
    "vhodná jako název firmy/appky a zároveň jako doména. Preferuj unikátní neologismy (jako 'faxxar', 'zovix', 'maxferit'), " +
    "ne běžná slovníková slova ani existující značky. Bez diakritiky, bez mezer, jen malá písmena a-z.";
  const user =
    `Zaměření: ${theme}\n` +
    `Vygeneruj ${count + 4} kandidátů. Délka 4–14 znaků. ` +
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
  // dedup + oříznout na count
  const seen = new Set<string>();
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

function scoreName(avail: Record<string, Avail>, tlds: string[], google: number | null) {
  let got = 0;
  let max = 0;
  for (const t of tlds) {
    const w = TLD_WEIGHTS[t] ?? 1;
    max += w;
    if (avail[t] === "free") got += w;
  }
  const domainScore = max ? got / max : 0; // 0..1

  // Google: méně = líp. 0 výsledků -> 1.0, ~10^8 -> 0. Log škála.
  let googleScore: number | null = null;
  if (google != null) {
    googleScore = clamp(1 - Math.log10(google + 1) / 8, 0, 1);
  }

  const score =
    googleScore == null
      ? Math.round(domainScore * 100)
      : Math.round((0.55 * domainScore + 0.45 * googleScore) * 100);

  return { domainScore: round2(domainScore), googleScore: googleScore == null ? null : round2(googleScore), score };
}

/* ----------------------------- Helpery ----------------------------- */

function hasGoogle(env: Env): boolean {
  return !!(env.GOOGLE_API_KEY && env.GOOGLE_CX);
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
