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
  email = 'professor@monsenhor.edu.br';
  password = 'Professor@123';
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
}

