export type DeviceState = 'Online' | 'Standby' | 'Calibrating';

export class AdaptiveThresholdManager {
    private history: number[] = [];
    private readonly WINDOW_SIZE = 100;
    private readonly MIN_SAMPLES = 10;

    // Model Parameters
    private onlineCentroid = 0;
    private standbyCentroid = 0;
    private threshold = 0;
    private confidence = 0;

    // Hysteresis
    private consecutiveOnline = 0;
    private consecutiveStandby = 0;
    private currentState: DeviceState = 'Calibrating';
    private readonly STABILITY_THRESHOLD = 3;

    constructor() {
        this.reset();
    }

    public reset() {
        this.history = [];
        this.resetModel();
    }

    private resetModel() {
        this.onlineCentroid = 0;
        this.standbyCentroid = 0;
        this.threshold = 0;
        this.confidence = 0;
        this.currentState = 'Calibrating';
        this.consecutiveOnline = 0;
        this.consecutiveStandby = 0;
    }

    public addMeasurement(rtt: number) {
        if (rtt <= 0 || rtt > 10000) return; // Ignore impossible latency

        this.history.push(rtt);
        if (this.history.length > this.WINDOW_SIZE) {
            this.history.shift();
        }

        this.updateModel();
    }

    public determineState(rtt: number): DeviceState {
        if (this.history.length < this.MIN_SAMPLES || this.threshold === 0) {
            return 'Calibrating';
        }

        const rawState: DeviceState = rtt < this.threshold ? 'Online' : 'Standby';

        // Hysteresis: Prevent frequent state flipping
        if (rawState === 'Online') {
            this.consecutiveOnline++;
            this.consecutiveStandby = 0;
        } else {
            this.consecutiveStandby++;
            this.consecutiveOnline = 0;
        }

        // Only transition if we have N consecutive readings
        if (rawState === 'Online' && this.consecutiveOnline >= this.STABILITY_THRESHOLD) {
            this.currentState = 'Online';
        } else if (rawState === 'Standby' && this.consecutiveStandby >= this.STABILITY_THRESHOLD) {
            this.currentState = 'Standby';
        }

        // Initial state exit
        if (this.currentState === 'Calibrating') {
            this.currentState = rawState;
        }

        return this.currentState;
    }

    /**
     * Re-runs K-Means to find optimal centroids using the latest dataset
     */
    private updateModel() {
        if (this.history.length < this.MIN_SAMPLES) return;

        // Interquartile Range (IQR) filtering to remove network spikes
        const sorted = [...this.history].sort((a, b) => a - b);
        const q1 = sorted[Math.floor(sorted.length * 0.25)];
        const q3 = sorted[Math.floor(sorted.length * 0.75)];
        const iqr = q3 - q1;

        // Use loose bounds (2.0 IQR) to capture valid high-latency standby states
        const upper = q3 + 2.0 * iqr;
        const lower = Math.max(0, q1 - 1.5 * iqr);
        const cleanData = this.history.filter(v => v >= lower && v <= upper);

        // Fallback to full history if filtering is too aggressive
        const data = cleanData.length < this.MIN_SAMPLES ? this.history : cleanData;

        // 1D K-Means Clustering (K=2)
        // Initialize with 10th and 90th percentiles
        const sortedDist = [...data].sort((a, b) => a - b);
        let c1 = sortedDist[Math.floor(sortedDist.length * 0.1)];
        let c2 = sortedDist[Math.floor(sortedDist.length * 0.9)];

        // Ensure minimum separation for stability
        if (Math.abs(c1 - c2) < 50) c2 = c1 + 200;

        // Iterate to convergence (max 10 steps)
        for (let i = 0; i < 10; i++) {
            const cluster1: number[] = [];
            const cluster2: number[] = [];

            data.forEach(val => {
                if (Math.abs(val - c1) < Math.abs(val - c2)) {
                    cluster1.push(val);
                } else {
                    cluster2.push(val);
                }
            });

            const newC1 = this.avg(cluster1, c1);
            const newC2 = this.avg(cluster2, c2);

            if (Math.abs(newC1 - c1) < 1 && Math.abs(newC2 - c2) < 1) {
                c1 = newC1;
                c2 = newC2;
                break;
            }
            c1 = newC1;
            c2 = newC2;
        }

        // Ensure c1 is always the lower latency (Online)
        if (c1 > c2) [c1, c2] = [c2, c1];

        const separation = c2 - c1;
        const MIN_SEPARATION = 300; // Minimum ms difference to be considered valid distinct states

        if (separation < MIN_SEPARATION) {
            // Clusters are too close (just noise). We cannot reliably distinguish states.
            // Check absolute value to guess state
            const avg = (c1 + c2) / 2;
            if (avg < 500) {
                // Low latency but no variance -> Likely Always Online
                this.onlineCentroid = avg;
                this.standbyCentroid = avg + 1000; // Fake a standby
                this.threshold = avg + 500;
            } else {
                // High latency and no variance -> Likely Always Standby or Bad Network
                this.onlineCentroid = Math.max(0, avg - 1000); // Fake a online
                this.standbyCentroid = avg;
                this.threshold = avg - 250;
            }
            this.confidence = 0.1; // Low confidence
        } else {
            this.onlineCentroid = c1;
            this.standbyCentroid = c2;
            this.threshold = (c1 + c2) / 2;
            this.confidence = Math.min(1.0, separation / 1000);
        }
    }

    private avg(arr: number[], fallback: number): number {
        return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : fallback;
    }

    public getDebugStats() {
        return {
            onlineAvg: this.onlineCentroid,
            standbyAvg: this.standbyCentroid,
            threshold: this.threshold,
            confidence: this.confidence,
            samples: this.history.length
        };
    }
}
