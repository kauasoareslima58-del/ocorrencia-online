import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuditLog, DashboardStats, NamedItem, Occurrence, Student, Teacher } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  getDashboard() {
    return this.http.get<DashboardStats>(`${this.base}/dashboard`);
  }

  getOccurrences(filters: Record<string, string> = {}) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params = params.set(key, value);
    });
    return this.http.get<Occurrence[]>(`${this.base}/occurrences`, { params });
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

  getStudents(search = '', className = '') {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (className) params = params.set('className', className);
    return this.http.get<Student[]>(`${this.base}/students`, { params });
  }

  createStudent(payload: object) {
    return this.http.post<Student>(`${this.base}/students`, payload);
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
}

interface OccurrenceUpdateResponse {
  message: string;
}
