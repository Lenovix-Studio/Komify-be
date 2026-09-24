import {
  BadRequestException,
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { SystemService } from './system.service';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StatusResponseDto } from './dto/status-response.dto';
import { CategoryResponseDto } from './dto/category-response.dto';
import { CensorshipResponseDto } from './dto/censorship-response.dto';
import { LanguageResponseDto } from './dto/language-response.dto';

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  // API to get categories
  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mendapatkan daftar kategori komik aktif',
    description:
      'Mengambil seluruh kategori komik yang belum dihapus (soft-delete), diurutkan berdasarkan nama secara alfabetis.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Daftar kategori berhasil diambil',
    type: [CategoryResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Terjadi kesalahan internal pada server',
  })
  async getCategories(): Promise<CategoryResponseDto[]> {
    return this.systemService.getCategories();
  }

  // API to get status
  @Get('statuses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mendapatkan daftar status sistem / komik',
    description:
      'Mengambil seluruh list status yang tersedia di sistem untuk keperluan dropdown/filter.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Berhasil mengambil daftar status',
    type: [StatusResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Terjadi kesalahan pada server saat mengambil data',
  })
  async getStatuses(): Promise<StatusResponseDto[]> {
    return this.systemService.getStatuses();
  }

  // API to get censorships
  @Get('censorships')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mendapatkan daftar status sensor (censorships)',
    description:
      'Mengambil seluruh list status sensor untuk chapter/komik (Censored, Uncensored, dsb).',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Daftar censorship berhasil diambil',
    type: [CensorshipResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Terjadi kesalahan internal pada server',
  })
  async getCensorships(): Promise<CensorshipResponseDto[]> {
    return this.systemService.getCensorships();
  }

  // API to get languages
  @Get('languages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mendapatkan daftar bahasa',
    description:
      'Mengambil seluruh daftar bahasa yang didukung untuk chapter komik.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Daftar bahasa berhasil diambil',
    type: [LanguageResponseDto],
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Terjadi kesalahan internal pada server',
  })
  async getLanguages(): Promise<LanguageResponseDto[]> {
    return this.systemService.getLanguages();
  }

  // Endpoint to reset all data in the database
  @Post('reset-all-data')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset database and physical assets',
    description:
      'Menghapus seluruh baris data database komik & master tags serta membersihkan semua file/folder di STATIC_DIR (dinonaktifkan di production).',
  })
  @ApiResponse({
    status: 200,
    description: 'Database and storage reset successfully',
    schema: {
      example: {
        success: true,
        message:
          'All database data and physical assets have been successfully reset',
        storageCleaned: true,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Operation rejected in production or path error',
  })
  async resetAllData() {
    return this.systemService.resetAllData();
  }

  // Endpoint to import comics from a JSON file
  @Post('import-comics-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './storage/temp/imports',

        filename: (req, file, callback) => {
          const ext = path.extname(file.originalname);

          const filename = `${Date.now()}${ext}`;

          callback(null, filename);
        },
      }),

      limits: {
        fileSize: 100 * 1024 * 1024,
      },

      fileFilter: (req, file, callback) => {
        if (file.mimetype !== 'application/json') {
          return callback(
            new BadRequestException('Only JSON files are allowed'),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async importComicsFile(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    return this.systemService.importComicsFile(file.path);
  }

  // Endpoint to import comics from JSON data
  @Post('import-comics')
  async importComics(@Body() body: unknown) {
    return this.systemService.importComics(body);
  }
}
