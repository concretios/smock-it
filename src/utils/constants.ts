export const arrayFlags = ['namespaceToExclude', 'outputFormat', 'fieldsToExclude'];

export const languageChoices = [
  { name: 'en', message: 'en', value: 'en', hint: 'English (US)' },
];

export const outputChoices = [
  { name: 'DI', message: 'DI', value: 'di', hint: 'Create records directly into org' },
  { name: 'JSON', message: 'JSON', value: 'json' },
  { name: 'CSV', message: 'CSV', value: 'csv' },
];

export const MOCKAROO_BASE_URL = 'https://api.mockaroo.com/api/generate.json';

export const MOCKAROO_CHUNK_SIZE = 1000

export const MOCKAROO_API_CALLS_PER_DAY = 200 