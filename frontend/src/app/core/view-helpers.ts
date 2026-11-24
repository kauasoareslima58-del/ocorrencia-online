import { OccurrenceStatus, Priority, UserRole } from './models';

export function statusLabel(status: OccurrenceStatus): string {
  return ({
    PENDENTE: 'Pendente',
    EM_ANALISE: 'Em análise',
    EM_ACOMPANHAMENTO: 'Em acompanhamento',
    ENCERRADA: 'Encerrada'
  } as const)[status] ?? status;
}

export function priorityLabel(priority: Priority): string {
  return ({
    BAIXA: 'Baixa',
    MEDIA: 'Média',
    ALTA: 'Alta',
    URGENTE: 'Urgente'
  } as const)[priority] ?? priority;
}

export function roleLabel(role: UserRole): string {
  return ({
    ADMINISTRADOR: 'Coordenação',
    PROFESSOR: 'Professor'
  } as const)[role] ?? role;
}

export function classLabel(className: string): string {
  return String(className ?? '').trim();
}

export function formatDate(value: string): string {
  if (!value) return '—';
  const isoDate = value.slice(0, 10);
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(parsed);
}

export function formatDateTime(value: string): string {
  if (!value) return '—';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(parsed);
}

export function todayLocalIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function nowLocalTime(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function isStrongPassword(password: string): boolean {
  return password.length >= 8
    && password.length <= 72
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function formatDurationHours(hours: number | null): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—';
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours % 24);
  return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}
