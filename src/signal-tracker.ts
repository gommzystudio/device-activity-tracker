/**
 * Signal Activity Tracker
 *
 * Monitors Signal user activity using RTT-based analysis via signal-cli-rest-api.
 * Uses WebSocket connection in json-rpc mode to receive delivery receipts.
 */

import WebSocket from 'ws';

export type ProbeMethod = 'reaction' | 'message';

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
    absolute: {
        veryActive: number;
        minimized: number;
        screenOn: number;
        screenOff: number;
    };
    adjusted: {
        veryActive: number;
        minimized: number;
        screenOn: number;
        screenOff: number;
    };
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
    requiredSamples: number;
    networkBaseline: number;
    isCalibrated: boolean;
    calibrationStartedAt: number;
}

/**
 * Temporal pattern detection for transition ramps
 */
interface TemporalPattern {
    windowSize: number;
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
    minimumStateDuration: number;
    transitionMargin: number;
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

interface DeviceMetrics {
    rttHistory: number[];
    recentRtts: number[];
    state: string;
    lastRtt: number;
    lastUpdate: number;
    ema: number;
    stateChangedAt: number;
    stateHistory: Array<{state: string, timestamp: number, rtt: number}>;
    baselineP25: number;
    baselineP50: number;
    baselineP75: number;
    baselineP90: number;
    // New fields for improved accuracy
    calibration: CalibrationState;
    thresholds: StateThresholds;
    temporalPattern: TemporalPattern;
    stateStats: Map<string, StateStatistics>;
}

// JSON-RPC message format for receipts
interface JsonRpcMessage {
    jsonrpc: string;
    method?: string;
    params?: {
        envelope?: {
            source?: string;
            sourceNumber?: string;
            timestamp?: number;
            receiptMessage?: {
                when: number;
                isDelivery: boolean;
                isRead: boolean;
                timestamps: number[];
            };
        };
    };
}

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
            console.log('[SIGNAL]', ...args);
        }
    }

    info(...args: any[]) {
        console.log('[SIGNAL]', ...args);
    }
}

const logger = new TrackerLogger(true);

export class SignalTracker {
    private apiUrl: string;
    private senderNumber: string;
    private targetNumber: string;
    private isTracking: boolean = false;
    private deviceMetrics: Map<string, DeviceMetrics> = new Map();
    private globalRttHistory: number[] = [];
    private probeMethod: ProbeMethod = 'reaction';
    private ws: WebSocket | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    public onUpdate?: (data: any) => void;

    // Serialized probe tracking (per Codex recommendation)
    // Only ONE probe in flight at a time - correlate by order, not timestamp
    private pendingProbeStartTime: number | null = null;
    private pendingProbeTimeout: NodeJS.Timeout | null = null;
    private probeResolve: (() => void) | null = null;

    constructor(
        apiUrl: string,
        senderNumber: string,
        targetNumber: string,
        debugMode: boolean = false
    ) {
        this.apiUrl = apiUrl.replace(/\/$/, '');
        this.senderNumber = senderNumber;
        this.targetNumber = targetNumber;
        logger.setDebugMode(debugMode);
    }

    public setProbeMethod(method: ProbeMethod) {
        this.probeMethod = method;
        logger.info(`Probe method changed to: ${method}`);
    }

    public getProbeMethod(): ProbeMethod {
        return this.probeMethod;
    }

    /**
     * Start tracking the target user's activity
     */
    public async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;
        logger.info(`Tracking started for ${this.targetNumber}`);
        logger.info(`Probe method: ${this.probeMethod}`);

        if (this.onUpdate) {
            this.onUpdate({
                devices: [],
                deviceCount: 1,
                presence: null,
                median: 0,
                threshold: 0
            });
        }

        // Connect WebSocket for receiving receipts
        this.connectWebSocket();

