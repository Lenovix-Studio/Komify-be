import {
  BadRequestException,
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { diskStorage } from 'multer';

import * as path from 'path';

import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

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

  // Endpoint to reset all data in the database
  @Post('reset-all-data')
  async resetAllData() {
    return this.systemService.resetAllData();
  }
}
