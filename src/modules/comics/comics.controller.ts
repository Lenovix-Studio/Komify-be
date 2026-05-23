import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';

import { ComicsService } from './comics.service';

@Controller('comics')
export class ComicsController {
  constructor(private readonly comicsService: ComicsService) {}

  @Get(':comicId/chapters/:chapterId')
  async getChapterDetail(
    @Param('comicId') comicId: string,
    @Param('chapterId') chapterId: string,
  ) {
    return this.comicsService.getChapterDetail(comicId, chapterId);
  }

  // API to get chapter details by comic ID
  @Get(':comicId/chapters')
  async getChaptersByComic(@Param('comicId') comicId: string) {
    return this.comicsService.getChaptersByComic(comicId);
  }

  // API to get homepage comics with pagination
  @Get('homepage')
  async getHomepageComics(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.comicsService.getHomepageComics(
      Number(page || 1),
      Number(limit || 10),
    );
  }

  // API to get comic metadata by comic ID
  @Get(':id/metadata')
  async getMetadata(@Param('id') id: string) {
    const data = await this.comicsService.getComicMetadata(id);

    if (!data) {
      throw new NotFoundException('Comic metadata not found');
    }

    return data;
  }
}
