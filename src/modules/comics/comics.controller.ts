import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Post,
  UploadedFiles,
  UseInterceptors,
  Body,
  Put,
  Delete,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ComicsService } from './comics.service';
import { CreateChapterDto } from '../chapters/dto/create-chapter.dto';

@Controller('comics')
export class ComicsController {
  constructor(private readonly comicsService: ComicsService) {}

  // API to get a random comic
  @Get('random')
  async getRandomComic() {
    return this.comicsService.getRandomComic();
  }

  // API to get a list of comics with optional filters and pagination
  @Get()
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('language') language?: string,
    @Query('tags') tags?: string,
    @Query('parodies') parodies?: string,
    @Query('characters') characters?: string,
    @Query('artists') artists?: string,
    @Query('groups') groups?: string,
    @Query('authors') authors?: string,
    @Query('sort') sort?: string,
  ) {
    return this.comicsService.findAll({
      page: Number(page || 1),
      limit: Number(limit || 20),
      q,
      category,
      status,
      language,
      tags: tags ? tags.split(',').map((x) => x.trim()) : [],
      parodies: parodies ? parodies.split(',').map((x) => x.trim()) : [],
      characters: characters ? characters.split(',').map((x) => x.trim()) : [],
      artists: artists ? artists.split(',').map((x) => x.trim()) : [],
      groups: groups ? groups.split(',').map((x) => x.trim()) : [],
      authors: authors ? authors.split(',').map((x) => x.trim()) : [],
      sort,
    });
  }

  // API to delete a comic by ID
  @Delete(':comicId')
  async deleteComic(@Param('comicId') comicId: string) {
    return this.comicsService.deleteComic(comicId);
  }

  // API to create a new chapter for a comic
  @Post(':comicId/chapters')
  @UseInterceptors(AnyFilesInterceptor())
  async createChapter(
    @Param('comicId') comicId: string,

    @UploadedFiles()
    files: Express.Multer.File[],

    @Body('metadata')
    metadata: string,
  ) {
    let dto: CreateChapterDto;
    try {
      dto = JSON.parse(metadata);
    } catch {
      throw new BadRequestException('invalid metadata json');
    }

    return this.comicsService.createChapter(comicId, dto, files);
  }

  // API to edit an existing comic
  @Put(':comicId')
  @UseInterceptors(FileInterceptor('cover'))
  async editComic(
    @Param('comicId') comicId: string,

    @UploadedFile()
    cover: Express.Multer.File,

    @Body()
    body: any,
  ) {
    const files = cover ? [cover] : [];

    return this.comicsService.editComic(comicId, files, body);
  }

  // API to publish a comic
  @Post('publish')
  @UseInterceptors(AnyFilesInterceptor())
  async publishComic(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: any,
  ) {
    return this.comicsService.publishComic(files, body);
  }

  // API to get chapter details by comic ID and chapter ID
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
