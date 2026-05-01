import {
  buildConsolationPrizeSummary,
  buildSnkrdunkSearchQuery,
  CLOVE_ORIPA_BASE_URL,
  DOPA_GLOBAL_BASE_URL,
  normalizePackageCards,
  parseClovePackageHtml,
  parseDopaPackageHtml,
  parseLatestSalesPoint,
  parseSalesHistoryOptions,
  parseSnkrdunkSearchResults,
  pickBestSnkrdunkResult,
  selectSalesOptionId,
  SNKRDUNK_BASE_URL,
  targetConditionForCard,
  TCG_JAPAN_API_BASE_URL
} from "./parsers.js";

const CACHE_TTL_MS = 30 * 60 * 1000;
const PRICE_CACHE_VERSION = "v3";
const DEFAULT_SHOP_ID = 21;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "GET_PACKAGE":
      return getPackage(message.payload);
    case "GET_CARD_PRICE":
      return getCardPrice(message.payload);
    case "CLEAR_CACHE":
      await chrome.storage.local.clear();
      return { cleared: true };
    default:
      throw new Error(`Unknown message type: ${message?.type || "empty"}`);
  }
}

async function getPackage(payload = {}) {
  const source = payload.source === "dopa" ? "dopa" : payload.source === "clove" ? "clove" : "tcg-japan";

  if (source === "clove") {
    const packageId = String(payload.packageId || "").trim();
    if (!packageId) throw new Error("Invalid Clove package id.");
    return getClovePackage(payload, packageId);
  }

  const packageId = Number(payload.packageId);

  if (!Number.isInteger(packageId) || packageId <= 0) {
    throw new Error("Invalid package id.");
  }

  if (source === "dopa") {
    return getDopaPackage(payload, packageId);
  }

  const shopId = Number(payload.shopId || DEFAULT_SHOP_ID);
  const url = `${TCG_JAPAN_API_BASE_URL}/api/package/${packageId}?shop_id=${shopId}`;
  const json = await fetchJson(url);
  const packageData = json.package;

  if (!packageData?.id) {
    throw new Error("TCG Japan package API did not return package data.");
  }

  return {
    package: {
      ...packageData,
      consolation_prize: buildConsolationPrizeSummary(packageData),
      package_cards: normalizePackageCards(packageData)
    }
  };
}

async function getDopaPackage(payload, packageId) {
  const locale = normalizeDopaLocale(payload.locale);
  const url = `${DOPA_GLOBAL_BASE_URL}/${locale}/gacha/${packageId}`;
  const html = await fetchText(url);
  const packageData = parseDopaPackageHtml(html, {
    packageId,
    locale
  });

  if (!packageData?.id) {
    throw new Error("DOPA page did not return package data.");
  }

  return { package: packageData };
}

async function getClovePackage(payload, packageId) {
  const locale = normalizeCloveLocale(payload.locale);
  const category = normalizeCloveCategory(payload.category);
  const url = `${CLOVE_ORIPA_BASE_URL}/${locale}/oripa/${encodeURIComponent(category)}/${encodeURIComponent(packageId)}`;
  const html = await fetchText(url);
  const packageData = parseClovePackageHtml(html, {
    packageId,
    locale,
    category
  });

  if (!packageData?.id) {
    throw new Error("Clove page did not return package data.");
  }

  return { package: packageData };
}

function normalizeDopaLocale(locale) {
  const normalized = String(locale || "zh").toLowerCase();
  return /^[a-z]{2}(?:-[a-z]{2})?$/.test(normalized) ? normalized : "zh";
}

function normalizeCloveLocale(locale) {
  const normalized = String(locale || "ja");
  return /^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(normalized) ? normalized : "ja";
}

function normalizeCloveCategory(category) {
  const normalized = String(category || "All").trim();
  return /^[\w-]+$/i.test(normalized) ? normalized : "All";
}

