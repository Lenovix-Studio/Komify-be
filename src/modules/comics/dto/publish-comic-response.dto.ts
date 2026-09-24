import { ApiProperty } from '@nestjs/swagger';

export class PublishComicResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
    format: 'uuid',
  })
  comic_id!: string;

  @ApiProperty({ example: '1001' })
  legacy_id!: string;
}
