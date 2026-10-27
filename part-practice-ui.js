(function () {
  const PART_TABS = [
    { key: "full", label: "합창" },
    { key: "soprano", label: "소프라노" },
    { key: "alto", label: "알토" },
    { key: "tenor", label: "테너" },
    { key: "bass", label: "베이스" },
  ];

  // MIDI 파트가 있는 곡(칸타타 등)에만 두 번째 줄로 표시
  const MIDI_TABS = [
    { key: "sopranoMidi", label: "소프라노" },
    { key: "altoMidi", label: "알토" },
    { key: "tenorMidi", label: "테너" },
    { key: "bassMidi", label: "베이스" },
  ];

  function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }

  function buildYoutubeAppUrl(youtubeId) {
    const ua = navigator.userAgent || "";
    if (/Android/i.test(ua)) {
      return `intent://www.youtube.com/watch?v=${youtubeId}#Intent;package=com.google.android.youtube;scheme=https;end`;
    }
    if (/iPhone|iPad|iPod/i.test(ua)) {
      return `youtube://www.youtube.com/watch?v=${youtubeId}`;
    }
    return `https://www.youtube.com/watch?v=${youtubeId}`;
  }

  function openYoutubeOnDevice(youtubeId, event) {
    if (!youtubeId || !isMobileDevice()) return;
    event.preventDefault();
    window.location.href = buildYoutubeAppUrl(youtubeId);
  }

  function getDefaultPartKey(item) {
    const preferred = PART_TABS.find(({ key }) => item.parts?.[key]?.youtubeId);
    return preferred ? preferred.key : "full";
  }

  let youtubeApiPromise = null;

  function loadYoutubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!youtubeApiPromise) {
      youtubeApiPromise = new Promise((resolve) => {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          if (typeof previous === "function") previous();
          resolve(window.YT);
        };
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      });
    }
    return youtubeApiPromise;
  }

  // 곡마다 시작 시점이 다른 연속재생 플레이어. queue: [{ videoId, startSeconds }]
  function createQueuePlayer(host) {
    let playerPromise = null;
    let queue = [];
    let index = 0;

    function getPlayer() {
      if (!playerPromise) {
        playerPromise = loadYoutubeApi().then(
          (YT) =>
            new Promise((resolve) => {
              const player = new YT.Player(host, {
                width: "100%",
                height: "100%",
                playerVars: { playsinline: 1, rel: 0 },
                events: {
                  onReady: () => resolve(player),
                  onStateChange: (event) => {
                    // 한 곡이 끝나면 다음 곡을 그 곡의 시작 시점부터, 마지막 곡 뒤에는 처음으로
                    if (event.data === YT.PlayerState.ENDED && queue.length) {
                      index = (index + 1) % queue.length;
                      const { videoId, startSeconds } = queue[index];
                      player.loadVideoById({ videoId, startSeconds });
                    }
                  },
                },
              });
            }),
        );
      }
      return playerPromise;
    }

    return {
      async cue(nextQueue) {
        queue = nextQueue;
        index = 0;
        const player = await getPlayer();
        if (queue !== nextQueue) return;
        const { videoId, startSeconds } = queue[0];
        player.cueVideoById({ videoId, startSeconds });
      },
    };
  }

  // 탭(파트) + 유튜브 플레이어 패널.
  // getSource(key)가 { embedUrl, watchUrl, youtubeId? } 또는 연속재생용 { queue, watchUrl } 또는 null을 돌려줌
  function buildPartPanel({ title, note, getSource, hasMidi, defaultKey, emptyText }) {
    const panel = document.createElement("section");
    panel.className = "part-practice-panel card";

    const titleEl = document.createElement("h3");
    titleEl.className = "part-practice-song";
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    if (note) {
      const noteEl = document.createElement("p");
      noteEl.className = "part-tabs-label";
      noteEl.textContent = note;
      panel.appendChild(noteEl);
    }

    const tabs = document.createElement("div");
    tabs.className = "part-tabs";
    tabs.setAttribute("role", "tablist");

    const player = document.createElement("div");
    player.className = "part-practice-player";

    const frameWrap = document.createElement("div");
    frameWrap.className = "practice-frame";

    const iframe = document.createElement("iframe");
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    frameWrap.appendChild(iframe);

    const empty = document.createElement("p");
    empty.className = "practice-empty";
    empty.hidden = true;
    empty.textContent = emptyText;

    player.appendChild(frameWrap);
    player.appendChild(empty);

    const openLink = document.createElement("a");
    openLink.className = "practice-open";
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "유튜브에서 열기";
    openLink.addEventListener("click", (event) => {
      const youtubeId = openLink.dataset.youtubeId;
      openYoutubeOnDevice(youtubeId, event);
    });

    let queuePlayer = null;

    function selectPart(key) {
      const source = getSource(key);

      panel.querySelectorAll(".part-tab").forEach((btn) => {
        const isActive = btn.dataset.part === key;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      if (source?.queue) {
        if (!queuePlayer) {
          const host = document.createElement("div");
          iframe.replaceWith(host);
          queuePlayer = createQueuePlayer(host);
        }
        queuePlayer.cue(source.queue);
        frameWrap.hidden = false;
        empty.hidden = true;
        openLink.href = source.watchUrl;
        delete openLink.dataset.youtubeId;
        openLink.hidden = false;
      } else if (source) {
        iframe.src = source.embedUrl;
        frameWrap.hidden = false;
        empty.hidden = true;
        openLink.href = source.watchUrl;
        if (source.youtubeId) {
          openLink.dataset.youtubeId = source.youtubeId;
        } else {
          delete openLink.dataset.youtubeId;
        }
        openLink.hidden = false;
      } else {
        iframe.src = "";
        frameWrap.hidden = true;
        empty.hidden = false;
        delete openLink.dataset.youtubeId;
        openLink.hidden = true;
      }
    }

    function appendTabs(container, tabDefs) {
      tabDefs.forEach(({ key, label }) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "part-tab";
        btn.dataset.part = key;
        btn.textContent = label;
        btn.setAttribute("role", "tab");
        btn.addEventListener("click", () => selectPart(key));
        container.appendChild(btn);
      });
    }

    appendTabs(tabs, PART_TABS);
    panel.appendChild(tabs);

    if (hasMidi) {
      const midiLabel = document.createElement("p");
      midiLabel.className = "part-tabs-label";
      midiLabel.textContent = "MIDI로 연습";
      panel.appendChild(midiLabel);

      const midiTabs = document.createElement("div");
      midiTabs.className = "part-tabs part-tabs-midi";
      midiTabs.setAttribute("role", "tablist");
      appendTabs(midiTabs, MIDI_TABS);
      panel.appendChild(midiTabs);
    }

    selectPart(defaultKey);

    panel.appendChild(player);
    panel.appendChild(openLink);
    return panel;
  }

  function renderPartPractice(container, item) {
    if (!container || !item) return;

    container.innerHTML = "";
    container.hidden = false;

    const panel = buildPartPanel({
      title: item.title,
      getSource: (key) => {
        const youtubeId = item.parts?.[key]?.youtubeId;
        if (!youtubeId) return null;
        return {
          youtubeId,
          embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
          watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
        };
      },
      hasMidi: MIDI_TABS.some(({ key }) => item.parts?.[key]?.youtubeId),
      defaultKey: getDefaultPartKey(item),
      emptyText: "이 파트 연습 영상이 아직 없습니다.",
    });

    container.appendChild(panel);
    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // 파트별로 전체 곡을 번호 순서대로 이어서 재생. 각 곡은 parts[key].startSeconds부터 시작
  function renderPartPlaylist(container, items, { title = "파트별 연속듣기" } = {}) {
    if (!container || !items?.length) return;

    container.innerHTML = "";
    container.hidden = false;

    const queueFor = (key) =>
      items
        .map((item) => item.parts?.[key])
        .filter((part) => part?.youtubeId)
        .map((part) => ({ videoId: part.youtubeId, startSeconds: part.startSeconds || 0 }));

    const panel = buildPartPanel({
      title,
      note: "파트를 고르면 모든 곡이 번호 순서대로 이어서 재생되고, 끝나면 처음부터 반복됩니다.",
      getSource: (key) => {
        const queue = queueFor(key);
        if (!queue.length) return null;
        return {
          queue,
          watchUrl: `https://www.youtube.com/watch_videos?video_ids=${queue.map((q) => q.videoId).join(",")}`,
        };
      },
      hasMidi: MIDI_TABS.some(({ key }) => queueFor(key).length),
      defaultKey: "soprano",
      emptyText: "이 파트 연습 영상이 아직 없습니다.",
    });

    container.appendChild(panel);
  }

  window.PartPracticeUI = {
    PART_TABS,
    MIDI_TABS,
    render: renderPartPractice,
    renderPlaylist: renderPartPlaylist,
    getDefaultPartKey,
  };
})();
