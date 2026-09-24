import { describe, expect, it, vi } from 'vitest';
import dnsPromises from 'node:dns/promises';
import {
  isForbiddenIp,
  isIpInIpv4Cidr,
  isPermanentDeny,
  normalizeIp,
  validateExternalUrl,
} from '../src/common/utils/ssrf-validator.js';

describe('SSRF Validator Unit Tests', () => {
  describe('IPv4 / IPv6 Normalization', () => {
    it('normalizes IPv4-mapped IPv6 addresses', () => {
      expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
      expect(normalizeIp('::ffff:192.168.56.101')).toBe('192.168.56.101');
      expect(normalizeIp('::ffff:169.254.169.254')).toBe('169.254.169.254');
    });

    it('trims whitespace and converts to lowercase', () => {
      expect(normalizeIp('  192.168.1.1  ')).toBe('192.168.1.1');
      expect(normalizeIp(' FE80::1 ')).toBe('fe80::1');
    });
  });

  describe('CIDR Bitwise Matching', () => {
    it('correctly checks if an IPv4 belongs to a CIDR range', () => {
      expect(isIpInIpv4Cidr('192.168.56.101', '192.168.56.0/24')).toBe(true);
      expect(isIpInIpv4Cidr('192.168.56.1', '192.168.56.0/24')).toBe(true);
      expect(isIpInIpv4Cidr('192.168.56.254', '192.168.56.0/24')).toBe(true);

      expect(isIpInIpv4Cidr('192.168.57.1', '192.168.56.0/24')).toBe(false);
      expect(isIpInIpv4Cidr('10.0.0.1', '192.168.56.0/24')).toBe(false);
      expect(isIpInIpv4Cidr('172.16.0.1', '192.168.56.0/24')).toBe(false);
    });

    it('matches single IP CIDR (/32 or without prefix)', () => {
      expect(isIpInIpv4Cidr('192.168.56.101', '192.168.56.101/32')).toBe(true);
      expect(isIpInIpv4Cidr('192.168.56.101', '192.168.56.101')).toBe(true);
      expect(isIpInIpv4Cidr('192.168.56.102', '192.168.56.101')).toBe(false);
    });
  });

  describe('Permanent Deny Priority', () => {
    it('always blocks loopback addresses', () => {
      expect(isPermanentDeny('127.0.0.1')).toBe(true);
      expect(isPermanentDeny('127.100.200.1')).toBe(true);
      expect(isPermanentDeny('::1')).toBe(true);
      expect(isPermanentDeny('::ffff:127.0.0.1')).toBe(true);
    });

    it('always blocks cloud metadata and link-local addresses', () => {
      expect(isPermanentDeny('169.254.169.254')).toBe(true);
      expect(isPermanentDeny('169.254.1.1')).toBe(true);
      expect(isPermanentDeny('fe80::1')).toBe(true);
      expect(isPermanentDeny('::ffff:169.254.169.254')).toBe(true);
    });

    it('always blocks broadcast and multicast addresses', () => {
      expect(isPermanentDeny('0.0.0.0')).toBe(true);
      expect(isPermanentDeny('224.0.0.1')).toBe(true);
      expect(isPermanentDeny('239.255.255.250')).toBe(true);
      expect(isPermanentDeny('240.0.0.1')).toBe(true);
      expect(isPermanentDeny('255.255.255.255')).toBe(true);
      expect(isPermanentDeny('ff02::1')).toBe(true);
    });

    it('permanent deny cannot be bypassed by allowedCidrs or allowPrivate', () => {
      const allowedCidrs = ['127.0.0.0/8', '169.254.0.0/16', '192.168.56.0/24'];
      expect(isForbiddenIp('127.0.0.1', { allowedCidrs, allowPrivate: true })).toBe(true);
      expect(isForbiddenIp('169.254.169.254', { allowedCidrs, allowPrivate: true })).toBe(true);
      expect(isForbiddenIp('::1', { allowedCidrs, allowPrivate: true })).toBe(true);
      expect(isForbiddenIp('0.0.0.0', { allowedCidrs, allowPrivate: true })).toBe(true);
    });
  });

  describe('Policy Hierarchy (Allowed CIDR vs RFC1918 vs Public)', () => {
    const labCidrs = ['192.168.56.0/24'];

    it('allows permitted CIDR when allowPrivate is false', () => {
      expect(isForbiddenIp('192.168.56.101', { allowedCidrs: labCidrs, allowPrivate: false })).toBe(false);
      expect(isForbiddenIp('192.168.56.1', { allowedCidrs: labCidrs, allowPrivate: false })).toBe(false);
    });

    it('blocks non-permitted private IP when allowPrivate is false', () => {
      expect(isForbiddenIp('192.168.57.1', { allowedCidrs: labCidrs, allowPrivate: false })).toBe(true);
      expect(isForbiddenIp('10.0.0.1', { allowedCidrs: labCidrs, allowPrivate: false })).toBe(true);
      expect(isForbiddenIp('172.16.0.1', { allowedCidrs: labCidrs, allowPrivate: false })).toBe(true);
    });

    it('allows all RFC1918 when allowPrivate is true', () => {
      expect(isForbiddenIp('192.168.57.1', { allowPrivate: true })).toBe(false);
      expect(isForbiddenIp('10.0.0.1', { allowPrivate: true })).toBe(false);
      expect(isForbiddenIp('172.16.0.1', { allowPrivate: true })).toBe(false);
    });

    it('always allows public internet IP', () => {
      expect(isForbiddenIp('8.8.8.8', { allowPrivate: false })).toBe(false);
      expect(isForbiddenIp('93.184.216.34', { allowPrivate: false })).toBe(false);
    });
  });

  describe('URL Protocol & Format Validation', () => {
    it('rejects unsupported protocols (file, ftp, gopher, javascript, data)', async () => {
      await expect(validateExternalUrl('file:///etc/passwd')).rejects.toThrow('Only http and https protocols are supported');
      await expect(validateExternalUrl('ftp://ftp.example.com')).rejects.toThrow('Only http and https protocols are supported');
      await expect(validateExternalUrl('gopher://gopher.example.com')).rejects.toThrow('Only http and https protocols are supported');
      await expect(validateExternalUrl('data:text/plain;base64,SGVsbG8=')).rejects.toThrow('Only http and https protocols are supported');
    });

    it('rejects malformed URLs', async () => {
      await expect(validateExternalUrl('not-a-valid-url')).rejects.toThrow('The provided URL format is invalid');
      await expect(validateExternalUrl('http://:80')).rejects.toThrow();
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
