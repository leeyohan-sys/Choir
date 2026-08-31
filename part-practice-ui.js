(function () {
  const PART_TABS = [
    { key: "full", label: "합창" },
    { key: "soprano", label: "소프라노" },
    { key: "alto", label: "알토" },
    { key: "tenor", label: "테너" },
    { key: "bass", label: "베이스" },
  ];

  function getDefaultPartKey(item) {
    const preferred = PART_TABS.find(({ key }) => item.parts?.[key]?.youtubeId);
    return preferred ? preferred.key : "full";
  }

  function renderPartPractice(container, item) {
    if (!container || !item) return;

    container.innerHTML = "";
    container.hidden = false;

    const panel = document.createElement("section");
    panel.className = "part-practice-panel card";

    const title = document.createElement("h3");
    title.className = "part-practice-song";
    title.textContent = item.title;
    panel.appendChild(title);

    if (item.composer) {
      const meta = document.createElement("p");
      meta.className = "part-practice-meta";
      const category = item.category ? ` · ${item.category}` : "";
      meta.textContent = `${item.composer}${category}`;
      panel.appendChild(meta);
    } else if (item.category) {
      const meta = document.createElement("p");
      meta.className = "part-practice-meta";
      meta.textContent = item.category;
      panel.appendChild(meta);
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
    empty.textContent = "이 파트 연습 영상이 아직 없습니다.";

    player.appendChild(frameWrap);
    player.appendChild(empty);

    const openLink = document.createElement("a");
    openLink.className = "practice-open";
    openLink.target = "_blank";
    openLink.rel = "noopener noreferrer";
    openLink.textContent = "유튜브에서 열기";

    function selectPart(key) {
      const part = item.parts?.[key];
      const youtubeId = part?.youtubeId || null;

      tabs.querySelectorAll(".part-tab").forEach((btn) => {
        const isActive = btn.dataset.part === key;
        btn.classList.toggle("active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      if (youtubeId) {
        iframe.src = `https://www.youtube.com/embed/${youtubeId}`;
        frameWrap.hidden = false;
        empty.hidden = true;
        openLink.href = `https://www.youtube.com/watch?v=${youtubeId}`;
        openLink.hidden = false;
      } else {
        iframe.src = "";
        frameWrap.hidden = true;
        empty.hidden = false;
        openLink.hidden = true;
      }
    }

    PART_TABS.forEach(({ key, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "part-tab";
      btn.dataset.part = key;
      btn.textContent = label;
      btn.setAttribute("role", "tab");
      btn.addEventListener("click", () => selectPart(key));
      tabs.appendChild(btn);
    });

    selectPart(getDefaultPartKey(item));

    panel.appendChild(tabs);
    panel.appendChild(player);
    panel.appendChild(openLink);
    container.appendChild(panel);
    container.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  window.PartPracticeUI = {
    PART_TABS,
    render: renderPartPractice,
    getDefaultPartKey,
  };
})();
