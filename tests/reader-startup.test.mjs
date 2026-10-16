import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('PDF first-page loading does not wait for metadata or table of contents', async () => {
  let requestedPage;
  const originalPDF = globalThis.pdfjsLib;
  const originalFetch = globalThis.fetch;
  const never = new Promise(() => {});
  globalThis.pdfjsLib = {
    GlobalWorkerOptions: {},
    getDocument: () => ({ promise: Promise.resolve({
      numPages: 20,
      getMetadata: () => never,
      getOutline: () => never,
      getPage: async page => {
        requestedPage = page;
        return { getViewport: () => ({ width: 600, height: 900 }) };
      },
      destroy: async () => {},
    }) }),
  };
  globalThis.fetch = async () => ({ text: async () => '' });
  try {
    const source = (await readFile(new URL('../public/reader/foliate/pdf.js', import.meta.url), 'utf8'))
      .replace("import './vendor/pdfjs/pdf.mjs'", '')
      .replace("new URL(`vendor/pdfjs/${path}`, import.meta.url).toString()", "`https://reader.test/${path}`");
    const { makePDF } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    let timeout;
    const book = await Promise.race([
      makePDF('https://reader.test/book.pdf'),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('First page blocked by metadata')), 1000); }),
    ]).finally(() => clearTimeout(timeout));
    assert.equal(book.sections.length, 20);
    const first = await book.sections[0].load();
    assert.equal(requestedPage, 1);
    assert.ok(first.src.startsWith('blob:'));
    book.sections[0].unload();
    await book.destroy();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalPDF === undefined) delete globalThis.pdfjsLib;
    else globalThis.pdfjsLib = originalPDF;
  }
});
