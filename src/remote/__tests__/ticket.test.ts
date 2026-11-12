import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { decodeTicket, isSocketAddress } from '../ticket';

// Produced by the desktop's own `PairingTicket::encode` (synthetic keys).
const link = readFileSync(join(__dirname, 'fixtures/pairing-link.txt'), 'utf8').trim();

describe('pairing ticket', () => {
  it('decodes a link produced by the desktop encoder', () => {
    expect(decodeTicket(link)).toEqual({
      version: 1,
      address: {
        device: '01'.repeat(32),
        relay: 'https://euw1-1.relay.n0.iroh.link./',
        addrs: ['192.168.1.20:51234', '[fe80::1]:51234'],
      },
      secret: '02'.repeat(32),
    });
  });

  it('rejects everything the desktop decoder rejects', () => {
    const payload = (ticket: unknown) => `sovra://remote-control?ticket=${encodeURIComponent(JSON.stringify(ticket))}`;
    const good = decodeTicket(link)!;
    const bad = [
      `${link}&extra=x`,
      `${link}#fragment`,
      link.replace('sovra:', 'https:'),
      link.replace('remote-control', 'remote-control/x'),
      link.replace('ticket=', 'tickets='),
      'x'.repeat(2049),
      payload({ ...good, version: 2 }),
      payload({ ...good, extra: true }),
      payload({ ...good, secret: 'short' }),
      payload({ ...good, address: { ...good.address, relay: 'http://relay.example' } }),
      payload({ ...good, address: { ...good.address, relay: 'https://user@relay.example/' } }),
      payload({ ...good, address: { ...good.address, relay: 'https://relay.example/?q=1' } }),
      payload({ ...good, address: { ...good.address, addrs: ['not an address'] } }),
      payload({ ...good, address: { ...good.address, addrs: Array(17).fill('1.2.3.4:5') } }),
      payload({ ...good, address: { ...good.address, device_id: 'spoof' } }),
    ];
    for (const candidate of bad) expect(decodeTicket(candidate)).toBeNull();
    expect(decodeTicket(payload(good))).toEqual(good);
  });

  it('accepts only real socket addresses', () => {
    expect(isSocketAddress('10.0.0.1:443')).toBe(true);
    expect(isSocketAddress('[2001:db8::1]:443')).toBe(true);
    expect(isSocketAddress('256.0.0.1:443')).toBe(false);
    expect(isSocketAddress('10.0.0.1')).toBe(false);
    expect(isSocketAddress('10.0.0.1:70000')).toBe(false);
    expect(isSocketAddress('host:443')).toBe(false);
  });
});
