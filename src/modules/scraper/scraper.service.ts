import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class ScraperService {
  async extractMetadata(url: string, scraperCode?: string) {
    try {
      const scraperUrl =
        process.env.SCRAPER_URL || 'http://localhost:8000/api/v1/scrape';
      const response = await fetch(scraperUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, scraper_code: scraperCode }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        return data.data;
      }
      throw new BadRequestException(
        data.detail || 'Failed to extract data from scraper service',
      );
    } catch (error: any) {
      console.error('Scraper service error:', error.message);
      throw new BadRequestException(
        error.message || 'Scraper service unavailable',
      );
    }
  }
}
