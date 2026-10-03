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

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new BadRequestException(
          `Scraper returned non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`,
        );
      }

      if (response.ok && data.success) {
        return data.data;
      }

      throw new BadRequestException(
        data.detail || data.message || 'Failed to extract data from scraper service',
      );
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      console.error('Scraper service error:', error.message);
      throw new BadRequestException(
        error.message || 'Scraper service unavailable',
      );
    }
  }
}
