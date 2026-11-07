import type { Weather } from '@diary/shared';

export const WEATHER_LABELS: Record<Weather, string> = {
  sunny: '晴れ',
  cloudy: 'くもり',
  rainy: '雨',
  snowy: '雪',
};

export const WEATHER_ICONS: Record<Weather, string> = {
  sunny: '☀',
  cloudy: '☁',
  rainy: '☂',
  snowy: '☃',
};
