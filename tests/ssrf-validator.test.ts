import { describe, expect, it, vi, beforeEach } from 'vitest';
import dnsPromises from 'node:dns/promises';
import {
  normalizeIp,
  isIpInIpv4Cidr,
  isPermanentDeny,
  isForbiddenIp,
  validateExternalUrl,
} from '../src/common/utils/ssrf-validator.js';

describe('SSRF Validator Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('normalizeIp', () => {
    it('unwraps IPv4-mapped IPv6 address', () => {
      expect(normalizeIp('::ffff:192.168.1.1')).toBe('192.168.1.1');
      expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    });

    it('trims whitespace and converts to lower case', () => {
      expect(normalizeIp('  192.168.1.100  ')).toBe('192.168.1.100');
      expect(normalizeIp(' FE80::1 ')).toBe('fe80::1');
    });
  });

  describe('isIpInIpv4Cidr', () => {
    it('correctly checks if IP belongs to CIDR subnet', () => {
      expect(isIpInIpv4Cidr('192.168.56.101', '192.168.56.0/24')).toBe(true);
      expect(isIpInIpv4Cidr('192.168.56.1', '192.168.56.0/24')).toBe(true);
      expect(isIpInIpv4Cidr('192.168.57.1', '192.168.56.0/24')).toBe(false);
      expect(isIpInIpv4Cidr('10.0.0.1', '10.0.0.0/8')).toBe(true);
      expect(isIpInIpv4Cidr('11.0.0.1', '10.0.0.0/8')).toBe(false);
    });
  });

  describe('isPermanentDeny', () => {
    it('blocks loopback addresses', () => {
      expect(isPermanentDeny('127.0.0.1')).toBe(true);
      expect(isPermanentDeny('127.1.2.3')).toBe(true);
      expect(isPermanentDeny('::1')).toBe(true);
    });

    it('blocks cloud metadata endpoint 169.254.169.254', () => {
      expect(isPermanentDeny('169.254.169.254')).toBe(true);
      expect(isPermanentDeny('169.254.0.1')).toBe(true);
    });

    it('blocks 0.0.0.0, broadcast and multicast', () => {
      expect(isPermanentDeny('0.0.0.0')).toBe(true);
      expect(isPermanentDeny('255.255.255.255')).toBe(true);
      expect(isPermanentDeny('224.0.0.1')).toBe(true);
      expect(isPermanentDeny('240.0.0.1')).toBe(true);
      expect(isPermanentDeny('::')).toBe(true);
      expect(isPermanentDeny('fe80::1')).toBe(true);
      expect(isPermanentDeny('ff02::1')).toBe(true);
    });

    it('does not permanently block normal private or public addresses', () => {
      expect(isPermanentDeny('192.168.56.101')).toBe(false);
      expect(isPermanentDeny('10.0.0.5')).toBe(false);
      expect(isPermanentDeny('8.8.8.8')).toBe(false);
      expect(isPermanentDeny('1.1.1.1')).toBe(false);
    });
  });

  describe('isForbiddenIp Security Policy Hierarchy', () => {
    it('denies permanent addresses even when allowedCidrs includes them', () => {
      expect(isForbiddenIp('127.0.0.1', { allowedCidrs: ['127.0.0.0/8'] })).toBe(true);
      expect(isForbiddenIp('169.254.169.254', { allowedCidrs: ['169.254.0.0/16'] })).toBe(true);
    });

    it('denies permanent addresses even when allowPrivate is true', () => {
      expect(isForbiddenIp('127.0.0.1', { allowPrivate: true })).toBe(true);
      expect(isForbiddenIp('169.254.169.254', { allowPrivate: true })).toBe(true);
    });

    it('allows private IP only if covered by explicit allowedCidrs', () => {
      expect(isForbiddenIp('192.168.56.101', { allowedCidrs: ['192.168.56.0/24'], allowPrivate: false })).toBe(false);
      expect(isForbiddenIp('192.168.1.1', { allowedCidrs: ['192.168.56.0/24'], allowPrivate: false })).toBe(true);
      expect(isForbiddenIp('10.0.0.1', { allowedCidrs: ['192.168.56.0/24'], allowPrivate: false })).toBe(true);
    });

    it('allows public routable IPs', () => {
      expect(isForbiddenIp('93.184.216.34', { allowPrivate: false })).toBe(false);
      expect(isForbiddenIp('8.8.8.8', { allowPrivate: false })).toBe(false);
    });
  });

  describe('validateExternalUrl', () => {
    it('rejects unsupported protocols (file:, ftp:, gopher:)', async () => {
      await expect(validateExternalUrl('file:///etc/passwd')).rejects.toThrow('URL protocol "file:" is not supported');
      await expect(validateExternalUrl('ftp://ftp.example.com')).rejects.toThrow('URL protocol "ftp:" is not supported');
      await expect(validateExternalUrl('gopher://gopher.example.com')).rejects.toThrow('URL protocol "gopher:" is not supported');
    });

    it('rejects malformed URLs', async () => {
      await expect(validateExternalUrl('not-a-valid-url')).rejects.toThrow('The provided URL is not a valid standard URL');
    });

    it('validates port range', async () => {
      await expect(validateExternalUrl('http://example.com:0')).rejects.toThrow('URL port must be a valid number between 1 and 65535');
      await expect(validateExternalUrl('http://example.com:70000')).rejects.toThrow();
    });
  });

  describe('DNS Rebinding & Mixed IP Defense', () => {
    it('rejects hostname if ANY resolved address is prohibited (mixed public + loopback)', async () => {
      vi.spyOn(dnsPromises, 'lookup').mockImplementation(
        (() => Promise.resolve([
          { address: '93.184.216.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ])) as never,
      );

      await expect(validateExternalUrl('http://mixed-evil.example.com')).rejects.toThrow(
        'resolved to prohibited address 127.0.0.1',
      );
    });

    it('rejects hostname if ANY resolved address is prohibited (mixed public + private unallowed)', async () => {
      vi.spyOn(dnsPromises, 'lookup').mockImplementation(
        (() => Promise.resolve([
          { address: '93.184.216.34', family: 4 },
          { address: '10.0.0.1', family: 4 },
        ])) as never,
      );

      await expect(
        validateExternalUrl('http://mixed-private.example.com', { allowPrivate: false }),
      ).rejects.toThrow('resolved to prohibited address 10.0.0.1');
    });

    it('accepts hostname when ALL resolved addresses are permitted', async () => {
      vi.spyOn(dnsPromises, 'lookup').mockImplementation(
        (() => Promise.resolve([
          { address: '93.184.216.34', family: 4 },
          { address: '93.184.216.35', family: 4 },
        ])) as never,
      );

      const result = await validateExternalUrl('http://valid-cdn.example.com');
      expect(result.pinnedIp).toBe('93.184.216.34');
      expect(result.port).toBe(80);
      expect(result.protocol).toBe('http:');
    });
  });
});
