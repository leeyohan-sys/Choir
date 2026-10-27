const fs = require("fs");
const path = require("path");

const BASE_URL = "https://m.joongangart.kr/RejoiceWholeWorld";
const SOURCE_URL = `${BASE_URL}/01/%EC%98%A8%EC%84%B8%EC%83%81%EA%B8%B0%EB%BB%90%ED%95%98%EB%9D%BC.html`;

// 칸타타 전체 7곡 중 연습할 곡만 등록
// playStart: 파트별 연속듣기에서 재생을 시작할 시점(초). Vocal(합창 포함)과 MIDI 영상은 길이가 달라 따로 둠.
// null이면 처음부터 재생 (MIDI는 처음부터 재생)
const SONGS = [
  { number: 1, title: "세상의 빛", playStart: { vocal: 60, midi: null } },
  { number: 2, title: "내 영혼이 주를 찬양하며 (마리아의 찬가)", playStart: { vocal: 40, midi: null } },
  { number: 4, title: "귀한 예물 가지고", playStart: { vocal: 25, midi: null } },
  { number: 6, title: "큰 기쁨의 소식", playStart: { vocal: 20, midi: null } },
  { number: 7, title: "온 세상 기뻐하라", playStart: { vocal: 38, midi: null } },
];

// pop1: 합창, pop2~5: 파트별 Vocal, pop7~10: 파트별 MIDI (pop6 반주는 사용하지 않음)
const PART_PAGES = [
  { key: "full", page: 1, label: "합창", kind: "vocal" },
  { key: "soprano", page: 2, label: "소프라노", kind: "vocal" },
  { key: "alto", page: 3, label: "알토", kind: "vocal" },
  { key: "tenor", page: 4, label: "테너", kind: "vocal" },
  { key: "bass", page: 5, label: "베이스", kind: "vocal" },
  { key: "sopranoMidi", page: 7, label: "소프라노 MIDI", kind: "midi" },
  { key: "altoMidi", page: 8, label: "알토 MIDI", kind: "midi" },
  { key: "tenorMidi", page: 9, label: "테너 MIDI", kind: "midi" },
  { key: "bassMidi", page: 10, label: "베이스 MIDI", kind: "midi" },
];

function toSearchable(text) {
  return String(text || "")
    .replace(/[^0-9a-zA-Z가-힣]/g, "")
    .toLowerCase();
}

function normalizeTitle(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function fetchYoutubeId(songNumber, page) {
  const url = `${BASE_URL}/${String(songNumber).padStart(2, "0")}/pop${page}.html`;
  const html = await (
    await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    })
  ).text();
  const m = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

async function main() {
  const items = [];

  for (const song of SONGS) {
    const parts = {};
    for (const { key, page, label, kind } of PART_PAGES) {
      const youtubeId = await fetchYoutubeId(song.number, page);
      const playStart = song.playStart?.[kind];
      parts[key] = youtubeId
        ? {
            youtubeId,
            videoTitle: `${song.title} / ${label}`,
            startSeconds: playStart ?? 0,
          }
        : null;
    }

    const displayTitle = `${String(song.number).padStart(2, "0")} ${song.title}`;
    items.push({
      number: song.number,
      title: displayTitle,
      songTitle: song.title,
      composer: "",
      category: "크리스마스 칸타타",
      normalizedTitle: normalizeTitle(displayTitle),
      searchableTitle: toSearchable(displayTitle),
      youtubeId: parts.full?.youtubeId || null,
      detailUrl: `${BASE_URL}/${String(song.number).padStart(2, "0")}/pop1.html`,
      sourceUrl: SOURCE_URL,
      parts,
    });
  }

  const payload = {
    title: "Rejoice, 온 세상 기뻐하라! (칸타타 연습곡)",
    source: SOURCE_URL,
    updatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };

  const out = path.join(__dirname, "..", "public", "mapping-cantata-rejoice.json");
  fs.writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`saved ${items.length} songs -> ${out}`);
  for (const item of items) {
    const partCount = Object.values(item.parts).filter((p) => p?.youtubeId).length;
    console.log(`#${item.number} ${item.songTitle}: ${partCount} parts`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
