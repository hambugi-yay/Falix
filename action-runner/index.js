// action-runner/index.js
require('dotenv').config();
const puppeteer = require('puppeteer');

(async () => {
  // 기본값: hambugu.falixsrv.me
  const SERVER = process.env.TARGET_SERVER || 'hambugu.falixsrv.me';
  const START_URL = process.env.START_URL || 'https://falixnodes.net/start';
  const HEADLESS = process.env.HEADLESS !== 'false'; // 'false'로 하면 headful로 실행
  const VIEWPORT = { width: 1280, height: 800 };
  const NAV_TIMEOUT = parseInt(process.env.NAV_TIMEOUT || '60000', 10);

  console.log(`Starting falix runner — HEADLESS=${HEADLESS}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    console.log('Navigating to', START_URL);
    await page.goto(START_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    // --- CAPTCHA 시도 클릭 (주의: 자동 우회 아님) ---
    try {
      const frames = page.frames();
      const rcFrame = frames.find(f => /recaptcha|google.com\/recaptcha/.test(f.url()));
      if (rcFrame) {
        const checkbox = await rcFrame.$('#recaptcha-anchor, .recaptcha-checkbox');
        if (checkbox) {
          console.log('Attempting captcha checkbox click (no guarantee)');
          await checkbox.click({ delay: 100 });
        } else {
          console.log('Captcha frame found but checkbox not located.');
        }
      } else {
        console.log('No recaptcha iframe found (site may not use reCAPTCHA)');
      }
    } catch (e) {
      console.log('Captcha click attempt failed:', e.message);
    }

    // 대기 (캡챠 수동 해결 시간 등)
    await page.waitForTimeout(15000);

    // 입력/버튼 셀렉터 (사이트 구조 변경시 수정 필요)
    const inputSelector = '#IP';
    const sendSelector = '#send';

    const inputHandle = await page.$(inputSelector);
    const sendHandle = await page.$(sendSelector);

    if (!inputHandle || !sendHandle) {
      console.log('Input or send button not found. Trying fallback strategies...');

      // fallback: input 요소 탐색 (텍스트 타입 첫 번째 등)
      try {
        const altInput = await page.$('input[type="text"], input[type="search"], input[name*="ip"], input[placeholder*="IP"]');
        if (altInput) {
          await altInput.focus();
          await page.evaluate(el => el.value = '', altInput);
          await page.type(await page.evaluateHandle(el => el.getAttribute('id') || el.getAttribute('name') || '', altInput), SERVER, { delay: 50 }).catch(()=>{});
          // 위의 type fallback은 안전하지 않으므로 아래 직접 evaluate 방식 사용
          await page.evaluate((sel, val) => {
            const el = document.querySelector('input[type="text"], input[type="search"], input[name*="ip"], input[placeholder*="IP"]');
            if (el) el.value = val;
          }, null, SERVER);
          // 시도 버튼 클릭: 일반 버튼 탐색
          const altBtn = await page.$('button[type="submit"], button:contains("Start"), button:contains("Connect"), #send');
          if (altBtn) {
            await altBtn.click();
            console.log('Fallback: filled input and clicked alt button.');
          } else {
            console.log('Fallback button not found.');
          }
        } else {
          console.log('No obvious fallback input found.');
        }
      } catch (e) {
        console.log('Fallback attempt error:', e.message);
      }
    } else {
      // 표준 처리
      await page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.value = ''; }, inputSelector);
      await page.type(inputSelector, SERVER, { delay: 50 });
      await page.waitForTimeout(5000);
      await page.click(sendSelector);
      console.log('Filled server and clicked send (standard selectors).');
    }

    // 약간 대기 후 종료
    await page.waitForTimeout(5000);
    console.log('Run finished at', new Date().toISOString());
  } catch (err) {
    console.error('Error during run:', err);
    process.exitCode = 2;
  } finally {
    await browser.close();
  }
})();