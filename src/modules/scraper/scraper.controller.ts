import { Body, Controller, Post } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ExtractMetadataDto } from './dto/extract-metadata.dto';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  @Post('metadata')
  async extractMetadata(@Body() dto: ExtractMetadataDto) {
    const data = await this.scraperService.extractMetadata(dto.url);
    return {
      success: true,
      data,
    };
  }
}
