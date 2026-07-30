const form = document.getElementById("matchForm");
const input = document.getElementById("youtubeUrl");
const messageEl = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");
const resultBox = document.getElementById("resultBox");
const resultLink = document.getElementById("resultLink");
const copyBtn = document.getElementById("copyBtn");
const songListEl = document.getElementById("songList");
const comboToggle = document.getElementById("comboToggle");

// 이전에 설치(PWA) 기능을 등록했다면 흔적을 정리
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

function normalizeYoutubeId(inputValue) {
  if (!inputValue || typeof inputValue !== "string") return null;

  const trimmed = inputValue.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "").slice(0, 11) || null;
    }

    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return v;
      }
      const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/i);
      if (embedMatch) return embedMatch[1];
    }
  } catch (_error) {
    // URL 파싱에 실패해도 정규식 추출을 한 번 더 시도
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
}

function closeSongList() {
  songListEl.hidden = true;
  input.setAttribute("aria-expanded", "false");
  activeIndex = -1;
}

function filterSongs(keyword) {
  const normalizedKeyword = normalizeTitle(keyword);
  const searchableKeyword = toSearchableText(normalizedKeyword);

  if (!searchableKeyword) {
    return songItems;
  }

  // 유튜브 주소/ID 입력 중에는 전체 목록을 보여주지 않음
  if (normalizeYoutubeId(keyword)) {
    return [];
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

    li.addEventListener("mousedown", (event) => {
      // blur 전에 선택되도록 mousedown 사용
      event.preventDefault();
      selectSong(item);
    });

    songListEl.appendChild(li);
  });
}

function refreshSongList({ open = true } = {}) {
  const filtered = filterSongs(input.value);
  renderSongList(filtered);
  if (open) {
    openSongList();
  }
}

function selectSong(item) {
  input.value = item.title;
  closeSongList();
  input.focus();
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

input.addEventListener("focus", () => {
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
      const item = filtered[activeIndex];
      if (item) selectSong(item);
    }
  } else if (event.key === "Escape") {
    closeSongList();
  }
});

comboToggle.addEventListener("click", () => {
  if (songListEl.hidden) {
    activeIndex = -1;
    refreshSongList({ open: true });
    input.focus();
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

    if (youtubeId) {
      found = items.find((item) => item.youtubeId === youtubeId) || null;
    } else {
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
