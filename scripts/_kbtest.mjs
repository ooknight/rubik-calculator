import { chromium } from 'playwright-core';

const exe = process.env.LOCALAPPDATA + '\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe';
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push('[' + m.type() + '] ' + m.text()));
page.on('pageerror', (e) => logs.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/?t=' + Date.now(), { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return a ? `${a.tagName} r=${a.getAttribute('data-r')} g=${a.getAttribute('data-g')} f=${a.getAttribute('data-f')}` : 'none';
});

console.log('初始行数:', await page.locator('tbody tr').count());

// 干净场景：param1 输入 5，按 Enter（最后一行应加行）
await page.locator('tbody tr:nth-child(1) .item-col.num-edit .cell-input').first().click();
await page.keyboard.type('5');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
console.log('param1 Enter 后行数:', await page.locator('tbody tr').count());
console.log('param1 Enter 后焦点:', await active());

console.log('ERRORS:', logs.filter(l => l.includes('PAGEERROR') || l.includes('error')));
await browser.close();
