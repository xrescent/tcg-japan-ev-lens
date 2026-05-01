export const SNKRDUNK_BASE_URL = "https://snkrdunk.com";
export const TCG_JAPAN_API_BASE_URL = "https://api.oripal-world.com";

const KNOWN_CONDITIONS = [
  "PSA10",
  "PSA9",
  "PSA8以下",
  "BGS10 BL",
  "BGS10 GL",
  "BGS9.5",
  "BGS9以下",
  "ARS10+",
  "ARS10",
  "ARS9",
  "ARS8以下",
  "他鑑定品",
  "A",
  "B",
  "C",
  "D"
];

const DEFAULT_SALES_OPTION_IDS = {
  A: 18,
  B: 19,
  C: 20,
  D: 21,
  PSA10: 22,
  PSA9: 23,
  "PSA8以下": 24,
  "BGS10 BL": 25,
  "BGS10 GL": 26,
  "BGS9.5": 27,
  "BGS9以下": 28,
  "ARS10+": 29,
  ARS10: 30,
  ARS9: 31,
  "ARS8以下": 32,
  "他鑑定品": 33
};

export function parseTcgJapanPackagePath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const packageId = Number(parts[parts.length - 1]);
  if (!Number.isInteger(packageId) || packageId <= 0) return null;

  return {
    packageTypePath: parts[parts.length - 2],
    packageId
  };
}

export function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/\\u0026/g, "&")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      const normalized = entity.toLowerCase();
      const named = {
        amp: "&",
        quot: "\"",
        apos: "'",
        lt: "<",
        gt: ">",
        nbsp: " "
      };

      if (named[normalized]) return named[normalized];
      if (normalized.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      }
      if (normalized.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      }
      return match;
    });
}

export function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isPsaCard(card) {
  if (!card) return false;
  const classText = [
    card.className,
    card.class,
    card.classes,
    card.sourceClassName,
    card.sourceElementClass
  ]
    .filter(Boolean)
    .join(" ");

  return (
    /PSA\s*10/i.test(String(card.name || "")) ||
    String(classText).includes("gacha-info-card-psa") ||
    card.is_psa_enabled === 1
  );
}

export function extractCardSearchParts(card) {
  const rawName = normalizeWhitespace(card?.name || "");
  const psaMatch = rawName.match(/PSA\s*([0-9]+)/i);
  const braceNumber = rawName.match(/\{([^}]+)\}/);
  const looseNumber = rawName.match(/([0-9]{2,3}\s*\/\s*[0-9]{2,3})/);
  const rarityMatch = rawName.match(/【([^】]+)】/);
  const psaGrade = isPsaCard(card)
    ? Number(card?.psa || (psaMatch ? psaMatch[1] : 10))
    : null;

  const baseName = normalizeWhitespace(
    rawName
      .replace(/〔[^〕]*PSA\s*\d+[^〕]*〕/gi, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/【[^】]+】/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/PSA\s*\d+/gi, "")
  );

  return {
    rawName,
    baseName,
    rarity: rarityMatch ? normalizeWhitespace(rarityMatch[1]) : "",
    cardNumber: normalizeWhitespace(braceNumber?.[1] || looseNumber?.[1] || "").replace(/\s/g, ""),
    psaGrade
  };
}

export function targetConditionForCard(card) {
  const parts = extractCardSearchParts(card);
  return parts.psaGrade ? `PSA${parts.psaGrade}` : "B";
}

export function buildSnkrdunkSearchQuery(card) {
  const parts = extractCardSearchParts(card);
  return [parts.baseName, parts.rarity, parts.cardNumber, parts.psaGrade ? `PSA${parts.psaGrade}` : ""]
    .filter(Boolean)
    .join(" ");
}

