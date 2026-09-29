import { IsNotEmpty, IsUrl, IsOptional, IsString } from 'class-validator';

export class ExtractMetadataDto {
  @IsNotEmpty()
  @IsUrl()
  url!: string;

  @IsOptional()
  @IsString()
  scraperCode?: string;
}
