import {
  Body,
  Controller,
  Param,
  Put,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ChaptersService } from './chapters.service';

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  // Edit a chapter
  @Put(':chapterId')
  @UseInterceptors(AnyFilesInterceptor())
  async editChapter(
    @Param('chapterId')
    chapterId: string,

    @UploadedFiles()
    files: Array<Express.Multer.File>,

    @Body()
    body: any,
  ) {
    return this.chaptersService.editChapter(chapterId, files, body);
  }
}
