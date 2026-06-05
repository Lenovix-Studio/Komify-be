import {
  Body,
  Controller,
  Param,
  Put,
  Get,
  Delete,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ChaptersService } from './chapters.service';

@Controller('chapters')
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  // DELETE CHAPTER
  @Delete(':chapterId')
  async deleteChapter(
    @Param('chapterId')
    chapterId: string,
  ) {
    return this.chaptersService.deleteChapter(chapterId);
  }

  // GET CHAPTER DETAILS
  @Get(':chapterId')
  async getChapter(@Param('chapterId') chapterId: string) {
    return this.chaptersService.getChapter(chapterId);
  }

  // EDIT CHAPTER
  @Put(':chapterId')
  @UseInterceptors(AnyFilesInterceptor())
  async editChapter(
    @Param('chapterId')
    chapterId: string,

    @UploadedFiles()
    files: Express.Multer.File[],

    @Body()
    body: any,
  ) {
    return this.chaptersService.editChapter(chapterId, files, body);
  }
}