async function getCardPrice(payload = {}) {
  const card = payload.card;
  if (!card?.name) throw new Error("Missing card name.");

  const targetCondition = targetConditionForCard(card);
  const query = buildSnkrdunkSearchQuery(card);
  const sourceKey = card.source || "tcg-japan";
  const cacheKey = `${PRICE_CACHE_VERSION}:price:${sourceKey}:${encodeURIComponent(query)}:${targetCondition}`;

  if (!payload.force) {
    const cached = await readCache(cacheKey);
    if (cached) {
      return {
        price: applyCloveReferencePriceFallback(card, query, targetCondition, cached),
        cacheHit: true
      };
    }
  }

  const fetchedPrice = await fetchCardPriceFromSnkrdunk(card, query, targetCondition);
  const price = applyCloveReferencePriceFallback(card, query, targetCondition, fetchedPrice);
  await writeCache(cacheKey, price);

  return { price, cacheHit: false };
}

function applyCloveReferencePriceFallback(card, query, targetCondition, fetchedPrice) {
  const referencePrice = Number(card?.point || 0);
  const fallbackStatuses = new Set(["not_found", "no_sales"]);

  if (card?.source !== "clove" || !Number.isFinite(referencePrice) || referencePrice <= 0) {
    return fetchedPrice;
  }

  if (!fallbackStatuses.has(fetchedPrice?.status)) return fetchedPrice;

  return {
    status: "ok",
    source: "clove_reference_price",
    query,
    targetCondition,
    price: referencePrice,
    referencePrice,
    referencePriceUpdatedAt: card.referencePriceUpdatedAt || card.reference_price_updated_at || "",
    searchUrl: fetchedPrice.searchUrl || "",
    match: fetchedPrice.match || null,
    snkrdunkStatus: fetchedPrice.status,
    snkrdunkSearchUrl: fetchedPrice.searchUrl || "",
    snkrdunkTargetCondition: fetchedPrice.targetCondition || targetCondition,
    snkrdunkMatchedListingPrice: Number.isFinite(fetchedPrice.matchedListingPrice)
      ? fetchedPrice.matchedListingPrice
      : null
  };
}

async function fetchCardPriceFromSnkrdunk(card, query, targetCondition) {
  const searchUrl = `${SNKRDUNK_BASE_URL}/search?keywords=${encodeURIComponent(query)}`;
  const searchHtml = await fetchText(searchUrl);
  const candidates = parseSnkrdunkSearchResults(searchHtml);
  const match = pickBestSnkrdunkResult(candidates, card, targetCondition);

  if (!match) {
    return {
      status: "not_found",
      query,
      searchUrl,
      targetCondition,
      candidates: candidates.slice(0, 5)
    };
  }

  const historyUrl = `${SNKRDUNK_BASE_URL}/apparels/${match.productId}/sales-histories`;
  const historyHtml = await fetchText(historyUrl);
  const options = parseSalesHistoryOptions(historyHtml);
  const salesOptionId = selectSalesOptionId(options, targetCondition);
  const chartUrl = `${SNKRDUNK_BASE_URL}/v1/apparels/${match.productId}/sales-chart/used?salesChartOptionId=${salesOptionId}`;
  const chart = await fetchJson(chartUrl);
  const latestSale = parseLatestSalesPoint(chart);

  if (latestSale) {
    return {
      status: "ok",
      source: "condition_chart",
      query,
      searchUrl,
      targetCondition,
      match,
      salesOptionId,
      price: latestSale.price,
      soldAt: latestSale.date,
      chartUrl
    };
  }

  return {
    status: "no_sales",
    query,
    searchUrl,
    targetCondition,
    match,
    salesOptionId,
    matchedListingPrice: Number.isFinite(match.salePrice) ? match.salePrice : null,
    chartUrl
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    },
    credentials: "omit",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }

  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    },
    credentials: "omit",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function readCache(key) {
  const result = await chrome.storage.local.get(key);
  const cached = result[key];
  if (!cached || Date.now() - cached.savedAt > CACHE_TTL_MS) return null;
  return cached.value;
}

async function writeCache(key, value) {
  await chrome.storage.local.set({
    [key]: {
      savedAt: Date.now(),
      value
    }
  });
}
