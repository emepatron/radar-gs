import { describe, expect, it } from "vitest";
import { isDailyQuotaError } from "../quota";
import { fetchPublicHtml, SiteOfflineError } from "../safe-fetch";
import type { Settings } from "../settings";
import { enrichPlace, extractFromHtml, whatsappFromPhone } from "./enrich";
import { isPublicBody, scorePlace } from "./score";

const DEFAULT_SETTINGS: Settings = {
  weights: { noSite: 30, manyReviews: 25, noAdsPixel: 20, whatsapp: 10, whatsappInstagram: 20 },
  minReviews: 40,
  minQualifiedScore: 40,
  monthlyLimit: 950,
  maxDepth: 3,
};

describe("extractFromHtml", () => {
  it("encontra e-mail, Instagram, WhatsApp e pixels", () => {
    const html = `
      <a href="mailto:contato@escritorio.com.br">E-mail</a>
      <a href="https://www.instagram.com/escritorio.silva/">Insta</a>
      <a href="https://api.whatsapp.com/send?text=oi&amp;phone=5565999887766">Zap</a>
      <script>fbq('init', '123');</script>
      <script src="https://www.googletagmanager.com/gtag/js?id=AW-1234567"></script>`;
    const r = extractFromHtml(html);
    expect(r.emails).toEqual(["contato@escritorio.com.br"]);
    expect(r.instagram).toBe("https://instagram.com/escritorio.silva");
    expect(r.whatsapp).toBe("https://wa.me/5565999887766");
    expect(r.metaPixel).toBe(true);
    expect(r.googleAds).toBe(true);
    expect(r.gtm).toBe(false);
  });

  it("ignora falsos positivos", () => {
    const html = `
      <img src="logo@2x.png">
      <a href="https://instagram.com/p/Cabc123">post</a>
      <a href="https://instagram.com/explore/tags/x">tag</a>
      <p>erro reportado a 1a2b@o123.ingest.sentry.io</p>
      <script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>`;
    const r = extractFromHtml(html);
    expect(r.emails).toEqual([]);
    expect(r.instagram).toBeNull();
    expect(r.whatsapp).toBeNull();
    expect(r.metaPixel).toBe(false);
    expect(r.googleAds).toBe(false);
  });

  it("pula link de post e pega o perfil que vem depois", () => {
    const r = extractFromHtml(`instagram.com/reel/xyz instagram.com/clinica_bela`);
    expect(r.instagram).toBe("https://instagram.com/clinica_bela");
  });

  it("detecta wa.me e GTM", () => {
    const r = extractFromHtml(`<a href="https://wa.me/+5565999887766">Zap</a> GTM-ABCD12`);
    expect(r.whatsapp).toBe("https://wa.me/5565999887766");
    expect(r.gtm).toBe(true);
  });
});

describe("whatsappFromPhone", () => {
  it("aceita celular e rejeita fixo", () => {
    expect(whatsappFromPhone("(65) 99988-7766")).toBe("https://wa.me/5565999887766");
    expect(whatsappFromPhone("065 99988-7766")).toBe("https://wa.me/5565999887766");
    expect(whatsappFromPhone("(65) 3549-1234")).toBeNull();
    expect(whatsappFromPhone(null)).toBeNull();
  });
});

describe("scorePlace", () => {
  const base = {
    website: null,
    ratingCount: 0,
    siteStatus: "none" as const,
    metaPixel: false,
    googleAds: false,
    gtm: false,
    whatsapp: null,
    instagram: null,
  };

  it("sem site, muitas avaliações e WhatsApp", () => {
    const r = scorePlace({ ...base, ratingCount: 40, whatsapp: "https://wa.me/1" }, DEFAULT_SETTINGS);
    expect(r.score).toBe(30 + 25 + 10);
  });

  it("site sem pixel com WhatsApp e Instagram usa o bônus no lugar do +10", () => {
    const r = scorePlace(
      { ...base, website: "https://x.com", siteStatus: "ok", whatsapp: "w", instagram: "i", ratingCount: 39 },
      DEFAULT_SETTINGS,
    );
    expect(r.score).toBe(20 + 20);
  });

  it("GTM conta como pixel e site com erro não soma 'sem pixel'", () => {
    expect(scorePlace({ ...base, website: "https://x.com", siteStatus: "ok", gtm: true }, DEFAULT_SETTINGS).score).toBe(0);
    expect(scorePlace({ ...base, website: "https://x.com", siteStatus: "error" }, DEFAULT_SETTINGS).score).toBe(0);
  });
});

