(function () {
  const socket = io();
  const promptInput = document.getElementById("prompt-input");
  const durationInput = document.getElementById("duration-input");
  const form = document.getElementById("challenge-form");

  let latestState = null;
  let clockOffsetMs = 0;

  socket.emit("role:join", { role: "admin" });

  socket.on("connect", () => {
    socket.emit("role:join", { role: "admin" });
  });

  socket.on("challenge:state", (state) => {
    const firstState = !latestState;
    latestState = state;
    clockOffsetMs = state.serverNow - Date.now();

    if (firstState || document.activeElement !== promptInput) {
      promptInput.value = state.prompt;
    }

    if (firstState || document.activeElement !== durationInput) {
      durationInput.value = state.durationSeconds;
    }

    renderState();
    renderLinks();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    socket.emit("admin:update", {
      prompt: promptInput.value,
      durationSeconds: Number(durationInput.value)
    });
  });

  document.getElementById("start-button").addEventListener("click", () => {
    socket.emit("admin:start");
  });

  document.getElementById("pause-button").addEventListener("click", () => {
    socket.emit("admin:pause");
  });

  document.getElementById("reset-button").addEventListener("click", () => {
    socket.emit("admin:reset");
  });

  setInterval(renderState, 200);

  function renderState() {
    if (!latestState) {
      return;
    }

    const remainingMs = AIChallenge.calculateRemainingMs(latestState, clockOffsetMs);
    AIChallenge.setText("admin-timer", AIChallenge.formatTime(remainingMs));
    AIChallenge.setText("admin-status", statusLabel(latestState, remainingMs));
    AIChallenge.setText("left-stream", latestState.streamers.left ? "Ready" : "Waiting");
    AIChallenge.setText("right-stream", latestState.streamers.right ? "Ready" : "Waiting");
  }

  function renderLinks() {
    const origin = window.location.origin;
    setLink("display-link", `${origin}/`);
    setLink("center-screen-link", `${origin}/screen/center`);
    setLink("left-screen-link", `${origin}/screen/left`);
    setLink("right-screen-link", `${origin}/screen/right`);
    setLink("left-link", `${origin}/contestant/left`);
    setLink("right-link", `${origin}/contestant/right`);
  }

  function setLink(id, href) {
    const link = document.getElementById(id);

    if (!link) {
      return;
    }

    link.href = href;
    link.textContent = href;
  }

  function statusLabel(state, remainingMs) {
    if (state.running) {
      return "Running";
    }

    if (remainingMs === 0) {
      return "Finished";
    }

    return "Ready";
  }
})();
