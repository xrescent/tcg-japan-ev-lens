export const SNKRDUNK_BASE_URL = "https://snkrdunk.com";
export const TCG_JAPAN_API_BASE_URL = "https://api.oripal-world.com";
export const DOPA_GLOBAL_BASE_URL = "https://dopa-global.com";
export const CLOVE_ORIPA_BASE_URL = "https://oripa.clove.jp";

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

export function parseDopaGlobalPackagePath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  const gachaIndex = parts.indexOf("gacha");
  if (gachaIndex === -1 || gachaIndex >= parts.length - 1) return null;

  const packageId = Number(parts[gachaIndex + 1]);
  if (!Number.isInteger(packageId) || packageId <= 0) return null;

  return {
    locale: gachaIndex > 0 ? parts[gachaIndex - 1] : "zh",
    packageId
  };
}

export function parseCloveOripaPackagePath(pathname) {
  const parts = String(pathname || "").split("/").filter(Boolean);
  const oripaIndex = parts.indexOf("oripa");
  if (oripaIndex === -1 || oripaIndex >= parts.length - 2) return null;

  const category = parts[oripaIndex + 1];
  const packageId = parts[oripaIndex + 2];
  if (!category || !packageId) return null;

  return {
    locale: oripaIndex > 0 ? parts[oripaIndex - 1] : "ja",
    category,
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
    String(card.productType || card.product_type || "").toLowerCase() === "psa" ||
    card.is_psa_enabled === 1
  );
}

export function extractCardSearchParts(card) {
  const rawName = normalizeWhitespace(card?.name || "");
  const searchableName = stripLeadingSealedBoxLabel(rawName);
  const psaMatch = searchableName.match(/PSA\s*([0-9]+)/i);
  const braceNumber = searchableName.match(/\{([^}]+)\}/);
  const looseNumber = searchableName.match(/([0-9]{2,3}\s*\/\s*[0-9]{2,3})/);
  const rarityMatch = searchableName.match(/【([^】]+)】/);
  const fieldRarity = normalizeWhitespace(card?.rarity || "");
  const fieldNumber = normalizeWhitespace(card?.itemNumber || card?.item_number || card?.cardNumber || "");
  const psaGrade = isPsaCard(card)
    ? Number(card?.psa || (psaMatch ? psaMatch[1] : 10))
    : null;

  const baseName = normalizeWhitespace(
    searchableName
      .replace(/〔[^〕]*PSA\s*\d+[^〕]*〕/gi, "")
      .replace(/\((?:Japanese|English|Korean|Chinese)\)/gi, "")
      .replace(/\(\s*PSA\s*\d+\s*\)/gi, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/【[^】]+】/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/PSA\s*\d+/gi, "")
      .replace(/\(\s*\)/g, "")
  );

  return {
    rawName,
    baseName,
    rarity: rarityMatch ? normalizeWhitespace(rarityMatch[1]) : fieldRarity,
    cardNumber: normalizeCardNumber(braceNumber?.[1] || looseNumber?.[1] || fieldNumber || ""),
    psaGrade
  };
}

function stripLeadingSealedBoxLabel(value) {
  return normalizeWhitespace(
    String(value || "").replace(/^RAW\s*\d+\s*[\(（]\s*未開封\s*BOX\s*[\)）]\s*/i, "")
  );
}

function normalizeCardNumber(value) {
  const normalized = normalizeWhitespace(value);
  if (/^[-ー―]+$/.test(normalized)) return "";
  if (/[a-z]/i.test(normalized)) return normalized;
  return normalized.replace(/\s/g, "");
}

export function targetConditionForCard(card) {
  if (isSealedBoxCard(card)) return "sealed_box";

  const parts = extractCardSearchParts(card);
  return parts.psaGrade ? `PSA${parts.psaGrade}` : "B";
}

export function buildSnkrdunkSearchQuery(card) {
  if (isSealedBoxCard(card)) {
    return buildSealedBoxSearchQuery(card);
  }

  const parts = extractCardSearchParts(card);
  return [parts.baseName, parts.rarity, parts.cardNumber, parts.psaGrade ? `PSA${parts.psaGrade}` : ""]
    .filter(Boolean)
    .join(" ");
}

export function isSealedBoxCard(card) {
  return (
    String(card?.product_type || card?.productType || "").toLowerCase() === "sealed_box" ||
    /^RAW\s*\d+\s*[\(（]\s*未開封\s*BOX\s*[\)）]/i.test(String(card?.name || ""))
  );
}

function buildSealedBoxSearchQuery(card) {
  const setName = normalizeSealedBoxSetName(stripLeadingSealedBoxLabel(card?.name || ""));
  return setName ? `${setName} ボックス` : stripLeadingSealedBoxLabel(card?.name || "");
}

