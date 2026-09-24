import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PublishComicUploadDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'File gambar cover (jpg, png, webp, gif)',
    required: false,
  })
  cover?: any;

  @ApiProperty({
    type: 'string',
    description:
      'JSON string dari PublishComicDocumentDto (metadata, template, status, chapters)',
    example: JSON.stringify({
      template: 'manga',
      status: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      metadata: {
        title: 'One Piece',
        alternative_title: 'Wan Pīsu',
        description: 'Petualangan mencari One Piece',
        tags: 'Action, Adventure, Comedy',
        authors: 'Eiichiro Oda',
      },
      chapters: [
        {
          id: 'ch1',
          main: 1,
          sub: 0,
          title: 'Romance Dawn',
          language: 'id',
          censorship_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
        },
      ],
    }),
  })
  @IsString()
  @IsNotEmpty()
  document!: string;
}
