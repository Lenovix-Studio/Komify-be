import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

class CreateChapterPageDto {
  @IsInt()
  @Min(1)
  page_number!: number;

  @IsString()
  filename!: string;

  @IsString()
  temp_id!: string;
}

export class CreateChapterDto {
  @IsUUID()
  comic_id!: string;

  @IsString()
  title!: string;

  @IsString()
  chapter_number!: string;

  @IsString()
  language_code!: string;

  @IsUUID()
  censorship_id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateChapterPageDto)
  pages!: CreateChapterPageDto[];
}
