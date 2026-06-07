import { IsNotEmpty, IsUrl } from 'class-validator';

export class ExtractMetadataDto {
  @IsNotEmpty()
  @IsUrl()
  url!: string;
}
