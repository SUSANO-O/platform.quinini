import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signRequest, verifySignature, SIGNATURE_MAX_AGE_SEC, SIGNATURE_HEADER } from '../hub-signature';

const SECRET = 'test-secret-at-least-32-chars-long!!';

describe('hub-signature', () => {
  describe('signRequest', () => {
    it('produces a header with t= and sha256= parts', () => {
      const sig = signRequest('{"test":1}', SECRET);
      expect(sig).toMatch(/^t=\d+;sha256=[0-9a-f]{64}$/);
    });

    it('timestamp is close to now', () => {
      const before = Math.floor(Date.now() / 1000);
      const sig = signRequest('body', SECRET);
      const after = Math.floor(Date.now() / 1000);
      const t = parseInt(sig.split(';')[0].split('=')[1], 10);
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(after + 1);
    });

    it('different bodies produce different signatures', () => {
      const s1 = signRequest('body1', SECRET);
      const s2 = signRequest('body2', SECRET);
      const hash1 = s1.split(';sha256=')[1];
      const hash2 = s2.split(';sha256=')[1];
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifySignature', () => {
    it('round-trip: sign then verify returns true', () => {
      const body = JSON.stringify({ agentHubId: 'test-agent' });
      const sig = signRequest(body, SECRET);
      expect(verifySignature(body, sig, SECRET)).toBe(true);
    });

    it('returns false for wrong secret', () => {
      const body = '{"test":1}';
      const sig = signRequest(body, SECRET);
      expect(verifySignature(body, sig, 'wrong-secret')).toBe(false);
    });

    it('returns false for tampered body', () => {
      const body = '{"agentHubId":"original"}';
      const sig = signRequest(body, SECRET);
      expect(verifySignature('{"agentHubId":"tampered"}', sig, SECRET)).toBe(false);
    });

    it('returns false for expired signature (age > 5 minutes)', () => {
      const body = 'test body';
      const pastTs = Math.floor(Date.now() / 1000) - SIGNATURE_MAX_AGE_SEC - 1;
      // Build a valid HMAC for the past timestamp manually
      const crypto = require('crypto');
      const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
      const hmac = crypto.createHmac('sha256', SECRET).update(`${pastTs}.${bodyHash}`).digest('hex');
      const expiredSig = `t=${pastTs};sha256=${hmac}`;
      expect(verifySignature(body, expiredSig, SECRET)).toBe(false);
    });

    it('returns false for future timestamp (clock skew attack)', () => {
      const body = 'body';
      const futureTs = Math.floor(Date.now() / 1000) + SIGNATURE_MAX_AGE_SEC + 60;
      const crypto = require('crypto');
      const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
      const hmac = crypto.createHmac('sha256', SECRET).update(`${futureTs}.${bodyHash}`).digest('hex');
      const futureSig = `t=${futureTs};sha256=${hmac}`;
      expect(verifySignature(body, futureSig, SECRET)).toBe(false);
    });

    it('returns false for empty signature', () => {
      expect(verifySignature('body', '', SECRET)).toBe(false);
    });

    it('returns false for missing sha256 part', () => {
      const t = Math.floor(Date.now() / 1000);
      expect(verifySignature('body', `t=${t}`, SECRET)).toBe(false);
    });

    it('returns false for empty secret', () => {
      const body = 'body';
      const sig = signRequest(body, SECRET);
      expect(verifySignature(body, sig, '')).toBe(false);
    });

    it('SIGNATURE_HEADER constant is correct', () => {
      expect(SIGNATURE_HEADER).toBe('X-Landing-Signature');
    });
  });
});
