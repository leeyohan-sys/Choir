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

  // 곡마다 시작 시점이 다른 연속재생 플레이어. queue: [{ videoId, startSeconds, title }]
  function createQueuePlayer(host, { onChange } = {}) {
    let player = null;
    let queue = [];
    let index = 0;
    let destroyed = false;

    const ready = loadYoutubeApi().then(
      (YT) =>
        new Promise((resolve) => {
          if (destroyed) return;
          player = new YT.Player(host, {
            width: "100%",
            height: "100%",
            playerVars: { playsinline: 1, rel: 0, autoplay: 1 },
            events: {
              onReady: () => resolve(),
              onStateChange: (event) => {
                // 한 곡이 끝나면 다음 곡을 그 곡의 시작 시점부터, 마지막 곡 뒤에는 처음으로
                if (event.data === YT.PlayerState.ENDED) go(index + 1);
              },
            },
          });
        }),
    );

    function go(nextIndex) {
      if (!player || !queue.length) return;
      index = (nextIndex + queue.length) % queue.length;
      const { videoId, startSeconds } = queue[index];
      player.loadVideoById({ videoId, startSeconds });
      if (onChange) onChange(index, queue);
    }

    return {
      async play(nextQueue) {
        queue = nextQueue;
        await ready;
        if (!destroyed) go(0);
      },
      next: () => go(index + 1),
      prev: () => go(index - 1),
      destroy() {
        destroyed = true;
        if (player) player.destroy();
      },
    };
  }

  function createPartTab(key, label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "part-tab";
    btn.dataset.part = key;
    btn.textContent = label;
    btn.addEventListener("click", () => onClick(key));
    return btn;
  }

  // 탭(파트) + 유튜브 플레이어 패널. getSource(key)가 { embedUrl, watchUrl, youtubeId } 또는 null을 돌려줌
  function buildPartPanel({ title, getSource, hasMidi, defaultKey, emptyText }) {
    const panel = document.createElement("section");
    panel.className = "part-practice-panel card";

    const titleEl = document.createElement("h3");
    titleEl.className = "part-practice-song";
    titleEl.textContent = title;
    panel.appendChild(titleEl);

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

    function selectPart(key) {
      const source = getSource(key);

      panel.querySelectorAll(".part-tab").forEach((btn) => {
        const isActive = btn.dataset.part === key;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      if (source) {
        iframe.src = source.embedUrl;
        frameWrap.hidden = false;
        empty.hidden = true;
        openLink.href = source.watchUrl;
        openLink.dataset.youtubeId = source.youtubeId;
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
        const btn = createPartTab(key, label, selectPart);
        btn.setAttribute("role", "tab");
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

  // 화면 위 팝업창에서 연속재생. 닫으면 플레이어를 없애 소리도 멈춤
  function openPlaylistModal(title, queue) {
    const overlay = document.createElement("div");
    overlay.className = "playlist-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", title);

    const box = document.createElement("div");
    box.className = "playlist-modal-box card";

    const head = document.createElement("div");
    head.className = "playlist-modal-head";
    const titleEl = document.createElement("h3");
    titleEl.textContent = title;
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "playlist-modal-close";
    closeButton.setAttribute("aria-label", "닫기");
    closeButton.textContent = "✕";
    head.appendChild(titleEl);
    head.appendChild(closeButton);

    const frameWrap = document.createElement("div");
    frameWrap.className = "practice-frame";
    const host = document.createElement("div");
    frameWrap.appendChild(host);

    const nowPlaying = document.createElement("p");
    nowPlaying.className = "playlist-now";

    const controls = document.createElement("div");
    controls.className = "playlist-controls";
    const prevButton = document.createElement("button");
    prevButton.type = "button";
    prevButton.textContent = "◀ 이전 곡";
    const nextButton = document.createElement("button");
    nextButton.type = "button";
    nextButton.textContent = "다음 곡 ▶";
    controls.appendChild(prevButton);
    controls.appendChild(nextButton);

    box.appendChild(head);
    box.appendChild(frameWrap);
    box.appendChild(nowPlaying);
    box.appendChild(controls);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const player = createQueuePlayer(host, {
      onChange: (index, list) => {
        nowPlaying.textContent = `${list[index].title} (${index + 1}/${list.length})`;
      },
    });
    nowPlaying.textContent = `${queue[0].title} (1/${queue.length})`;
    player.play(queue);

    prevButton.addEventListener("click", () => player.prev());
    nextButton.addEventListener("click", () => player.next());

    function close() {
      player.destroy();
      overlay.remove();
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeydown);
    }

    function onKeydown(event) {
      if (event.key === "Escape") close();
    }

    closeButton.addEventListener("click", close);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener("keydown", onKeydown);
    closeButton.focus();
  }

  // 파트별로 전체 곡을 번호 순서대로 이어서 재생. 각 곡은 parts[key].startSeconds부터 시작
  function renderPartPlaylist(container, items, { title = "파트별 연속듣기" } = {}) {
    if (!container || !items?.length) return;

    container.innerHTML = "";
    container.hidden = false;

    const queueFor = (key) =>
      items
        .filter((item) => item.parts?.[key]?.youtubeId)
        .map((item) => ({
          videoId: item.parts[key].youtubeId,
          startSeconds: item.parts[key].startSeconds || 0,
          title: item.title,
        }));

    const panel = document.createElement("section");
    panel.className = "part-practice-panel card";

    const titleEl = document.createElement("h3");
    titleEl.className = "part-practice-song";
    titleEl.textContent = title;
    panel.appendChild(titleEl);

    const note = document.createElement("p");
    note.className = "part-tabs-label";
    note.textContent = "파트를 누르면 팝업창에서 모든 곡이 순서대로 이어서 재생됩니다.";
    panel.appendChild(note);

    function appendRow(tabDefs, className, titleSuffix) {
      const row = document.createElement("div");
      row.className = className;
      tabDefs.forEach(({ key, label }) => {
        const queue = queueFor(key);
        const btn = createPartTab(key, label, () => openPlaylistModal(`${label}${titleSuffix} 연속듣기`, queue));
        btn.disabled = !queue.length;
        row.appendChild(btn);
      });
      panel.appendChild(row);
    }

    appendRow(PART_TABS, "part-tabs", "");

    if (MIDI_TABS.some(({ key }) => queueFor(key).length)) {
      const midiLabel = document.createElement("p");
      midiLabel.className = "part-tabs-label";
      midiLabel.textContent = "MIDI로 연습";
      panel.appendChild(midiLabel);
      appendRow(MIDI_TABS, "part-tabs part-tabs-midi", " MIDI");
    }

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
