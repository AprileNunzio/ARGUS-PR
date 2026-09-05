import { sendMail } from './smtp_client.js';
import { publish as mqttPublish } from './mqtt_client.js';
import { sendWebhook, sendTelegram, triggerGate } from './http_channels.js';
import { operateRelay } from './onvif_relay.js';
import { sendIpRelayPulse } from './ip_relay.js';
import { publish, Topic } from '../../../kernel/event_bus.js';

export const ChannelKind = Object.freeze({
    CONSOLE: 'console',
    EMAIL: 'email',
    TELEGRAM: 'telegram',
    WEBHOOK: 'webhook',
    MQTT: 'mqtt',
    GATE: 'gate',
    ONVIF_RELAY: 'onvif_relay',
    IP_RELAY: 'ip_relay'
});

export const CHANNEL_KINDS = Object.freeze(Object.values(ChannelKind));

export const CHANNEL_LABELS = Object.freeze({
    console: 'Avviso nella console',
    email: 'Email (SMTP)',
    telegram: 'Telegram',
    webhook: 'Webhook',
    mqtt: 'MQTT',
    gate: 'Comando HTTP (cancello, rele, domotica)',
    onvif_relay: 'Rele della telecamera (ONVIF)',
    ip_relay: 'Rele Hardware IP / Ethernet (TCP)'
});

export const SECRET_LABELS = Object.freeze({
    email: 'Password SMTP',
    telegram: 'Token del bot',
    webhook: 'Segreto per la firma HMAC',
    mqtt: 'Password del broker',
    gate: 'Password',
    onvif_relay: 'Password della telecamera'
});

async function dispatch(channel, secret, message) {
    const config = channel.config ?? {};

    if (channel.kind === ChannelKind.CONSOLE) {
        publish(Topic.ALARM, {
            source: 'automation',
            rule: message.rule,
            cameraId: message.cameraId ?? null,
            text: message.text,
            timestamp: message.timestamp ?? Date.now()
        });
        return { notified: true };
    }

    if (channel.kind === ChannelKind.EMAIL) {
        const recipients = String(config.to ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
        if (recipients.length === 0) throw new Error('Nessun destinatario configurato');

        return sendMail({
            host: config.host,
            port: Number.parseInt(config.port, 10) || 587,
            secure: config.secure === true,
            startTls: config.startTls !== false,
            username: config.username || null,
            password: secret,
            from: config.from ?? config.username,
            to: recipients,
            subject: message.subject ?? `ARGUS-PR: ${message.rule}`,
            text: message.text
        });
    }

    if (channel.kind === ChannelKind.TELEGRAM) return sendTelegram(config, secret, message);
    if (channel.kind === ChannelKind.WEBHOOK) return sendWebhook(config, secret, message);
    if (channel.kind === ChannelKind.GATE) return triggerGate(config, secret);
    if (channel.kind === ChannelKind.ONVIF_RELAY) return operateRelay(config, secret);
    if (channel.kind === ChannelKind.IP_RELAY) return sendIpRelayPulse(config.host, config.port, config.command, config.durationMs);

    if (channel.kind === ChannelKind.MQTT) {
        return mqttPublish({
            host: config.host,
            port: Number.parseInt(config.port, 10) || (config.tls === true ? 8883 : 1883),
            tls: config.tls === true,
            username: config.username || null,
            password: secret,
            topic: config.topic ?? 'argus/events',
            payload: JSON.stringify({
                rule: message.rule,
                event: message.event,
                camera: message.camera,
                text: message.text,
                at: new Date(message.timestamp ?? Date.now()).toISOString()
            }),
            retain: config.retain === true
        });
    }

    throw new Error(`Canale non supportato: ${channel.kind}`);
}

export async function deliver(channel, secret, message) {
    if (channel.enabled === false) return { skipped: 'canale disattivato' };
    return dispatch(channel, secret, message);
}