function normalizeSealedBoxSetName(value) {
  return normalizeWhitespace(
    String(value || "")
      .replace(/^ポケモンカードゲーム\s*/i, "")
      .replace(/^(?:ソード\s*&\s*シールド|スカーレット\s*&\s*バイオレット|MEGA)\s*/i, "")
      .replace(/^(?:ハイクラスパック|強化拡張パック|拡張パック)\s*/i, "")
      .replace(/(?:BOX|ボックス)$/i, "")
      .replace(/^["“”「」『』]+|["“”「」『』]+$/g, "")
  );
}

export function normalizeForCompare(value) {
  return normalizeWhitespace(value)
    .toLocaleLowerCase("ja-JP")
    .replace(/\bbox\b/gi, "ボックス")
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
  const base = normalizeForCompare(isSealedBoxCard(card) ? buildSealedBoxSearchQuery(card) : parts.baseName);
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

export function pickFirstPricedSnkrdunkResult(results) {
  return (results || []).find((result) => Number.isFinite(result?.salePrice) && result.salePrice > 0) || null;
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

export function buildConsolationPrizeSummary(packageData) {
  const cards = Array.isArray(packageData?.package_cards) ? packageData.package_cards : [];
  const normalVisibleQuantity = cards
    .filter((card) => Number(card?.rank) !== 9 && Number(card?.number) > 0)
    .reduce((sum, card) => sum + Number(card.number || 0), 0);
  const totalQuantity = Number(packageData?.number || 0);
  const missingQuantity = totalQuantity > normalVisibleQuantity ? totalQuantity - normalVisibleQuantity : 0;
  const placeholders = cards.filter((card) => {
    return Number(card?.rank) === 4 && (!card?.name || !card?.card_id || !Number(card?.number));
  });
  const apiPoint = placeholders
    .map((card) => Number(card?.point))
    .find((point) => Number.isFinite(point) && point > 0);

  if (!missingQuantity && !placeholders.length) return null;

  return {
    rank: 4,
    quantity: missingQuantity || null,
    point: apiPoint || null,
    source: apiPoint ? "api_point" : "missing_rank4",
    placeholderCount: placeholders.length
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

export function parseDopaPackageHtml(html, options = {}) {
  const payload = collectNextFlightPayload(html);
  const props = findDopaPageProps(payload);
  if (!props?.pack) {
    throw new Error("DOPA page did not include gacha package data.");
  }

  return normalizeDopaPackage(props, options);
}

export function parseClovePackageHtml(html, options = {}) {
  const match = String(html || "").match(/<script\b[^>]*id=(["'])__NEXT_DATA__\1[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) {
    throw new Error("Clove page did not include Next.js package data.");
  }

  const payload = JSON.parse(match[2]);
  const oripa = payload?.props?.pageProps?.oripa;
  if (!oripa?.id) {
    throw new Error("Clove page did not include oripa data.");
  }

  return normalizeClovePackage(oripa, {
    locale: payload.locale,
    category: payload.query?.category,
    packageId: payload.query?.oripaId,
    ...options
  });
}

function collectNextFlightPayload(html) {
  const re = /self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g;
  let match;
  let payload = "";

  while ((match = re.exec(String(html || "")))) {
    try {
      const chunk = JSON.parse(match[1]);
      if (typeof chunk?.[1] === "string") payload += chunk[1];
    } catch (_error) {
      // Ignore unrelated Next.js chunks that are not valid JSON arrays.
    }
  }

  return payload;
}

function findDopaPageProps(payload) {
  const text = String(payload || "");
  let index = text.indexOf("\"packId\":\"");

  while (index !== -1) {
    const labelStart = text.lastIndexOf(":[", index);
    if (labelStart !== -1) {
      const arrayText = readBalancedJson(text, labelStart + 1);
      if (arrayText) {
        try {
          const node = JSON.parse(arrayText);
          const props = findDopaPropsInNode(node);
          if (props?.pack) return props;
        } catch (_error) {
          // Keep scanning; the payload can contain many RSC records.
        }
      }
    }

    index = text.indexOf("\"packId\":\"", index + 1);
  }

  return null;
}

function readBalancedJson(text, startIndex) {
  const start = String(text || "")[startIndex];
  if (start !== "[" && start !== "{") return "";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, index + 1);
    }
  }

  return "";
}

function findDopaPropsInNode(node, depth = 0) {
  if (!node || depth > 10) return null;

  if (!Array.isArray(node) && typeof node === "object" && node.pack && node.packId) {
    return node;
  }

  const values = Array.isArray(node) ? node : typeof node === "object" ? Object.values(node) : [];
  for (const value of values) {
    const found = findDopaPropsInNode(value, depth + 1);
    if (found) return found;
  }

  return null;
}

function normalizeDopaPackage(props, options = {}) {
  const pack = props.pack || {};
  const preview = props.previewImage || {};
  const packageId = Number(pack.id || props.packId || options.packageId || 0);
  const cards = normalizeDopaRankedCards(preview.rankedCards, packageId);
  const lastOneCard = normalizeDopaLastOneCard(preview.lastOneCard?.data, packageId);
  const totalQuantity = Number(pack.total || 0);
  const listedQuantity = cards.reduce((sum, card) => sum + Number(card.number || 0), 0);
  const consolationQuantity = totalQuantity > listedQuantity ? totalQuantity - listedQuantity : 0;
  const minReturnPoint = Number(pack.returnInfo?.minReturn || 0);

  if (lastOneCard) cards.push(lastOneCard);

  return {
    id: packageId,
    source: "dopa",
    name: normalizeWhitespace(pack.name || `DOPA #${packageId}`),
    image_url: pack.imageUrl || preview.coverImage?.url || "",
    price: Number(pack.oneTimePoint || 0),
    number: totalQuantity,
    stock: Number(pack.remaining || 0),
    stock_quantity: Number(pack.remaining || 0),
    sold: Number(pack.sold || pack.pulled_number || 0),
    description: pack.description || preview.gachaDetail || "",
    currency: "pt",
    dopa_locale: options.locale || "",
    dopa_pack_type: pack.packType || "",
    dopa_hazure_kind: pack.hazure_kind || "",
    consolation_prize: consolationQuantity && minReturnPoint
      ? {
          rank: 4,
          quantity: consolationQuantity,
          point: minReturnPoint,
          source: "api_point",
          placeholderCount: 0
        }
      : null,
    package_cards: cards.sort((a, b) => {
      const rankDiff = Number(a.rank || 999) - Number(b.rank || 999);
      if (rankDiff !== 0) return rankDiff;
      return Number(a.id || 0) - Number(b.id || 0);
    })
  };
}

function normalizeDopaRankedCards(rankedCards, packageId) {
  const groups = Array.isArray(rankedCards) ? rankedCards : [];
  const cards = [];

  for (const group of groups) {
    const rank = dopaRankToDisplayRank(group?.rank);
    const data = Array.isArray(group?.cards?.data) ? group.cards.data : [];

    for (const card of data) {
      const normalized = normalizeDopaCard(card, {
        packageId,
        rank,
        dopaRank: group?.rank
      });
      if (normalized) cards.push(normalized);
    }
  }

  return cards;
}

function normalizeDopaLastOneCard(card, packageId) {
  const normalized = normalizeDopaCard(card, {
    packageId,
    rank: 9,
    dopaRank: "last-one"
  });
  if (!normalized) return null;

  return {
    ...normalized,
    id: `dopa-last-${normalized.id}`,
    is_last_one: true,
    number: Number(normalized.number || 1) || 1
  };
}

function normalizeDopaCard(card, context) {
  if (!card?.id) return null;

  const productType = String(card.productType || card.product_type || "").toLowerCase();
  const psa = Number(card.psaPoint || card.psa_point || 0);
  const quantity = Number(card.quantity || 0);
  const point = Number(card.pack_card_point || card.point || 0);

  return {
    id: `dopa-${card.id}`,
    package_id: context.packageId || null,
    source: "dopa",
    rank: context.rank,
    dopa_rank: context.dopaRank || "",
    name: normalizeWhitespace(card.name || ""),
    image_url: card.imageUrl || card.image_url || "",
    number: quantity > 0 ? quantity : 1,
    point: Number.isFinite(point) && point > 0 ? point : null,
    itemNumber: normalizeWhitespace(card.itemNumber || card.item_number || ""),
    rarity: normalizeWhitespace(card.rarity || ""),
    product_type: productType,
    is_psa_enabled: productType === "psa" || psa > 0 ? 1 : 2,
    psa: psa > 0 ? psa : null,
    only_shipping: Boolean(card.onlyShipping || card.only_shipping)
  };
}

function dopaRankToDisplayRank(rank) {
  const normalized = normalizeWhitespace(rank).toLowerCase();
  const map = {
    grail: 1,
    s: 1,
    "1st": 2,
    a: 2,
    "2nd": 3,
    b: 3,
    "3rd": 4,
    c: 4,
    hazure: 4
  };

  return map[normalized] || 4;
}

const CLOVE_PRIZE_LISTS = [
  ["firstDisplayedPrizesForLineup", 1],
  ["secondDisplayedPrizesForLineup", 2],
  ["thirdDisplayedPrizesForLineup", 3],
  ["fourthDisplayedPrizesForLineup", 4],
  ["extraDisplayedPrizesForLineup", 2],
  ["roundNumberDisplayedPrizesForLineup", 9],
  ["lastOneDisplayedPrizesForLineup", 9]
];

function normalizeClovePackage(oripa, options = {}) {
  const packageId = String(oripa.id || options.packageId || "");
  const totalQuantity = Number(oripa.quantity || 0);
  const listedCards = [];
  let placeholderCount = 0;

  for (const [field, rank] of CLOVE_PRIZE_LISTS) {
    const prizes = Array.isArray(oripa[field]) ? oripa[field] : [];
    for (const prize of prizes) {
      const normalized = normalizeClovePrize(prize, {
        packageId,
        rank,
        field
      });
      if (!normalized) continue;

      if (Number(normalized.number) > 0 || Number(normalized.rank) === 9) {
        listedCards.push(normalized);
      } else {
        placeholderCount += 1;
      }
    }
  }

  const listedQuantity = listedCards
    .filter((card) => Number(card.rank) !== 9)
    .reduce((sum, card) => sum + Number(card.number || 0), 0);
  const missingQuantity = totalQuantity > listedQuantity ? totalQuantity - listedQuantity : 0;

  return {
    id: packageId,
    source: "clove",
    name: normalizeWhitespace(oripa.name || `Clove #${packageId}`),
    image_url: localizedAssetUrl(oripa.thumbnail) || localizedAssetUrl(oripa.subImages) || "",
    price: Number(oripa.price || 0),
    number: totalQuantity,
    stock: Number(oripa.remaining || 0),
    stock_quantity: Number(oripa.remaining || 0),
    sold: Math.max(0, totalQuantity - Number(oripa.remaining || 0)),
    currency: "pt",
    clove_locale: options.locale || "",
    clove_category: options.category || oripa.category || "",
    consolation_prize: missingQuantity > 0
      ? {
          rank: 4,
          quantity: missingQuantity,
          point: null,
          source: "missing_clove_lower_tiers",
          placeholderCount
        }
      : null,
    package_cards: listedCards.sort((a, b) => {
      const rankDiff = Number(a.rank || 999) - Number(b.rank || 999);
      if (rankDiff !== 0) return rankDiff;
      return String(a.id || "").localeCompare(String(b.id || ""));
    })
  };
}

function normalizeClovePrize(prize, context) {
  if (!prize?.id) return null;

  const rank = Number(context.rank || clovePrizeTypeToDisplayRank(prize.prizeType));
  const quantity = Number(prize.quantity || 0);
  const referencePrice = Number(prize.referencePriceInfo?.referencePrice || 0);
  const condition = normalizeWhitespace(prize.condition || "");
  const isSealedBox = /^RAW\s*\d+$/i.test(condition) || /未開封\s*BOX/i.test(prize.mainDescription || prize.mainDescriptionEn || "");
  const isPsa = /^PSA\s*10$/i.test(condition) || /PSA\s*10/i.test(prize.mainDescriptionEn || prize.mainDescription || "");
  const name = normalizeWhitespace([condition || (isPsa ? "PSA10" : ""), prize.mainDescription || prize.mainDescriptionEn || ""]
    .filter(Boolean)
    .join(" ")
    .replace(/\(PSA\)/gi, ""));

  return {
    id: `clove-${prize.id}`,
    package_id: context.packageId || null,
    source: "clove",
    rank,
    clove_prize_type: prize.prizeType || "",
    clove_lineup_field: context.field || "",
    name,
    image_url: prize.imageUrl || "",
    number: quantity > 0 ? quantity : 0,
    point: Number.isFinite(referencePrice) && referencePrice > 0 ? referencePrice : null,
    referencePriceUpdatedAt: prize.referencePriceInfo?.referencePriceUpdatedAt || "",
    itemNumber: normalizeWhitespace(prize.kataban || ""),
    rarity: normalizeWhitespace(prize.subDescription || ""),
    product_type: isPsa ? "psa" : isSealedBox ? "sealed_box" : "raw",
    is_psa_enabled: isPsa ? 1 : 2,
    psa: isPsa ? 10 : null,
    only_shipping: Boolean(prize.isShippingOnly),
    sourceElementClass: isPsa ? "clove-prize-card clove-prize-card-psa" : "clove-prize-card"
  };
}

function clovePrizeTypeToDisplayRank(prizeType) {
  const map = {
    FIRST: 1,
    SECOND: 2,
    THIRD: 3,
    FOURTH: 4,
    EXTRA: 2,
    ROUND_NUMBER: 9,
    LAST_ONE: 9
  };

  return map[normalizeWhitespace(prizeType).toUpperCase()] || 4;
}

function localizedAssetUrl(asset) {
  if (!asset) return "";
  if (typeof asset === "string") return asset;
  if (typeof asset !== "object") return "";
  const value = asset["zh-TW"] || asset.ja || asset.en || Object.values(asset).find(Boolean) || "";
  if (Array.isArray(value)) return value.find(Boolean) || "";
  return value || "";
}
