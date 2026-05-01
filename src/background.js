import {
  buildSnkrdunkSearchQuery,
  normalizePackageCards,
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
const PRICE_CACHE_VERSION = "v2";
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
  const packageId = Number(payload.packageId);
  const shopId = Number(payload.shopId || DEFAULT_SHOP_ID);

  if (!Number.isInteger(packageId) || packageId <= 0) {
    throw new Error("Invalid package id.");
  }

  const url = `${TCG_JAPAN_API_BASE_URL}/api/package/${packageId}?shop_id=${shopId}`;
  const json = await fetchJson(url);
  const packageData = json.package;

  if (!packageData?.id) {
    throw new Error("TCG Japan package API did not return package data.");
  }

  return {
    package: {
      ...packageData,
      package_cards: normalizePackageCards(packageData)
    }
  };
}

async function getCardPrice(payload = {}) {
  const card = payload.card;
  if (!card?.name) throw new Error("Missing card name.");

  const targetCondition = targetConditionForCard(card);
  const query = buildSnkrdunkSearchQuery(card);
  const cacheKey = `${PRICE_CACHE_VERSION}:price:${encodeURIComponent(query)}:${targetCondition}`;

  if (!payload.force) {
    const cached = await readCache(cacheKey);
    if (cached) return { price: cached, cacheHit: true };
  }

  const price = await fetchCardPriceFromSnkrdunk(card, query, targetCondition);
  await writeCache(cacheKey, price);

  return { price, cacheHit: false };
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