describe("site que não é site próprio", () => {
  it("Instagram cadastrado como site vira contato e conta como 'só rede social'", async () => {
    const r = await enrichPlace("https://www.instagram.com/adv.maria/", "(65) 3549-1234");
    expect(r.siteStatus).toBe("social");
    expect(r.instagram).toBe("https://instagram.com/adv.maria");
    expect(r.whatsapp).toBeNull();
  });

  it("Facebook cadastrado como site usa o celular para o WhatsApp", async () => {
    const r = await enrichPlace("https://www.facebook.com/Fabiani-1058467980958543/", "(65) 99988-7766");
    expect(r.siteStatus).toBe("social");
    expect(r.whatsapp).toBe("https://wa.me/5565999887766");
    expect(r.whatsappSource).toBe("celular");
  });

  it("domínio inexistente vira 'offline'", async () => {
    await expect(fetchPublicHtml("https://radar-gs-dominio-que-nao-existe-7x9.com.br/")).rejects.toBeInstanceOf(
      SiteOfflineError,
    );
    const r = await enrichPlace("https://radar-gs-dominio-que-nao-existe-7x9.com.br/", null);
    expect(r.siteStatus).toBe("offline");
  });

  it("'só rede social' e 'fora do ar' somam como sem site; erro comum não", () => {
    const place = {
      website: "https://x.com.br",
      ratingCount: 0,
      metaPixel: false,
      googleAds: false,
      gtm: false,
      whatsapp: null,
      instagram: null,
    };
    expect(scorePlace({ ...place, siteStatus: "offline" }, DEFAULT_SETTINGS).signals).toEqual(["Site fora do ar (+30)"]);
    expect(scorePlace({ ...place, siteStatus: "social" }, DEFAULT_SETTINGS).signals).toEqual(["Só rede social (+30)"]);
    expect(scorePlace({ ...place, siteStatus: "error" }, DEFAULT_SETTINGS).score).toBe(0);
  });
});

describe("isPublicBody", () => {
  it.each([
    { name: "Ordem dos Advogados do Brasil", types: ["consultant"], primaryType: "consultant" },
    { name: "OAB Subseção Lucas", types: ["consultant"], primaryType: null },
    { name: "Promotoria de Justiça de Lucas do Rio Verde", types: ["government_office", "lawyer"], primaryType: "government_office" },
    { name: "Fórum da Comarca", types: ["point_of_interest"], primaryType: null },
  ])("exclui $name", (p) => {
    expect(isPublicBody(p)).toBe(true);
  });

  it.each([
    { name: "Advocacia Castro Associados", types: ["association_or_organization"], primaryType: "association_or_organization" },
    { name: "Pedro Dorado Advogados", types: ["consultant"], primaryType: "consultant" },
    { name: "Clínica Bella Face", types: ["beauty_salon"], primaryType: "beauty_salon" },
  ])("mantém $name", (p) => {
    expect(isPublicBody(p)).toBe(false);
  });
});

describe("isDailyQuotaError", () => {
  const raw =
    "Places API respondeu 429: Quota exceeded for quota metric 'SearchTextRequest' and limit 'SearchTextRequest per day'";

  it("reconhece a cota diária do Google", () => {
    expect(isDailyQuotaError(raw)).toBe(true);
    expect(isDailyQuotaError("Cota excedida. Tente novamente amanhã.")).toBe(true);
  });

  it("não trata o limite mensal interno como cota diária", () => {
    expect(isDailyQuotaError("Limite mensal de 950 buscas atingido (950 usadas).")).toBe(false);
  });
});

describe("fetchPublicHtml", () => {
  it.each([
    "http://127.0.0.1/",
    "http://localhost:3000/",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.0.1/",
    "http://[::1]/",
    "file:///etc/passwd",
  ])("bloqueia %s", async (url) => {
    await expect(fetchPublicHtml(url)).rejects.toThrow();
  });
});
