import { Injectable, BadRequestException } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import { NhentaiExtractor } from './extractors/nhentai.extractor';
// import { EhentaiExtractor } from './extractors/ehentai.extractor';
// import { Hentai2ReadExtractor } from './extractors/hentai2read.extractor';

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
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      );
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });
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
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      const html = await page.content();

      // =========================
      // NHENTAI
      // =========================
      if (url.includes('nhentai.net')) {
        return new NhentaiExtractor().extract(html);
      }

      // =========================
      // E-HENTAI
      // =========================
      //   if (url.includes('e-hentai.org')) {
      //     return new EhentaiExtractor().extract(html);
      //   }

      // =========================
      // HENTAI2READ
      // =========================
      //   if (url.includes('hentai2read.com')) {
      //     return new Hentai2ReadExtractor().extract(html);
      //   }

      throw new BadRequestException('unsupported source');
    } finally {
      await browser.close();
    }
  }
}
