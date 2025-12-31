<h1 align="center">Device Activity Tracker</h1>
<p align="center">WhatsApp & Signal Activity Tracker via RTT Analysis</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat&logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript"/>
  <img src="https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License MIT"/>
</p>

> ⚠️ **DISCLAIMER**: Proof-of-concept for educational and security research purposes only. Demonstrates privacy vulnerabilities in WhatsApp and Signal.

Table of Contents

Overview
How It Works
Installation
Usage
Project Structure
Privacy Protection
Common Issues
Ethical & Legal Considerations
Citation
License


Overview
This tool implements the research findings from "Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers" by researchers at the University of Vienna and SBA Research.
What It Does
By analyzing the Round-Trip Time (RTT) of message delivery receipts, this tracker can detect:

✅ Active usage - When a user is actively using their device (low RTT)
💤 Standby mode - When the device is idle or locked (higher RTT)
📍 Network changes - Potential location changes (mobile data vs. WiFi)
📊 Usage patterns - Activity trends over time

Security Implications
This demonstrates a significant privacy vulnerability that allows passive surveillance through legitimate messaging protocols. No user interaction or malware installation is required—attackers only need the target's phone number.
Example Interface
Show Image
The web interface provides real-time RTT measurements, device state visualization, and historical activity patterns.

How It Works
Core Mechanism
The tracker operates by sending probe messages and measuring the time it takes to receive delivery acknowledgments:

Probe Transmission - A specially crafted message is sent to the target
RTT Measurement - Time between sending and receiving CLIENT_ACK (Status 3) is recorded
State Detection - RTT values are analyzed against a dynamic threshold
Pattern Recognition - Historical data reveals usage patterns

Probe Methods
Two non-intrusive probe techniques are supported:
MethodDescriptionUser ImpactDelete (Default)Sends a deletion request for a non-existent messageNo notification, completely silentReactionSends a reaction emoji to a non-existent messageNo notification, completely silent
Detection Algorithm
Dynamic Threshold Calculation:

Threshold = 90% of median RTT from recent measurements
RTT < Threshold → Active (device unlocked, app in foreground)
RTT > Threshold → Standby (device locked or app in background)
No response → Offline (device powered off or no network)

Adaptive Learning:
The system continuously updates its baseline by maintaining a rolling window of measurements, allowing it to adapt to different network conditions and device characteristics.

Installation
Prerequisites

Node.js 20 or higher
npm package manager
WhatsApp or Signal account for authentication

Quick Setup
bash# Clone the repository
git clone https://github.com/gommzystudio/device-activity-tracker.git
cd device-activity-tracker

# Install dependencies
npm install
cd client && npm install && cd ..

Usage
Option 1: Docker (Recommended)
The simplest way to run the application:
bash# Copy environment configuration
cp .env.example .env

# (Optional) Customize ports in .env
# BACKEND_PORT=3001
# CLIENT_PORT=3000

# Build and start containers
docker compose up --build
Access the application:

Frontend: http://localhost:3000 (or your configured CLIENT_PORT)
Backend API: http://localhost:3001 (or your configured BACKEND_PORT)

Stop the containers:
bashdocker compose down

Option 2: Manual Setup
Web Interface (Both WhatsApp & Signal)
bash# Terminal 1: Start backend server
npm run start:server

# Terminal 2: Start frontend client
npm run start:client
Getting Started:

Open http://localhost:3000 in your browser
Choose platform (WhatsApp or Signal)
Scan the QR code with your mobile app
Enter target phone number (format: 491701234567)
Select probe method and start tracking


CLI Interface (WhatsApp Only)
bashnpm start
Follow the interactive prompts to:

Authenticate with WhatsApp (scan QR code)
Enter target phone number
View real-time tracking data

Example CLI Output:
╔════════════════════════════════════════════════════════════════╗
║ 🟢 Device Status Update - 09:41:51                            ║
╠════════════════════════════════════════════════════════════════╣
║ JID: ***********@lid                                          ║
║ Status: Active                                                ║
║ RTT: 245ms                                                    ║
║ Avg (last 3): 267ms                                          ║
║ Median: 258ms                                                ║
║ Threshold: 232ms                                             ║
╚════════════════════════════════════════════════════════════════╝
Status Indicators:

🟢 Online/Active - Device is actively being used (RTT below threshold)
🟡 Standby - Device is idle/locked (RTT above threshold)
🔴 Offline - Device is unreachable (no CLIENT_ACK received)


Switching Probe Methods
Web Interface:
Use the dropdown menu in the control panel to switch between "Delete" and "Reaction" probe methods in real-time.
CLI Mode:
The "Delete" method is used by default. Probe method selection will be available in a future update.

