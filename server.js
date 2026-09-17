const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");

const express = require("express");
const { Server } = require("socket.io");

const app = express();
const publicDir = path.join(__dirname, "public");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const useHttps = Boolean(process.env.SSL_KEY && process.env.SSL_CERT);

const defaultDurationSeconds = 5 * 60;

const challenge = {
  prompt:
    "Build a useful AI assistant for a live event host. You have five minutes. Show the clearest workflow you can.",
  durationSeconds: defaultDurationSeconds,
  running: false,
  startedAt: null,
  endsAt: null,
  pausedRemainingMs: defaultDurationSeconds * 1000
};

const streamers = {
  left: null,
  right: null
};

app.use(express.static(publicDir));

app.get("/", (_request, response) => {
  response.sendFile(path.join(publicDir, "display.html"));
});

app.get("/admin", (_request, response) => {
  response.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/screen/center", (_request, response) => {
  response.sendFile(path.join(publicDir, "screen-center.html"));
});

app.get("/screen/left", (_request, response) => {
  response.sendFile(path.join(publicDir, "screen-left.html"));
});

app.get("/screen/right", (_request, response) => {
  response.sendFile(path.join(publicDir, "screen-right.html"));
});

app.get("/contestant/:side", (request, response) => {
  const side = request.params.side;

  if (side !== "left" && side !== "right") {
    response.status(404).send("Unknown contestant side. Use /contestant/left or /contestant/right.");
    return;
  }

  response.sendFile(path.join(publicDir, "contestant.html"));
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    state: serializeState(),
    streamers
  });
});

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {
  socket.emit("challenge:state", serializeState());

  socket.on("role:join", ({ role, side } = {}) => {
    if (role === "display") {
      socket.data.role = "display";
      socket.join("display");
      requestOffersForDisplay(socket.id);
      return;
    }

    if (role === "admin") {
      socket.data.role = "admin";
      return;
    }

    if (role === "contestant" && isSide(side)) {
      socket.data.role = "contestant";
      socket.data.side = side;
    }
  });

  socket.on("admin:update", (payload = {}) => {
    const prompt = sanitizePrompt(payload.prompt);
    const durationSeconds = clampDuration(payload.durationSeconds);

    if (prompt) {
      challenge.prompt = prompt;
    }

    if (durationSeconds !== null) {
      challenge.durationSeconds = durationSeconds;

      if (!challenge.running) {
        challenge.pausedRemainingMs = durationSeconds * 1000;
        challenge.startedAt = null;
        challenge.endsAt = null;
      }
    }

    broadcastState();
  });

  socket.on("admin:start", () => {
    const remaining = getRemainingMs();

    challenge.running = true;
    challenge.startedAt = Date.now();
    challenge.endsAt = challenge.startedAt + (remaining > 0 ? remaining : challenge.durationSeconds * 1000);

    broadcastState();
  });

  socket.on("admin:pause", () => {
    challenge.pausedRemainingMs = getRemainingMs();
    challenge.running = false;
    challenge.startedAt = null;
    challenge.endsAt = null;

    broadcastState();
  });

  socket.on("admin:reset", () => {
    resetTimer();
    broadcastState();
  });

  socket.on("streamer:ready", ({ side } = {}) => {
    if (!isSide(side)) {
      return;
    }

    socket.data.role = "contestant";
    socket.data.side = side;
    streamers[side] = socket.id;
    io.to("display").emit("streamer:ready", { side });
  });

  socket.on("streamer:stopped", ({ side } = {}) => {
    if (!isSide(side)) {
      side = socket.data.side;
    }

    if (isSide(side) && streamers[side] === socket.id) {
      streamers[side] = null;
      io.to("display").emit("streamer:stopped", { side });
    }
  });

  socket.on("display:request-offer", ({ side } = {}) => {
    if (!isSide(side) || !streamers[side]) {
      return;
    }

    io.to(streamers[side]).emit("display:request-offer", {
      side,
      displayId: socket.id
    });
  });

  socket.on("webrtc:offer", ({ to, side, offer } = {}) => {
    if (!isSide(side) || !offer) {
      return;
    }

    const payload = {
      from: socket.id,
      side,
      offer
    };

    if (to) {
      io.to(to).emit("webrtc:offer", payload);
      return;
    }

    io.to("display").emit("webrtc:offer", payload);
  });

  socket.on("webrtc:answer", ({ to, side, answer } = {}) => {
    if (!to || !isSide(side) || !answer) {
      return;
    }

    io.to(to).emit("webrtc:answer", {
      from: socket.id,
      side,
      answer
    });
  });

  socket.on("webrtc:ice", ({ to, side, candidate } = {}) => {
    if (!isSide(side) || !candidate) {
      return;
    }

    const payload = {
      from: socket.id,
      side,
      candidate
    };

    if (to) {
      io.to(to).emit("webrtc:ice", payload);
      return;
    }

    io.to("display").emit("webrtc:ice", payload);
  });

  socket.on("disconnect", () => {
    const side = socket.data.side;

    if (isSide(side) && streamers[side] === socket.id) {
      streamers[side] = null;
      io.to("display").emit("streamer:stopped", { side });
    }
  });
});

