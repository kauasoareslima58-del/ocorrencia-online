import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import {
  AuditLog,
  BatchImportResponse,
  DashboardStats,
  NamedItem,
  Occurrence,
  PaginatedResponse,
  Student,
  Teacher
} from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  getDashboard() {
    return this.http.get<DashboardStats>(`${this.base}/dashboard`);
  }

  getOccurrences(filters: Record<string, string | number> = {}) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        params = params.set(key, String(value));
      }
    });
    return this.http.get<PaginatedResponse<Occurrence>>(`${this.base}/occurrences`, { params });
  }

  getOccurrence(id: number) {
    return this.http.get<Occurrence>(`${this.base}/occurrences/${id}`);
  }

  createOccurrence(payload: object) {
    return this.http.post<Occurrence>(`${this.base}/occurrences`, payload);
  }

  updateOccurrence(id: number, payload: object) {
    return this.http.patch<Occurrence>(`${this.base}/occurrences/${id}`, payload);
  }

  addOccurrenceUpdate(id: number, payload: object) {
    return this.http.post<OccurrenceUpdateResponse>(`${this.base}/occurrences/${id}/updates`, payload);
  }

  getStudents(search = '', className = '', includeInactive = false) {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (className) params = params.set('className', className);
    if (includeInactive) params = params.set('includeInactive', 'true');
    return this.http.get<Student[]>(`${this.base}/students`, { params });
  }

  createStudent(payload: object) {
    return this.http.post<Student>(`${this.base}/students`, payload);
  }

  updateStudent(id: number, payload: object) {
    return this.http.patch<Student>(`${this.base}/students/${id}`, payload);
  }

  updateStudentStatus(id: number, active: boolean) {
    return this.http.patch<{ id: number; active: boolean; message: string }>(`${this.base}/students/${id}/status`, { active });
  }

  batchCreateStudents(students: Array<object>) {
    return this.http.post<BatchImportResponse>(`${this.base}/students/batch`, { students });
  }

  getStudentHistory(id: number) {
    return this.http.get<{ student: Student; occurrences: Occurrence[] }>(`${this.base}/students/${id}/history`);
  }

  getMetadata() {
    return this.http.get<{ categories: NamedItem[]; locations: NamedItem[]; classes: string[] }>(`${this.base}/metadata`);
  }

  getAuditLogs() {
    return this.http.get<AuditLog[]>(`${this.base}/audit`);
  }

  getTeachers() {
    return this.http.get<Teacher[]>(`${this.base}/teachers`);
  }

  createTeacher(payload: object) {
    return this.http.post<Teacher>(`${this.base}/teachers`, payload);
  }

  updateTeacherStatus(id: number, active: boolean) {
    return this.http.patch<Teacher>(`${this.base}/teachers/${id}/status`, { active });
  }

  resetTeacherPassword(id: number, newPassword: string) {
    return this.http.post<{ message: string }>(`${this.base}/teachers/${id}/reset-password`, { newPassword });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.post<{ message: string }>(`${this.base}/auth/change-password`, { currentPassword, newPassword });
  }
}

interface OccurrenceUpdateResponse {
  message: string;
}
