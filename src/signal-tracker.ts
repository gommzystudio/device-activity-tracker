/**
 * Signal Activity Tracker
 *
 * Monitors Signal user activity using RTT-based analysis via signal-cli-rest-api.
 * Uses WebSocket connection in json-rpc mode to receive delivery receipts.
 */

import WebSocket from 'ws';

export type ProbeMethod = 'reaction' | 'message';

interface DeviceMetrics {
    rttHistory: number[];
    recentRtts: number[];
    state: string;
    lastRtt: number;
    lastUpdate: number;
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
    private isPaused: boolean = false;
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
        this.isPaused = false;
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
        if (this.isPaused) return;
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
            if (this.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }
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
            if (this.isPaused || !this.isTracking) {
                resolve();
                return;
            }

            // Store resolve function so receipt handler can signal completion
            this.probeResolve = resolve;

            if (this.isPaused || !this.isTracking) {
                this.probeResolve = null;
                resolve();
                return;
            }

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
        if (this.isPaused) return;
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
        if (this.isPaused) return;
        if (!this.deviceMetrics.has(identifier)) {
            this.deviceMetrics.set(identifier, {
                rttHistory: [],
                recentRtts: [],
                state: 'OFFLINE',
                lastRtt: timeout,
                lastUpdate: Date.now()
            });
        } else {
            const metrics = this.deviceMetrics.get(identifier)!;
            metrics.state = 'OFFLINE';
            metrics.lastRtt = timeout;
            metrics.lastUpdate = Date.now();
        }

        logger.info(`Device ${identifier} marked as OFFLINE (no receipt after ${timeout}ms)`);
        this.sendUpdate();
    }

    private addMeasurementForDevice(identifier: string, rtt: number) {
        if (this.isPaused) return;
        if (!this.deviceMetrics.has(identifier)) {
            this.deviceMetrics.set(identifier, {
                rttHistory: [],
                recentRtts: [],
                state: 'Calibrating...',
                lastRtt: rtt,
                lastUpdate: Date.now()
            });
        }

        const metrics = this.deviceMetrics.get(identifier)!;

        if (rtt <= 5000) {
            metrics.recentRtts.push(rtt);
            if (metrics.recentRtts.length > 3) {
                metrics.recentRtts.shift();
            }

            metrics.rttHistory.push(rtt);
            if (metrics.rttHistory.length > 2000) {
                metrics.rttHistory.shift();
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

        if (metrics.state === 'OFFLINE') {
            if (metrics.lastRtt <= 5000 && metrics.recentRtts.length > 0) {
                logger.debug(`Device ${identifier} came back online (RTT: ${metrics.lastRtt}ms)`);
            } else {
                return;
            }
        }

        const movingAvg = metrics.recentRtts.reduce((a, b) => a + b, 0) / metrics.recentRtts.length;

        let median = 0;
        let threshold = 0;

        if (this.globalRttHistory.length >= 3) {
            const sorted = [...this.globalRttHistory].sort((a, b) => a - b);
            const mid = Math.floor(sorted.length / 2);
            median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            threshold = median * 0.9;

            if (movingAvg < threshold) {
                metrics.state = 'Online';
            } else {
                metrics.state = 'Standby';
            }
        } else {
            metrics.state = 'Calibrating...';
        }

        const stateColor = metrics.state === 'Online' ? '🟢' : metrics.state === 'Standby' ? '🟡' : '⚪';
        logger.info(`${stateColor} ${identifier}: ${metrics.state} (RTT: ${metrics.lastRtt}ms, Avg: ${movingAvg.toFixed(0)}ms)`);
    }

    private sendUpdate() {
        const devices = Array.from(this.deviceMetrics.entries()).map(([id, metrics]) => ({
            jid: id,
            state: metrics.state,
            rtt: metrics.lastRtt,
            avg: metrics.recentRtts.length > 0
                ? metrics.recentRtts.reduce((a, b) => a + b, 0) / metrics.recentRtts.length
                : 0
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
        this.isPaused = false;

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

    public pauseTracking() {
        if (!this.isTracking || this.isPaused) return;
        this.isPaused = true;

        if (this.pendingProbeTimeout) {
            clearTimeout(this.pendingProbeTimeout);
            this.pendingProbeTimeout = null;
        }
        this.pendingProbeStartTime = null;
        if (this.probeResolve) {
            this.probeResolve();
            this.probeResolve = null;
        }

        logger.info('Tracking paused');
    }

    public resumeTracking() {
        if (!this.isTracking || !this.isPaused) return;
        this.isPaused = false;
        logger.info('Tracking resumed');
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
