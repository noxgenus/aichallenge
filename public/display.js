(function () {
  const socket = io();
  const peers = {
    left: null,
    right: null
  };
  const activeSides = getActiveSides();
  const audioToggle = document.getElementById("audio-toggle");

  let latestState = null;
  let clockOffsetMs = 0;
  let audioEnabled = false;

  if (audioToggle) {
    audioToggle.addEventListener("click", () => {
      audioEnabled = !audioEnabled;
      applyAudioPreference();
    });

    applyAudioPreference();
  }

  socket.emit("role:join", { role: "display" });

  socket.on("connect", () => {
    AIChallenge.setText("connection-status", "Connected");
    socket.emit("role:join", { role: "display" });
    requestOffers();
  });

  socket.on("disconnect", () => {
    AIChallenge.setText("connection-status", "Offline");
  });

  socket.on("challenge:state", (state) => {
    latestState = state;
    clockOffsetMs = state.serverNow - Date.now();
    renderState();
    updateStreamBadges(state.streamers || {});
  });

  socket.on("streamer:ready", ({ side }) => {
    if (!activeSides.includes(side)) {
      return;
    }

    setStageStatus(side, "Connecting");
    socket.emit("display:request-offer", { side });
  });

  socket.on("streamer:stopped", ({ side }) => {
    if (!activeSides.includes(side)) {
      return;
    }

    closePeer(side);
    setStageStatus(side, "Waiting");
  });

  socket.on("webrtc:offer", async ({ from, side, offer }) => {
    if (!from || !isSide(side) || !activeSides.includes(side) || !offer) {
      return;
    }

    await acceptOffer(side, from, offer);
  });

  socket.on("webrtc:ice", async ({ side, candidate }) => {
    if (!activeSides.includes(side)) {
      return;
    }

    const peer = peers[side];

    if (!peer || !candidate) {
      return;
    }

    try {
      await peer.connection.addIceCandidate(candidate);
    } catch (error) {
      console.warn("Could not add display ICE candidate", error);
    }
  });

  setInterval(renderState, 200);
  setTimeout(requestOffers, 500);

  function requestOffers() {
    for (const side of activeSides) {
      socket.emit("display:request-offer", { side });
    }
  }

  async function acceptOffer(side, streamerId, offer) {
    closePeer(side);

    const connection = new RTCPeerConnection(AIChallenge.rtcConfig);
    peers[side] = {
      connection,
      streamerId
    };

    connection.ontrack = (event) => {
      const video = document.getElementById(`${side}-video`);

      if (video && event.streams[0]) {
        video.srcObject = event.streams[0];
        applyAudioPreference(video);
      }

      setStageStatus(side, "Live");
    };

    connection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice", {
          to: streamerId,
          side,
          candidate: event.candidate
        });
      }
    };

    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "failed") {
        setStageStatus(side, "Reconnecting");
        socket.emit("display:request-offer", { side });
      }

      if (connection.connectionState === "disconnected" || connection.connectionState === "closed") {
        setStageStatus(side, "Waiting");
      }
    };

    try {
      await connection.setRemoteDescription(offer);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);

      socket.emit("webrtc:answer", {
        to: streamerId,
        side,
        answer: connection.localDescription
      });
    } catch (error) {
      console.error("Could not accept stream offer", error);
      setStageStatus(side, "Error");
      closePeer(side);
    }
  }

  function closePeer(side) {
    const peer = peers[side];

    if (peer) {
      peer.connection.close();
      peers[side] = null;
    }

    const video = document.getElementById(`${side}-video`);

    if (video) {
      video.srcObject = null;
      applyAudioPreference(video);
    }
  }

  function applyAudioPreference(video) {
    const videos = video
      ? [video]
      : activeSides
          .map((side) => document.getElementById(`${side}-video`))
          .filter(Boolean);

    for (const element of videos) {
      element.muted = !audioEnabled;
      element.volume = audioEnabled ? 1 : 0;

      if (audioEnabled && element.srcObject) {
        element.play().catch(() => {
          audioEnabled = false;
          applyAudioPreference();
        });
      }
    }

    if (audioToggle) {
      audioToggle.textContent = audioEnabled ? "Disable Audio" : "Enable Audio";
      audioToggle.setAttribute("aria-pressed", String(audioEnabled));
    }
  }

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

  function updateStreamBadges(streamers) {
    for (const side of activeSides) {
      if (!peers[side]) {
        setStageStatus(side, streamers[side] ? "Ready" : "Waiting");
      }
    }
  }

  function setStageStatus(side, status) {
    AIChallenge.setText(`${side}-status`, status);
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

  function isSide(side) {
    return side === "left" || side === "right";
  }

  function getActiveSides() {
    const displaySide = document.body.dataset.displaySide;

    if (isSide(displaySide)) {
      return [displaySide];
    }

    return ["left", "right"];
  }
})();
