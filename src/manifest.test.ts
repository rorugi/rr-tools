// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { KnowledgeBaseNamespace, parseManifest } from '@remnote/plugin-sdk';
import manifestText from '../public/manifest.json?raw';

const manifest = JSON.parse(manifestText);
// The host's kb namespace explicitly requires KnowledgeBaseInfo, rather than
// the All scope used for Rem access (public host namespace registration).
function scopedKnowledgeBase(scopes: { type: string; level: string }[]) {
  const call = vi.fn(async () => {
    if (!scopes.some(scope => scope.type === 'KnowledgeBaseInfo' && ['Read', 'ReadCreate', 'ReadCreateModify', 'ReadCreateModifyDelete'].includes(scope.level))) {
      throw new Error("kb.getCurrentKnowledgeBaseData: no KnowledgeBaseInfo scope with Read permission");
    }
    return { _id: 'fixture-kb', name: 'Fixture' };
  });
  return { kb: new KnowledgeBaseNamespace(call), call };
}
it('the release manifest authorizes the SDK knowledge-base lookup with its dedicated read scope', async () => {
  expect(parseManifest(manifest).success).toBe(true);
  const { kb, call } = scopedKnowledgeBase(manifest.requiredScopes);
  await expect(kb.getCurrentKnowledgeBaseData()).resolves.toEqual({ _id: 'fixture-kb', name: 'Fixture' });
  expect(call).toHaveBeenCalledWith('getCurrentKnowledgeBaseData', {}, 'kb');
  expect(manifest.requiredScopes).toContainEqual({ type: 'KnowledgeBaseInfo', level: 'Read' });
});
it('reproduces the missing permission in the previous All-only manifest', async () => {
  const { kb } = scopedKnowledgeBase([{ type: 'All', level: 'ReadCreateModify' }]);
  await expect(kb.getCurrentKnowledgeBaseData()).rejects.toThrow('no KnowledgeBaseInfo scope');
});
