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
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ComicsService } from './comics.service';
import { CreateChapterDto } from '../chapters/dto/create-chapter.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FindComicsQueryDto } from './dto/find-comics-query.dto';
import { ComicPaginationResponseDto } from './dto/comic-list-response.dto';
import { RandomComicResponseDto } from './dto/random-comic-response.dto';
import { PublishComicUploadDto } from './dto/publish-comic.dto';
import { PublishComicResponseDto } from './dto/publish-comic-response.dto';
import { ComicMetadataResponseDto } from './dto/comic-metadata.dto';
import { ComicChaptersResponseDto } from './dto/comic-chapters.dto';

@ApiTags('Comics')
@Controller('comics')
export class ComicsController {
  constructor(private readonly comicsService: ComicsService) {}

  // API to get a random comic
  @Get('random')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mendapatkan satu komik secara acak',
    description:
      'Mengambil satu data komik aktif (tidak terhapus) secara acak untuk fitur rekomendasi/eksplorasi.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Berhasil mendapatkan komik acak',
    type: RandomComicResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Tidak ada data komik yang ditemukan',
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Terjadi kegagalan server saat memproses data',
  })
  async getRandomComic(): Promise<RandomComicResponseDto> {
    return this.comicsService.getRandomComic();
  }

  // API to get a list of comics with optional filters and pagination
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mendapatkan daftar komik (Filter & Pagination)',
    description:
      'Mengambil daftar komik dengan filter teks pencarian, kategori, status, bahasa chapter, dan tag/karakter/artist/author/parodi/group.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Daftar komik beserta pagination berhasil diambil',
    type: ComicPaginationResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Terjadi kegagalan server saat memproses data',
  })
  async findAll(
    @Query() query: FindComicsQueryDto,
  ): Promise<ComicPaginationResponseDto> {
    return this.comicsService.findAll(query);
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
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(AnyFilesInterceptor())
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Mempublikasikan komik baru beserta chapters dan pages',
    description:
      'Endpoint untuk upload komik, memproses cover dan gambar halaman chapter ke WebP, mengekstrak metadata relasi (tags, authors, dsb.), dan menyimpannya secara transaksional.',
  })
  @ApiBody({ type: PublishComicUploadDto })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Komik berhasil dipublikasikan',
    type: PublishComicResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Data payload atau file tidak valid',
  })
  async publishComic(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() body: PublishComicUploadDto,
  ): Promise<PublishComicResponseDto> {
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
  @ApiOperation({
    summary: 'Get chapters by comic ID',
    description:
      'Mengambil seluruh daftar chapter beserta pages, bahasa, dan censorship berdasarkan ID comic.',
  })
  @ApiParam({
    name: 'comicId',
    type: 'string',
    format: 'uuid',
    description: 'UUID comic',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar chapter berhasil diambil',
    type: ComicChaptersResponseDto,
  })
  async getChaptersByComic(
    @Param('comicId', new ParseUUIDPipe()) comicId: string,
  ): Promise<ComicChaptersResponseDto> {
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
      Number(limit || 12),
    );
  }

  // API to get comic metadata by comic ID
  @Get(':id/metadata')
  @ApiOperation({
    summary: 'Get comic metadata by comic ID',
    description:
      'Mengambil informasi lengkap metadata komik (kategori, tag, author, artist, status, dsb)',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'UUID comic',
  })
  @ApiResponse({
    status: 200,
    description: 'Metadata berhasil diambil',
    type: ComicMetadataResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Comic metadata not found',
  })
  async getMetadata(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ComicMetadataResponseDto> {
    const data = await this.comicsService.getComicMetadata(id);

    if (!data) {
      throw new NotFoundException('Comic metadata not found');
    }

    return data;
  }
}
