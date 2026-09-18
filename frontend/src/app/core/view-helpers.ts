import { OccurrenceStatus, Priority, UserRole } from './models';

export function statusLabel(status: OccurrenceStatus): string {
  return ({
    PENDENTE: 'Pendente',
    EM_ANALISE: 'Em análise',
    EM_ACOMPANHAMENTO: 'Em acompanhamento',
    ENCERRADA: 'Encerrada'
  } as const)[status];
}

export function priorityLabel(priority: Priority): string {
  return ({ BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', URGENTE: 'Urgente' } as const)[priority];
}

export function roleLabel(role: UserRole): string {
  return ({ ADMINISTRADOR: 'Administrador', PROFESSOR: 'Professor', ALUNO: 'Aluno' } as const)[role];
}

export function classLabel(className: string): string {
  return className
    .replace(/^(\d)º Ano\s+(.+)$/, '$1º$2')
    .replace(/^(\d)ª Série\s+(.+)$/, '$1º$2');
}

export function formatDate(value: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function formatDateTime(value: string): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
