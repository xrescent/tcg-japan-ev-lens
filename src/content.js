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
    domSignals: {
      rank4OtherAvailable: false,
      lastPrize: null
    },
    lastPrizeValue: "",
    collapsedRanks: new Set(),
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
    state.domSignals = { rank4OtherAvailable: false, lastPrize: null };
    state.lastPrizeValue = "";
    state.collapsedRanks = new Set();
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
      const packageCards = response.package.package_cards || [];
      state.domSignals = collectDomSignals(packageCards);
      state.cards = appendConsolationPrizeCard(
        mergeDomPsaHints(packageCards.filter((card) => Number(card.rank) !== 9)),
        response.package
      );
      state.statusText = `搜尋 SNKRDUNK 成交價 0/${state.cards.length}`;
      render();

      await runWithConcurrency(state.cards, 3, async (card) => {
        if (shouldSkipAutoPricing(card)) {
          state.prices.set(cardKey(card), buildPlaceholderPrizePrice(card));
          updatePricingStatus();
          render();
          return;
        }

        state.prices.set(cardKey(card), { status: "loading" });
        render();

        try {
          const priceResponse = await sendMessage("GET_CARD_PRICE", {
            card,
            force: forcePrices
          });
          if (priceResponse.cacheHit) priceResponse.price.cacheHit = true;
          state.prices.set(cardKey(card), priceResponse.price);
        } catch (error) {
          state.prices.set(cardKey(card), {
            status: "error",
            error: error.message || String(error)
          });
        }

        updatePricingStatus();
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

  function updatePricingStatus() {
    const done = [...state.prices.values()].filter((price) => price.status !== "loading").length;
    state.statusText = `搜尋 SNKRDUNK 成交價 ${Math.min(done, state.cards.length)}/${state.cards.length}`;
  }

  function buildPlaceholderPrizePrice(card) {
    const point = Number(card?.point);
    const query = fallbackSearchQuery(card);

    if (Number.isFinite(point) && point > 0) {
      return {
        status: "ok",
        source: "api_point",
        price: point,
        targetCondition: "point",
        query,
        reason: card?.is_consolation ? "consolation_api_point" : "rank4_api_point"
      };
    }

    return {
      status: "manual_required",
      reason: card?.is_consolation ? "missing_consolation_point" : "rank4_other_available",
      targetCondition: isPsaPrize(card) ? `PSA${card.psa || 10}` : "B",
      query
    };
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

      if (action === "toggle-rank") {
        toggleRankGroup(event.target.closest("[data-tcg-ev-rank-group]")?.dataset.tcgEvRankGroup);
      }
    });

    root.addEventListener("input", (event) => {
      const bulkInput = event.target.closest("[data-tcg-ev-rank-price]");
      if (bulkInput) {
        state.rankBulkPrices[bulkInput.dataset.tcgEvRankPrice] = bulkInput.value;
        return;
      }

      const lastPrizeInput = event.target.closest("[data-tcg-ev-last-prize-value]");
      if (lastPrizeInput) {
        state.lastPrizeValue = lastPrizeInput.value;
        updateLastPrizeMetrics();
        return;
      }

      const input = event.target.closest("[data-tcg-ev-manual-price]");
      if (!input) return;

      const cardId = input.dataset.tcgEvManualPrice;
      const card = findCardByKey(cardId);
      const key = card ? cardKey(card) : String(cardId || "");
      const price = Number(input.value);
      if (Number.isFinite(price) && price > 0) {
        state.manualPrices.set(key, price);
      } else {
        state.manualPrices.delete(key);
      }
      renderSummaryOnly();
      renderRemainingDrawOnly();
      updateCardRowPresentation(key);
      if (card) updateRankGroupPresentation(card.rank);
      updateLastPrizeMetrics();
    });

    root.addEventListener("change", (event) => {
      const manualInput = event.target.closest("[data-tcg-ev-manual-price]");
      if (manualInput) {
        render();
        return;
      }

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
          ${renderRemainingDrawPanel(summary)}
          ${renderBulkControls()}
          ${renderLastPrizePanel(summary)}
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

  function renderLastPrizePanel(summary) {
    if (!state.domSignals.lastPrize) return "";
    const metrics = computeLastPrizeMetrics(summary);

    return `
      <section class="tcg-ev-last-prize" data-tcg-ev-last-prize>
        <div class="tcg-ev-last-prize-head">
          <strong>最後一抽特別獎</strong>
          <span>${escapeHtml(state.domSignals.lastPrize.text || "偵測到 rank9 最後賞。")}</span>
        </div>
        <p>這類獎項不自動併入上方單抽 EV；它更適合用「包剩餘抽數」或「平均攤提」方式參考。</p>
        <div class="tcg-ev-last-prize-grid">
          <label>
            最後賞估值
            <input data-tcg-ev-last-prize-value type="number" min="0" step="1" value="${escapeHtml(state.lastPrizeValue)}" placeholder="¥">
          </label>
          <div>
            <span>平均攤提</span>
            <strong data-tcg-ev-last-amortized>${formatYen(metrics.amortized)}</strong>
          </div>
          <div>
            <span>包剩餘估值</span>
            <strong data-tcg-ev-last-bundle-value>${formatYen(metrics.bundleValue)}</strong>
          </div>
          <div>
            <span>包剩餘 ROI</span>
            <strong data-tcg-ev-last-bundle-roi>${formatPercent(metrics.bundleRoi)}</strong>
          </div>
        </div>
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

  function renderRemainingDrawOnly() {
    const panel = root.querySelector("[data-tcg-ev-remaining]");
    if (!panel) return;

    const nextHtml = renderRemainingDrawPanel(computeSummary());
    if (nextHtml) {
      panel.outerHTML = nextHtml;
    } else {
      panel.remove();
    }
  }

  function renderRemainingDrawPanel(summary) {
    const analysis = computeRemainingDrawAnalysis(summary);
    if (!analysis) return "";

    const coverageClass = analysis.coverageComplete ? "is-complete" : "is-incomplete";
    const survivalRows = analysis.survival
      .map((item) => {
        const rankClass = rankBadgeClass(item.rank);
        return `
          <div>
            <span class="tcg-ev-rank${rankClass ? ` ${rankClass}` : ""}">R${escapeHtml(item.rank)}</span>
            <strong>${formatPercent(item.probability)}</strong>
          </div>
        `;
      })
      .join("");

    return `
      <section class="tcg-ev-remaining ${coverageClass}" data-tcg-ev-remaining>
        <div class="tcg-ev-remaining-head">
          <div>
            <strong>
              剩餘抽分析
              <span
                class="tcg-ev-info-hint"
                tabindex="0"
                aria-label="中性 EV 假設已抽走的獎項隨機分布；保守 EV 假設已抽走的是最高價獎項；樂觀 EV 假設已抽走的是最低價獎項。"
                data-tcg-ev-tooltip="中性：假設已抽走獎項隨機分布。保守：假設最高價獎項先被抽走。樂觀：假設最低價獎項先被抽走。"
              >i</span>
            </strong>
            <span>${analysis.remaining} / ${analysis.total} 抽剩餘，已抽 ${analysis.drawn} 抽</span>
          </div>
          <span>${analysis.coverageComplete ? "估價完整" : `缺 ${analysis.unpricedQuantity} 抽估價`}</span>
        </div>
        <div class="tcg-ev-remaining-grid">
          <div class="is-neutral">
            <span>中性 EV</span>
            <strong>${formatYen(analysis.neutralEv)}</strong>
          </div>
          <div class="is-conservative">
            <span>保守 EV</span>
            <strong>${formatYen(analysis.conservativeEv)}</strong>
          </div>
          <div class="is-optimistic">
            <span>樂觀 EV</span>
            <strong>${formatYen(analysis.optimisticEv)}</strong>
          </div>
        </div>
        ${survivalRows ? `
          <div class="tcg-ev-survival-block">
            <div class="tcg-ev-survival-head">
              <strong>
                Rank 存活率
                <span
                  class="tcg-ev-info-hint"
                  tabindex="0"
                  aria-label="Rank 存活率代表至少還有一個該 Rank 獎項仍在剩餘池內的機率，不是 EV 佔比，也不是單抽中獎率。"
                  data-tcg-ev-tooltip="代表至少還有一個該 Rank 獎項仍在剩餘池內的機率；不是 EV 佔比，也不是單抽中獎率。"
                >i</span>
              </strong>
            </div>
            <div class="tcg-ev-survival">${survivalRows}</div>
          </div>
        ` : ""}
      </section>
    `;
  }

  function renderCards(summary) {
    if (!state.cards.length) {
      return `<section class="tcg-ev-card-list" data-tcg-ev-cards><p class="tcg-ev-empty">還沒有讀到獎項資料。</p></section>`;
    }

    const groups = buildRankGroups(summary);

    return `
      <section class="tcg-ev-card-list" data-tcg-ev-cards>
        ${groups.map((group) => renderRankGroup(group, summary.totalQuantity)).join("")}
      </section>
    `;
  }

  function buildRankGroups(summary = computeSummary()) {
    const groups = new Map();
    const totalQuantity = Number(summary.totalQuantity || 0);

    state.cards.forEach((card, index) => {
      const key = rankGroupKey(card.rank);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          rank: Number(card.rank),
          cards: [],
          quantity: 0,
          unpricedCount: 0,
          evContribution: 0,
          evShare: NaN
        });
      }

      const group = groups.get(key);
      const needsInput = cardNeedsManualInput(card);
      const contribution = cardEvContribution(card, totalQuantity);
      group.cards.push({ card, index, needsInput });
      group.quantity += Number(card.number || 0);
      if (needsInput) group.unpricedCount += 1;
      if (Number.isFinite(contribution)) group.evContribution += contribution;
    });

    return [...groups.values()]
      .map((group) => ({
        ...group,
        evShare: Number.isFinite(summary.ev) && summary.ev > 0 ? (group.evContribution / summary.ev) * 100 : NaN,
        cards: group.cards.sort((a, b) => {
          if (a.needsInput !== b.needsInput) return a.needsInput ? -1 : 1;
          return a.index - b.index;
        })
      }))
      .sort((a, b) => {
        const inputDiff = Number(b.unpricedCount > 0) - Number(a.unpricedCount > 0);
        if (inputDiff !== 0) return inputDiff;
        const rankDiff = rankSortValue(a.rank) - rankSortValue(b.rank);
        if (rankDiff !== 0) return rankDiff;
        return String(a.key).localeCompare(String(b.key));
      });
  }

  function renderRankGroup(group, totalQuantity) {
    const collapsed = state.collapsedRanks.has(group.key);
    const rankLabel = Number.isFinite(group.rank) ? `R${group.rank}` : "其他";
    const rankClass = rankBadgeClass(group.rank);
    const unpricedLabel = group.unpricedCount
      ? `<span class="tcg-ev-rank-group-status" data-tcg-ev-rank-group-status>需補 ${group.unpricedCount}</span>`
      : `<span class="tcg-ev-rank-group-status is-complete" data-tcg-ev-rank-group-status>已覆蓋</span>`;

    return `
      <section class="tcg-ev-rank-group${collapsed ? " is-collapsed" : ""}${group.unpricedCount ? " has-unpriced" : ""}" data-tcg-ev-rank-group-section="${escapeHtml(group.key)}">
        <button
          type="button"
          class="tcg-ev-rank-group-head"
          data-tcg-ev-action="toggle-rank"
          data-tcg-ev-rank-group="${escapeHtml(group.key)}"
          aria-expanded="${collapsed ? "false" : "true"}"
        >
          <span class="tcg-ev-rank${rankClass ? ` ${rankClass}` : ""}">${escapeHtml(rankLabel)}</span>
          <span class="tcg-ev-rank-group-title">${escapeHtml(rankLabel)} 獎項</span>
          <span class="tcg-ev-rank-group-toggle">${collapsed ? "展開" : "收合"}</span>
          <span class="tcg-ev-rank-group-metrics">
            <span class="tcg-ev-rank-group-meta" data-tcg-ev-rank-group-meta>${rankGroupMetaText(group)}</span>
            <span class="tcg-ev-rank-group-ev" data-tcg-ev-rank-group-ev>${escapeHtml(rankContributionText(group))}</span>
            ${unpricedLabel}
          </span>
        </button>
        <div class="tcg-ev-rank-group-body"${collapsed ? " hidden" : ""}>
          ${group.cards.map((item) => renderCardRow(item.card, totalQuantity)).join("")}
        </div>
      </section>
    `;
  }

  function renderCardRow(card, totalQuantity) {
    const key = cardKey(card);
    const qty = Number(card.number || 0);
    const data = state.prices.get(key) || { status: "pending" };
    const manualPrice = state.manualPrices.get(key);
    const price = manualPrice || (Number.isFinite(data.price) ? data.price : null);
    const contribution = price && totalQuantity ? (price * qty) / totalQuantity : null;
    const rowClass = getCardRowClass(card, data, manualPrice);
    const sourceLabel = sourceText(data, manualPrice);
    const link = data.match?.link || data.searchUrl || "";
    const googleLink = googleSearchUrl(data.query || fallbackSearchQuery(card));
    const originalPrice = manualPrice && Number.isFinite(data.price) ? data.price : null;
    const rankClass = rankBadgeClass(card.rank);

    return `
      <article class="tcg-ev-card${rowClass ? ` ${rowClass}` : ""}" data-tcg-ev-card-id="${escapeHtml(key)}">
        <div class="tcg-ev-rank${rankClass ? ` ${rankClass}` : ""}">R${escapeHtml(card.rank || "-")}</div>
        ${renderCardImage(card)}
        <div class="tcg-ev-card-main">
          <div class="tcg-ev-card-name" title="${escapeHtml(card.name || "")}">${escapeHtml(card.name || "-")}</div>
          <div class="tcg-ev-card-meta">
            <span>數量 ${qty}</span>
            <span>${escapeHtml(conditionLabel(card, data))}</span>
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
            <input data-tcg-ev-manual-price="${escapeHtml(key)}" type="number" min="0" step="1" value="${manualPrice || ""}" placeholder="¥">
          </label>
          <div class="tcg-ev-card-links">
            ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">SNKRDUNK</a>` : ""}
            <a href="${escapeHtml(googleLink)}" target="_blank" rel="noreferrer">Google</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderCardImage(card) {
    if (card?.image_url) {
      return `<img src="${escapeHtml(imageUrl(card.image_url))}" alt="" loading="lazy">`;
    }

    return `<div class="tcg-ev-card-placeholder" aria-hidden="true">其他</div>`;
  }

  function renderCardProblem(data, manualPrice = null) {
    if (manualPrice) return "";
    if (data.status === "manual_required") {
      const message = data.reason === "missing_consolation_point"
        ? "偵測到「其他可用」安慰獎，但 API 沒有 point 欄位；請手動輸入固定值。"
        : "此 R4 區塊顯示「其他可用」，不自動估價；請手動輸入固定值。";
      return `<p class="tcg-ev-warning">${escapeHtml(message)}</p>`;
    }
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
    const key = String(cardId || "");
    const card = findCardByKey(key);
    const article = [...root.querySelectorAll("[data-tcg-ev-card-id]")]
      .find((node) => node.dataset.tcgEvCardId === key);
    if (!card || !article) return;

    const totalQuantity = computeSummary().totalQuantity;
    const data = state.prices.get(cardKey(card)) || { status: "pending" };
    const manualPrice = state.manualPrices.get(cardKey(card));
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

  function updateRankGroupPresentation(rank) {
    const key = rankGroupKey(rank);
    const group = buildRankGroups(computeSummary()).find((item) => item.key === key);
    const section = [...root.querySelectorAll("[data-tcg-ev-rank-group-section]")]
      .find((node) => node.dataset.tcgEvRankGroupSection === key);
    if (!group || !section) return;

    section.classList.toggle("has-unpriced", group.unpricedCount > 0);
    setText(section, "[data-tcg-ev-rank-group-meta]", rankGroupMetaText(group));
    setText(section, "[data-tcg-ev-rank-group-ev]", rankContributionText(group));

    const statusNode = section.querySelector("[data-tcg-ev-rank-group-status]");
    if (statusNode) {
      statusNode.textContent = group.unpricedCount ? `需補 ${group.unpricedCount}` : "已覆蓋";
      statusNode.classList.toggle("is-complete", group.unpricedCount === 0);
    }
  }

  function getCardRowClass(card, data, manualPrice) {
    return [
      !manualPrice && ["error", "not_found", "no_sales", "manual_required"].includes(data.status) ? "has-warning" : "",
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
      const data = state.prices.get(cardKey(card));
      const manualPrice = state.manualPrices.get(cardKey(card));
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
        const price = state.prices.get(cardKey(card));
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
    if (!state.prices.has(cardKey(card))) return false;
    return data.status !== "pending" && data.status !== "loading";
  }

  function cardNeedsManualInput(card) {
    const data = state.prices.get(cardKey(card)) || { status: "pending" };
    const manualPrice = state.manualPrices.get(cardKey(card));
    return isUnpricedCard(card, data, manualPrice);
  }

  function computeRemainingDrawAnalysis(summary = computeSummary()) {
    const total = Number(summary.totalQuantity || state.packageData?.number || 0);
    const remaining = Number(state.packageData?.stock || state.packageData?.stock_quantity || 0);
    if (!total || !remaining || remaining >= total) return null;

    const drawn = total - remaining;
    const valuedLots = state.cards
      .map((card) => ({
        rank: Number(card.rank),
        quantity: Number(card.number || 0),
        price: resolvedCardPrice(card)
      }))
      .filter((lot) => lot.quantity > 0);
    const pricedLots = valuedLots.filter((lot) => Number.isFinite(lot.price) && lot.price > 0);
    const unpricedQuantity = valuedLots
      .filter((lot) => !Number.isFinite(lot.price) || lot.price <= 0)
      .reduce((sum, lot) => sum + lot.quantity, 0);

    return {
      total,
      remaining,
      drawn,
      neutralEv: summary.ev,
      conservativeEv: computeScenarioRemainingEv(pricedLots, drawn, remaining, "highest"),
      optimisticEv: computeScenarioRemainingEv(pricedLots, drawn, remaining, "lowest"),
      coverageComplete: unpricedQuantity === 0 && summary.coverageComplete,
      unpricedQuantity,
      survival: computeRankSurvivalProbabilities(valuedLots, total, drawn)
    };
  }

  function computeScenarioRemainingEv(lots, drawn, remaining, removeMode) {
    if (!remaining) return NaN;

    const ordered = [...lots].sort((a, b) => {
      const priceDiff = removeMode === "highest" ? b.price - a.price : a.price - b.price;
      if (priceDiff !== 0) return priceDiff;
      return Number(a.rank || 999) - Number(b.rank || 999);
    });
    let drawsToRemove = Math.max(0, drawn);
    let remainingValue = 0;

    for (const lot of ordered) {
      const removed = Math.min(lot.quantity, drawsToRemove);
      const kept = lot.quantity - removed;
      drawsToRemove -= removed;
      remainingValue += kept * lot.price;
    }

    return remainingValue / remaining;
  }

  function computeRankSurvivalProbabilities(lots, total, drawn) {
    const quantitiesByRank = new Map();

    for (const lot of lots) {
      if (!Number.isFinite(lot.rank) || lot.rank < 1 || lot.rank > 4) continue;
      quantitiesByRank.set(lot.rank, (quantitiesByRank.get(lot.rank) || 0) + lot.quantity);
    }

    return [...quantitiesByRank.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rank, quantity]) => ({
        rank,
        probability: rankSurvivalProbability(total, drawn, quantity)
      }));
  }

  function rankSurvivalProbability(total, drawn, quantity) {
    if (!total || !quantity) return NaN;
    if (drawn < quantity) return 100;
    const allDrawnProbability = Math.exp(logCombination(total - quantity, drawn - quantity) - logCombination(total, drawn));
    return (1 - allDrawnProbability) * 100;
  }

  function logCombination(n, k) {
    if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
    const iterations = Math.min(k, n - k);
    let total = 0;

    for (let i = 1; i <= iterations; i += 1) {
      total += Math.log(n - iterations + i) - Math.log(i);
    }

    return total;
  }

  function cardEvContribution(card, totalQuantity) {
    const qty = Number(card.number || 0);
    const price = resolvedCardPrice(card);
    if (!price || !qty || !totalQuantity) return null;
    return (price * qty) / totalQuantity;
  }

  function resolvedCardPrice(card) {
    const data = state.prices.get(cardKey(card));
    const manualPrice = state.manualPrices.get(cardKey(card));
    return manualPrice || (Number.isFinite(data?.price) ? data.price : null);
  }

  function shouldSkipAutoPricing(card) {
    return card?.is_consolation || (state.domSignals.rank4OtherAvailable && Number(card?.rank) === 4);
  }

  function computeLastPrizeMetrics(summary = computeSummary()) {
    const value = Number(state.lastPrizeValue);
    const lastPrizeValue = Number.isFinite(value) && value > 0 ? value : 0;
    const remaining = Number(state.packageData?.stock || state.packageData?.stock_quantity || summary.totalQuantity || 0);
    const cost = Number(state.packageData?.price || 0);
    const bundleCost = remaining * cost;
    const bundleValue = summary.ev * remaining + lastPrizeValue;

    if (!lastPrizeValue) {
      return {
        amortized: NaN,
        bundleValue: NaN,
        bundleRoi: NaN
      };
    }

    return {
      amortized: remaining && lastPrizeValue ? lastPrizeValue / remaining : NaN,
      bundleValue: bundleValue || NaN,
      bundleRoi: bundleCost ? (bundleValue / bundleCost) * 100 : NaN
    };
  }

  function updateLastPrizeMetrics() {
    const panel = root.querySelector("[data-tcg-ev-last-prize]");
    if (!panel) return;

    const metrics = computeLastPrizeMetrics();
    setText(panel, "[data-tcg-ev-last-amortized]", formatYen(metrics.amortized));
    setText(panel, "[data-tcg-ev-last-bundle-value]", formatYen(metrics.bundleValue));
    setText(panel, "[data-tcg-ev-last-bundle-roi]", formatPercent(metrics.bundleRoi));
  }

  function setText(scope, selector, value) {
    const node = scope.querySelector(selector);
    if (node) node.textContent = value;
  }

  function toggleRankGroup(rankKey) {
    if (!rankKey) return;

    if (state.collapsedRanks.has(rankKey)) {
      state.collapsedRanks.delete(rankKey);
    } else {
      state.collapsedRanks.add(rankKey);
    }

    render();
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
      state.manualPrices.set(cardKey(card), price);
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
      if (state.manualPrices.delete(cardKey(card))) changed += 1;
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

  function appendConsolationPrizeCard(cards, packageData) {
    if ((cards || []).some((card) => card?.is_consolation)) return cards;

    const summary = packageData?.consolation_prize;
    const placeholderCount = Number(summary?.placeholderCount || 0);
    const missingQuantity = Number(summary?.quantity || 0) || computeMissingPrizeQuantity(cards, packageData);
    const shouldAppend =
      missingQuantity > 0 &&
      (state.domSignals.rank4OtherAvailable || placeholderCount > 0 || summary?.source === "missing_rank4" || summary?.source === "api_point");

    if (!shouldAppend) return cards;

    const point = Number(summary?.point);
    return [
      ...cards,
      {
        id: `consolation-${packageData?.id || state.routeKey}`,
        package_id: packageData?.id || null,
        rank: Number(summary?.rank || 4),
        name: "其他可用 / 安慰獎",
        image_url: null,
        number: missingQuantity,
        point: Number.isFinite(point) && point > 0 ? point : null,
        is_psa_enabled: 2,
        psa: null,
        is_consolation: true,
        placeholderCount,
        sourceElementClass: "gacha-info-detail-rank4 other-available"
      }
    ];
  }

  function computeMissingPrizeQuantity(cards, packageData) {
    const listedQuantity = (cards || [])
      .filter((card) => !card?.is_consolation && Number(card?.rank) !== 9)
      .reduce((sum, card) => sum + Number(card.number || 0), 0);
    const packageQuantity = Number(packageData?.number || 0);
    return packageQuantity > listedQuantity ? packageQuantity - listedQuantity : 0;
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

  function collectDomSignals(packageCards = []) {
    const detailNodes = getGachaDetailNodes();
    const rank4OtherAvailable = detailNodes.some((node) => {
      if (rankFromClassName(node.className) !== 4) return false;
      return /其他可用|other\s+available/i.test(normalizeText(node.textContent));
    });
    const lastPrizeNode = detailNodes.find((node) => rankFromClassName(node.className) === 9);
    const lastPrizeCard = packageCards.find((card) => Number(card.rank) === 9);

    return {
      rank4OtherAvailable,
      lastPrize: lastPrizeNode || lastPrizeCard
        ? {
            text: normalizeText(lastPrizeNode?.textContent || lastPrizeCard?.name || "偵測到 rank9 最後賞。").slice(0, 90)
          }
        : null
    };
  }

  function collectDomCardHints() {
    const scope = getGachaInfoScope();
    const detailNodes = getGachaDetailNodes(scope);
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
    const match = String(className || "").match(/\brank\s*([1-9])\b|rank([1-9])\b/i);
    return match ? Number(match[1] || match[2]) : null;
  }

  function getGachaInfoScope() {
    return document.querySelector(".gacha-info") || document;
  }

  function getGachaDetailNodes(scope = getGachaInfoScope()) {
    return [
      ...scope.querySelectorAll(
        ".gacha-info-detail[class*='rank'], .gacha-info.detail[class*='rank'], [class*='gacha-info-detail-rank'], [class*='gacha-info-detai'][class*='rank']"
      )
    ];
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
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
    if (card?.is_consolation) {
      const point = Number(card.point);
      return [
        state.packageData?.name,
        "其他可用",
        "安慰獎",
        Number.isFinite(point) && point > 0 ? `${point}pt` : ""
      ]
        .filter(Boolean)
        .join(" ");
    }

    const name = String(card?.name || "")
      .replace(/〔[^〕]*PSA\s*\d+[^〕]*〕/gi, "")
      .replace(/\[[^\]]*\]/g, "")
      .replace(/[{}【】]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `${name} ${isPsaPrize(card) ? `PSA${card.psa || 10}` : "B"}`.trim();
  }

  function conditionLabel(card, data) {
    if (card?.is_consolation) {
      const point = Number(data?.source === "api_point" ? data.price : card.point);
      return Number.isFinite(point) && point > 0 ? `安慰獎 ${point}pt` : "安慰獎";
    }
    return isPsaPrize(card) ? `PSA${card.psa || 10}` : "B品";
  }

  function findCardByKey(key) {
    const normalized = String(key || "");
    return state.cards.find((card) => cardKey(card) === normalized);
  }

  function cardKey(cardOrId) {
    if (cardOrId && typeof cardOrId === "object") return String(cardOrId.id);
    return String(cardOrId || "");
  }

  function rankBadgeClass(rank) {
    const value = Number(rank);
    if (value >= 1 && value <= 4) return `is-rank-${value}`;
    return "";
  }

  function rankGroupKey(rank) {
    const value = Number(rank);
    return Number.isFinite(value) ? String(value) : "unknown";
  }

  function rankSortValue(rank) {
    const value = Number(rank);
    return Number.isFinite(value) ? value : 999;
  }

  function rankContributionText(group) {
    return `貢獻 ${formatYen(group.evContribution)} / 佔 ${formatPercent(group.evShare)}`;
  }

  function rankGroupMetaText(group) {
    return `${group.cards.length}種 共 ${group.quantity}抽`;
  }

  function sourceText(data, manualPrice) {
    if (manualPrice) return "手動價格";
    if (data.status === "manual_required") return "需手動";
    if (data.status === "loading") return "查詢中";
    if (data.source === "api_point") return Number.isFinite(data.price) ? `API ${data.price}pt` : "API pt";
    if (data.cacheHit && data.source === "condition_chart") return `快取${data.targetCondition || ""}線圖`;
    if (data.source === "condition_chart") return `${data.targetCondition || ""}線圖`;
    if (data.status === "no_sales") return `${data.targetCondition || ""}無線圖`;
    if (data.status === "pending") return "等待中";
    return data.status || "-";
  }

  function pricePlaceholder(data) {
    if (data.status === "loading") return "查詢中";
    if (data.status === "manual_required") return "請輸入";
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

  function formatPercent(value) {
    if (!Number.isFinite(value)) return "-";
    return `${value.toFixed(1)}%`;
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