        // Start the probe loop
        this.probeLoop();
    }

    /**
     * Connect to signal-cli-rest-api WebSocket for receiving messages
     */
    private connectWebSocket() {
        if (!this.isTracking) return;

        const wsUrl = this.apiUrl.replace('http', 'ws') + '/v1/receive/' + encodeURIComponent(this.senderNumber);
        logger.debug(`Connecting WebSocket to ${wsUrl}`);

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.on('open', () => {
                logger.info('WebSocket connected for receiving receipts');
            });

            this.ws.on('message', (data: WebSocket.Data) => {
                try {
                    const raw = data.toString();
                    logger.debug('WebSocket raw message:', raw.substring(0, 500));
                    const message = JSON.parse(raw) as JsonRpcMessage;
                    this.processJsonRpcMessage(message);
                } catch (err) {
                    logger.debug('Error parsing WebSocket message:', err);
                }
            });

            this.ws.on('close', () => {
                logger.debug('WebSocket closed');
                this.scheduleReconnect();
            });

            this.ws.on('error', (err) => {
                logger.debug('WebSocket error:', err);
                this.scheduleReconnect();
            });
        } catch (err) {
            logger.debug('Error creating WebSocket:', err);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (!this.isTracking) return;
        if (this.reconnectTimeout) return;

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (this.isTracking) {
                logger.debug('Reconnecting WebSocket...');
                this.connectWebSocket();
            }
        }, 5000);
    }

    private processJsonRpcMessage(message: any) {
        // Handle both JSON-RPC format and direct envelope format
        let envelope = message.params?.envelope || message.envelope;

        if (!envelope) {
            logger.debug('No envelope in message');
            return;
        }

        // Check if this is a delivery receipt from our target
        const sourceNumber = envelope.sourceNumber || envelope.source;

        if (envelope.receiptMessage?.isDelivery) {
            logger.debug(`Delivery receipt from ${sourceNumber}`);

            // Serialized probe approach: if we have a pending probe, ANY delivery receipt
            // from the target is for that probe (since we only send one at a time)
            if (this.pendingProbeStartTime !== null && sourceNumber === this.targetNumber) {
                const receiptTime = Date.now();
                const rtt = receiptTime - this.pendingProbeStartTime;

                logger.info(`Delivery receipt matched! RTT: ${rtt}ms`);

                // Clear the timeout
                if (this.pendingProbeTimeout) {
                    clearTimeout(this.pendingProbeTimeout);
                    this.pendingProbeTimeout = null;
                }

                // Record the measurement
                this.addMeasurementForDevice(this.targetNumber, rtt);

                // Clear pending probe and signal completion
                this.pendingProbeStartTime = null;
                if (this.probeResolve) {
                    this.probeResolve();
                    this.probeResolve = null;
                }
            }
        }
    }

    private async probeLoop() {
        while (this.isTracking) {
            try {
                // Serialized probing: wait for previous probe to complete before sending next
                await this.sendSerializedProbe();
            } catch (err) {
                logger.debug('Error sending probe:', err);
            }
            // Small delay between probes
            const delay = Math.floor(Math.random() * 1000) + 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    /**
     * Send a probe and wait for receipt or timeout before returning
     * This ensures only ONE probe is in flight at a time (serialization)
     */
    private async sendSerializedProbe(): Promise<void> {
        return new Promise<void>(async (resolve) => {
            // Store resolve function so receipt handler can signal completion
            this.probeResolve = resolve;

            // Record probe start time
            this.pendingProbeStartTime = Date.now();

            // Send the probe
            await this.sendProbe();

            // Set timeout - if no receipt within 15s, mark offline and continue
            this.pendingProbeTimeout = setTimeout(() => {
                if (this.pendingProbeStartTime !== null) {
                    const elapsed = Date.now() - this.pendingProbeStartTime;
                    logger.debug(`Probe timeout after ${elapsed}ms`);
                    this.markDeviceOffline(this.targetNumber, elapsed);
                    this.pendingProbeStartTime = null;
                    this.pendingProbeTimeout = null;
                    if (this.probeResolve) {
                        this.probeResolve();
                        this.probeResolve = null;
                    }
                }
            }, 15000);
        });
    }

    private async sendProbe() {
        if (this.probeMethod === 'reaction') {
            await this.sendReactionProbe();
        } else {
            await this.sendMessageProbe();
        }
    }

    /**
     * Send a reaction probe - sends a reaction to trigger delivery receipt
     * Uses serialized approach: correlation is by order, not timestamp
     */
    private async sendReactionProbe() {
        const timestamp = Date.now();
        const reactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];

        try {
            const response = await fetch(`${this.apiUrl}/v1/reactions/${encodeURIComponent(this.senderNumber)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reaction: randomReaction,
                    recipient: this.targetNumber,
                    target_author: this.targetNumber,
                    timestamp: timestamp - 86400000 // Fake timestamp for non-existent message
                })
            });

            if (response.ok || response.status === 204) {
                logger.debug(`Reaction probe sent: ${randomReaction}`);
            } else {
                const errorText = await response.text();
                logger.debug(`Failed to send reaction probe: ${response.status} - ${errorText}`);
            }
        } catch (err) {
            logger.debug('Error sending reaction probe:', err);
        }
    }

    /**
     * Send a message probe - sends an invisible/minimal message
     * Uses serialized approach: correlation is by order, not timestamp
     */
    private async sendMessageProbe() {
        try {
            const response = await fetch(`${this.apiUrl}/v2/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: this.senderNumber,
                    recipients: [this.targetNumber],
                    message: '\u200B' // Zero-width space (nearly invisible)
                })
            });

            if (response.ok) {
                logger.debug('Message probe sent');
            } else {
                const errorText = await response.text();
                logger.debug(`Failed to send message probe: ${response.status} - ${errorText}`);
            }
        } catch (err) {
            logger.debug('Error sending message probe:', err);
        }
    }

    private markDeviceOffline(identifier: string, timeout: number) {
        if (!this.deviceMetrics.has(identifier)) {
            this.deviceMetrics.set(identifier, {
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
            const metrics = this.deviceMetrics.get(identifier)!;
            if (metrics.state !== 'OFFLINE') {
                metrics.stateHistory.push({state: 'OFFLINE', timestamp: Date.now(), rtt: timeout});
                metrics.stateChangedAt = Date.now();
            }
            metrics.state = 'OFFLINE';
            metrics.lastRtt = timeout;
            metrics.lastUpdate = Date.now();
        }

        logger.info(`Device ${identifier} marked as OFFLINE (no receipt after ${timeout}ms)`);
        this.sendUpdate();
    }

    /**
     * Initialize thresholds with absolute values from research
     */
    private initializeThresholds(): StateThresholds {
        return {
            absolute: {
                veryActive: 350,
                minimized: 500,
                screenOn: 1000,
                screenOff: 1500
            },
            adjusted: {
                veryActive: 350,
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
            requiredSamples: 300,
            networkBaseline: 0,
            isCalibrated: false,
            calibrationStartedAt: Date.now()
        };
    }

    /**
     * Initialize temporal pattern tracking
     */
    private initializeTemporalPattern(): TemporalPattern {
        return {
            windowSize: 30000,
            samples: [],
            trendDirection: 'stable',
            transitionDetected: false
        };
    }

    /**
     * Calculate network baseline from first 100 RTT samples
     */
    private calculateNetworkBaseline(rttHistory: number[]): number {
        if (rttHistory.length < 100) return 0;
        const firstSamples = rttHistory.slice(0, 100);
        return this.calculateMedian(firstSamples);
    }

    /**
     * Update adjusted thresholds based on network baseline
     */
    private updateAdjustedThresholds(thresholds: StateThresholds, networkBaseline: number) {
        const adjustment = networkBaseline > 500 ? 0 : networkBaseline;
        thresholds.adjusted.veryActive = thresholds.absolute.veryActive + adjustment;
        thresholds.adjusted.minimized = thresholds.absolute.minimized + adjustment;
        thresholds.adjusted.screenOn = thresholds.absolute.screenOn + adjustment;
        thresholds.adjusted.screenOff = thresholds.absolute.screenOff + adjustment;
    }

    /**
     * Update temporal pattern with new RTT sample
     */
    private updateTemporalPattern(pattern: TemporalPattern, rtt: number, timestamp: number) {
        pattern.samples.push({ rtt, timestamp });
        const cutoffTime = timestamp - pattern.windowSize;
        pattern.samples = pattern.samples.filter(s => s.timestamp >= cutoffTime);
        if (pattern.samples.length >= 10) {
            const trend = this.detectTrend(pattern.samples);
            pattern.trendDirection = trend.direction;
            pattern.transitionDetected = trend.isTransition;
        }
    }

    /**
     * Detect trend in temporal pattern using linear regression
     */
    private detectTrend(samples: Array<{rtt: number; timestamp: number}>): {
        direction: 'rising' | 'falling' | 'stable';
        isTransition: boolean;
    } {
        if (samples.length < 10) {
            return { direction: 'stable', isTransition: false };
        }
        const n = samples.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        samples.forEach((sample, i) => {
            sumX += i;
            sumY += sample.rtt;
            sumXY += i * sample.rtt;
            sumXX += i * i;
        });
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const direction: 'rising' | 'falling' | 'stable' =
            slope > 10 ? 'rising' :
            slope < -10 ? 'falling' :
            'stable';
        const firstRTT = samples[0].rtt;
        const lastRTT = samples[samples.length - 1].rtt;
        const rttChange = lastRTT - firstRTT;
        const isTransition = direction === 'rising' && rttChange > 200;
        return { direction, isTransition };
    }

    private isOutlier(value: number, history: number[]): boolean {
        if (history.length < 10) return false;
        const median = this.calculateMedian(history);
        const deviations = history.map(val => Math.abs(val - median));
        const mad = this.calculateMedian(deviations);
        const modifiedZScore = 0.6745 * (value - median) / (mad + 0.0001);
        // UPDATED: Only filter extreme network glitches
        return Math.abs(modifiedZScore) > 10 && value > 5000;
    }

    private calculateMedian(arr: number[]): number {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    private calculatePercentile(arr: number[], percentile: number): number {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const index = (percentile / 100) * (sorted.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        return sorted[lower] * (1 - weight) + sorted[upper] * weight;
    }

    private updateBaselines(metrics: DeviceMetrics) {
        if (metrics.rttHistory.length < 20) return;
        metrics.baselineP25 = this.calculatePercentile(metrics.rttHistory, 25);
        metrics.baselineP50 = this.calculatePercentile(metrics.rttHistory, 50);
        metrics.baselineP75 = this.calculatePercentile(metrics.rttHistory, 75);
        metrics.baselineP90 = this.calculatePercentile(metrics.rttHistory, 90);
    }

    private addMeasurementForDevice(identifier: string, rtt: number) {
        if (!this.deviceMetrics.has(identifier)) {
            this.deviceMetrics.set(identifier, {
                rttHistory: [],
                recentRtts: [],
                state: DeviceState.CALIBRATING,
                lastRtt: rtt,
                lastUpdate: Date.now(),
                ema: rtt,
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

        const metrics = this.deviceMetrics.get(identifier)!;

        if (rtt <= 5000) {
            const isOutlier = this.isOutlier(rtt, metrics.rttHistory);

            if (!isOutlier || metrics.rttHistory.length < 10) {
                metrics.recentRtts.push(rtt);
                if (metrics.recentRtts.length > 10) {
                    metrics.recentRtts.shift();
                }

                const alpha = 0.3;
                metrics.ema = alpha * rtt + (1 - alpha) * metrics.ema;

                metrics.rttHistory.push(rtt);
                if (metrics.rttHistory.length > 2000) {
                    metrics.rttHistory.shift();
                }

                // Update calibration state
                metrics.calibration.samplesCollected = metrics.rttHistory.length;

                // Calculate network baseline after 100 samples
                if (metrics.calibration.samplesCollected === 100) {
                    metrics.calibration.networkBaseline = this.calculateNetworkBaseline(metrics.rttHistory);
                    this.updateAdjustedThresholds(metrics.thresholds, metrics.calibration.networkBaseline);
                    logger.debug(
                        `[CALIBRATION] ${identifier}: Network baseline calculated: ${metrics.calibration.networkBaseline.toFixed(0)}ms`
                    );
                }

                // Mark as calibrated after 300 samples
                if (metrics.calibration.samplesCollected >= metrics.calibration.requiredSamples && !metrics.calibration.isCalibrated) {
                    metrics.calibration.isCalibrated = true;
                    logger.info(
                        `Device ${identifier} calibration complete (${metrics.calibration.samplesCollected} samples, ` +
                        `baseline: ${metrics.calibration.networkBaseline.toFixed(0)}ms)`
                    );
                }

                // Update temporal pattern
                this.updateTemporalPattern(metrics.temporalPattern, rtt, Date.now());
            } else {
                logger.debug(`[OUTLIER FILTERED] RTT ${rtt}ms for ${identifier}`);
            }

            this.globalRttHistory.push(rtt);
            if (this.globalRttHistory.length > 2000) {
                this.globalRttHistory.shift();
            }

            metrics.lastRtt = rtt;
            metrics.lastUpdate = Date.now();

            this.determineDeviceState(identifier);
        }

        this.sendUpdate();
    }

    private determineDeviceState(identifier: string) {
        const metrics = this.deviceMetrics.get(identifier);
        if (!metrics) return;

        // 1. Check for OFFLINE state
        if (metrics.state === DeviceState.OFFLINE) {
            if (metrics.lastRtt <= 5000 && metrics.recentRtts.length > 0) {
                logger.debug(`Device ${identifier} came back online (RTT: ${metrics.lastRtt}ms)`);
            } else {
                return;
            }
        }

        // 2. Check calibration state
        if (!metrics.calibration.isCalibrated) {
            const progress = metrics.calibration.samplesCollected;
            const required = metrics.calibration.requiredSamples;
            metrics.state = `${DeviceState.CALIBRATING} (${progress}/${required})`;
            logger.debug(`Still calibrating ${identifier}: ${progress}/${required} samples`);
            return;
        }

        // 3. Update device-specific baseline percentiles
        this.updateBaselines(metrics);

        // 4. Use EMA for smoother classification
        const currentRTT = metrics.ema;

        // 5. HYSTERESIS
        const MIN_STATE_DURATION = 10000;
        const timeSinceStateChange = Date.now() - metrics.stateChangedAt;
        const canChangeState = timeSinceStateChange > MIN_STATE_DURATION;

        // 6. Determine new state using absolute thresholds
        let newState: string;
        const thresholds = metrics.thresholds.adjusted;
        const MARGIN = 1.2;

        // 7. Check temporal transitions
        if (metrics.temporalPattern.transitionDetected && metrics.temporalPattern.trendDirection === 'rising') {
            newState = DeviceState.APP_MINIMIZED;
            logger.debug(`[TEMPORAL TRANSITION] ${identifier}: Detected app going to background`);
        }
        // 8. Use absolute thresholds
        else if (currentRTT < thresholds.veryActive * MARGIN) {
            newState = DeviceState.APP_FOREGROUND;
        } else if (currentRTT < thresholds.screenOn * MARGIN) {
            newState = DeviceState.APP_MINIMIZED;
        } else if (currentRTT < thresholds.screenOff * MARGIN) {
            newState = DeviceState.SCREEN_ON;
        } else {
            newState = DeviceState.SCREEN_OFF;
        }

        // 9. Apply hysteresis
        if (newState !== metrics.state && canChangeState) {
            logger.debug(
                `[STATE CHANGE] ${identifier}: ${metrics.state} -> ${newState} ` +
                `(RTT: ${currentRTT.toFixed(0)}ms, Thresholds - Active: ${thresholds.veryActive.toFixed(0)}ms, ` +
                `Minimized: ${thresholds.minimized.toFixed(0)}ms, ScreenOn: ${thresholds.screenOn.toFixed(0)}ms, ` +
                `ScreenOff: ${thresholds.screenOff.toFixed(0)}ms)`
            );

            metrics.stateHistory.push({
                state: newState,
                timestamp: Date.now(),
                rtt: metrics.lastRtt
            });

            if (metrics.stateHistory.length > 1000) {
                metrics.stateHistory.shift();
            }

            metrics.state = newState;
            metrics.stateChangedAt = Date.now();
        } else if (newState !== metrics.state) {
            logger.debug(
                `[HYSTERESIS] ${identifier}: Delaying state change ${metrics.state} -> ${newState} ` +
                `(${(MIN_STATE_DURATION - timeSinceStateChange) / 1000}s remaining)`
            );
        }

        const stateColor = metrics.state.includes('Active') ? '🟢' : metrics.state === DeviceState.SCREEN_ON ? '🟡' : '⚪';
        const movingAvg = metrics.recentRtts.reduce((a, b) => a + b, 0) / metrics.recentRtts.length;
        logger.info(`${stateColor} ${identifier}: ${metrics.state} (RTT: ${metrics.lastRtt}ms, Avg: ${movingAvg.toFixed(0)}ms, EMA: ${metrics.ema.toFixed(0)}ms)`);
    }

    private sendUpdate() {
        const devices = Array.from(this.deviceMetrics.entries()).map(([id, metrics]) => ({
            jid: id,
            state: metrics.state,
            rtt: metrics.lastRtt,
            avg: metrics.recentRtts.length > 0
                ? metrics.recentRtts.reduce((a, b) => a + b, 0) / metrics.recentRtts.length
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
            rttHistory: metrics.rttHistory,
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

        const globalMedian = this.calculateGlobalMedian();
        const globalThreshold = globalMedian * 0.9;

        const data = {
            devices,
            deviceCount: 1,
            presence: null,
            median: globalMedian,
            threshold: globalThreshold
        };

        if (this.onUpdate) {
            this.onUpdate(data);
        }
    }

    private calculateGlobalMedian(): number {
        if (this.globalRttHistory.length < 3) return 0;

        const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Stop tracking and clean up resources
     */
    public stopTracking() {
        this.isTracking = false;

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Clean up serialized probe state
        if (this.pendingProbeTimeout) {
            clearTimeout(this.pendingProbeTimeout);
            this.pendingProbeTimeout = null;
        }
        this.pendingProbeStartTime = null;
        if (this.probeResolve) {
            this.probeResolve();
            this.probeResolve = null;
        }

        logger.info('Tracking stopped');
    }
}

/**
 * Check if signal-cli-rest-api is available and get linked accounts
 */
export async function getSignalAccounts(apiUrl: string): Promise<string[]> {
    try {
        const response = await fetch(`${apiUrl}/v1/accounts`);
        if (response.ok) {
            const data = await response.json();
            return data.map((acc: any) => acc.number || acc);
        }
    } catch (err) {
        console.error('[SIGNAL] Failed to get accounts:', err);
    }
    return [];
}

/**
 * Get QR code link URL for device linking
 */
export function getSignalQrLinkUrl(apiUrl: string, deviceName: string = 'activity-tracker'): string {
    return `${apiUrl}/v1/qrcodelink?device_name=${encodeURIComponent(deviceName)}`;
}

/**
 * Check if a number is registered and discoverable on Signal
 */
export async function checkSignalNumber(
    apiUrl: string,
    senderNumber: string,
    targetNumber: string
): Promise<{ registered: boolean; error?: string }> {
    try {
        const response = await fetch(
            `${apiUrl}/v1/search/${encodeURIComponent(senderNumber)}?numbers=${encodeURIComponent(targetNumber)}`,
            { signal: AbortSignal.timeout(30000) }
        );

        if (response.ok) {
            const results = await response.json();
            if (Array.isArray(results) && results.length > 0) {
                const result = results[0];
                if (result.registered) {
                    return { registered: true };
                } else {
                    return {
                        registered: false,
                        error: 'Number is not registered on Signal or has privacy settings blocking discovery'
                    };
                }
            }
        }

        return { registered: false, error: 'Failed to check Signal registration status' };
    } catch (err) {
        return { registered: false, error: `Signal API error: ${err}` };
    }
}
