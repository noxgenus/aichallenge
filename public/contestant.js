(function () {
  const socket = io();
  const side = AIChallenge.getContestantSide();
  const previewVideo = document.getElementById("preview-video");
  const shareButton = document.getElementById("share-button");
  const stopButton = document.getElementById("stop-button");
  const micCheckbox = document.getElementById("mic-checkbox");

  let stream = null;
  const peers = new Map();

  AIChallenge.setText("contestant-title", side === "left" ? "Contestant A" : "Contestant B");

  socket.emit("role:join", {
    role: "contestant",
    side
  });

  socket.on("connect", () => {
    socket.emit("role:join", {
      role: "contestant",
      side
    });

    if (stream) {
      socket.emit("streamer:ready", { side });
    }
  });

  socket.on("display:request-offer", ({ side: requestedSide, displayId: requestedDisplayId }) => {
    if (requestedSide !== side || !stream) {
      return;
    }

    createOffer(requestedDisplayId);
  });

  socket.on("webrtc:answer", async ({ from, answer }) => {
    const peer = peers.get(from);

    if (!peer || !answer) {
      return;
    }

    try {
      await peer.setRemoteDescription(answer);
      setStatus(sharingLabel());
    } catch (error) {
      console.warn("Could not accept display answer", error);
      setStatus("Connection error");
    }
  });

  socket.on("webrtc:ice", async ({ from, candidate }) => {
    const peer = peers.get(from);

    if (!peer || !candidate) {
      return;
    }

    try {
      await peer.addIceCandidate(candidate);
    } catch (error) {
      console.warn("Could not add contestant ICE candidate", error);
    }
  });

  shareButton.addEventListener("click", startSharing);
  stopButton.addEventListener("click", stopSharing);

  async function startSharing() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setStatus("Screen sharing needs a modern secure browser");
      return;
    }

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: 30
        },
        audio: true
      });

      if (micCheckbox && micCheckbox.checked) {
        await addMicrophoneAudio();
      }

      previewVideo.srcObject = stream;
      setStatus("Preparing stream");

      for (const track of stream.getTracks()) {
        track.addEventListener("ended", stopSharing);
      }

      socket.emit("streamer:ready", { side });
      setStatus(waitingLabel());
    } catch (error) {
      console.warn("Screen sharing was not started", error);
      setStatus("Screen sharing cancelled");
    }
  }

  function stopSharing() {
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }

    stream = null;
    previewVideo.srcObject = null;
    closeAllPeers();
    socket.emit("streamer:stopped", { side });
    setStatus("Not sharing");
  }

  async function createOffer(targetDisplayId) {
    if (!stream || !targetDisplayId) {
      return;
    }

    closePeer(targetDisplayId);

    const peer = new RTCPeerConnection(AIChallenge.rtcConfig);
    peers.set(targetDisplayId, peer);

    for (const track of stream.getTracks()) {
      peer.addTrack(track, stream);
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:ice", {
          to: targetDisplayId,
          side,
          candidate: event.candidate
        });
      }
    };

    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        setStatus(sharingLabel());
      }

      if (peer.connectionState === "failed") {
        setStatus("Reconnecting");
        createOffer(targetDisplayId);
      }
    };

    try {
      const offer = await peer.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });
      await peer.setLocalDescription(offer);

      socket.emit("webrtc:offer", {
        to: targetDisplayId,
        side,
        offer: peer.localDescription
      });

      setStatus(waitingLabel());
    } catch (error) {
      console.error("Could not create stream offer", error);
      setStatus("Connection error");
      closePeer(targetDisplayId);
    }
  }

  function closePeer(targetDisplayId) {
    const peer = peers.get(targetDisplayId);

    if (peer) {
      peer.close();
      peers.delete(targetDisplayId);
    }
  }

  function closeAllPeers() {
    for (const peer of peers.values()) {
      peer.close();
    }

    peers.clear();
  }

  async function addMicrophoneAudio() {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      for (const track of micStream.getAudioTracks()) {
        stream.addTrack(track);
      }
    } catch (error) {
      console.warn("Microphone audio was not added", error);
      setStatus("Microphone skipped");
    }
  }

  function hasAudioTrack() {
    return Boolean(stream && stream.getAudioTracks().some((track) => track.readyState === "live"));
  }

  function waitingLabel() {
    return hasAudioTrack() ? "Waiting for display with audio" : "Waiting for display without audio";
  }

  function sharingLabel() {
    return hasAudioTrack() ? "Sharing live with audio" : "Sharing live without audio";
  }

  function setStatus(value) {
    AIChallenge.setText("share-status", value);
  }
})();
