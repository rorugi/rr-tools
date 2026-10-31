import { expect, it } from 'vitest';
import pkg from '../package.json';
import manifest from '../public/manifest.json';
import { VERSION } from './version';

it('keeps the handshake version equal to package.json and the manifest', () => {
  expect(VERSION).toBe(pkg.version);
  expect(VERSION).toBe(`${manifest.version.major}.${manifest.version.minor}.${manifest.version.patch}`);
});
