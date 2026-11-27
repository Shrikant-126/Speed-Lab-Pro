import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractAudits } from '../src/analysis/audits.js';
import { imagePlan, lhReasonCodes, parseLhDims } from '../src/analysis/imagePlan.js';

const lhr = {
  stackPacks: [{ id: 'wordpress', title: 'WordPress', descriptions: { 'unused-css-rules': 'Consider reducing WordPress plugins.' } }],
  categories: {
    performance: {
      auditRefs: [
        { id: 'first-contentful-paint', group: 'metrics' },
        { id: 'image-delivery-insight', group: 'insights' },
        { id: 'network-dependency-tree-insight', group: 'insights' },
        { id: 'font-display-insight', group: 'insights' },
        { id: 'unused-css-rules', group: 'diagnostics' },
        { id: 'broken', group: 'diagnostics' },
      ],
    },
  },
  audits: {
    'first-contentful-paint': { id: 'first-contentful-paint', title: 'FCP', score: 0.5 },
    'image-delivery-insight': {
      id: 'image-delivery-insight', title: 'Improve image delivery', description: 'Reduce image size. [Learn more](https://x.dev)', score: 0, scoreDisplayMode: 'metricSavings',
      displayValue: 'Est savings of 856 KiB', metricSavings: { LCP: 300, FCP: 0 },
      details: { type: 'table', headings: [{ key: 'node', valueType: 'node', label: '' }, { key: 'url', valueType: 'url', label: 'URL', subItemsHeading: { key: 'reason', valueType: 'text' } }, { key: 'wastedBytes', valueType: 'bytes', label: 'Est Savings' }],
        items: [{ entity: { type: 'entity', text: 'site.com' }, node: { type: 'node', selector: 'img.hero', snippet: '<img src="a.webp">', boundingRect: { left: 0, top: 10, width: 300, height: 200 } }, url: 'https://site.com/a.webp', wastedBytes: 1000, subItems: { type: 'subitems', items: [{ reason: 'larger than it needs to be (1361x768) for its displayed dimensions (581x326)', wastedBytes: 900 }] } }] },
    },
    'network-dependency-tree-insight': {
      id: 'network-dependency-tree-insight', title: 'Network dependency tree', score: 0, scoreDisplayMode: 'numeric',
      details: { type: 'list', items: [
        { type: 'list-section', value: { type: 'network-tree', longestChain: { duration: 900 }, chains: { A: { url: 'https://site.com/', navStartToEndTime: 300, transferSize: 5000, isLongest: true, children: { B: { url: 'https://site.com/a.css', navStartToEndTime: 900, transferSize: 4000, isLongest: true, children: {} } } } } } },
        { type: 'list-section', title: 'Preconnected origins', value: { type: 'text', value: 'no origins were preconnected' } },
      ] },
    },
    'font-display-insight': { id: 'font-display-insight', title: 'Font display', score: 1, scoreDisplayMode: 'metricSavings' },
    'unused-css-rules': {
      id: 'unused-css-rules', title: 'Reduce unused CSS', score: 0.5, scoreDisplayMode: 'metricSavings', displayValue: 'Est savings of 107 KiB',
      details: { type: 'opportunity', overallSavingsBytes: 109000, headings: [{ key: 'url', valueType: 'url', label: 'URL' }, { key: 'wastedBytes', valueType: 'bytes', label: 'Est Savings' }], items: [{ url: 'https://site.com/a.css', wastedBytes: 40000, totalBytes: 45000 }] },
    },
    broken: { id: 'broken', title: 'Broken', scoreDisplayMode: 'error' },
  },
};

test('extractAudits groups insights/diagnostics, keeps tables, trees and stack-pack hints', () => {
  const a = extractAudits(lhr);
  assert.deepEqual(a.groups.map((g) => g.key), ['insights', 'diagnostics']);
  const ins = a.groups[0].audits;
  assert.deepEqual(ins.map((x) => x.id), ['image-delivery-insight', 'network-dependency-tree-insight']);
  const img = ins[0];
  assert.equal(img.rating, 'fail');
  assert.deepEqual(img.metricSavings, { LCP: 300 });
  assert.equal(img.details.items[0].entity, 'site.com');
  assert.deepEqual(img.details.items[0].node.rect, { left: 0, top: 10, width: 300, height: 200 });
  assert.equal(img.details.items[0].subItems.items.length, 1);
  assert.equal(img.details.headings[1].sub.key, 'reason');
  const tree = ins[1].details.items[0].value;
  assert.equal(tree.type, 'network-tree');
  assert.equal(tree.chains.A.children.B.url, 'https://site.com/a.css');
  const css = a.groups[1].audits[0];
  assert.equal(css.rating, 'average');
  assert.equal(css.stackPackHint, 'Consider reducing WordPress plugins.');
  assert.ok(a.passed.some((p) => p.id === 'font-display-insight'));
  assert.ok(!JSON.stringify(a).includes('Broken'));
});

test('imagePlan turns Lighthouse reasons into resize/compress steps with target size', () => {
  const reasons = ['This image file is larger than it needs to be (1361x768) for its displayed dimensions (581x326).', "Increasing the image compression factor could improve this image's download size."];
  assert.deepEqual(parseLhDims(reasons), { file: { w: 1361, h: 768 }, displayed: { w: 581, h: 326 } });
  assert.deepEqual(lhReasonCodes(reasons, 'webp').sort(), ['oversized', 'poor-compression']);
  const plan = imagePlan({ url: 'https://x/a.webp', format: 'webp', transferSize: 170000, lighthouse: { wastedBytes: 139000, reasons }, issues: [] }, { strategy: 'mobile' });
  assert.equal(plan.verdict, 'optimize');
  assert.equal(plan.targetWidth, 1017);
  assert.equal(plan.savingsBytes, 139000);
  assert.equal(plan.targetBytes, 31000);
});

test('imagePlan never recommends enlarging an image', () => {
  const plan = imagePlan({ url: 'https://x/a.webp', format: 'webp', transferSize: 59000, natural: { w: 768, h: 513 }, rendered: { w: 651, h: 435 }, recommended: { width: 1140, height: 761 }, lighthouse: { wastedBytes: 34000, reasons: ['Image is larger than its displayed size'] }, issues: ['oversized'] }, { strategy: 'mobile' });
  assert.ok(!plan.steps.some((s) => s.kind === 'resize'));
  assert.equal(plan.targetWidth, null);
  assert.ok(plan.steps.some((s) => s.kind === 'compress'));
});
