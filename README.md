# AI Challenge Game

A Node.js app for a live AI challenge game:

- Display screen: left contestant stream, center timer and prompt, right contestant stream.
- Admin screen: edit the prompt, set the timer duration, start, pause, and reset.
- Contestant screens: each contestant shares their desktop to the display with WebRTC.
- Audio: contestants can share browser-supported desktop/tab/system audio, and can optionally add microphone audio.

## Run

```powershell
npm install
npm start
```

Open:

- Combined display: http://localhost:3000/
- Center screen: http://localhost:3000/screen/center
- Left screen: http://localhost:3000/screen/left
- Right screen: http://localhost:3000/screen/right
- Admin: http://localhost:3000/admin
- Contestant A: http://localhost:3000/contestant/left
- Contestant B: http://localhost:3000/contestant/right

On the display or side-screen pages, click `Enable Audio` once. Browsers block autoplaying audio until a user gesture happens.

## LAN Setup

To let other computers connect, run the server on all network interfaces:

```powershell
$env:HOST="0.0.0.0"
npm start
```

Then open the admin page and copy the generated contestant links, replacing `localhost` with the host machine's LAN IP if needed.

## HTTPS For Desktop Capture

Browsers allow `getDisplayMedia` screen sharing on secure origins. `http://localhost` works for local testing, but contestant machines connecting over the LAN usually need HTTPS.

Desktop audio capture depends on the browser and operating system. Chrome-based browsers usually offer tab audio and, on some platforms, system audio. The contestant page also has an `Include microphone` checkbox for voice audio.

If you have a local certificate and key:

```powershell
$env:SSL_KEY="certs/key.pem"
$env:SSL_CERT="certs/cert.pem"
$env:HOST="0.0.0.0"
npm start
```

The app will automatically serve HTTPS when `SSL_KEY` and `SSL_CERT` are set.

## How It Works

Socket.IO carries challenge state and WebRTC signaling. The desktop video stream itself is sent peer-to-peer from each contestant browser to the display browser.

For same-room setups on one network, browser host candidates are usually enough. The included public STUN server helps when browsers need to discover network paths, but production events may want a TURN server for tougher network environments.