Project Structure
device-activity-tracker/
├── src/
│   ├── tracker.ts           # WhatsApp RTT tracking logic
│   ├── signal-tracker.ts    # Signal RTT tracking logic
│   ├── server.ts            # Express backend API (both platforms)
│   └── index.ts             # CLI interface entry point
├── client/                  # React frontend application
│   ├── src/
│   │   ├── components/      # React UI components
│   │   └── App.tsx          # Main application component
│   └── package.json
├── docker-compose.yml       # Docker container configuration
├── Dockerfile               # Docker image definition
├── .env.example             # Environment variables template
└── package.json             # Project dependencies

Privacy Protection
How to Defend Against This Attack
As of December 2025, this vulnerability remains unpatched in both WhatsApp and Signal. Here are recommended mitigation steps:
For WhatsApp Users
Primary Defense:

Open WhatsApp Settings → Privacy → Advanced
Enable "Block unknown account messages"

Limitations:

WhatsApp does not disclose the exact "high volume" threshold
Attackers can still send a significant number of probes before rate-limiting activates
Does not fully prevent the attack, only reduces its effectiveness

What Doesn't Work:

❌ Disabling read receipts (doesn't affect delivery receipts)
❌ Blocking the attacker (new numbers can be used)
❌ Hiding last seen status (irrelevant to this attack)

For Signal Users
Signal currently has no built-in mitigation for this attack vector.
General Recommendations

Be aware of who has your phone number
Limit sharing your number publicly
Consider using separate numbers for sensitive communications
Monitor your device for unusual network activity


Common Issues
Authentication Problems
Issue: Cannot connect to WhatsApp/Signal or QR code won't scan
Solution:
bash# Delete authentication cache and restart
rm -rf auth_info_baileys/
npm run start:server  # Or restart Docker containers
Connection Errors
Issue: "Connection failed" or timeout errors
Possible causes:

Poor internet connection
Firewall blocking WebSocket connections
WhatsApp/Signal rate limiting

Solution:

Check your internet connection
Disable VPN temporarily
Wait 5-10 minutes and try again

Docker Issues
Issue: Containers fail to start
Solution:
bash# Clean rebuild
docker compose down -v
docker compose up --build

Ethical & Legal Considerations
⚠️ Important Legal Notice
This tool is provided strictly for educational and security research purposes. Unauthorized surveillance is illegal in most jurisdictions and may violate:

Privacy laws (GDPR, CCPA, etc.)
Computer fraud and abuse statutes
Wiretapping and electronic surveillance laws
Terms of service for messaging platforms

Ethical Guidelines
✅ Acceptable Use:

Security research with proper authorization
Academic studies with ethical review board approval
Penetration testing with explicit written consent
Educational demonstrations in controlled environments

❌ Prohibited Use:

Tracking individuals without their knowledge or consent
Stalking, harassment, or intimidation
Corporate espionage or competitive intelligence gathering
Any form of unauthorized surveillance

Data Protection
Authentication Data:

Session tokens are stored in auth_info_baileys/ directory
Never commit this directory to version control
Add to .gitignore immediately
Delete authentication data when finished testing

Responsible Disclosure
If you discover vulnerabilities or security issues:

Report to the platform vendor through their responsible disclosure program
Allow reasonable time (typically 90 days) for patching
Coordinate public disclosure with the vendor


Citation
This project implements research by Gegenhuber et al. from the University of Vienna and SBA Research. If you use this tool in academic work, please cite:
bibtex@inproceedings{gegenhuber2024careless,
  title={Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users on Mobile Instant Messengers},
  author={Gegenhuber, Gabriel K. and G{\"u}nther, Maximilian and Maier, Markus and Judmayer, Aljosha and Holzbauer, Florian and Frenzel, Philipp {\'E}. and Ullrich, Johanna},
  booktitle={Proceedings of the Network and Distributed System Security Symposium},
  year={2024},
  organization={University of Vienna, SBA Research}
}
Original Research Paper: [Available upon publication]

License
MIT License - See LICENSE file for details.
Dependencies
This project is built on:

@whiskeysockets/baileys - WhatsApp Web API
libsignal-client - Signal Protocol implementation
React, Express, TypeScript, and other open-source libraries


Star History
Show Image

Contributing
Contributions are welcome! Please:

Fork the repository
Create a feature branch (git checkout -b feature/improvement)
Commit your changes (git commit -am 'Add new feature')
Push to the branch (git push origin feature/improvement)
Open a Pull Request


Support

Issues: GitHub Issues
Discussions: GitHub Discussions


⚠️ Use responsibly. This tool demonstrates real security vulnerabilities affecting millions of users worldwide.


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=gommzystudio/device-activity-tracker&type=date&legend=top-left)](https://www.star-history.com/#gommzystudio/device-activity-tracker&type=date&legend=top-left)
