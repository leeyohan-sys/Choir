// 상단 "홈 화면에 앱 추가" 버튼
// 크롬 등 설치 창을 띄울 수 있는 브라우저는 바로 설치 창을, 나머지는 브라우저별 안내를 보여줌
(function () {
  const button = document.getElementById("installAppButton");
  const help = document.getElementById("installHelp");
  if (!button || !help) return;

  const ua = navigator.userAgent || "";
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  // 이미 홈 화면 앱으로 실행 중이면 버튼을 보이지 않음
  if (isStandalone) return;

  const isIos =
    /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isKakao = /KAKAOTALK/i.test(ua);
  const isOtherInApp = /NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|BAND\//i.test(ua);
  const isSamsung = /SamsungBrowser/i.test(ua);

  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    help.hidden = true;
  });

  function addLine(text) {
    const p = document.createElement("p");
    p.textContent = text;
    help.appendChild(p);
  }

  function showHelp() {
    help.innerHTML = "";

    if (isKakao) {
      addLine("카카오톡 안에서는 홈 화면에 추가할 수 없어요.");
      addLine("아래 버튼으로 휴대폰 기본 브라우저에서 연 다음, 다시 '홈 화면에 앱 추가'를 눌러 주세요.");
      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "브라우저로 열기";
      openButton.addEventListener("click", () => {
        window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`;
      });
      help.appendChild(openButton);
    } else if (isOtherInApp) {
      addLine("이 앱 안에서는 홈 화면에 추가할 수 없어요.");
      addLine("메뉴(⋮ 또는 ···)에서 '다른 브라우저로 열기'를 누른 다음, 다시 '홈 화면에 앱 추가'를 눌러 주세요.");
    } else if (isIos) {
      addLine("1. 화면의 공유 버튼(네모에 위쪽 화살표 □↑)을 누르세요.");
      addLine("2. 목록을 내려 '홈 화면에 추가'를 누르세요.");
      addLine("3. 오른쪽 위 '추가'를 누르면 홈 화면에 '파트연습' 앱이 생깁니다.");
    } else if (isSamsung) {
      addLine("1. 아래쪽 메뉴(≡)를 누르세요.");
      addLine("2. '현재 페이지 추가' → '홈 화면'을 누르세요.");
    } else if (isAndroid) {
      addLine("1. 오른쪽 위 메뉴(⋮)를 누르세요.");
      addLine("2. '홈 화면에 추가' 또는 '앱 설치'를 누르세요.");
    } else {
      addLine("주소창 오른쪽의 설치 아이콘을 누르거나, 브라우저 메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 선택하세요.");
    }

    help.hidden = false;
  }

  button.hidden = false;

  button.addEventListener("click", async () => {
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        button.hidden = true;
        help.hidden = true;
      }
      return;
    }

    if (!help.hidden) {
      help.hidden = true;
      return;
    }
    showHelp();
  });
})();
