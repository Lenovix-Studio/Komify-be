import * as cheerio from 'cheerio';

export interface ExtractedMetadata {
  title: string;
  alternative_title: string;
  parodies: string[];
  characters: string[];
  tags: string[];
  artists: string[];
  groups: string[];
}

export class NhentaiExtractor {
  extract(html: string): ExtractedMetadata {
    const $ = cheerio.load(html);
    const result: ExtractedMetadata = {
      title: '',
      alternative_title: '',
      parodies: [],
      characters: [],
      tags: [],
      artists: [],
      groups: [],
    };

    // =========================
    // TITLE
    // =========================
    const beforeTitle = $('h1.title .before').text().trim();
    const prettyTitle = $('h1.title .pretty').text().trim();
    const afterText = $('h1.title .after').text().trim();
    const parodyMatch = afterText.match(/\([^)]+\)/);

    result.title = [beforeTitle, prettyTitle, parodyMatch?.[0]]
      .filter(Boolean)
      .join(' ')
      .trim();
    result.alternative_title = $('h2.title').text().trim();

    // =========================
    // TAG CONTAINERS
    // =========================
    $('.tag-container').each((_, element) => {
      const container = $(element);
      const rawLabel = container
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim()
        .replace(':', '')
        .toLowerCase();
      const values: string[] = [];

      container.find('.name').each((_, tag) => {
        const value = $(tag).text().trim();
        if (value) {
          values.push(value);
        }
      });

      switch (rawLabel) {
        case 'parodies':
          result.parodies = values;
          break;

        case 'characters':
          result.characters = values;
          break;

        case 'tags':
          result.tags = values;
          break;

        case 'artists':
          result.artists = values;
          break;

        case 'groups':
          result.groups = values;
          break;
      }
    });
    return result;
  }
}
