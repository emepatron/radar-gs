import { fetchPublicHtml, SiteOfflineError } from "../safe-fetch";

export type Enrichment = {
  siteStatus: "none" | "ok" | "error" | "social" | "offline";
  emails: string[];
  instagram: string | null;
  whatsapp: string | null;
  whatsappSource: "site" | "celular" | null;
  metaPixel: boolean;
  googleAds: boolean;
  gtm: boolean;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_IGNORED_EXT = /\.(png|jpe?g|gif|svg|webp|css|js)$/i;
const EMAIL_IGNORED_DOMAINS = /(sentry|wixpress|example\.com|domain\.com|seudominio|yourdomain)/i;

const INSTAGRAM_RE = /instagram\.com\/([A-Za-z0-9_.]{1,30})/gi;
const INSTAGRAM_NON_PROFILES = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "sharer", "share"]);

const SOCIAL_HOSTS = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linktr\.ee|wa\.me|whatsapp\.com|linkedin\.com|tiktok\.com)$/i;

const WHATSAPP_RE = /(?:wa\.me\/|whatsapp\.com\/send\/?\?(?:[^"'\s]*?&(?:amp;)?)?phone=)\+?(\d{10,15})/i;

export function extractFromHtml(html: string) {
  const emails = [...new Set((html.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))]
    .filter((e) => !EMAIL_IGNORED_EXT.test(e) && !EMAIL_IGNORED_DOMAINS.test(e))
    .slice(0, 3);

  let instagram: string | null = null;
  for (const match of html.matchAll(INSTAGRAM_RE)) {
    const handle = match[1].replace(/\.+$/, "");
    if (handle && !INSTAGRAM_NON_PROFILES.has(handle.toLowerCase())) {
      instagram = `https://instagram.com/${handle}`;
      break;
    }
  }

  const wa = html.match(WHATSAPP_RE);

  return {
    emails,
    instagram,
    whatsapp: wa ? `https://wa.me/${wa[1]}` : null,
    metaPixel: /connect\.facebook\.net\/[^"']*fbevents|fbq\(\s*['"]init|facebook\.com\/tr\?id=/i.test(html),
    googleAds: /\bAW-\d{6,}/.test(html),
    gtm: /googletagmanager\.com\/gtm\.js|\bGTM-[A-Z0-9]{4,}/.test(html),
  };
}

// Celular brasileiro: DDD + 9 dígitos começando em 9. Fixo não tem WhatsApp presumido.
export function whatsappFromPhone(nationalPhone: string | null | undefined) {
  const digits = (nationalPhone ?? "").replace(/\D/g, "").replace(/^0/, "");
  return digits.length === 11 && digits[2] === "9" ? `https://wa.me/55${digits}` : null;
}

export async function enrichPlace(website: string | null, phone: string | null): Promise<Enrichment> {
  const phoneWhatsapp = whatsappFromPhone(phone);
  const empty = {
    emails: [],
    instagram: null,
    whatsapp: phoneWhatsapp,
    whatsappSource: phoneWhatsapp ? ("celular" as const) : null,
    metaPixel: false,
    googleAds: false,
    gtm: false,
  };

  if (!website) return { siteStatus: "none", ...empty };

  let host: string;
  try {
    host = new URL(website).hostname;
  } catch {
    return { siteStatus: "error", ...empty };
  }

  // Perfil de rede social cadastrado como site: não é site próprio, mas o próprio link pode ser o contato.
  if (SOCIAL_HOSTS.test(host)) {
    const found = extractFromHtml(website);
    return {
      siteStatus: "social",
      ...empty,
      instagram: found.instagram,
      whatsapp: found.whatsapp ?? phoneWhatsapp,
      whatsappSource: found.whatsapp ? "site" : empty.whatsappSource,
    };
  }

  try {
    const html = await fetchPublicHtml(website).catch((e) => {
      if (e instanceof SiteOfflineError) throw e;
      return fetchPublicHtml(website, { timeoutMs: 25_000 });
    });
    const found = extractFromHtml(html);
    return {
      siteStatus: "ok",
      ...found,
      whatsapp: found.whatsapp ?? phoneWhatsapp,
      whatsappSource: found.whatsapp ? "site" : empty.whatsappSource,
    };
  } catch (e) {
    return { siteStatus: e instanceof SiteOfflineError ? "offline" : "error", ...empty };
  }
}
