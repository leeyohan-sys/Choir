const form = document.getElementById("matchForm");
const input = document.getElementById("youtubeUrl");
const messageEl = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");
const resultBox = document.getElementById("resultBox");
const resultLink = document.getElementById("resultLink");
const copyBtn = document.getElementById("copyBtn");
const songListEl = document.getElementById("songList");
const comboToggle = document.getElementById("comboToggle");

// 이전에 등록된 PWA/서비스 워커가 있으면 정리
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((reg) => reg.unregister()))
    .catch(() => {});
}

let mappingData = null;
let songItems = [];
let activeIndex = -1;

const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
const TITLE_ALIAS_TO_DETAIL = {
  // "기쁨의찬양"처럼 현장 표현으로 입력하는 경우를 위한 별칭
  기쁨의찬양: "https://www.vitnara.co.kr/part/thegrace9/thegrace9/17.html",
  기쁨찬양: "https://www.vitnara.co.kr/part/thegrace9/thegrace9/17.html",
};

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}

function setResultLink(url) {
  if (!url) {
    resultLink.textContent = "";
    resultLink.href = "#";
    resultBox.hidden = true;
    return;
  }

  resultLink.textContent = url;
  resultLink.href = url;
  resultBox.hidden = false;
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

function looksLikeYoutubeInput(inputValue) {
  const value = (inputValue || "").trim().toLowerCase();
  if (!value) return false;
  return (
    value.includes("youtube.com") ||
    value.includes("youtu.be") ||
    /^https?:\/\//i.test(value) ||
    /^[a-zA-Z0-9_-]{11}$/.test(value)
  );
}

function normalizeYoutubeId(inputValue) {
  if (!inputValue || typeof inputValue !== "string") return null;

  const trimmed = inputValue.trim();
  if (!trimmed) return null;

  // 이미 ID(11자리)만 입력한 경우도 허용
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host.endsWith("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }

      // /embed/, /shorts/, /live/, /v/ 형태도 지원
      const pathMatch = url.pathname.match(
        /\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/i,
      );
      if (pathMatch) return pathMatch[1];
    }
  } catch (_error) {
    // URL 파싱에 실패해도 정규식 기반 추출로 폴백
  }

  const match = trimmed.match(YOUTUBE_ID_REGEX);
  return match ? match[1] : null;
}

async function getMappingData() {
  if (mappingData) return mappingData;

  const response = await fetch("./mapping.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("mapping.json 로드 실패");
  }
  mappingData = await response.json();
  return mappingData;
}

function openSongList() {
  songListEl.hidden = false;
  input.setAttribute("aria-expanded", "true");
  // 화면 아래 남은 공간에 맞춰 목록 높이를 잡아 스크롤 가능하게 함
  const comboRect = document.getElementById("combo").getBoundingClientRect();
  const available = window.innerHeight - comboRect.bottom - 12;
  const maxHeight = Math.max(160, Math.min(available, Math.floor(window.innerHeight * 0.55)));
  songListEl.style.maxHeight = `${maxHeight}px`;
}

function closeSongList() {
  songListEl.hidden = true;
  input.setAttribute("aria-expanded", "false");
  activeIndex = -1;
  songListEl.style.maxHeight = "";
}

// 콤보로 목록만 볼 때는 키보드 방지, 직접 입력할 때만 키보드 허용
function setTypingEnabled(enabled) {
  if (enabled) {
    input.removeAttribute("readonly");
  } else {
    input.setAttribute("readonly", "readonly");
  }
}

function filterSongs(keyword) {
  // 유튜브 주소가 인식되면 곡 목록 필터 대신 주소 검색으로 처리
  if (normalizeYoutubeId(keyword) || looksLikeYoutubeInput(keyword)) {
    return null;
  }

  const normalizedKeyword = normalizeTitle(keyword);
  const searchableKeyword = toSearchableText(normalizedKeyword);

  if (!searchableKeyword) {
    return songItems;
  }

  return songItems.filter((item) => {
    const title = item.normalizedTitle || "";
    const searchableTitle = item.searchableTitle || toSearchableText(item.title || "");
    return title.includes(normalizedKeyword) || searchableTitle.includes(searchableKeyword);
  });
}

function renderSongList(items) {
  songListEl.innerHTML = "";

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "combo-empty";
    empty.textContent = "일치하는 곡이 없습니다.";
    songListEl.appendChild(empty);
    return;
  }

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "combo-item";
    li.setAttribute("role", "option");
    li.dataset.index = String(index);
    li.textContent = item.title;
    if (index === activeIndex) {
      li.classList.add("active");
    }

    // pointerdown+preventDefault는 모바일 스크롤을 막으므로 click으로 선택
    li.addEventListener("click", () => {
      setTypingEnabled(false);
      selectSong(item);
    });

    songListEl.appendChild(li);
  });
}

function refreshSongList({ open = true, showAll = false } = {}) {
  const filtered = showAll ? songItems : filterSongs(input.value);

  // 유튜브 주소 입력 중에는 콤보 목록을 닫고 기존처럼 주소 검색만 사용
  if (filtered === null) {
    closeSongList();
    return;
  }

  renderSongList(filtered);
  if (open) {
    openSongList();
  }
}

