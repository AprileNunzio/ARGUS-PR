<div align="center">

# ARGUS-PR

**Self-hosted, cross-platform Network Video Recorder. No cloud.**

Record your IP cameras on your own hardware. No subscription, no external service, no data leaving your network.

[![Node](https://img.shields.io/badge/node-%3E%3D20.11-3c873a)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-0f6fa8)](#installation)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[Italiano](README.md) · **English**

</div>

---
## What it is

ARGUS-PR turns a PC — even an old one — into a complete network video recorder. A Node.js daemon pulls RTSP streams from your cameras, records them to disk, and makes them searchable through a web interface that opens on any device on the network: computer, tablet or phone.

It is not a desktop application. It runs **headless**: install it on a monitorless machine with Ubuntu Server, leave it in a cabinet, and administer it from a browser.

> **Current state: 1.0.0.** Inaugural production-ready release. Continuous recording with cryptographic integrity chain, detection of people, vehicles and animals, GDPR-compliant face biometrics, ANPR, automations with relays and gates, floor plans with virtual barriers, PTZ control, multilingual support (Italian/English), GPU acceleration for decoding and inference, and standalone installers for Windows and Linux. See the [Roadmap](#roadmap).

---
## Why it exists

Commercial video surveillance systems have three recurring problems: they force you onto the vendor's cloud, they stop receiving updates after a few years, and they charge a subscription for features the hardware already has.

ARGUS-PR exists to live entirely on your own infrastructure, run on modest hardware, and stay inspectable: the code is open and the recordings are ordinary files on a disk you control.

---
## Features

### Available today

| | |
|---|---|
| **Any kind of source** | RTSP IP cameras, MJPEG and HTTP streams, and **USB devices attached to the server** (dshow on Windows, v4l2 on Linux, avfoundation on macOS), with enumeration of devices and their formats |
| **Camera console** | Filterable card list, an add wizard that verifies the source before saving, and a per-channel sheet with General, Recording, Zones and Diagnostics |
| **No browser dialogs** | No popups: every screen has its own address, and destructive confirmations appear inside the page with their consequences spelled out |
| **Automations** | Rules binding a recognition to an action: email, Telegram, signed webhook, MQTT, HTTP command, and **gate opening through the camera's ONVIF relay**, with cooldown, daily cap and time window |
| **Per-camera analytics** | People, vehicles, animals, faces, face recognition and plates are switched on individually per channel, each with a selectable algorithm and an adjustable threshold |
| **Guided autoconfiguration** | A sequence of real tests against the source — reachability, opening, format, preview, recording, analysis — that proposes and applies a working configuration |
| **Automatic discovery** | Finds ONVIF cameras on the local network over WS-Discovery, with no addresses typed by hand |
| **Stream verification** | Probes each camera with ffprobe and reports the real codec, resolution and frame rate |
| **Encrypted credentials** | Camera passwords are protected with AES-256-GCM; the key lives on disk with 0600 permissions and never leaves the machine |
| **Role-based access** | Administrator, operator and viewer, with distinct permissions for live, archive and export |
| **Audit log** | Every access, change and sensitive operation is recorded with user, time and address |
| **Real-time events** | An authenticated WebSocket channel pushes events to the browser without polling |
| **Responsive interface** | The same interface on desktop, tablet and phone, with no app to install |
| **Live video** | RTSP streams played in the browser with sub-second latency, no plugins and no external libraries |
| **Video wall** | A 1/4/9/16/25/36/64 tile grid or adaptive layout, per-tile camera assignment, automatic reconnection and branding on free tiles |
| **Wall control room** | Layout, Main HD or Sub SD quality per channel, HDMI/DP/VGA outputs and clock format, applied **in real time** to HDMI and web through the event bus |
| **AI boxes on the wall** | Outlines of people, vehicles and animals appear over the video with label, confidence and per-class colour, in three styles, reusing tracks already computed without extra inference |
| **AI engine telemetry** | Per channel: frames per second, real inference latency, detections, dropped frames, restarts, active ONNX provider and last error |
| **Continuous and event recording** | MP4 segments with no re-encoding, each with an SHA-256 hash and event marking for selective retention |
| **Time scheduling** | A weekly 7×48 half-hour grid per camera, plus per-day calendar exceptions |
| **Motion detection with zones** | An adaptive background model at 5 fps and 160×90 in pure pixel arithmetic; polygonal zones on canvas, hysteresis, anti-glare guard and cooldown |
| **AI vision and tracking** | Recognition of people, vehicles (cars, vans, motorcycles, bicycles) and animals (dogs, cats, birds) with IoU tracking across frames |
| **Face biometrics and GDPR** | YuNet + SFace models with the standard 0.363 threshold, a biometric centroid and complete GDPR erasure |
| **ANPR plate reading** | Multi-frame OCR with confidence-weighted voting and validation against real Italian and European plate shapes |
| **Access control and gates** | Whitelist, blacklist and monitored rules, wildcard patterns, and absolute priority for the blacklist |
| **Machine detection intake** | An API authenticated with cryptographic keys (only SHA-256 hashes in the database) for external ONVIF streams or inference models |
| **Navigable archive** | A timeline you can zoom down to six seconds: click an instant and playback starts there |
| **Differentiated automatic retention** | By days, quota and free space, with extended retention for segments containing detected events |
| **Standalone installers** | Unattended Linux (`autoinstaller.sh`) and Windows (`.exe` setup with desktop launcher, icon and service) with a Python venv and ONNX models |
| **Automatic updates** | Updates from GitHub with one click. If the new version fails to start, the system rolls itself back: the service does not even have permission to rewrite its own code |
| **Forensic export** | Video leaves without re-encoding, accompanied by a sealed manifest listing every segment with its hash, who exported, when and why. A single flipped bit is detected |
| **Local console** | On the monitor attached to the server the video wall appears full screen with a status bar and IP address: the machine becomes an appliance |
| **Acceleration verified in the field** | Every accelerator ffmpeg declares is **tested** before use: `ffmpeg -hwaccels` lists what was compiled in, not what the machine actually has. Encoders are promoted only after a trial encode, including NVENC, QSV, VAAPI, VideoToolbox and V4L2 mem2mem |
| **Machine capabilities** | A report valid on Linux, Windows and macOS listing processor, usable accelerators, V4L2 devices, chip codec modules, ONNX providers and temperature, with the exact commands to enable what is missing. **It applies nothing by itself** |
| **Analysis that does not starve recording** | Analysis rate and inference threads derived from available cores; the worker drops stale frames and stays anchored to the present instead of accumulating lag |
| **Machine management** | Service restart, server power and selective cache cleanup from the interface, with inline confirmation |
| **Date, time and synchronisation** | 24h or AM/PM format, IANA time zone applied to the operating system as well, real daylight-saving state, and NTP synchronisation on demand |
| **Offline updates** | Installation from USB, an already-mounted SMB/NFS share, FTP or HTTPS through `git bundle` packages, with SHA-256 verification and the same rollback watchdog as OTA |
| **RAM tuning** | SQLite cache up to 2 GB, mmap up to 4 GB, and quick presets from single-core to many-core machines |
| **Diagnostics** | `argus doctor` checks environment, permissions, database and ffmpeg, and prints the full hardware capability report with applicable suggestions |
| **Command-line administration** | `argus update`, `argus watchdog-reset` and `argus vision list/enable/disable`: the whole update cycle and analytics configuration work without a browser |
| **Internationalization (i18n)** | Modular BCP 47 language catalogs (`it`, `en`), on-the-fly language switching during setup, settings and topbar, modular lazy-loading and Zero-Trust path traversal protection |

### In development

Plate reading from the full-resolution stream · Deferred analysis of recorded segments · Readable event descriptions (transit versus dwell)

---
## Requirements

| | Minimum | Recommended |
|---|---|---|
| **CPU** | Dual core x86-64 or ARM64 | Quad core |
| **RAM** | 2 GB | 4 GB or more |
| **Disk** | 8 GB for the system | SSD for the system, HDD or NAS for recordings |
| **Node.js** | 20.11 | 22 LTS |
| **ffmpeg** | — | 6.0 or newer, required for recording and playback |

Supported systems: **Windows 10/11 and Server**, **Linux** (Debian, Ubuntu, Fedora, Alpine, Raspberry Pi OS), **macOS**.

An old PC with a second-generation Core i5 and 4 GB of RAM handles 4–8 channels comfortably, because streams are copied exactly as they arrive from the camera, without re-encoding.

---
## Installation

### Windows — standalone installer (recommended)

Download the official guided installer **`.exe`** from **[GitHub Releases](https://github.com/AprileNunzio/ARGUS-PR/releases/latest)** (`ARGUS-PR-vX.Y.Z-Setup.exe`) and **double-click** it.

Verify the fingerprint before running it, against the `SHA256SUMS.txt` attached to the same release:

```powershell
Get-FileHash ARGUS-PR-vX.Y.Z-Setup.exe -Algorithm SHA256
```

The executable is not signed with a commercial certificate: SmartScreen shows a warning on first run. Compare the fingerprint rather than trusting the file name alone.

When it finishes you will find the **ARGUS-PR** icon on the desktop and in the Start menu. It is a real executable (`ARGUS-PR.exe`), not a shortcut to a web page: on launch it checks the `ArgusPR` service, starts it if stopped, waits for it to answer, and opens the console in a dedicated application window with no address bar. If the service fails to start it shows a message with the log path, instead of leaving the browser on "connection refused".

Alternatively, from **PowerShell** (run as Administrator):

```powershell
irm https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/deploy/windows/install.ps1 | iex
```

The installer configures Node.js, FFmpeg, Python and a virtualenv with ONNX models (SHA-256 verified) on its own, creates the `ArgusPR` Windows service, and adds the firewall rule for port 443. Before declaring success it waits for the port to actually answer. Full installation log: `%ProgramData%\ARGUS-PR\install.log`.

### Windows — portable quick start (no service)

If you only want to try it without creating a system service:
1. Install the prerequisites: `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg`
2. **Double-click** `deploy\windows\quick-start.bat`

### Offline installation, without internet access

Every release attaches a `git bundle` package (`argus-pr-vX.Y.Z.bundle`) containing the entire project history. Copy it to a USB stick or an already-mounted SMB share, then open it from **Updates & Maintenance › Manual installation from USB, SMB or FTP**: the system looks for packages in `/media`, `/mnt` and `/run/media`, verifies their content and SHA-256 fingerprint, and applies the update with the same rollback watchdog as the online procedure.

The same package can be imported from the command line:

```bash
argus update v0.47.2
systemctl restart argus-pr
```

---
### Linux — automatic installation (recommended)

One command. It asks nothing and confirms nothing: it recognises the distribution, installs what is missing, registers the service, and gives you back the address to connect to.

```bash
wget -qO- https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/autoinstaller.sh | sudo bash
```

If you prefer to read the script before running it — a healthy habit, given that it runs as root:

```bash
wget https://raw.githubusercontent.com/AprileNunzio/ARGUS-PR/main/autoinstaller.sh
less autoinstaller.sh
sudo bash autoinstaller.sh
```

**What it does, in order:**

1. Re-elevates itself to root with `sudo` if it is not already.
2. Recognises the package manager: `apt`, `dnf`, `yum`, `pacman`, `zypper` or `apk`. Covers Debian, Ubuntu, Fedora, RHEL, Rocky, Alma, Arch, openSUSE and Alpine.
3. Installs the prerequisites: `curl`, `git`, `xz`, `python3`, the build toolchain (needed by `better-sqlite3` on architectures without a prebuilt binary) and `ffmpeg`.
4. **Node.js**: if it finds one ≥ 20 it uses it; otherwise it downloads the official LTS build from nodejs.org into `/usr/local/lib/argus-node` and links it in `/usr/local/bin`. It recognises x86-64, ARM64, ARMv7, ppc64le and s390x — so it works on a Raspberry Pi too.
5. Clones the repository into `/opt/argus-pr` and checks out **the latest release tag**, not the development branch.
6. Creates the `argus` service user, the `/var/lib/argus-pr` data directory with `750` permissions, and the `/etc/argus-pr/argus.env` configuration file with `640` permissions, readable only by root and the service.
7. Writes the systemd unit with hardened isolation (`ProtectSystem=strict`, `NoNewPrivileges`, no capabilities, writes allowed only to data and `vendor/`), enables it and starts it.
8. Opens the port on `ufw` or `firewalld`, if active.
9. If the machine has a graphics card, it also installs the **local console** (see the dedicated section below).
10. Prints a summary with web address, installed version and paths.

**Options**, all optional — the defaults are right in the vast majority of cases:

| Option | Effect |
|---|---|
| `--port 9443` | An HTTPS port other than 443 |
| `--dir /srv/argus` | Code installation directory |
| `--data /srv/recordings` | Data and recordings directory: use it to point at a dedicated disk |
| `--ref v0.4.0` | Install a specific tag or branch instead of the latest release |
| `--kiosk` | Force the local console even if the script detects no graphics card |
| `--no-kiosk` | Service only, no local interface — typical for a rack server |

```bash
sudo bash autoinstaller.sh --port 9443 --data /srv/recordings --no-kiosk
```

Re-running the script on an already-installed machine is safe: it updates the code to the latest release, rewrites the systemd unit and restarts the service **without touching the database or recordings**.

### Linux — manual installation as a service

```bash
git clone https://github.com/AprileNunzio/ARGUS-PR.git
cd ARGUS-PR
sudo ./deploy/linux/install.sh
```

Installs into `/opt/argus-pr`, creates the service user, prepares `/var/lib/argus-pr` and registers the systemd unit with hardened isolation.

```bash
systemctl status argus-pr
journalctl -u argus-pr -f
journalctl -u argus-pr -n 40            # startup banner
```

<details>
<summary><b>Ubuntu Server from scratch — turning an old PC into an NVR</b></summary>

```bash
sudo apt update && sudo apt upgrade -y

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs ffmpeg git rsync
git clone https://github.com/AprileNunzio/ARGUS-PR.git
cd ARGUS-PR && sudo ./deploy/linux/install.sh
```

For a dedicated recordings disk:

```bash
sudo mkfs.ext4 /dev/sdb1 && sudo mkdir -p /srv/recordings
echo '/dev/sdb1 /srv/recordings ext4 defaults,noatime 0 2' | sudo tee -a /etc/fstab
sudo mount -a && sudo chown -R argus:argus /srv/recordings
sudo systemctl edit argus-pr --setenv=ARGUS_MEDIA_DIR=/srv/recordings
sudo systemctl restart argus-pr
```

</details>

### Docker

```bash
cd deploy/docker
docker compose up -d
```

It uses `network_mode: host` because ONVIF discovery needs multicast on the local network.

### From source, for development

```bash
git clone https://github.com/AprileNunzio/ARGUS-PR.git
cd ARGUS-PR
npm install
npm run doctor
npm start
```

---
## Export with chain of custody

Footage pulled from a surveillance system can end up in front of an insurer or a judge. There the question is not "is the picture clear", it is "how do you prove this is the original". ARGUS-PR answers with a manifest.

From the **Archive** tab, below the timeline: pick the interval, write the reason, press *Export*. You get three files.

| File | Contents |
|---|---|
| `video.mp4` | The segments joined **without re-encoding**: the frames are bit-for-bit those that were recorded |
| `manifest.json` | Who exported, from which address, when, why; every source segment with its hash; the hash of the produced video; the chain |
| `manifest.sig` | The HMAC-SHA256 seal of the manifest |

**How the chain works.** Each segment produces a link computed over the previous link, its own position, its own hash, its timestamp and its size. Modifying a segment, reordering them or substituting one changes the root of the chain, and verification notices.

**The double hash.** Each segment's hash is computed twice: when the segment is recorded, and again when it is exported. If someone touched a file on disk in between, the manifest says so and names **which** segment does not match. The export is not blocked: you export what is there, declaring what does not add up. Hiding the problem would be worse than reporting it.

**The seal.** An HMAC-SHA256 with a key derived from the installation's master key through HKDF. The master key is never used directly and never leaves the machine. A manifest rewritten and resealed elsewhere fails verification.

The **Verify** button rechecks everything: manifest hash, seal, segment chain and the hash of the video on disk.

```
Export intact: video, manifest and seal match. Chain cc759b5999d1c93d…
```

Deliberate limits: six hours per interval, 720 segments, two parallel exports. They exist to stop an export from saturating the machine while it is recording.

---
## Automatic updates from GitHub

A video recorder stays powered on for years. If updating it requires an SSH session, it will never be updated. ARGUS-PR updates itself from the **System** page, and if the new version fails to start it rolls back on its own.

### How to update

Open **System → Updates**, press *Check for updates*, and if a new one exists press *Install*. The service restarts and comes back on its own. There is nothing else to do.

The system checks for new versions every six hours anyway and records it in the log, without installing anything: installation stays your decision.

### Why it is safe

The delicate part of any self-update is that the program rewrites itself. If the process serving the network can modify its own code, whoever compromises it gains persistence. Here it cannot:

- **The service has no write permission on its own code.** `/opt/argus-pr` belongs to root; the service runs as the `argus` user and can only write to data, recordings and `vendor/`.
- **The application can only *request* an update.** It writes `update-state.json` in the data directory and exits with code 75. Nothing else.
- **The update is applied by `ExecStartPre`**, a script systemd runs as root before every start (with the `+` prefix, therefore outside the service sandbox).
- **The requested reference is validated twice**, by the application and again by the privileged script, against `^v[0-9]+\.[0-9]+\.[0-9]+$`. A branch, a commit, a path or a string containing a `;` is rejected and never reaches `git`.
- **The remote is rewritten to the official URL before fetching**, so the code comes from this repository and nowhere else, even if someone had tampered with the git configuration.
- **Downgrades are refused**: you can only move forward.
- **Only an administrator** (`system.manage`) sees and uses this page. A viewer gets `403`.
- **Integrity is guaranteed by git**: every object is addressed by its own SHA, so a file altered in transit does not match the tag's commit and the checkout fails.

### Automatic rollback

This is the piece that makes updating comfortable on a machine nobody is watching.

1. Once the update is applied, the state becomes `pending` with an attempt counter.
2. If the new process stays up for **90 seconds**, it marks itself `healthy`. Done.
3. If it crashes instead, systemd restarts it; at every restart `ExecStartPre` increments the counter.
4. On the **third failed start** the script checks out the previous commit — saved before starting — reinstalls dependencies and marks `rolled-back`.
5. You reopen the interface and find the old version running, with the reason written down.

The state is visible in `System → Updates` and in the logs:

```bash
journalctl -u argus-pr | grep argus-pre-start
cat /var/lib/argus-pr/update-state.json
```

### If it is not a git clone

Automatic updating requires the installation to be a git clone, like the one made by the autoinstaller. If you unpacked a zip, the System page tells you so and the *Install* button does not appear: you update by downloading the new version, or you switch to the automatic installation, which is also how you get automatic rollback.

On Windows, update checking and notification work the same way; automatic application with rollback is specific to systemd and therefore Linux only.

---
## Local console — the machine becomes an appliance

An NVR locked in a cabinet with a monitor in front of it should show the cameras, not a login prompt. The **local console** does exactly that: at power-on, on the monitor attached to the server, the video wall starts full screen with every active camera.

The autoinstaller enables it by itself when it detects a graphics card (`/dev/dri/card0`, `/dev/fb0` or a card in `/sys/class/drm`) and the machine is not a container. You can force it with `--kiosk` or exclude it with `--no-kiosk`.

**How it looks**

- A grid that arranges itself: 1 tile with one camera, 2 side by side with two, then 2×2, 3×3, 4×4 and so on. No configuration: the layout follows the number of active channels.
- Each tile carries the camera name and a status dot — green when live, amber when connecting, red if the stream cannot be played.
- At the bottom, a status bar with the web address to type on other devices, the channel count, how many are recording, the version and the clock.
- If initial setup has not been done yet, the address to connect to appears instead of the tiles. Same if no camera exists yet.
- The grid realigns itself: add a camera from the web and it appears on the monitor within ten seconds, with nothing to restart.

**Low resolution, by choice**

The wall uses the camera's **sub stream** when configured (`subStreamUrl`), that is the low-resolution one. This shows many tiles without saturating CPU and network: the high-definition main stream stays for recording and for full-screen viewing from the web. If a camera has no sub stream the main one is used, downscaled to 720p only if a re-encode is needed anyway.

**How it is built, and why it is safe**

The console has no credentials written anywhere. The `/wall` page asks for a session at `POST /api/console/session`, and the server grants it **only if the request comes from loopback** (`127.0.0.1`, `::1`): that is, only from the browser running on the machine itself. From any other address the same call answers `403`, even from the local network.

The issued session belongs to a `__kiosk__` service user with the **viewer** role: it can see live and archive, but cannot add cameras, change settings or manage users. Whoever has physical access to the monitor sees the images and nothing else. Until initial setup is complete the console issues no session at all.

**Under the hood**

The `argus-pr-kiosk.service` systemd unit starts a minimal X session on `tty1` with the dedicated, unprivileged system user `argus-kiosk`, and launches Chromium in kiosk mode on `https://127.0.0.1/wall`, after installing the internal authority into the browser profile. If Chromium is unavailable it falls back to Firefox; if no browser can be installed the installation continues anyway and says so: the NVR stays reachable over the web.

```bash
systemctl status argus-pr-kiosk          # console state
systemctl restart argus-pr-kiosk         # restart the video wall
systemctl disable --now argus-pr-kiosk   # turn the console off, the NVR keeps running
systemctl enable --now getty@tty1        # bring the terminal back on tty1
```

The wall is also reachable from another PC at `https://<address>/wall`, but from remote it needs a normal login: the loopback shortcut does not apply.

---
## First start

On first start ARGUS-PR enters **guided setup**. Open `https://<server-address>` **from the local network** and follow five steps. The browser will show a certificate warning: this is expected, see [Certificate and HTTPS](#certificate-and-https).

1. **Welcome** — a summary of the detected hardware
2. **Administrator** — you create the account, with password requirements checked as you type
3. **Video engine** — if ffmpeg is missing, the system installs it with SHA-256 verification
4. **Storage** — paths and available space
5. **Summary** — final confirmation

Once finished the procedure cannot be repeated: the setup routes close permanently.

> **Complete setup right after the first start.** Until an administrator exists, anyone who reaches the address can create one. The terminal banner reminds you.

If you lose the password:

```bash
npm run reset-admin
```

---
## Configuration

Almost everything is adjusted from the browser, under **Settings**: updates, remote access, account security, console and retention. Every change is validated, recorded in the audit log and applied hot, without a restart.

Only the HTTPS port, the certificate and the data paths stay in the environment file: a wrong value would make them unreachable from the very page you would have changed them on, so they are touched from the machine.

### You decide when it restarts

When an update is found, the system **does not restart on its own**. In Settings you choose:

| Policy | Behaviour |
|---|---|
| **Always ask for confirmation** (default) | a notice appears with a button to restart when you want |
| **Only in the maintenance window** | it updates on its own in the hours and days you specify, for example 03:00 to 05:00 |
| **Immediately** | applies as soon as it is available |

The window may cross midnight. If the new version does not stabilise, the previous one is restored automatically and the new one is quarantined.

### Environment variables

They remain available for automated installation and for those who prefer configuring from a file. An `argus.env` file in the data folder has the same effect.

| Variable | Default | Description |
|---|---|---|
| `ARGUS_HOST` | `0.0.0.0` | Listen address |
| `ARGUS_PORT` | `443` | HTTPS port |
| `ARGUS_HTTP_PORT` | `80` | Port used only to redirect to HTTPS; `0` disables it |
| `ARGUS_DATA_DIR` | system dependent | Database, keys, configuration |
| `ARGUS_MEDIA_DIR` | `<data>/media` | Video recordings |
| `ARGUS_FFMPEG_PATH` | detected from PATH | Explicit path to ffmpeg |
| `ARGUS_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`, `silent` |
| `ARGUS_TRUST_PROXY` | `false` | Enable **only** behind a reverse proxy of your own |
| `ARGUS_SESSION_TTL_HOURS` | `12` | Session lifetime |
| `ARGUS_AUTO_UPDATE` | `true` | Check for updates at start and every 6 hours |
| `ARGUS_AUTO_UPDATE_MIN_INTERVAL` | `60` | Minimum minutes between two automatic attempts |
| `ARGUS_UPDATE_KEYRING` | `/etc/argus-pr/update-key.asc` | Public key used to verify release signatures |
| `ARGUS_PLATE_FORMAT` | `italian` | Plate shape used to validate and correct ANPR readings |
| `ARGUS_PUBLIC_ACCESS` | `false` | Allows **viewing only** of the cameras from the internet |
| `ARGUS_PUBLIC_HOSTS` | empty | Public DNS names to include in the certificate |
| `ARGUS_TRUSTED_NETWORKS` | empty | Networks treated as local, e.g. the WireGuard subnet |
| `ARGUS_TLS_CERT` | empty | Public certificate, if you own one |
| `ARGUS_TLS_KEY` | empty | Private key of the certificate |
| `ARGUS_TLS_CA` | empty | Intermediate chain of the certificate |

Default data folder: `%PROGRAMDATA%\ARGUS-PR` on Windows, `/var/lib/argus-pr` on Linux with systemd, `~/.local/share/argus-pr` otherwise.

---
## Security

The project takes a Zero-Trust approach: every input is hostile until validated.

### Certificate and HTTPS

**ARGUS-PR never speaks in the clear.** Port 80 exists only to answer `308` towards HTTPS: it serves no content, reads no cookie, touches no database.

On first start the system generates a small internal certificate authority of its own and has it sign the server certificate — ECDSA P-256 keys, no external dependency, no `openssl` to install. The certificate covers `localhost`, the hostname, every local IP address and every name declared in `ARGUS_PUBLIC_HOSTS`, and renews itself 30 days before expiry or whenever an address changes.

The browser will show a warning, because no public authority vouches for that CA. You have two options:

```bash
argus cert     # prints SHA-256 fingerprint, expiry and the path to ca.crt
```

1. **Compare the fingerprint** shown by the browser with the one from the command, then accept the exception.
2. **Install `ca.crt`** on the devices you connect from: the warning disappears and you get the green padlock. The file is in `<data folder>/secrets/pki/ca.crt`.

If you own a real public certificate (Let's Encrypt and similar), point to it with `ARGUS_TLS_CERT` and `ARGUS_TLS_KEY`: it takes precedence and the internal PKI is never even created.

### From the internet you watch, you do not touch

Every request is classified into three network zones — `local`, `lan`, `wan` — and every feature declares where it is reachable from. The default for every route is **private**: unreachable from the internet until someone explicitly decides otherwise.

With `ARGUS_PUBLIC_ACCESS=true`, only login, session, camera list and live video pass from the internet. Configuration, archive, exports, users, updates and every other administrative function stay out. Three further independent barriers sit above this:

- **No administrative account can log in from the internet.** The refusal uses the same message as a wrong password, so as not to reveal which users exist.
- **Sessions are bound to the zone they were born in**: a cookie obtained at the office does not work from outside.
- **The camera list is reduced**: from the internet only id, name and state come out. RTSP URLs, addresses, ports, make and model stay in.

Whoever connects from outside also has a budget of 240 requests per minute and per-route limits four times tighter.

> Exposing the NVR on the internet remains a choice that increases risk. If you can, prefer a VPN (WireGuard, Tailscale) and put its subnet in `ARGUS_TRUSTED_NETWORKS`. If you must expose it, keep `ARGUS_PUBLIC_ACCESS` on only as long as it is genuinely needed.

### ARGUS-SHIELD, the perimeter firewall

Installed alongside the NVR is [ARGUS-SHIELD](shield/README.md), a **standalone** application that governs the machine's firewall and answers attacks in real time: an nftables ruleset with a default-deny policy, scan defence, connection limits, and automatic blocking of addresses that accumulate suspicious behaviour — with an exponentially decaying score and increasing duration for repeat offenders.

Communication between the two programs is **one-way**: the NVR writes events, the shield reads them. There is no way for the NVR to command the firewall, so a compromised NVR does not drag the perimeter defence down with it.

```bash
argus-shield status     # backend, ruleset, blocked addresses
argus-shield unban <ip> # manual unblock
```

The local network is never blocked: locking yourself out of a system that is recording would be worse than the attack.

### The rest of the defences

- **User passwords** with `scrypt` and an individual salt; constant-time comparison.
- **Camera passwords** encrypted with AES-256-GCM using a key generated on first run, stored with `0600` permissions and never committed to the repository.
- **Sessions** with 256-bit tokens; only the SHA-256 hash reaches the database. Cookies are `HttpOnly`, `SameSite=Strict`, `Secure` under HTTPS.
- **A restrictive CSP** with no `unsafe-inline`, plus `X-Frame-Options: DENY` and `nosniff`.
- **Rate limiting** on login and password change, plus **progressive per-account lockout**: from the third failed attempt the wait doubles on every error up to half an hour, and at the tenth it becomes an hour. The count is per username, so a botnet spread over many addresses does not bypass it.
- **Origin verification** on every request that modifies data.
- **No shell** when invoking ffmpeg: arguments passed as an array, `shell: false`. RTSP URLs are user input and are validated against an allowlist of schemes.
- **Confined paths**: every path derived from input is verified as a descendant of the allowed root.
- **An immutable audit log** for accesses and sensitive operations.

To report a vulnerability, open an issue without exploitable details and ask for a private contact.

---
## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Browser — desktop, tablet, phone                    │
│  Native ESM, no build step                           │
└───────────────┬──────────────────────┬───────────────┘
                │ HTTPS/HTTP           │ WebSocket
┌───────────────▼──────────────────────▼───────────────┐
│  ARGUS-PR process (Node.js)                          │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────────┐  │
│  │ Router  │ │ Security │ │ Events │ │ File Range │  │
│  └─────────┘ └──────────┘ └────────┘ └────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │ Features: auth · cameras · discovery           │  │
│  └────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ SQLite (WAL) │  │ AES Vault   │  │ ffmpeg      │  │
│  └──────────────┘  └─────────────┘  └──────┬──────┘  │
└───────────────────────────────────────────┼─────────┘
                                            │ RTSP
                                    ┌───────▼────────┐
                                    │  IP cameras    │
                                    └────────────────┘
```

The code follows Clean Architecture with colocation by feature: each module lives in a folder with its own logic, its own routes and its own view. The dependency rule always points inward — `features` depends on `security`, `storage` and `platform`, which depend on `kernel`, which depends on nothing.

---
## Roadmap

| Phase | Contents | State |
|---|---|---|
| **F0** | Kernel, security, HTTP, interface, cameras, ONVIF discovery | ✅ done |
| **F1** | ffmpeg pipeline, live video, fMP4 transport over WebSocket | ✅ done |
| **F2** | Recording, segmentation, archive index, retention | ✅ done |
| **F3** | Playback, timeline and export with chain of custody | ✅ done |
| **FA** | Linux autoinstaller and full-screen local console | ✅ done |
| **FU** | GitHub updates with automatic rollback | ✅ done |
| **F4** | Time scheduling, motion detection with zones, detection intake | ✅ done |
| **F5** | People, face biometrics, ANPR plates, access control, standalone installers | ✅ done |
| **F7.1** | Cameras under System, unified input, USB and MJPEG sources, tabbed console | ✅ done |
| **F7.2** | Per-camera, per-capability analytics and a registry of selectable engines | ✅ done |
| **F7.3** | Event→action rules: notifications, email, webhook, MQTT, relays and gates | ✅ done |
| **F6** | Floor plans, virtual barriers, PTZ and patrols, Telegram/MQTT notifications, physical relays | ✅ done |
| **F8** | Field trial: YOLOX decoding fix, panoramic cameras, recording with PCM audio, ANPR on rotated plates | ✅ done |
| **F9** | Plate reading from the full-resolution stream and deferred analysis of recorded segments | 🔜 in progress |

The AI vision engine runs through a dedicated Python worker fed by ffmpeg rawvideo streams over standard pipes. It runs YOLOX for object detection, YuNet for faces, SFace for biometrics and weighted OCR for ANPR plates, without weighing down the Node.js process.

Ultra-wide sources (32:9 panoramics and similar) receive a wider analysis frame and are analysed in overlapping square windows: a 32:9 frame inside the network's square input would leave two thirds of the canvas empty. The source resolution is detected automatically with ffprobe. Every geometric threshold is expressed **as a fraction of the frame, never in absolute pixels**, because there is no way to know which camera the end user will install.

---
## Troubleshooting

<details>
<summary><b>Windows: "Connection refused" on localhost</b></summary>

It means the daemon is not listening: the installation stopped before creating the service. Check in this order:

```powershell
Get-Service ArgusPR
Get-Content "$env:ProgramData\ARGUS-PR\install.log" -Tail 40
Get-Content "$env:ProgramData\ARGUS-PR\service.log" -Tail 40
```

If the service does not exist, re-run the configuration without reinstalling everything:

```powershell
powershell -ExecutionPolicy Bypass -File "$env:ProgramFiles\ARGUS-PR\deploy\windows\install.ps1"
```

The historical cause was a copy of the files onto themselves that interrupted the script before `npm install`: if `node_modules` is missing from `%ProgramFiles%\ARGUS-PR`, that is your case and the command above is enough.
</details>

<details>
<summary><b>ffmpeg not found</b></summary>

Windows: `winget install Gyan.FFmpeg`, then reopen the terminal.
Debian/Ubuntu: `sudo apt install ffmpeg`
Fedora: `sudo dnf install ffmpeg`
macOS: `brew install ffmpeg`

If it is installed in a non-standard location: `ARGUS_FFMPEG_PATH=/path/to/ffmpeg`
</details>

<details>
<summary><b>better-sqlite3 does not build</b></summary>

Since npm 11, install scripts are blocked by default. The `allowScripts` field in `package.json` authorises this package. If you need to force it:

```bash
npm rebuild better-sqlite3
```

On Linux without prebuilt binaries you need the build tools: `sudo apt install build-essential python3`
</details>

<details>
<summary><b>ONVIF discovery finds nothing</b></summary>

It uses UDP multicast on port 3702: it must be able to leave the machine. Check that the server and the cameras are on the same subnet, that the firewall allows UDP 3702, and that `network_mode: host` is active in Docker. Some cameras ship with ONVIF disabled.
</details>

<details>
<summary><b>My camera burns a timestamp into the video and ANPR invents plates</b></summary>

A caption burned in by the camera — date, time, street name — is **structurally indistinguishable from a plate**: `09:17:21` without the colons is six digits, aligned, compact and of equal height. It passes every geometric filter.

The defences in place are voting on agreeing readings and validation against real plate shapes, which reject the vast majority of these. The clean fix is to **turn the overlay off on the camera**. It also removes the phantom faces that captions on skin-toned backgrounds can produce.
</details>

<details>
<summary><b>I lost the password</b></summary>

```bash
npm run reset-admin
```
It requires local access to the machine, which is the correct precondition for a recovery.
</details>

---
## Contributing

Pull requests are welcome. The project architectural constraints are strict and enforced: Clean Architecture, no comments in the code, no file over 500 lines, no dependency added without a demonstrated need, and the CSP never weakened.

Two rules learned the hard way in the field, worth knowing before touching vision or recording code:

- **No geometric threshold in absolute pixels.** There is no way to know which camera the end user will install: a pixel constant changes meaning as resolution changes. Express it as a fraction of the frame.
- **A vision or recording feature is only alive when proven on a real frame.** Object detection produced nothing for dozens of versions, and recording never wrote a file with PCM audio — both with a green test suite, because the tests covered the shape of the data and not whether the data arrived. A synthetic source proves the protocol, not the recognition.

---
## License

MIT — see [LICENSE](LICENSE).

<div align="center">
<sub>Created by Nunzio Aprile · NunzioTech</sub>
</div>
