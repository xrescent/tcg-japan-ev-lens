(function () {
  const ROOT_ID = "tcg-ev-lens-root";
  const DEFAULT_SHOP_ID = 21;
  const state = {
    routeKey: "",
    packageData: null,
    cards: [],
    prices: new Map(),
    manualPrices: new Map(),
    rankBulkPrices: {
      3: "",
      4: ""
    },
    bulkOnlyNonPsa: false,
    loading: false,
    collapsed: false,
    statusText: "待機中"
  };

  let root = null;
  let routeTimer = null;

  init();

  function init() {
    ensureRoot();
    bindEvents();
    watchRoute();
  }

  function watchRoute() {
    loadIfPackageRoute();
    routeTimer = window.setInterval(loadIfPackageRoute, 1200);
    window.addEventListener("beforeunload", () => window.clearInterval(routeTimer));
  }

  function loadIfPackageRoute(force = false) {
    const page = parsePackagePath(location.pathname);
    if (!page) {
      hideRoot();
      state.routeKey = "";
      return;
    }

    showRoot();
    const routeKey = `${page.packageTypePath}:${page.packageId}`;
    if (!force && state.routeKey === routeKey) return;

    state.routeKey = routeKey;
    state.packageData = null;
    state.cards = [];
    state.prices.clear();
    state.manualPrices.clear();
    state.rankBulkPrices = { 3: "", 4: "" };
    state.bulkOnlyNonPsa = false;
    loadPackage(page, force);
  }

  async function loadPackage(page, forcePrices) {
    state.loading = true;
    state.statusText = "讀取池子資訊...";
    render();

    try {
      const response = await sendMessage("GET_PACKAGE", {
        packageId: page.packageId,
        shopId: inferShopId()
      });

      state.packageData = response.package;
      state.cards = mergeDomPsaHints(response.package.package_cards || []);
      state.statusText = `搜尋 SNKRDUNK 成交價 0/${state.cards.length}`;
      render();

      await runWithConcurrency(state.cards, 3, async (card, index) => {
        state.prices.set(card.id, { status: "loading" });
        render();

        try {
          const priceResponse = await sendMessage("GET_CARD_PRICE", {
            card,
            force: forcePrices
          });
          if (priceResponse.cacheHit) priceResponse.price.cacheHit = true;
          state.prices.set(card.id, priceResponse.price);
        } catch (error) {
          state.prices.set(card.id, {
            status: "error",
            error: error.message || String(error)
          });
        }

        const done = [...state.prices.values()].filter((price) => price.status !== "loading").length;
        state.statusText = `搜尋 SNKRDUNK 成交價 ${Math.min(done, index + 1)}/${state.cards.length}`;
        render();
      });

      state.statusText = "完成";
    } catch (error) {
      state.statusText = error.message || String(error);
    } finally {
      state.loading = false;
      render();
    }
  }

  function ensureRoot() {
    root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("aside");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    render();
  }

  function hideRoot() {
    if (root) root.hidden = true;
  }

  function showRoot() {
    if (root) root.hidden = false;
  }

  function bindEvents() {
    root.addEventListener("click", (event) => {
      const action = event.target.closest("[data-tcg-ev-action]")?.dataset.tcgEvAction;
      if (!action) return;

      if (action === "toggle") {
        state.collapsed = !state.collapsed;
        render();
      }

      if (action === "refresh") {
        loadIfPackageRoute(true);
      }

      if (action === "apply-rank-price") {
        applyRankManualPrice(Number(event.target.closest("[data-tcg-ev-rank]")?.dataset.tcgEvRank));
      }

      if (action === "clear-rank-price") {
        clearRankManualPrice(Number(event.target.closest("[data-tcg-ev-rank]")?.dataset.tcgEvRank));
      }
    });

    root.addEventListener("input", (event) => {
      const bulkInput = event.target.closest("[data-tcg-ev-rank-price]");
      if (bulkInput) {
        state.rankBulkPrices[bulkInput.dataset.tcgEvRankPrice] = bulkInput.value;
        return;
      }

      const input = event.target.closest("[data-tcg-ev-manual-price]");
      if (!input) return;

      const cardId = Number(input.dataset.tcgEvManualPrice);
      const price = Number(input.value);
      if (Number.isFinite(price) && price > 0) {
        state.manualPrices.set(cardId, price);
      } else {
        state.manualPrices.delete(cardId);
      }
      renderSummaryOnly();
      updateCardRowPresentation(cardId);
    });

    root.addEventListener("change", (event) => {
      const checkbox = event.target.closest("[data-tcg-ev-only-non-psa]");
      if (!checkbox) return;
      state.bulkOnlyNonPsa = checkbox.checked;
      render();
    });
  }

  function render() {
    if (!root) return;

    root.className = state.collapsed ? "tcg-ev-lens is-collapsed" : "tcg-ev-lens";
    const packageData = state.packageData;
    const summary = computeSummary();
    const packageTitle = packageData?.name || "TCG Japan EV Lens";

    root.innerHTML = `
      <div class="tcg-ev-shell">
        <header class="tcg-ev-header">
          <div>
            <div class="tcg-ev-kicker">TCG Japan EV Lens</div>
            <h2 title="${escapeHtml(packageTitle)}">${escapeHtml(packageTitle)}</h2>
          </div>
          <div class="tcg-ev-actions">
            <button type="button" data-tcg-ev-action="refresh" title="重新抓取 SNKRDUNK 成交價">更新</button>
            <button type="button" data-tcg-ev-action="toggle" title="收合 / 展開">${state.collapsed ? "展開" : "收合"}</button>
          </div>
        </header>
        <div class="tcg-ev-body">
          ${renderSummary(summary)}
          ${renderBulkControls()}
          ${renderCards(summary)}
          <footer class="tcg-ev-footer">
            <span>${escapeHtml(state.statusText)}</span>
            <span>資料源：TCG Japan / SNKRDUNK</span>
          </footer>
        </div>
      </div>
    `;
  }

  function renderBulkControls() {
    const r3Count = countBulkTargetCards(3);
    const r4Count = countBulkTargetCards(4);

    return `
      <section class="tcg-ev-bulk">
        <div class="tcg-ev-bulk-head">
          <div>
            <strong>R3/R4 安慰獎固定值</strong>
            <span>R3、R4 可分開套用；原始 SNKRDUNK 線圖價仍保留在各列供比較。</span>
          </div>
          <label class="tcg-ev-check">
            <input data-tcg-ev-only-non-psa type="checkbox" ${state.bulkOnlyNonPsa ? "checked" : ""}>
            僅改動非 PSA 獎項
          </label>
        </div>
        ${renderBulkRankRow(3, r3Count)}
        ${renderBulkRankRow(4, r4Count)}
      </section>
    `;
  }

  function renderBulkRankRow(rank, count) {
    const disabled = count ? "" : " disabled";

    return `
      <div class="tcg-ev-bulk-row">
        <span>R${rank}</span>
        <label>
          ¥
          <input data-tcg-ev-rank-price="${rank}" type="number" min="0" step="1" value="${escapeHtml(state.rankBulkPrices[rank] || "")}" placeholder="固定值">
        </label>
        <button type="button" data-tcg-ev-action="apply-rank-price" data-tcg-ev-rank="${rank}"${disabled}>套用</button>
        <button type="button" data-tcg-ev-action="clear-rank-price" data-tcg-ev-rank="${rank}"${disabled}>清除</button>
        <small>${count} 張</small>
      </div>
    `;
  }

  function renderSummaryOnly() {
    const summaryNode = root.querySelector("[data-tcg-ev-summary]");
    if (!summaryNode) {
      render();
      return;
    }

    const summary = computeSummary();
    summaryNode.outerHTML = renderSummary(summary);
  }

  function renderSummary(summary) {
    const edgeClass = summary.edge >= 0 ? "is-good" : "is-bad";
    const coverageClass = summary.coveragePending
      ? "is-pending"
      : summary.coverageComplete
        ? "is-complete"
        : "is-incomplete";
    const pricedText = `${summary.pricedQuantity}/${summary.totalQuantity}`;
    return `
      <section class="tcg-ev-summary ${edgeClass}" data-tcg-ev-summary>
        <div class="tcg-ev-main-metric">
          <span>單抽期望值</span>
          <strong>${formatYen(summary.ev)}</strong>
        </div>
        <div class="tcg-ev-grid">
          <div>
            <span>抽取成本</span>
            <strong>${formatPoint(summary.cost)}</strong>
          </div>
          <div>
            <span>EV / 成本</span>
            <strong>${Number.isFinite(summary.ratio) ? `${summary.ratio.toFixed(1)}%` : "-"}</strong>
          </div>
          <div>
            <span>差額</span>
            <strong>${formatSignedYen(summary.edge)}</strong>
          </div>
          <div class="tcg-ev-coverage ${coverageClass}">
            <span>估價覆蓋</span>
            <strong>${pricedText}</strong>
          </div>
        </div>
        ${summary.stockNote ? `<p class="tcg-ev-note">${escapeHtml(summary.stockNote)}</p>` : ""}
      </section>
    `;
  }

  function renderCards(summary) {
    if (!state.cards.length) {
      return `<section class="tcg-ev-card-list" data-tcg-ev-cards><p class="tcg-ev-empty">還沒有讀到獎項資料。</p></section>`;
    }

    return `
      <section class="tcg-ev-card-list" data-tcg-ev-cards>
        ${state.cards.map((card) => renderCardRow(card, summary.totalQuantity)).join("")}
      </section>
    `;
  }

  function renderCardRow(card, totalQuantity) {
    const qty = Number(card.number || 0);
    const data = state.prices.get(card.id) || { status: "pending" };
    const manualPrice = state.manualPrices.get(card.id);
    const price = manualPrice || (Number.isFinite(data.price) ? data.price : null);
    const contribution = price && totalQuantity ? (price * qty) / totalQuantity : null;
    const rowClass = getCardRowClass(card, data, manualPrice);
    const sourceLabel = sourceText(data, manualPrice);
    const link = data.match?.link || data.searchUrl || "";
    const googleLink = googleSearchUrl(data.query || fallbackSearchQuery(card));
    const originalPrice = manualPrice && Number.isFinite(data.price) ? data.price : null;

    return `
      <article class="tcg-ev-card${rowClass ? ` ${rowClass}` : ""}" data-tcg-ev-card-id="${card.id}">
        <div class="tcg-ev-rank">R${escapeHtml(card.rank || "-")}</div>
        <img src="${escapeHtml(imageUrl(card.image_url))}" alt="" loading="lazy">
        <div class="tcg-ev-card-main">
          <div class="tcg-ev-card-name" title="${escapeHtml(card.name || "")}">${escapeHtml(card.name || "-")}</div>
          <div class="tcg-ev-card-meta">
            <span>數量 ${qty}</span>
            <span>${escapeHtml(isPsaPrize(card) ? `PSA${card.psa || 10}` : "B品")}</span>
            <span data-tcg-ev-source>${escapeHtml(sourceLabel)}</span>
            ${data.soldAt ? `<span>${escapeHtml(formatDate(data.soldAt))}</span>` : ""}
          </div>
          <div data-tcg-ev-warning>${renderCardProblem(data, manualPrice)}</div>
        </div>
        <div class="tcg-ev-card-price">
          <strong data-tcg-ev-price>${price ? formatYen(price) : pricePlaceholder(data)}</strong>
          <span data-tcg-ev-contribution>貢獻 ${contribution ? formatYen(contribution) : "-"}</span>
          <span data-tcg-ev-original-price${originalPrice ? "" : " hidden"}>${originalPrice ? `SNKRDUNK ${formatYen(originalPrice)}` : ""}</span>
          <label>
            手動
            <input data-tcg-ev-manual-price="${card.id}" type="number" min="0" step="1" value="${manualPrice || ""}" placeholder="¥">
          </label>
          <div class="tcg-ev-card-links">
            ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">SNKRDUNK</a>` : ""}
            <a href="${escapeHtml(googleLink)}" target="_blank" rel="noreferrer">Google</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderCardProblem(data, manualPrice = null) {
    if (manualPrice) return "";
    if (data.status === "not_found") {
      return `<p class="tcg-ev-warning">沒有找到足夠相似的 SNKRDUNK 商品，可手動補價。</p>`;
    }
    if (data.status === "no_sales") {
      const listing = Number.isFinite(data.matchedListingPrice)
        ? ` 搜尋頁出品價 ${formatYen(data.matchedListingPrice)} 未納入 EV。`
        : "";
      return `<p class="tcg-ev-warning">找得到商品，但 ${escapeHtml(data.targetCondition || "")} 線圖沒有成交點。${listing}</p>`;
    }
    if (data.status === "error") {
      return `<p class="tcg-ev-warning">${escapeHtml(data.error || "價格抓取失敗")}</p>`;
    }
    return "";
  }

  function updateCardRowPresentation(cardId) {
    const card = state.cards.find((item) => Number(item.id) === Number(cardId));
    const article = root.querySelector(`[data-tcg-ev-card-id="${cardId}"]`);
    if (!card || !article) return;

    const totalQuantity = computeSummary().totalQuantity;
    const data = state.prices.get(card.id) || { status: "pending" };
    const manualPrice = state.manualPrices.get(card.id);
    const price = manualPrice || (Number.isFinite(data.price) ? data.price : null);
    const contribution = price && totalQuantity ? (price * Number(card.number || 0)) / totalQuantity : null;
    const originalPrice = manualPrice && Number.isFinite(data.price) ? data.price : null;
    const rowClass = getCardRowClass(card, data, manualPrice);

    article.className = `tcg-ev-card${rowClass ? ` ${rowClass}` : ""}`;

    const priceNode = article.querySelector("[data-tcg-ev-price]");
    if (priceNode) priceNode.textContent = price ? formatYen(price) : pricePlaceholder(data);

    const contributionNode = article.querySelector("[data-tcg-ev-contribution]");
    if (contributionNode) contributionNode.textContent = `貢獻 ${contribution ? formatYen(contribution) : "-"}`;

    const sourceNode = article.querySelector("[data-tcg-ev-source]");
    if (sourceNode) sourceNode.textContent = sourceText(data, manualPrice);

    const originalNode = article.querySelector("[data-tcg-ev-original-price]");
    if (originalNode) {
      originalNode.hidden = !originalPrice;
      originalNode.textContent = originalPrice ? `SNKRDUNK ${formatYen(originalPrice)}` : "";
    }

    const warningNode = article.querySelector("[data-tcg-ev-warning]");
    if (warningNode) warningNode.innerHTML = renderCardProblem(data, manualPrice);
  }

  function getCardRowClass(card, data, manualPrice) {
    return [
      !manualPrice && (data.status === "error" || data.status === "not_found" || data.status === "no_sales") ? "has-warning" : "",
      isUnpricedCard(card, data, manualPrice) ? "is-unpriced" : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  function computeSummary() {
    const packageData = state.packageData || {};
    const totalQuantity = state.cards.reduce((sum, card) => sum + Number(card.number || 0), 0) || Number(packageData.number || 0);
    const cost = Number(packageData.price || 0);
    let totalValue = 0;
    let pricedQuantity = 0;

    for (const card of state.cards) {
      const qty = Number(card.number || 0);
      const data = state.prices.get(card.id);
      const manualPrice = state.manualPrices.get(card.id);
      const price = manualPrice || (Number.isFinite(data?.price) ? data.price : null);
      if (!price || !qty) continue;
      totalValue += price * qty;
      pricedQuantity += qty;
    }

    const ev = totalQuantity ? totalValue / totalQuantity : 0;
    const edge = ev - cost;
    const ratio = cost ? (ev / cost) * 100 : NaN;
    const stock = Number(packageData.stock || packageData.stock_quantity || 0);
    const stockNote = stock && totalQuantity && stock !== totalQuantity
      ? `目前 API 顯示剩餘 ${stock} 抽，但獎項數量合計為 ${totalQuantity}；EV 以頁面/公開 API 的獎項數量計算。`
      : "";
    const coveragePending =
      state.loading ||
      !state.packageData ||
      !state.cards.length ||
      state.cards.some((card) => {
        const price = state.prices.get(card.id);
        return !price || price.status === "pending" || price.status === "loading";
      });
    const coverageComplete = totalQuantity > 0 && pricedQuantity >= totalQuantity;

    return {
      ev,
      cost,
      edge,
      ratio,
      totalQuantity,
      pricedQuantity,
      stockNote,
      coveragePending,
      coverageComplete
    };
  }

  function isUnpricedCard(card, data, manualPrice) {
    if (manualPrice || Number.isFinite(data?.price)) return false;
    if (!state.packageData || state.loading) return false;
    if (!state.prices.has(card.id)) return false;
    return data.status !== "pending" && data.status !== "loading";
  }

  function applyRankManualPrice(rank) {
    if (rank !== 3 && rank !== 4) return;

    const price = Number(state.rankBulkPrices[rank]);
    if (!Number.isFinite(price) || price <= 0) {
      state.statusText = `請先輸入有效的 R${rank} 固定金額。`;
      render();
      return;
    }

    let changed = 0;
    for (const card of state.cards) {
      if (!isBulkTargetCard(card, rank)) continue;
      state.manualPrices.set(card.id, price);
      changed += 1;
    }

    const scope = state.bulkOnlyNonPsa ? "非 PSA " : "";
    state.statusText = `已將 ${changed} 個 R${rank} ${scope}獎項套用為 ${formatYen(price)}。`;
    render();
  }

  function clearRankManualPrice(rank) {
    if (rank !== 3 && rank !== 4) return;

    let changed = 0;
    for (const card of state.cards) {
      if (!isBulkTargetCard(card, rank)) continue;
      if (state.manualPrices.delete(card.id)) changed += 1;
    }

    const scope = state.bulkOnlyNonPsa ? "非 PSA " : "";
    state.statusText = `已清除 ${changed} 個 R${rank} ${scope}手動價。`;
    render();
  }

  function countBulkTargetCards(rank) {
    return state.cards.filter((card) => isBulkTargetCard(card, rank)).length;
  }

  function isBulkTargetCard(card, rank) {
    if (Number(card?.rank) !== rank) return false;
    return !state.bulkOnlyNonPsa || !isPsaPrize(card);
  }

  function isPsaPrize(card) {
    return (
      /PSA\s*10/i.test(String(card?.name || "")) ||
      String(card?.sourceElementClass || "").includes("gacha-info-card-psa") ||
      card?.is_psa_enabled === 1
    );
  }

  function mergeDomPsaHints(cards) {
    const hintsByRank = groupByRank(collectDomCardHints());
    const cardIndexesByRank = new Map();

    cards.forEach((card, index) => {
      const rank = Number(card.rank);
      if (!cardIndexesByRank.has(rank)) cardIndexesByRank.set(rank, []);
      cardIndexesByRank.get(rank).push(index);
    });

    return cards.map((card, index) => {
      const rank = Number(card.rank);
      const hints = hintsByRank.get(rank) || [];
      const indexes = cardIndexesByRank.get(rank) || [];
      const rankPosition = indexes.indexOf(index);
      const hint = hints.length === indexes.length ? hints[rankPosition] : null;

      if (!hint?.hasPsaClass) return card;
      return {
        ...card,
        sourceElementClass: [card.sourceElementClass, "gacha-info-card-psa"].filter(Boolean).join(" ")
      };
    });
  }

  function collectDomCardHints() {
    const scope = document.querySelector(".gacha-info") || document;
    const detailNodes = [
      ...scope.querySelectorAll(".gacha-info-detail[class*='rank'], .gacha-info.detail[class*='rank']")
    ];
    const nodes = detailNodes.length
      ? detailNodes
      : [...scope.querySelectorAll(".gacha-info-card, [class*='image-rank']")];

    return nodes
      .map((node) => {
        const container = node.closest(".gacha-info-detail, .gacha-info.detail, [class*='rank']");
        const className = [node.className, container?.className].filter(Boolean).join(" ");
        const rank = rankFromClassName(className);
        return {
          rank,
          hasPsaClass:
            String(className).includes("gacha-info-card-psa") ||
            Boolean(node.querySelector?.(".gacha-info-card-psa")) ||
            Boolean(container?.querySelector?.(".gacha-info-card-psa"))
        };
      })
      .filter((hint) => hint.rank);
  }

  function groupByRank(items) {
    const groups = new Map();
    for (const item of items) {
      if (!groups.has(item.rank)) groups.set(item.rank, []);
      groups.get(item.rank).push(item);
    }
    return groups;
  }

  function rankFromClassName(className) {
    const match = String(className || "").match(/\brank\s*([1-4])\b|rank([1-4])\b/i);
    return match ? Number(match[1] || match[2]) : null;
  }

  async function runWithConcurrency(items, limit, worker) {
    let next = 0;
    const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        await worker(items[index], index);
      }
    });
    await Promise.all(runners);
  }

  function sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error || "Extension background failed."));
          return;
        }
        resolve(response);
      });
    });
  }

  function parsePackagePath(pathname) {
    const parts = String(pathname || "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const packageId = Number(parts[parts.length - 1]);
    if (!Number.isInteger(packageId) || packageId <= 0) return null;
    return {
      packageTypePath: parts[parts.length - 2],
      packageId
    };
  }

  function inferShopId() {
    const html = document.documentElement.innerHTML;
    const shopMatch = html.match(/shops\/([0-9]+)\//);
    return shopMatch ? Number(shopMatch[1]) : DEFAULT_SHOP_ID;
  }

  function imageUrl(path) {
    if (!path) return "";
    if (String(path).startsWith("https://")) return path;
    return `https://s3.ap-northeast-1.amazonaws.com/oripal-world.com${path}`;
  }

  function googleSearchUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  }

  function fallbackSearchQuery(card) {
    const name = String(card?.name || "")
      .replace(/〔[^〕]*PSA\s*\d+[^〕]*〕/gi, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/[{}【】]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `${name} ${isPsaPrize(card) ? `PSA${card.psa || 10}` : "B"}`.trim();
  }

  function sourceText(data, manualPrice) {
    if (manualPrice) return "手動價格";
    if (data.status === "loading") return "查詢中";
    if (data.cacheHit && data.source === "condition_chart") return `快取${data.targetCondition || ""}線圖`;
    if (data.source === "condition_chart") return `${data.targetCondition || ""}線圖`;
    if (data.status === "no_sales") return `${data.targetCondition || ""}無線圖`;
    if (data.status === "pending") return "等待中";
    return data.status || "-";
  }

  function pricePlaceholder(data) {
    if (data.status === "loading") return "查詢中";
    if (data.status === "pending") return "等待";
    return "-";
  }

  function formatYen(value) {
    if (!Number.isFinite(value)) return "-";
    return `¥${Math.round(value).toLocaleString("ja-JP")}`;
  }

  function formatSignedYen(value) {
    if (!Number.isFinite(value)) return "-";
    const sign = value >= 0 ? "+" : "-";
    return `${sign}${formatYen(Math.abs(value))}`;
  }

  function formatPoint(value) {
    if (!Number.isFinite(value)) return "-";
    return `${Math.round(value).toLocaleString("ja-JP")} pt`;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("zh-TW", {
      month: "2-digit",
      day: "2-digit"
    });
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]);
  }
})();
