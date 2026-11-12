/** Opus guide: requests become structured, whitelisted actions. Run with `npm test`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respond, actionHref, suggestionsFor, type AssistantContext } from '../src/lib/assistant.ts';

const out: AssistantContext = { path: '/', signedIn: false };
const inn: AssistantContext = { path: '/', signedIn: true };
const go = (text: string, ctx = out) => { const r = respond(text, ctx); return r.action ? actionHref(r.action) : undefined; };

test('people search applies specialty and city filters', () => {
  assert.equal(go('Find producers in Atlanta.'), '/musicians?specialty=producer&city=Atlanta');
  assert.equal(go('find producers in Birmingham'), '/musicians?specialty=producer&city=Birmingham');
  assert.equal(go('I need a mixing engineer in NYC'), '/musicians?specialty=mixing-engineer&city=New+York');
  assert.equal(go('Discover musicians'), '/musicians');
  assert.equal(go('verified singers in London'), '/musicians?specialty=vocalist&verified=1&city=London');
  assert.equal(go('people open to collaborate'), '/musicians?collab=1');
});

test('studios open the studio directory', () => {
  assert.equal(go('Show me recording studios'), '/studios?studio=commercial');
  assert.equal(go('Explore recording studios'), '/studios?studio=commercial');
  assert.equal(go('studios in Nashville'), '/studios?city=Nashville');
  assert.equal(go('home studios'), '/studios?studio=home');
});

test('a city alone uses the clean World address', () => {
  assert.equal(go('Atlanta'), '/world/atlanta');
  assert.equal(go('show me los angeles'), '/world/los-angeles');
});

test('own pages respect sign-in', () => {
  assert.equal(go('Take me to my profile', inn), '/account/profile');
  assert.equal(go('Take me to my profile', out), '/sign-in?next=%2Faccount%2Fprofile');
  assert.equal(respond('Take me to my profile', out).offer, 'Sign in');
  assert.equal(go('Show my releases', inn), '/music');
  assert.equal(go('my connections', inn), '/account/connections');
});

test('verification is explained, with the page offered, not opened', () => {
  const r = respond('How do I get verified?', out);
  assert.match(r.text, /never sold/);
  assert.equal(r.offer, 'Read the criteria');
  assert.equal(actionHref(r.action!), '/verified');
});

test('unsupported things are said plainly, never pretended', () => {
  assert.match(respond('message my producer', inn).text, /not on Opus yet/);
  assert.match(respond('distribute my song to spotify', inn).text, /does not handle/);
  const r = respond('book me a flight', out);
  assert.match(r.text, /can’t do that yet/);
  assert.ok(r.offer, 'falls back to an offered search, not an automatic one');
  assert.equal(go('producers in Tokyo'), '/musicians?specialty=producer&city=Tokyo');
  assert.equal(go('producers in Smallville'), '/musicians?q=smallville&specialty=producer');
});

test('every action resolves to a same-site path', () => {
  const asks = ['producers in atlanta', 'my profile', 'charts', 'collective', 'start a release', 'list my studio', 'sign up', 'world', 'xyz <script>'];
  for (const a of asks) for (const ctx of [out, inn]) {
    const r = respond(a, ctx);
    if (r.action) assert.match(actionHref(r.action), /^\/(?!\/)/);
  }
});

test('suggestions follow the page', () => {
  assert.ok(suggestionsFor('/').includes('Find producers in Birmingham'));
  assert.ok(suggestionsFor('/studios').includes('List my studio'));
  assert.ok(suggestionsFor('/world/atlanta').includes('Producers in Atlanta'));
});
