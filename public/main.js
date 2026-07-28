const form = document.getElementById("matchForm");
const input = document.getElementById("youtubeUrl");
const messageEl = document.getElementById("message");
const submitBtn = document.getElementById("submitBtn");

let mappingData = null;
const YOUTUBE_ID_REGEX =
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const youtubeUrl = input.value.trim();
  if (!youtubeUrl) {
    setMessage("유튜브 주소를 입력해 주세요.", true);
    return;
  }

  submitBtn.disabled = true;
  setMessage("일치하는 파트연습을 찾는 중입니다...");

  try {
    const youtubeId = normalizeYoutubeId(youtubeUrl);
    if (!youtubeId) {
      setMessage("유효한 유튜브 주소(또는 영상 ID)를 입력해 주세요.", true);
      return;
    }

    const data = await getMappingData();
    const found = (data.items || []).find((item) => item.youtubeId === youtubeId);
    if (!found) {
      setMessage("일치하는 파트연습 상세페이지를 찾지 못했습니다.", true);
      return;
    }

    setMessage("일치 항목을 찾았습니다. 상세페이지로 이동합니다.");
    window.location.href = found.detailUrl;
  } catch (_error) {
    setMessage("데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", true);
  } finally {
    submitBtn.disabled = false;
  }
});
