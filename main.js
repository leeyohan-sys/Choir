// 이전에 등록된 PWA/서비스 워커가 있으면 정리
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((reg) => reg.unregister()))
    .catch(() => {});
}

function normalizeTitle(inputValue) {
  return inputValue.trim().replace(/\s+/g, " ").toLowerCase();
}

function toSearchableText(inputValue) {
  return inputValue.replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
}

function getSongNumber(item) {
  const fromUrl = (item.detailUrl || "").match(/\/(\d{2})\.html$/i);
  if (fromUrl) return Number(fromUrl[1]);

  const fromTitle = (item.title || "").match(/^(\d{1,2})\b/);
  return fromTitle ? Number(fromTitle[1]) : Number.MAX_SAFE_INTEGER;
}

function findBestTitleMatch(items, normalizedKeyword, searchableKeyword) {
  const priorities = [
    {
      // 1순위: 완전일치
      match: (title, searchableTitle) =>
        title === normalizedKeyword || searchableTitle === searchableKeyword,
    },
    {
      // 2순위: 시작일치
      match: (title, searchableTitle) =>
        title.startsWith(normalizedKeyword) || searchableTitle.startsWith(searchableKeyword),
    },
    {
      // 3순위: 포함일치
      match: (title, searchableTitle) =>
        title.includes(normalizedKeyword) || searchableTitle.includes(searchableKeyword),
    },
  ];

  for (const priority of priorities) {
    const matched = items.find((item) => {
      const title = item.normalizedTitle || "";
      const searchableTitle = item.searchableTitle || toSearchableText(title);
      return priority.match(title, searchableTitle);
    });
    if (matched) return matched;
  }

  return null;
}

function parseSongNumberQuery(keyword) {
  const normalized = normalizeTitle(keyword);
  const match = normalized.match(/^0*(\d{1,3})\s*번?$/);
  if (!match) return null;
  return Number(match[1]);
}

function findByNumberOrTitle(items, keyword) {
  const normalizedKeyword = normalizeTitle(keyword);
  const searchableKeyword = toSearchableText(normalizedKeyword);
  if (!searchableKeyword) return null;

  const songNumber = parseSongNumberQuery(keyword);
  if (songNumber !== null) {
    const byNumber = items.find((item) => {
      if (item.number != null && Number(item.number) === songNumber) return true;
      return getSongNumber(item) === songNumber;
    });
    if (byNumber) return byNumber;
  }

  const bySongTitle = findBestTitleMatch(
    items.map((item) => ({
      ...item,
      normalizedTitle: normalizeTitle(item.songTitle || item.title || ""),
      searchableTitle: toSearchableText(item.songTitle || item.title || ""),
    })),
    normalizedKeyword,
    searchableKeyword,
  );
  if (bySongTitle) {
    return items.find((item) => item.number === bySongTitle.number || item.title === bySongTitle.title) || bySongTitle;
  }

  return findBestTitleMatch(items, normalizedKeyword, searchableKeyword);
}

