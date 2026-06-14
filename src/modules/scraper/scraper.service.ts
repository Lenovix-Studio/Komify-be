import { Injectable, BadRequestException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { NhentaiExtractor } from './extractors/nhentai.extractor';
import { ImhentaiExtractor } from './extractors/imhentai.extractor';
import { NhentaicomExtractor } from './extractors/nhentaicom.extractor';

@Injectable()
export class ScraperService {
  async extractMetadata(url: string) {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath:
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1920,1080',
        '--disable-infobars',
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      );
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
      });
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9,id;q=0.8',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      });

      // =========================
      // E-HENTAI COOKIE
      // =========================
      if (url.includes('e-hentai.org')) {
        await page.setCookie({
          name: 'nw',
          value: '1',
          domain: '.e-hentai.org',
        });
      }

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const html = await page.content();

      // =========================
      // NHENTAI
      // =========================
      if (url.includes('nhentai.net')) {
        return new NhentaiExtractor().extract(html);
      }

      // =========================
      // NHENTAI.COM
      // =========================
      if (url.includes('nhentai.com')) {
        return new NhentaicomExtractor().extract(html);
      }

      // =========================
      // IMHENTAI
      // =========================
      if (url.includes('imhentai.xxx')) {
        return new ImhentaiExtractor().extract(html);
      }

      throw new BadRequestException('unsupported source');
    } finally {
      await browser.close();
    }
  }
}
