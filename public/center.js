(function () {
  const socket = io();

  let latestState = null;
  let clockOffsetMs = 0;

  socket.on("connect", () => {
    AIChallenge.setText("connection-status", "Connected");
  });

  socket.on("disconnect", () => {
    AIChallenge.setText("connection-status", "Offline");
  });

  socket.on("challenge:state", (state) => {
    latestState = state;
    clockOffsetMs = state.serverNow - Date.now();
    renderState();
  });

  setInterval(renderState, 200);

  function renderState() {
    if (!latestState) {
      return;
    }

    const remainingMs = AIChallenge.calculateRemainingMs(latestState, clockOffsetMs);
    AIChallenge.setText("timer", AIChallenge.formatTime(remainingMs));
    AIChallenge.setText("prompt", latestState.prompt);
    AIChallenge.setText("round-status", statusLabel(latestState, remainingMs));

    document.body.classList.toggle("is-running", latestState.running);
    document.body.classList.toggle("is-finished", !latestState.running && remainingMs === 0);
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
