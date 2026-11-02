import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription, filter } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { AppNotification } from '../core/models';
import { formatDateTime, priorityLabel, roleLabel, statusLabel } from '../core/view-helpers';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent implements OnInit, OnDestroy {
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

  notificationsOpen = false;
  notifications: AppNotification[] = [];
  unreadCount = 0;
  pendingCount = 0;
  liveAlerts: AppNotification[] = [];
  browserNotificationPermission: NotificationPermission | 'unsupported' = 'unsupported';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private routerSub: Subscription | null = null;
  private knownKeys = new Set<string>();
  private initialLoadDone = false;

  readonly roleLabel = roleLabel;
  readonly priorityLabel = priorityLabel;
  readonly statusLabel = statusLabel;
  readonly formatDateTime = formatDateTime;

  ngOnInit(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.browserNotificationPermission = Notification.permission;
    }

    this.loadNotifications();
    this.pollTimer = setInterval(() => this.loadNotifications(), 12000);

    this.routerSub = this.router.events
      .pipe(filter((ev) => ev instanceof NavigationEnd))
      .subscribe(() => {
        this.notificationsOpen = false;
        this.loadNotifications();
      });
  }

  ngOnDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.routerSub?.unsubscribe();
  }

  loadNotifications(): void {
    if (!this.auth.currentUser) return;
    this.api.getNotifications().subscribe({
      next: (res) => {
        const incoming = res.items || [];

        if (this.initialLoadDone) {
          const brandNew = incoming.filter((item) => !this.knownKeys.has(item.key) && !item.read);
          if (brandNew.length > 0) {
            this.triggerRealtimeAlert(brandNew);
          }
        }

        incoming.forEach((item) => this.knownKeys.add(item.key));
        this.initialLoadDone = true;
        this.notifications = incoming;
        this.unreadCount = res.unreadCount ?? 0;
        this.pendingCount = res.pendingCount ?? 0;
        this.cdr.markForCheck();
      },
      error: () => {
        // Ignore transient polling errors silently
      }
    });
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
    if (this.notificationsOpen) {
      this.loadNotifications();
    }
    this.cdr.markForCheck();
  }

  closeNotifications(): void {
    this.notificationsOpen = false;
    this.cdr.markForCheck();
  }

  openNotification(item: AppNotification): void {
    this.notificationsOpen = false;
    this.dismissLiveAlert(item.key);

    if (!item.read) {
      item.read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.api.markNotificationsRead([item.key]).subscribe();
    }

    void this.router.navigate(['/ocorrencias', item.occurrenceId]);
  }

  markAllAsRead(): void {
    const unreadKeys = this.notifications.filter((n) => !n.read).map((n) => n.key);
    if (!unreadKeys.length) return;

    this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
    this.unreadCount = 0;
    this.liveAlerts = [];
    this.cdr.markForCheck();

    this.api.markNotificationsRead(unreadKeys).subscribe();
  }

  requestBrowserNotifications(): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    Notification.requestPermission().then((perm) => {
      this.browserNotificationPermission = perm;
      this.cdr.markForCheck();
    });
  }

  dismissLiveAlert(key: string): void {
    this.liveAlerts = this.liveAlerts.filter((a) => a.key !== key);
    this.cdr.markForCheck();
  }

  private triggerRealtimeAlert(newItems: AppNotification[]): void {
    this.playNotificationChime();

    for (const item of newItems) {
      this.liveAlerts = [item, ...this.liveAlerts.filter((a) => a.key !== item.key)].slice(0, 3);

      setTimeout(() => {
        this.dismissLiveAlert(item.key);
      }, 10000);

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const browserNotif = new Notification(`🔔 ${item.title}`, {
            body: `${item.message} (${item.protocol})`,
            icon: 'images/logo-monsenhor-bicudo.png'
          });
          browserNotif.onclick = () => {
            window.focus();
            this.openNotification(item);
            browserNotif.close();
          };
        } catch {
          // Ignore browser notification errors
        }
      }
    }
    this.cdr.markForCheck();
  }

  private playNotificationChime(): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch {
      // AudioContext may be blocked until first user interaction
    }
  }

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
