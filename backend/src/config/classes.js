export const gradeLevels = [
  '6º Ano',
  '7º Ano',
  '8º Ano',
  '9º Ano',
  '1ª Série',
  '2ª Série',
  '3ª Série'
];

export const classSections = ['A', 'B', 'C', 'D'];

export const defaultClassNames = gradeLevels.flatMap((grade) =>
  classSections.map((section) => `${grade} ${section}`)
);

const normalizedClassMap = new Map(
  defaultClassNames.map((name) => [canonicalKey(name), name])
);

function canonicalKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[°ºª]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Normaliza variações comuns de escrita (ex.: "6º ano a", "1ª serie b", "6o Ano A")
 * para o padrão oficial da escola ("6º Ano A", "1ª Série B").
 */
export function normalizeClassName(rawValue) {
  const cleaned = String(rawValue ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';
  if (defaultClassNames.includes(cleaned)) return cleaned;

  const key = canonicalKey(cleaned)
    .replace(/^([6-9])[o]\s+ano\s+([a-d])$/, '$1 ano $2')
    .replace(/^([1-3])[a]\s+serie\s+([a-d])$/, '$1 serie $2');

  return normalizedClassMap.get(key) ?? cleaned;
}

export function isValidClass(className) {
  return defaultClassNames.includes(className);
}