function selectSong(item) {
  input.value = item.title;
  closeSongList();
  setTypingEnabled(false);
  input.blur();
  form.requestSubmit();
}

function moveActive(delta) {
  const items = [...songListEl.querySelectorAll(".combo-item")];
  if (!items.length) return;

  activeIndex = (activeIndex + delta + items.length) % items.length;
  items.forEach((el, idx) => {
    el.classList.toggle("active", idx === activeIndex);
  });
  items[activeIndex].scrollIntoView({ block: "nearest" });
}

async function initCombo() {
  const data = await getMappingData();
  songItems = [...(data.items || [])].sort((a, b) => getSongNumber(a) - getSongNumber(b));
  renderSongList(songItems);
}

// 입력칸을 직접 눌렀을 때만 키보드 입력 허용
input.addEventListener("pointerdown", () => {
  setTypingEnabled(true);
});

input.addEventListener("focus", () => {
  // readonly 상태(콤보 목록용)면 포커스를 즉시 해제해 키보드 차단
  if (input.hasAttribute("readonly")) {
    input.blur();
    return;
  }
  refreshSongList({ open: true });
});

input.addEventListener("input", () => {
  activeIndex = -1;
  refreshSongList({ open: true });
});

input.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    if (songListEl.hidden) refreshSongList({ open: true });
    moveActive(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    if (songListEl.hidden) refreshSongList({ open: true });
    moveActive(-1);
  } else if (event.key === "Enter" && !songListEl.hidden && activeIndex >= 0) {
    const active = songListEl.querySelector(".combo-item.active");
    if (active) {
      event.preventDefault();
      const filtered = filterSongs(input.value);
      if (!filtered) return;
      const item = filtered[activeIndex];
      if (item) selectSong(item);
    }
  } else if (event.key === "Escape") {
    closeSongList();
  }
});

comboToggle.addEventListener("pointerdown", (event) => {
  // 버튼 터치 시 입력창으로 포커스가 넘어가 키보드가 뜨는 것 방지
  event.preventDefault();
});

comboToggle.addEventListener("click", () => {
  setTypingEnabled(false);
  input.blur();
  if (songListEl.hidden) {
    activeIndex = -1;
    refreshSongList({ open: true, showAll: true });
  } else {
    closeSongList();
  }
});

document.addEventListener("click", (event) => {
  const combo = document.getElementById("combo");
  if (!combo.contains(event.target)) {
    closeSongList();
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  closeSongList();
  setResultLink(null);

  const keyword = input.value.trim();
  if (!keyword) {
    setMessage("곡 제목 또는 유튜브 주소를 입력해 주세요.", true);
    return;
  }

  submitBtn.disabled = true;
  setMessage("일치하는 파트연습을 찾는 중입니다...");

  try {
    const data = await getMappingData();
    const items = data.items || [];
    const youtubeId = normalizeYoutubeId(keyword);
    let found = null;

    // 1) 유튜브 주소/ID로 검색
    if (youtubeId) {
      found = items.find((item) => item.youtubeId === youtubeId) || null;
    }

    // 2) 없으면 곡 제목으로 검색
    if (!found) {
      const normalizedKeyword = normalizeTitle(keyword);
      const searchableKeyword = toSearchableText(normalizedKeyword);
      const aliasDetailUrl = TITLE_ALIAS_TO_DETAIL[searchableKeyword] || null;

      if (aliasDetailUrl) {
        found = { detailUrl: aliasDetailUrl };
      }

      if (!found) {
        found = findBestTitleMatch(items, normalizedKeyword, searchableKeyword);
      }
    }

    if (!found) {
      setMessage("일치하는 파트연습 상세페이지를 찾지 못했습니다.", true);
      return;
    }

    // 사용자 액션(버튼 클릭) 흐름에서 새 탭으로 바로 열기
    window.open(found.detailUrl, "_blank", "noopener,noreferrer");
    setResultLink(found.detailUrl);
    setMessage("일치 항목을 찾았습니다. 새 창으로 열었고, 아래 링크도 복사할 수 있습니다.");
  } catch (_error) {
    setMessage("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
  } finally {
    submitBtn.disabled = false;
  }
});

copyBtn.addEventListener("click", async () => {
  if (!resultLink.href || resultLink.href === "#") return;

  try {
    await navigator.clipboard.writeText(resultLink.href);
    setMessage("상세페이지 링크를 복사했습니다.");
  } catch (_error) {
    setMessage("링크 복사에 실패했습니다. 링크를 길게 눌러 복사해 주세요.", true);
  }
});

initCombo().catch(() => {
  setMessage("곡 목록을 불러오지 못했습니다.", true);
});

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

  function formatCatalogItemMeta(item) {
    return [item.composer, item.category].filter(Boolean).join(" · ");
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

      const titleEl = document.createElement("span");
      titleEl.className = "combo-item-title";
      titleEl.textContent = item.title;
      li.appendChild(titleEl);

      const meta = formatCatalogItemMeta(item);
      if (meta) {
        const metaEl = document.createElement("span");
        metaEl.className = "combo-item-meta";
        metaEl.textContent = meta;
        li.appendChild(metaEl);
      }

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