function createNumberTitleCatalog({
  formId,
  inputId,
  toggleId,
  listId,
  comboId,
  submitId,
  messageId,
  practiceBoxId,
  mappingUrl,
  emptyListText,
}) {
  const catalogForm = document.getElementById(formId);
  const catalogInput = document.getElementById(inputId);
  const catalogToggle = document.getElementById(toggleId);
  const catalogListEl = document.getElementById(listId);
  const catalogCombo = document.getElementById(comboId);
  const catalogSubmit = document.getElementById(submitId);
  const catalogMessage = document.getElementById(messageId);
  const catalogPracticeBox = document.getElementById(practiceBoxId);

  if (!catalogForm || !catalogInput || !catalogListEl) return;

  let catalogItems = [];
  let catalogActiveIndex = -1;
  let catalogMapping = null;

  function setCatalogMessage(text, isError = false) {
    catalogMessage.textContent = text;
    catalogMessage.classList.toggle("error", isError);
  }

  function hideCatalogPractice() {
    if (!catalogPracticeBox) return;
    catalogPracticeBox.innerHTML = "";
    catalogPracticeBox.hidden = true;
  }

  function setCatalogTypingEnabled(enabled) {
    if (enabled) {
      catalogInput.removeAttribute("readonly");
    } else {
      catalogInput.setAttribute("readonly", "readonly");
    }
  }

  function openCatalogList() {
    catalogListEl.hidden = false;
    catalogInput.setAttribute("aria-expanded", "true");
    const comboRect = catalogCombo.getBoundingClientRect();
    const available = window.innerHeight - comboRect.bottom - 12;
    const maxHeight = Math.max(160, Math.min(available, Math.floor(window.innerHeight * 0.55)));
    catalogListEl.style.maxHeight = `${maxHeight}px`;
  }

  function closeCatalogList() {
    catalogListEl.hidden = true;
    catalogInput.setAttribute("aria-expanded", "false");
    catalogActiveIndex = -1;
    catalogListEl.style.maxHeight = "";
  }

  function filterCatalogSongs(keyword) {
    const normalizedKeyword = normalizeTitle(keyword);
    const searchableKeyword = toSearchableText(normalizedKeyword);
    if (!searchableKeyword) return catalogItems;

    const songNumber = parseSongNumberQuery(keyword);
    return catalogItems.filter((item) => {
      if (songNumber !== null) {
        const itemNumber =
          item.number != null ? Number(item.number) : getSongNumber(item);
        if (itemNumber === songNumber) return true;
      }

      const title = item.normalizedTitle || "";
      const searchableTitle = item.searchableTitle || toSearchableText(item.title || "");
      const songTitle = toSearchableText(item.songTitle || "");
      return (
        title.includes(normalizedKeyword) ||
        searchableTitle.includes(searchableKeyword) ||
        songTitle.includes(searchableKeyword)
      );
    });
  }

  function selectCatalogSong(item) {
    catalogInput.value = item.title;
    closeCatalogList();
    setCatalogTypingEnabled(false);
    catalogInput.blur();
    openCatalogPractice(item);
  }

  async function openCatalogPractice(found) {
    closeCatalogList();
    hideCatalogPractice();

    if (!found) {
      setCatalogMessage("일치하는 파트연습을 찾지 못했습니다.", true);
      return;
    }

    catalogSubmit.disabled = true;
    setCatalogMessage("일치하는 파트연습을 찾는 중입니다...");

    try {
      const available = Object.values(found.parts || {}).filter((part) => part?.youtubeId).length;
      if (available === 0) {
        setCatalogMessage("이 곡의 파트연습 영상이 아직 없습니다.", true);
        return;
      }

      window.PartPracticeUI.render(catalogPracticeBox, found);
      setCatalogMessage("파트를 선택해 연습 영상을 재생할 수 있습니다.");
    } catch (_error) {
      setCatalogMessage("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
    } finally {
      catalogSubmit.disabled = false;
    }
  }

  function renderCatalogList(items) {
    catalogListEl.innerHTML = "";

    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "combo-empty";
      empty.textContent = catalogItems.length ? "일치하는 곡이 없습니다." : emptyListText;
      catalogListEl.appendChild(empty);
      return;
    }

    items.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "combo-item";
      li.setAttribute("role", "option");
      li.dataset.index = String(index);
      if (index === catalogActiveIndex) {
        li.classList.add("active");
      }

      li.textContent = item.title;

      li.addEventListener("click", () => {
        setCatalogTypingEnabled(false);
        selectCatalogSong(item);
      });

      catalogListEl.appendChild(li);
    });
  }

  function refreshCatalogList({ open = true, showAll = false } = {}) {
    const filtered = showAll ? catalogItems : filterCatalogSongs(catalogInput.value);
    renderCatalogList(filtered);
    if (open) openCatalogList();
  }

  function moveCatalogActive(delta) {
    const items = [...catalogListEl.querySelectorAll(".combo-item")];
    if (!items.length) return;

    catalogActiveIndex = (catalogActiveIndex + delta + items.length) % items.length;
    items.forEach((el, idx) => {
      el.classList.toggle("active", idx === catalogActiveIndex);
    });
    items[catalogActiveIndex].scrollIntoView({ block: "nearest" });
  }

  async function getCatalogMapping() {
    if (catalogMapping) return catalogMapping;
    const response = await fetch(mappingUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`${mappingUrl} 로드 실패`);
    catalogMapping = await response.json();
    return catalogMapping;
  }

  async function initCatalog() {
    const data = await getCatalogMapping();
    catalogItems = [...(data.items || [])].sort((a, b) => {
      const aNum = a.number != null ? Number(a.number) : getSongNumber(a);
      const bNum = b.number != null ? Number(b.number) : getSongNumber(b);
      return aNum - bNum;
    });
    renderCatalogList(catalogItems);
  }

  catalogInput.addEventListener("pointerdown", () => {
    setCatalogTypingEnabled(true);
  });

  catalogInput.addEventListener("focus", () => {
    if (catalogInput.hasAttribute("readonly")) {
      catalogInput.blur();
      return;
    }
    refreshCatalogList({ open: true });
  });

  catalogInput.addEventListener("input", () => {
    catalogActiveIndex = -1;
    refreshCatalogList({ open: true });
  });

  catalogInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (catalogListEl.hidden) refreshCatalogList({ open: true });
      moveCatalogActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (catalogListEl.hidden) refreshCatalogList({ open: true });
      moveCatalogActive(-1);
    } else if (event.key === "Enter" && !catalogListEl.hidden && catalogActiveIndex >= 0) {
      const filtered = filterCatalogSongs(catalogInput.value);
      const item = filtered[catalogActiveIndex];
      if (item) {
        event.preventDefault();
        selectCatalogSong(item);
      }
    } else if (event.key === "Escape") {
      closeCatalogList();
    }
  });

  catalogToggle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
  });

  catalogToggle.addEventListener("click", () => {
    setCatalogTypingEnabled(false);
    catalogInput.blur();
    if (catalogListEl.hidden) {
      catalogActiveIndex = -1;
      refreshCatalogList({ open: true, showAll: true });
    } else {
      closeCatalogList();
    }
  });

  document.addEventListener("click", (event) => {
    if (!catalogCombo.contains(event.target)) {
      closeCatalogList();
    }
  });

  catalogForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    closeCatalogList();
    hideCatalogPractice();

    const keyword = catalogInput.value.trim();
    if (!keyword) {
      setCatalogMessage("곡 번호 또는 곡 제목을 입력해 주세요.", true);
      return;
    }

    try {
      const data = await getCatalogMapping();
      const items = data.items || [];

      if (!items.length) {
        setCatalogMessage("곡 목록이 아직 등록되지 않았습니다. 곧 추가될 예정입니다.", true);
        return;
      }

      const found = findByNumberOrTitle(items, keyword);
      await openCatalogPractice(found);
    } catch (_error) {
      setCatalogMessage("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
    }
  });

  initCatalog().catch(() => {
    setCatalogMessage("곡 목록을 불러오지 못했습니다.", true);
  });
}

createNumberTitleCatalog({
  formId: "easyGrace13Form",
  inputId: "easyGrace13Input",
  toggleId: "easyGrace13Toggle",
  listId: "easyGrace13SongList",
  comboId: "easyGrace13Combo",
  submitId: "easyGrace13Submit",
  messageId: "easyGrace13Message",
  practiceBoxId: "easyGrace13PracticeBox",
  mappingUrl: "./mapping-easygrace13.json",
  emptyListText: "등록된 곡이 없습니다. 곡 목록은 곧 추가됩니다.",
});
