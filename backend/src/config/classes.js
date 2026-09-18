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

export function isValidClass(className) {
  return gradeLevels.some((grade) => {
    if (!className.startsWith(`${grade} `)) return false;
    const section = className.slice(grade.length + 1);
    return classSections.includes(section);
  });
}
