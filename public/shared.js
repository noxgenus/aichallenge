(function () {
  const rtcConfig = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302"
      }
    ]
  };

  function formatTime(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function calculateRemainingMs(state, clockOffsetMs) {
    if (!state) {
      return 0;
    }

    if (!state.running || !state.endsAt) {
      return Math.max(0, state.remainingMs || state.pausedRemainingMs || 0);
    }

    return Math.max(0, state.endsAt - (Date.now() + clockOffsetMs));
  }

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function getContestantSide() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const side = parts[parts.length - 1];

    return side === "right" ? "right" : "left";
  }

  window.AIChallenge = {
    rtcConfig,
    formatTime,
    calculateRemainingMs,
    setText,
    getContestantSide
  };
})();
