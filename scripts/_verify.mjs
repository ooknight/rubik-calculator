import { chromium } from 'playwright-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PE:' + e.message));
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await sleep(500);

// 先点工具栏"＋ 项"增加一个运算项，产生 data-g=1 运算符列
await page.locator('.toolbar button[title="增加一项（运算符 + 项）"]').click();
await sleep(300);

// 1) 长数字输入，验证宽度自适应
const firstInput = page.locator('.cell-input').first();
await firstInput.click();
await page.keyboard.press('Control+A');
await page.keyboard.type('123333333333.00');
await sleep(150);
await page.keyboard.press('Enter');
await sleep(250);
const w1 = await page.evaluate(() => Math.round(document.querySelector('.cell-input').getBoundingClientRect().width));

// 2) 表头运算符点击切换
const opBtn = page.locator('.calc-op-btn[data-g="1"]');
const before = await opBtn.getAttribute('aria-label');
await opBtn.click();
await sleep(150);
const after = await opBtn.getAttribute('aria-label');

// 3) 第一行 param2 输入常量快捷键 'a'（.cell-input 排序：0=param1, 1=param2）
const p2 = page.locator('.cell-input').nth(1);
await p2.click();
await page.keyboard.press('Control+A');
await page.keyboard.type('a');
await sleep(150);
await page.keyboard.press('Enter');
await sleep(250);
const constLen = await page.evaluate(() => document.querySelectorAll('.const-display').length);

console.log(JSON.stringify({
  longInputWidth: w1,
  opBefore: before,
  opAfter: after,
  opToggled: before !== after,
  constCellCount: constLen,
  errors: errs.length ? errs : 'none',
}, null, 2));
await browser.close();