export function normalizeForCompare(value) {
  return normalizeWhitespace(value)
    .toLocaleLowerCase("ja-JP")
    .replace(/[【】〔〕\[\]{}()（）"']/g, " ")
    .replace(/\s+/g, "");
}

export function parseYen(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/[^\d]/g, "");
  if (!normalized) return null;
  return Number(normalized);
}

function normalizeSnkrdunkUrl(href) {
  const decoded = decodeHtmlEntities(href);
  if (decoded.startsWith("https://")) return decoded;
  if (decoded.startsWith("/")) return `${SNKRDUNK_BASE_URL}${decoded}`;
  return decoded;
}

function parseAriaProductLabel(label) {
  const decoded = decodeHtmlEntities(label);
  const match = decoded.match(/^(.*?)\s+-\s+¥\s*([\d,]+)/);
  return {
    title: normalizeWhitespace(match ? match[1] : decoded),
    salePrice: match ? parseYen(match[2]) : null
  };
}

function parseConditionFromAnchorBody(body) {
  const spans = [...String(body || "").matchAll(/<span\b[^>]*>([^<]{1,40})<\/span>/gi)]
    .map((match) => normalizeWhitespace(decodeHtmlEntities(match[1])));

  return spans.find((text) => KNOWN_CONDITIONS.includes(text)) || "";
}

export function parseSnkrdunkSearchResults(html) {
  const results = [];
  const anchorRe =
    /<a\b(?=[^>]*\bhref=(["'])(.*?)\1)(?=[^>]*\baria-label=(["'])(.*?)\3)[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRe.exec(String(html || "")))) {
    const link = normalizeSnkrdunkUrl(match[2]);
    const productIdMatch = link.match(/\/apparels\/([0-9]+)/);
    if (!productIdMatch) continue;

    const parsedLabel = parseAriaProductLabel(match[4]);
    if (!parsedLabel.title) continue;

    results.push({
      productId: Number(productIdMatch[1]),
      link,
      title: parsedLabel.title,
      salePrice: parsedLabel.salePrice,
      condition: parseConditionFromAnchorBody(match[5])
    });
  }

  return dedupeSearchResults(results);
}

function dedupeSearchResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = `${result.productId}:${result.link}:${result.condition}:${result.salePrice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scoreSnkrdunkResult(result, card, targetCondition = targetConditionForCard(card)) {
  const parts = extractCardSearchParts(card);
  const title = normalizeForCompare(result?.title || "");
  const base = normalizeForCompare(parts.baseName);
  const rarity = normalizeForCompare(parts.rarity);
  const cardNumber = normalizeForCompare(parts.cardNumber);
  const condition = normalizeWhitespace(result?.condition || "");
  let score = 0;

  if (!result?.productId || !title) return -100;
  if (base && title.includes(base)) score += 8;
  if (cardNumber && title.includes(cardNumber)) score += 10;
  if (rarity && title.includes(rarity)) score += 4;

  if (targetCondition) {
    if (condition === targetCondition) score += 8;
    if (targetCondition.startsWith("PSA") && !condition.startsWith("PSA")) score -= 6;
    if (!targetCondition.startsWith("PSA") && condition.startsWith("PSA")) score -= 5;
  }

  if (Number.isFinite(result.salePrice)) score += 1;
  return score;
}

export function pickBestSnkrdunkResult(results, card, targetCondition = targetConditionForCard(card)) {
  const scored = [...(results || [])]
    .map((result) => ({
      result,
      score: scoreSnkrdunkResult(result, card, targetCondition)
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 8) return null;
  return best.result;
}

function getAttribute(tag, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\s:?${escaped}=(["'])(.*?)\\1`, "i");
  const match = String(tag || "").match(re);
  return match ? decodeHtmlEntities(match[2]) : "";
}

export function parseSalesHistoryOptions(html) {
  const options = [];
  const tagRe = /<apparel-sales-history-item\b[^>]*>/gi;
  let match;

  while ((match = tagRe.exec(String(html || "")))) {
    const tag = match[0];
    const id = Number(getAttribute(tag, "sales-chart-option-id"));
    const name = normalizeWhitespace(getAttribute(tag, "sales-chart-option-name"));
    if (Number.isInteger(id) && name) options.push({ id, name });
  }

  return options;
}

export function selectSalesOptionId(options, targetCondition) {
  const normalizedTarget = normalizeWhitespace(targetCondition || "A");
  const exact = (options || []).find((option) => option.name === normalizedTarget);
  if (exact) return exact.id;

  return DEFAULT_SALES_OPTION_IDS[normalizedTarget] || DEFAULT_SALES_OPTION_IDS.A;
}

export function parseLatestSalesPoint(chartJson) {
  const points = Array.isArray(chartJson?.points) ? chartJson.points : [];
  const sorted = points
    .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .sort((a, b) => a[0] - b[0]);
  const latest = sorted[sorted.length - 1];

  if (!latest) return null;
  return {
    timestamp: latest[0],
    price: latest[1],
    date: new Date(latest[0]).toISOString()
  };
}

export function normalizePackageCards(packageData) {
  return [...(packageData?.package_cards || [])]
    .filter((card) => Number(card?.number) > 0)
    .sort((a, b) => {
      const rankDiff = Number(a.rank || 999) - Number(b.rank || 999);
      if (rankDiff !== 0) return rankDiff;
      return Number(a.id || 0) - Number(b.id || 0);
    });
}
