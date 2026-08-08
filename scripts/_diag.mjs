import { chromium } from 'playwright-core';

const URL = 'http://localhost:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.grid', { timeout: 5000 });
for (const btn of await page.$$('button')) { if ((await btn.textContent())?.includes('＋ 项')) { await btn.click(); break; } }
await page.waitForTimeout(300);
for (const btn of await page.$$('button')) { if ((await btn.textContent())?.includes('＋ 分组')) { await btn.click(); break; } }
await page.waitForTimeout(300);

// 检查 param1 display div 的内联 style
const p1info = await page.evaluate(() => {
  const el = document.querySelector('.cell--display[data-f="param1"]');
  if (!el) return null;
  return {
    inlineStyle: el.getAttribute('style'),
    computedGC: getComputedStyle(el).gridColumn,
    parentGC: getComputedStyle(el.parentElement).gridColumn,
    parentDisplay: getComputedStyle(el.parentElement).display,
  };
});
console.log('Param1 display:', JSON.stringify(p1info));

// 检查 grid 的 display 和子元素
const gridInfo = await page.evaluate(() => {
  const grid = document.querySelector('.grid');
  return {
    display: getComputedStyle(grid).display,
    childCount: grid.children.length,
    // 检查是否有 display:contents 的中间层
    firstChildDisplay: grid.children[0] ? getComputedStyle(grid.children[0]).display : null,
    firstChildTag: grid.children[0]?.tagName,
  };
});
console.log('Grid info:', JSON.stringify(gridInfo));

await browser.close();
