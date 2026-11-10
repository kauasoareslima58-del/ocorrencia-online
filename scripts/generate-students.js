import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const gradeLevels = [
  '6º Ano',
  '7º Ano',
  '8º Ano',
  '9º Ano',
  '1ª Série',
  '2ª Série',
  '3ª Série'
];

const classSections = ['A', 'B', 'C', 'D'];

const firstNamesMale = [
  'Lucas', 'Gabriel', 'Matheus', 'Arthur', 'Guilherme', 'Enzo', 'Felipe', 'Rafael',
  'Pedro', 'Gustavo', 'Bernardo', 'Nicolas', 'Samuel', 'Leonardo', 'Thiago', 'Cauã',
  'Vitor', 'Davi', 'Murilo', 'Henrique', 'Eduardo', 'Caio', 'João Pedro', 'Miguel',
  'Daniel', 'Heitor', 'Lorenzo', 'Vinicius', 'Yuri', 'Bruno', 'Bryan', 'Rodrigo',
  'Diego', 'Renan', 'Luiz Felipe', 'Danilo', 'Otávio', 'Igor', 'Breno', 'André'
];

const firstNamesFemale = [
  'Ana Beatriz', 'Julia', 'Sophia', 'Isabella', 'Manuela', 'Laura', 'Luiza', 'Alice',
  'Valentina', 'Helena', 'Giovanna', 'Maria Eduarda', 'Beatriz', 'Lara', 'Mariana',
  'Nicole', 'Rafaela', 'Camila', 'Yasmin', 'Gabriela', 'Clara', 'Larissa', 'Isadora',
  'Lívia', 'Melissa', 'Rebeca', 'Lorena', 'Cecília', 'Letícia', 'Emanuelly', 'Carolina',
  'Bianca', 'Vitória', 'Sarah', 'Stella', 'Amanda', 'Marina', 'Alicia', 'Isabelly', 'Eloá'
];

const lastNames = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira',
  'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes',
  'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nascimento', 'Andrade',
  'Moreira', 'Nunes', 'Marques', 'Machado', 'Mendes', 'Freitas', 'Cardoso', 'Ramos',
  'Gonçalves', 'Santana', 'Teixeira', 'Pinto', 'Castro', 'Cavalcanti', 'Moraes', 'Campos',
  'Barros', 'Melo', 'Tavares', 'Correia', 'Batista', 'Borges', 'Farias', 'Miranda',
  'Dantas', 'Pacheco', 'Guimarães', 'Rezende', 'Pinheiro', 'Bueno', 'Duarte', 'Siqueira'
];

const guardianTitlesMale = ['Carlos', 'Roberto', 'Paulo', 'Antônio', 'Marcos', 'Fernando', 'Ricardo', 'Eduardo', 'José', 'Marcelo', 'Alexandre', 'Luís'];
const guardianTitlesFemale = ['Patrícia', 'Maria', 'Renata', 'Fernanda', 'Sandra', 'Cristina', 'Eliane', 'Juliana', 'Aparecida', 'Cláudia', 'Adriana', 'Luciana'];

// Helper to shuffle or pick randomly deterministically
function createSeededRandom(seed = 1234567) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const random = createSeededRandom(20261104);

function pick(arr) {
  return arr[Math.floor(random() * arr.length)];
}

function generatePhone(classIndex, studentIndex) {
  const prefix = '99' + String(800 + (classIndex % 100)).padStart(3, '0').slice(0, 3);
  const suffix = String(1000 + (studentIndex * 37 + classIndex * 13) % 9000);
  return `(14) ${prefix}-${suffix}`;
}

const students = [];
let regCounter = 1001;

gradeLevels.forEach((grade, gIdx) => {
  classSections.forEach((section, sIdx) => {
    const className = `${grade} ${section}`;
    const classIdx = gIdx * 4 + sIdx;

    for (let i = 1; i <= 20; i++) {
      const isFemale = (i % 2 === 0);
      const firstName = isFemale ? pick(firstNamesFemale) : pick(firstNamesMale);
      const surname1 = pick(lastNames);
      let surname2 = pick(lastNames);
      while (surname2 === surname1) {
        surname2 = pick(lastNames);
      }
      const studentName = `${firstName} ${surname1} ${surname2}`;

      // Guardian
      const guardianIsFemale = random() > 0.45;
      const guardianFirstName = guardianIsFemale ? pick(guardianTitlesFemale) : pick(guardianTitlesMale);
      const guardianLastName = (random() > 0.3) ? surname1 : surname2;
      const guardianName = `${guardianFirstName} ${guardianLastName}`;
      const guardianPhone = generatePhone(classIdx, i);

      // Registration formatted e.g. 20260001 ...
      const registration = `2026${String(regCounter).padStart(4, '0')}`;
      regCounter++;

      students.push({
        registration,
        name: studentName,
        className,
        guardianName,
        guardianPhone
      });
    }
  });
});

console.log(`Gerados ${students.length} alunos (20 alunos para cada uma das ${gradeLevels.length * classSections.length} turmas).`);

// 1. Write CSV with UTF-8 BOM
const csvHeader = 'Matrícula;Nome;Turma;Nome do Responsável;Telefone\r\n';
const csvRows = students.map(s => 
  `"${s.registration}";"${s.name}";"${s.className}";"${s.guardianName}";"${s.guardianPhone}"`
).join('\r\n');

const csvContent = '\uFEFF' + csvHeader + csvRows;
const csvPathRoot = path.join(rootDir, 'alunos_20_por_turma.csv');
const csvPathBackend = path.join(rootDir, 'backend', 'alunos_20_por_turma.csv');

fs.writeFileSync(csvPathRoot, csvContent, 'utf-8');
fs.writeFileSync(csvPathBackend, csvContent, 'utf-8');
console.log(`CSV salvo em:\n  - ${csvPathRoot}\n  - ${csvPathBackend}`);

// 2. Write JSON for backend seed
const dataDir = path.join(rootDir, 'backend', 'src', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const jsContent = `// 560 alunos (20 alunos para cada uma das 28 turmas do 6º Ano à 3ª Série)
export const initialStudents = ${JSON.stringify(students, null, 2)};
`;
const jsPath = path.join(dataDir, 'students-seed.js');
fs.writeFileSync(jsPath, jsContent, 'utf-8');
console.log(`Seed JS salvo em: ${jsPath}`);

