// Optional source-contract check against previously downloaded PUBLIC RemNote bundles.
// Does not connect to a running RemNote instance or use account data.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const dir = process.argv[2];
if (!dir) throw new Error('Pass the directory containing the inspected public rn-*.js files.');
const modules = {};
const storage = new Map([['queueFilteredCardIds', JSON.stringify(['selected-a', 'selected-b'])]]);
const context = vm.createContext({ self: { rspackChunk_remnote_client: { push: entry => Object.assign(modules, entry[1]) } },
  localStorage: { getItem: key => storage.get(key) }, _: { compact: values => values.filter(Boolean) } });
for (const name of ['rn-2448.js', 'rn-52146.js']) vm.runInContext(fs.readFileSync(path.join(dir, name), 'utf8'), context, { timeout: 1000 });
const requireHost = id => ({
  448445: {}, 829117: { h3: 'knowledgeBaseId' },
  849255: { wE: route => () => route, MM: route => route },
  562540: { jsx: (type, props) => ({ type, props }) },
  84004: { Cards: () => ({ findManyAsync: async ids => ids.map(id => ({ _id: id, getRemAsync: async () => ({ _id: id }) })) }), mapCardInterfaceToQueueCardDataOrUndefinedAsync: async card => ({ cardId: card._id }) },
  734637: { rw: { Queue: 'Queue' }, wy: {} }, 228829: { EZ: () => true },
  541948: {}, 470234: {}, 780407: {}, 816542: { X: ids => ids.join(',') },
  934146: { UserDataStore: { queueFilteredFinishedCardIds: () => ({ get: () => [], set: () => {} }) } },
  184040: {}, 26107: { QueueMain: 'Native QueueMain' },
}[id] ?? (() => { throw new Error('Unexpected module dependency: ' + id); })());
requireHost.d = (out, getters, values) => {
  for (const [key, getter] of Object.entries(getters)) Object.defineProperty(out, key, { get: getter });
  Object.assign(out, values);
};
(async () => {
  const routes = {}; modules[317259]({}, routes, requireHost);
  const host = fs.readFileSync(path.join(dir, 'rn-2448.js'), 'utf8');
  assert.ok(host.includes('this.userPluginInfo=n,n.isNative=!1'), 'This inspected host forces restricted execution regardless of the manifest request');
  assert.equal(routes.N$.value, '/filtered_queue/:knowledgeBaseId/all');
  assert.equal(routes.QE.value, '/filtered_queue/:knowledgeBaseId/all_no_srs');
  const exports = {}; modules[631209]({}, exports, requireHost);
  const screen = exports.FilteredQueue({ knowledgeBaseId: 'fake-kb', subQueueAllMode: true, noSRS: true });
  assert.equal(screen.type, 'Native QueueMain');
  assert.equal(screen.props.noSRS, true);
  assert.equal(screen.props.inArticle, undefined);
  assert.deepEqual(Array.from((await screen.props.getCramItems()).cards, card => card.cardId), ['selected-a', 'selected-b']);
  storage.set('queueFilteredCardIds', '[]');
  assert.equal((await screen.props.getCramItems()).cards.length, 0);
  const bootstrap = fs.readFileSync(path.join(dir, 'rn-94626.js'), 'utf8');
  const start = bootstrap.indexOf('name:"Flashcards.allNoSRSQueueFiltered"');
  assert.ok(start > 0 && bootstrap.slice(start, bootstrap.indexOf('name:"Flashcards.queueFiltered"', start)).includes('subQueueAllMode:!0,noSRS:!0'));
  const queue = fs.readFileSync(path.join(dir, 'rn-62504.js'), 'utf8');
  assert.ok(queue.includes('enabled:!this.props.inArticle,location:eQ.cq.QueueBelowTopBar'));
  console.log('PASS public host contract: selected IDs, full queue, no-SRS route, empty guard, timer slot.');
})().catch(error => { console.error(error); process.exitCode = 1; });
