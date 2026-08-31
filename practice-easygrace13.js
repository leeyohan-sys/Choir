const titleEl = document.getElementById("practiceTitle");
const metaEl = document.getElementById("practiceMeta");
const messageEl = document.getElementById("practiceMessage");
const partsEl = document.getElementById("practiceParts");
const sourceLink = document.getElementById("sourceLink");
const playlistLink = document.getElementById("playlistLink");

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}

function getSongNumberFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const n = Number(params.get("n"));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const songNumber = getSongNumberFromQuery();
  if (!songNumber) {
    setMessage("곡 번호가 없습니다. 목록에서 다시 선택해 주세요.", true);
    return;
  }

  setMessage("파트연습 정보를 불러오는 중입니다...");

  try {
    const response = await fetch("./mapping-easygrace13.json", { cache: "no-store" });
    if (!response.ok) throw new Error("mapping load failed");
    const data = await response.json();
    const item = (data.items || []).find((song) => Number(song.number) === songNumber);

    if (!item) {
      setMessage("해당 곡을 찾지 못했습니다.", true);
      return;
    }

    document.title = `${item.title} · 파트연습`;
    titleEl.textContent = item.title;
    metaEl.textContent = item.composer
      ? `${item.composer} · 쉽고 은혜로운 찬양곡집 13집`
      : "쉽고 은혜로운 찬양곡집 13집";

    sourceLink.href = item.sourceUrl || data.source || "#";
    playlistLink.href = item.playlistUrl || data.playlist || "#";

    const available = Object.values(item.parts || {}).filter((part) => part?.youtubeId).length;
    if (available === 0) {
      partsEl.hidden = true;
      setMessage(
        "이 곡의 유튜브 파트연습 영상이 아직 플레이리스트에 없습니다. 아래 원본 링크를 이용해 주세요.",
        true,
      );
      return;
    }

    window.PartPracticeUI.render(partsEl, item);
    setMessage("파트를 선택해 연습 영상을 재생할 수 있습니다.");
  } catch (_error) {
    setMessage("파트연습 데이터를 불러오지 못했습니다.", true);
  }
}

main();
