/**
 * InfluxDB Database Module
 *
 * Handles persistence of RTT measurements and tracking data to InfluxDB.
 * Provides automatic downsampling via retention policies.
 */

import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import { pino } from 'pino';

const logger = pino({ level: 'info' });

interface InfluxConfig {
    url: string;
    token: string;
    org: string;
    bucket: string;
}

class DatabaseManager {
    private client: InfluxDB | null = null;
    private writeApi: WriteApi | null = null;
    private config: InfluxConfig | null = null;
    private enabled: boolean = false;

    /**
     * Initialize connection to InfluxDB
     */
    async initialize() {
        const url = process.env.INFLUXDB_URL;
        const token = process.env.INFLUXDB_TOKEN;
        const org = process.env.INFLUXDB_ORG;
        const bucket = process.env.INFLUXDB_BUCKET;

        if (!url || !token || !org || !bucket) {
            logger.warn('InfluxDB environment variables not set. Database persistence disabled.');
            logger.warn('Set INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_ORG, and INFLUXDB_BUCKET to enable.');
            this.enabled = false;
            return;
        }

        this.config = { url, token, org, bucket };
        this.client = new InfluxDB({ url, token });
        this.writeApi = this.client.getWriteApi(org, bucket, 'ms');

        // Configure write options
        this.writeApi.useDefaultTags({ app: 'whatsapp-tracker' });

        this.enabled = true;
        logger.info('InfluxDB connection initialized successfully');
    }

    /**
     * Write RTT measurement to database
     */
    async writeRTT(jid: string, rtt: number, state: string, deviceJid?: string) {
        if (!this.enabled || !this.writeApi) return;

        try {
            const point = new Point('rtt_measurement')
                .tag('contact_jid', jid)
                .tag('state', state)
                .floatField('rtt', rtt)
                .timestamp(new Date());

            if (deviceJid) {
                point.tag('device_jid', deviceJid);
            }

            this.writeApi.writePoint(point);
        } catch (error) {
            logger.error(error, 'Error writing RTT to database');
        }
    }

    /**
     * Write device state change to database
     */
    async writeStateChange(jid: string, oldState: string, newState: string, deviceJid?: string) {
        if (!this.enabled || !this.writeApi) return;

        try {
            const point = new Point('state_change')
                .tag('contact_jid', jid)
                .tag('old_state', oldState)
                .tag('new_state', newState)
                .timestamp(new Date());

            if (deviceJid) {
                point.tag('device_jid', deviceJid);
            }

            this.writeApi.writePoint(point);
        } catch (error) {
            logger.error(error, 'Error writing state change to database');
        }
    }

    /**
     * Write contact tracking event (added/removed)
     */
    async writeContactEvent(jid: string, event: 'added' | 'removed', displayNumber?: string) {
        if (!this.enabled || !this.writeApi) return;

        try {
            const point = new Point('contact_event')
                .tag('contact_jid', jid)
                .tag('event', event)
                .intField('value', event === 'added' ? 1 : 0)
                .timestamp(new Date());

            if (displayNumber) {
                point.tag('display_number', displayNumber);
            }

            this.writeApi.writePoint(point);
        } catch (error) {
            logger.error(error, 'Error writing contact event to database');
        }
    }

    /**
     * Write presence update to database
     */
    async writePresence(jid: string, presence: string) {
        if (!this.enabled || !this.writeApi) return;

        try {
            const point = new Point('presence_update')
                .tag('contact_jid', jid)
                .tag('presence', presence)
                .intField('value', 1)
                .timestamp(new Date());

            this.writeApi.writePoint(point);
        } catch (error) {
            logger.error(error, 'Error writing presence to database');
        }
    }

    /**
     * Flush pending writes to database
     */
    async flush() {
        if (!this.enabled || !this.writeApi) return;

        try {
            await this.writeApi.flush();
        } catch (error) {
            logger.error(error, 'Error flushing writes to database');
        }
    }

    /**
     * Close database connection
     */
    async close() {
        if (!this.enabled || !this.writeApi) return;

        try {
            await this.writeApi.close();
            logger.info('InfluxDB connection closed');
        } catch (error) {
            logger.error(error, 'Error closing database connection');
        }
    }

    /**
     * Check if database is enabled
     */
    isEnabled(): boolean {
        return this.enabled;
    }
}

// Singleton instance
export const db = new DatabaseManager();
