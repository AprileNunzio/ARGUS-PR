import { parseNetworks } from './addresses.js';

export const TABLE = 'argus_shield';

function portList(ports) {
    const unique = [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536))];
    return unique.length > 0 ? unique.join(', ') : null;
}

function networkElements(networks, kind) {
    return networks
        .filter((network) => network.family === kind)
        .map((network) => network.text)
        .join(', ');
}

function describeNetworks(entries) {
    const parsed = [];
    for (const entry of entries) {
        const network = parseNetworks([entry])[0];
        if (network) parsed.push({ family: network.family, text: entry.trim() });
    }
    return parsed;
}

function setBlock(name, type, extra) {
    return [`        set ${name} {`, `            type ${type};`, ...extra.map((line) => `            ${line}`), '        }'];
}

export function buildRuleset(config) {
    const lan = describeNetworks(config.lanNetworks);
    const allow = describeNetworks(config.allowlist);

    const lan4 = networkElements(lan, 'ipv4');
    const lan6 = networkElements(lan, 'ipv6');
    const allow4 = networkElements(allow, 'ipv4');
    const allow6 = networkElements(allow, 'ipv6');

    const publicPorts = portList(config.publicPorts);
    const localPorts = portList(config.localOnlyPorts);

    const lines = [];
    const push = (line) => lines.push(line);

    push(`table inet ${TABLE}`);
    push(`delete table inet ${TABLE}`);
    push('');
    push(`table inet ${TABLE} {`);

    lines.push(...setBlock('banned4', 'ipv4_addr', ['flags dynamic, timeout;', `timeout ${config.banSeconds}s;`, 'size 65535;']));
    lines.push(...setBlock('banned6', 'ipv6_addr', ['flags dynamic, timeout;', `timeout ${config.banSeconds}s;`, 'size 65535;']));
    lines.push(...setBlock('conncount4', 'ipv4_addr', ['flags dynamic;', 'size 65535;']));
    lines.push(...setBlock('conncount6', 'ipv6_addr', ['flags dynamic;', 'size 65535;']));
    lines.push(...setBlock('synrate4', 'ipv4_addr', ['flags dynamic, timeout;', 'timeout 5m;', 'size 65535;']));
    lines.push(...setBlock('synrate6', 'ipv6_addr', ['flags dynamic, timeout;', 'timeout 5m;', 'size 65535;']));

    if (lan4) lines.push(...setBlock('lan4', 'ipv4_addr', ['flags interval;', `elements = { ${lan4} }`]));
    if (lan6) lines.push(...setBlock('lan6', 'ipv6_addr', ['flags interval;', `elements = { ${lan6} }`]));
    if (allow4) lines.push(...setBlock('allow4', 'ipv4_addr', ['flags interval;', `elements = { ${allow4} }`]));
    if (allow6) lines.push(...setBlock('allow6', 'ipv6_addr', ['flags interval;', `elements = { ${allow6} }`]));

    push('');
    push('        chain input {');
    push('            type filter hook input priority filter; policy drop;');
    push('');
    push('            iif lo accept');
    push('            ip saddr @banned4 counter drop');
    push('            ip6 saddr @banned6 counter drop');
    push('            ct state invalid counter drop');
    push('            ct state established,related accept');
    push('');
    push('            udp sport 67 udp dport 68 accept');
    push('            udp sport 547 udp dport 546 accept');
    push('');
    push('            tcp flags & (fin|syn|rst|psh|ack|urg) == 0x0 counter drop');
    push('            tcp flags & (fin|syn) == fin|syn counter drop');
    push('            tcp flags & (syn|rst) == syn|rst counter drop');
    push('            tcp flags & (fin|rst) == fin|rst counter drop');
    push('            tcp flags & (fin|psh|urg) == fin|psh|urg counter drop');
    push('');

    if (allow4) push('            ip saddr @allow4 accept');
    if (allow6) push('            ip6 saddr @allow6 accept');

    push('            icmp type echo-request limit rate 5/second burst 10 packets accept');
    push('            icmp type echo-request counter drop');
    push('            icmpv6 type { echo-request, nd-neighbor-solicit, nd-neighbor-advert, nd-router-solicit, nd-router-advert } accept');
    push('');

    if (localPorts) {
        if (lan4) push(`            ip saddr @lan4 tcp dport { ${localPorts} } accept`);
        if (lan6) push(`            ip6 saddr @lan6 tcp dport { ${localPorts} } accept`);
    }

    if (config.wireguardPort > 0) {
        push(`            udp dport ${config.wireguardPort} accept`);
    }

    if (publicPorts) {
        push('');
        push(`            tcp dport { ${publicPorts} } ct state new add @conncount4 { ip saddr ct count over ${config.connectionsPerSource} } counter drop`);
        push(`            tcp dport { ${publicPorts} } ct state new add @conncount6 { ip6 saddr ct count over ${config.connectionsPerSource} } counter drop`);
        push(`            tcp dport { ${publicPorts} } ct state new add @synrate4 { ip saddr limit rate over ${config.newConnectionsPerMinute}/minute burst 20 packets } counter drop`);
        push(`            tcp dport { ${publicPorts} } ct state new add @synrate6 { ip6 saddr limit rate over ${config.newConnectionsPerMinute}/minute burst 20 packets } counter drop`);
        push(`            tcp dport { ${publicPorts} } accept`);
    }

    push('');
    push('            counter drop');
    push('        }');
    push('');
    push('        chain forward {');
    push('            type filter hook forward priority filter; policy drop;');
    push('            counter drop');
    push('        }');
    push('');
    push('        chain output {');
    push('            type filter hook output priority filter; policy accept;');
    push('        }');
    push('    }');
    push('');

    return lines.join('\n');
}
