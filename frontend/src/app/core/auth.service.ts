import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResponse, User, UserRole } from './models';

const TOKEN_KEY = 'ocorrencia_online_token';
const USER_KEY = 'ocorrencia_online_user';
const ALLOWED_ROLES: UserRole[] = ['ADMINISTRADOR', 'PROFESSOR'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly userSubject = new BehaviorSubject<User | null>(this.readUser());
  readonly user$ = this.userSubject.asObservable();

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get token(): string | null {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw || this.isTokenExpired(raw)) {
      if (raw) this.clearStorage();
      return null;
    }
    return raw;
  }

  get isAuthenticated(): boolean {
    return Boolean(this.token && this.currentUser);
  }

  login(email: string, password: string) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap(({ token, user }) => {
        if (!ALLOWED_ROLES.includes(user.role)) {
          this.logout();
          return;
        }
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.userSubject.next(user);
      })
    );
  }

  refreshSession() {
    return this.http.get<{ user: User }>(`${environment.apiUrl}/auth/me`).pipe(
      tap(({ user }) => {
        if (user && ALLOWED_ROLES.includes(user.role)) {
          localStorage.setItem(USER_KEY, JSON.stringify(user));
          this.userSubject.next(user);
        } else {
          this.logout();
        }
      })
    );
  }

  updateToken(token: string): void {
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
  }

  logout(): void {
    this.clearStorage();
    this.userSubject.next(null);
  }

  hasRole(...roles: UserRole[]): boolean {
    return !!this.currentUser && roles.includes(this.currentUser.role);
  }

  private clearStorage(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  private isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
      const payload = JSON.parse(atob(padded)) as { exp?: number };
      if (typeof payload.exp !== 'number') return false;
      return Date.now() >= payload.exp * 1000;
    } catch {
      return true;
    }
  }

  private readUser(): User | null {
    try {
      const value = localStorage.getItem(USER_KEY);
      const token = localStorage.getItem(TOKEN_KEY);
      if (!value || !token || this.isTokenExpired(token)) {
        this.clearStorage();
        return null;
      }
      const parsed = JSON.parse(value) as User;
      if (!parsed || !ALLOWED_ROLES.includes(parsed.role)) {
        this.clearStorage();
        return null;
      }
      return parsed;
    } catch {
      this.clearStorage();
      return null;
    }
  }
}
