export type UserRole = 'ADMINISTRADOR' | 'PROFESSOR' | 'ALUNO';
export type OccurrenceStatus = 'PENDENTE' | 'EM_ANALISE' | 'EM_ACOMPANHAMENTO' | 'ENCERRADA';
export type Priority = 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  studentId?: number | null;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Student {
  id: number;
  registration: string;
  name: string;
  className: string;
  guardianName?: string;
  guardianPhone?: string;
  occurrenceCount?: number;
}

export interface NamedItem {
  id: number;
  name: string;
}

export interface Occurrence {
  id: number;
  protocol: string;
  occurrenceDate: string;
  occurrenceTime: string;
  description: string;
  status: OccurrenceStatus;
  priority: Priority;
  categoryId?: number;
  categoryName: string;
  locationId?: number;
  locationName: string;
  createdBy: number;
  professorName: string;
  students: Student[];
  updates?: OccurrenceUpdate[];
  createdAt: string;
  updatedAt: string;
}

export interface OccurrenceUpdate {
  id: number;
  observation?: string;
  actionTaken?: string;
  previousStatus?: OccurrenceStatus;
  newStatus?: OccurrenceStatus;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
}

export interface DashboardStats {
  totals: { all: number; pending: number; analysis: number; monitoring: number; closed: number };
  byCategory: Array<{ name: string; total: number }>;
  recent: Occurrence[];
}

export interface AuditLog {
  id: number;
  action: string;
  entity: string;
  entityId: number | null;
  details: string | null;
  userName: string;
  userRole: UserRole;
  createdAt: string;
}

export interface Teacher {
  id: number;
  name: string;
  email: string;
  active: boolean | number;
  occurrenceCount: number;
  createdAt: string;
}
