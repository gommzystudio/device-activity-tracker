<h1 align="center">Device Activity Tracker</h1>
<p align="center">WhatsApp Activity Tracker via RTT Analysis</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License MIT"/>
</p>

> ⚠️ **DISCLAIMER**: Proof-of-concept for educational and security research purposes only. Demonstrates privacy vulnerabilities in WhatsApp and Signal.

## Overview

This project implements the research from the paper **"Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers"** by Gabriel K. Gegenhuber, Maximilian Günther, Markus Maier, Aljosha Judmayer, Florian Holzbauer, Philipp É. Frenzel, and Johanna Ullrich (University of Vienna & SBA Research).

**What it does:** By measuring Round-Trip Time (RTT) of WhatsApp message delivery receipts, this tool can detect:
- When a user is actively using their device (low RTT)
- When the device is in standby/idle mode (higher RTT)
- Potential location changes (mobile data vs. WiFi)
- Activity patterns over time

**Security implications:** This demonstrates a significant privacy vulnerability in messaging apps that can be exploited for surveillance.

## Example

![WhatsApp Activity Tracker Interface](example.png)

The web interface shows real-time RTT measurements, device state detection, and activity patterns.

## Installation

```bash
# Clone repository
git clone https://github.com/gommzystudio/device-activity-tracker.git
cd device-activity-tracker

# Install dependencies
npm install
cd client && npm install && cd ..

# Set up authentication credentials
cp .env.example .env
# Edit .env and set ADMIN_PASSWORD to a secure password
```

**Requirements:** Node.js 20+, npm, WhatsApp account, Docker & Docker Compose (for containerized deployment)

## Configuration

Before running the application, you must configure authentication credentials:

1. Copy the example environment file: `cp .env.example .env`
2. Edit `.env` and set a secure `ADMIN_PASSWORD`
3. Optionally change `ADMIN_USERNAME` (defaults to `admin`)
4. Optionally customize InfluxDB credentials for database security

**Security Note:** Never commit the `.env` file to version control. It's already in `.gitignore`.

### Data Persistence

The application now includes **InfluxDB** for persistent storage of tracking data:

- **RTT measurements** - All round-trip time data saved automatically
- **Device states** - Activity state changes (Online/Standby/Offline) tracked over time
- **Contact events** - Records when contacts are added/removed
- **Automatic retention** - Data persists across server restarts
- **Historical analysis** - Query patterns and trends over days, weeks, or months

The database runs automatically when using Docker Compose. All data is stored in Docker volumes and survives container restarts.

## Usage

### Docker Deployment (Recommended)

```bash
# Make sure .env is configured first!
docker-compose up -d
```

Then open `http://localhost:3000` and log in with your configured credentials.

### Development Mode

```bash
# Terminal 1: Start backend
npm run start:server

# Terminal 2: Start frontend
npm run start:client
```

Open `http://localhost:3000`, log in, scan QR code with WhatsApp, then enter phone number to track (e.g., `491701234567`).

### CLI Interface

```bash
npm start
```

Follow prompts to authenticate and enter target number.

## How It Works

The tracker sends reaction messages to non-existent message IDs, which triggers no notifications at the target. The time between sending the probe message and receiving the CLIENT ACK (Status 3) is measured as RTT. Device state is detected using a dynamic threshold calculated as 90% of the median RTT: values below the threshold indicate active usage, values above indicate standby mode. Measurements are stored in a history and the median is continuously updated to adapt to different network conditions.

## Known Issues

1. **Offline Detection Bug**: The offline detection is currently not working reliably

If you have time and interest, feel free to submit a pull request to fix these issues.

## Project Structure

```
device-activity-tracker/
├── src/
│   ├── tracker.ts      # Core RTT analysis logic
│   ├── server.ts       # Backend API server
│   └── index.ts        # CLI interface
├── client/             # React web interface
└── package.json
```

## How to Protect Yourself

The most effective protection is to enable "My Contacts" in WhatsApp under Settings → Privacy → Advanced. This prevents unknown numbers from sending you messages (including silent reactions). Disabling read receipts helps with regular messages but does not protect against this specific attack. As of December 2025, this vulnerability remains exploitable in WhatsApp and Signal.

## Ethical & Legal Considerations

⚠️ For research and educational purposes only. Never track people without explicit consent - this may violate privacy laws. Authentication data (`auth_info_baileys/`) is stored locally and must never be committed to version control.

## Citation

Based on research by Gegenhuber et al., University of Vienna & SBA Research:

```bibtex
@inproceedings{gegenhuber2024careless,
  title={Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers},
  author={Gegenhuber, Gabriel K. and G{\"u}nther, Maximilian and Maier, Markus and Judmayer, Aljosha and Holzbauer, Florian and Frenzel, Philipp {\'E}. and Ullrich, Johanna},
  year={2024},
  organization={University of Vienna, SBA Research}
}
```

## License

MIT License - See LICENSE file.

Built with [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)

---

**Use responsibly. This tool demonstrates real security vulnerabilities that affect millions of users.**