setInterval(() => {
  if (!challenge.running) {
    return;
  }

  if (getRemainingMs() <= 0) {
    challenge.running = false;
    challenge.pausedRemainingMs = 0;
    challenge.startedAt = null;
    challenge.endsAt = null;
  }

  broadcastState();
}, 1000);

server.listen(port, host, () => {
  const protocol = useHttps ? "https" : "http";
  console.log(`AI Challenge Game running at ${protocol}://${host}:${port}`);
  console.log(`Display: ${protocol}://localhost:${port}/`);
  console.log(`Admin:   ${protocol}://localhost:${port}/admin`);
});

function createServer(handler) {
  const sslKey = process.env.SSL_KEY;
  const sslCert = process.env.SSL_CERT;

  if (useHttps) {
    return https.createServer(
      {
        key: fs.readFileSync(sslKey),
        cert: fs.readFileSync(sslCert)
      },
      handler
    );
  }

  return http.createServer(handler);
}

function serializeState() {
  const remainingMs = getRemainingMs();

  return {
    prompt: challenge.prompt,
    durationSeconds: challenge.durationSeconds,
    running: challenge.running,
    startedAt: challenge.startedAt,
    endsAt: challenge.endsAt,
    pausedRemainingMs: challenge.pausedRemainingMs,
    remainingMs,
    serverNow: Date.now(),
    status: getStatus(remainingMs),
    streamers: {
      left: Boolean(streamers.left),
      right: Boolean(streamers.right)
    }
  };
}

function getRemainingMs() {
  if (!challenge.running || !challenge.endsAt) {
    return Math.max(0, challenge.pausedRemainingMs);
  }

  return Math.max(0, challenge.endsAt - Date.now());
}

function getStatus(remainingMs) {
  if (challenge.running) {
    return "running";
  }

  if (remainingMs === 0) {
    return "finished";
  }

  return "ready";
}

function resetTimer() {
  challenge.running = false;
  challenge.startedAt = null;
  challenge.endsAt = null;
  challenge.pausedRemainingMs = challenge.durationSeconds * 1000;
}

function broadcastState() {
  io.emit("challenge:state", serializeState());
}

function requestOffersForDisplay(displayId) {
  for (const side of ["left", "right"]) {
    if (streamers[side]) {
      io.to(streamers[side]).emit("display:request-offer", {
        side,
        displayId
      });
    }
  }
}

function isSide(side) {
  return side === "left" || side === "right";
}

function sanitizePrompt(prompt) {
  if (typeof prompt !== "string") {
    return "";
  }

  return prompt.trim().slice(0, 2000);
}

function clampDuration(durationSeconds) {
  const parsed = Number(durationSeconds);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(60 * 60, Math.max(10, Math.round(parsed)));
}
