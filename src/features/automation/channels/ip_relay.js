import net from 'node:net';

export async function sendIpRelayPulse(host, port, command = 'SET_RELAY 1', durationMs = 1500) {
    const targetPort = Number.parseInt(port, 10) || 6722;
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);

        socket.connect(targetPort, host, () => {
            socket.write(`${command}\r\n`);
            setTimeout(() => {
                socket.write('SET_RELAY 0\r\n');
                socket.end();
                resolve({ pulsed: true, durationMs });
            }, durationMs);
        });

        socket.on('error', (err) => {
            socket.destroy();
            reject(new Error(`Relay TCP Error: ${err.message}`));
        });

        socket.on('timeout', () => {
            socket.destroy();
            reject(new Error('Relay TCP Timeout'));
        });
    });
}
