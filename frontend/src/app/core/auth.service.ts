import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LoginResponse, User, UserRole } from './models';

const TOKEN_KEY = 'ocorrencia_online_token';
const USER_KEY = 'ocorrencia_online_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly userSubject = new BehaviorSubject<User | null>(this.readUser());
  readonly user$ = this.userSubject.asObservable();

  get currentUser(): User | null {
    return this.userSubject.value;
  }

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap(({ token, user }) => {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        this.userSubject.next(user);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSubject.next(null);
  }

  hasRole(...roles: UserRole[]): boolean {
    return !!this.currentUser && roles.includes(this.currentUser.role);
  }

  private readUser(): User | null {
    try {
      const value = localStorage.getItem(USER_KEY);
      return value ? (JSON.parse(value) as User) : null;
    } catch {
      localStorage.removeItem(USER_KEY);
      return null;
    }
  }
}

