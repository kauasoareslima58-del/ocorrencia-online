import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { roleLabel } from '../core/view-helpers';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  menuOpen = false;
  showPasswordModal = false;
  passwordSaving = false;
  passwordError = '';
  passwordSuccess = '';
  passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };

  readonly roleLabel = roleLabel;

  closeMenu(): void {
    this.menuOpen = false;
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  openPasswordModal(): void {
    this.showPasswordModal = true;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
    this.cdr.markForCheck();
  }

  closePasswordModal(): void {
    this.showPasswordModal = false;
    this.cdr.markForCheck();
  }

  submitPasswordChange(): void {
    if (this.passwordSaving) return;
    if (!this.passwordForm.currentPassword || !this.passwordForm.newPassword) {
      this.passwordError = 'Preencha a senha atual e a nova senha.';
      this.cdr.markForCheck();
      return;
    }
    if (this.passwordForm.newPassword !== this.passwordForm.confirmPassword) {
      this.passwordError = 'A nova senha e a confirmação não coincidem.';
      this.cdr.markForCheck();
      return;
    }
    if (this.passwordForm.newPassword.length < 8) {
      this.passwordError = 'A nova senha deve ter no mínimo 8 caracteres com maiúscula, minúscula, número e símbolo.';
      this.cdr.markForCheck();
      return;
    }

    this.passwordSaving = true;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.cdr.markForCheck();

    this.api.changePassword(this.passwordForm.currentPassword, this.passwordForm.newPassword).subscribe({
      next: (res) => {
        this.passwordSuccess = res.message || 'Senha alterada com sucesso!';
        this.passwordSaving = false;
        this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
        this.cdr.markForCheck();
        setTimeout(() => {
          this.closePasswordModal();
        }, 1500);
      },
      error: (err: HttpErrorResponse) => {
        this.passwordSaving = false;
        this.passwordError = typeof err.error?.message === 'string' ? err.error.message : 'Não foi possível alterar a senha.';
        this.cdr.markForCheck();
      }
    });
  }
}
