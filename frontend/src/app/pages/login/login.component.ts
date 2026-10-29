import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  email = '';
  password = '';
  showPassword = false;
  loading = false;
  errorMessage = '';

  submit(): void {
    if (!this.email || !this.password || this.loading) return;
    this.loading = true;
    this.errorMessage = '';
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => void this.router.navigate(['/painel']),
      error: (error: HttpErrorResponse) => {
        this.loading = false;
        this.errorMessage = typeof error.error?.message === 'string'
          ? error.error.message
          : 'Não foi possível acessar o sistema. Verifique se a API está ligada.';
      }
    });
  }

  useDemo(role: 'admin' | 'professor' | 'aluno'): void {
    if (role === 'admin') {
      this.email = 'admin@monsenhor.edu.br';
      this.password = 'Admin@123';
    } else if (role === 'professor') {
      this.email = 'professor@monsenhor.edu.br';
      this.password = 'Professor@123';
    } else {
      this.email = 'aluno@monsenhor.edu.br';
      this.password = 'Aluno@123';
    }
  }
}
