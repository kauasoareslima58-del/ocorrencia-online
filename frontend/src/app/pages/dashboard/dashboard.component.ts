import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DashboardMonthPoint, DashboardStats, OccurrenceStatus } from '../../core/models';
import { formatDate, formatDateTime, formatDurationHours, priorityLabel, statusLabel } from '../../core/view-helpers';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  stats: DashboardStats | null = null;
  loading = true;
  refreshing = false;
  error = '';

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly statusLabel = statusLabel;
  readonly priorityLabel = priorityLabel;
  readonly formatDate = formatDate;
  readonly formatDateTime = formatDateTime;
  readonly formatDurationHours = formatDurationHours;

  ngOnInit(): void {
    this.load(false);
    this.refreshTimer = setInterval(() => this.load(true), 60000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  load(silent = false): void {
    if (silent) {
      this.refreshing = true;
    } else {
      this.loading = true;
      this.error = '';
    }

    this.api.getDashboard().subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
        this.refreshing = false;
      },
      error: () => {
        if (!silent) {
          this.error = 'Não foi possível carregar os indicadores do banco de dados.';
        }
        this.loading = false;
        this.refreshing = false;
      }
    });
  }

  get maxMonthTotal(): number {
    if (!this.stats?.byMonth?.length) return 1;
    return Math.max(1, ...this.stats.byMonth.map((m) => m.total));
  }

  monthBarHeight(total: number): number {
    if (total <= 0) return 4;
    return Math.max(10, Math.round((total / this.maxMonthTotal) * 100));
  }

  monthQueryParams(point: DashboardMonthPoint): Record<string, string> {
    const [yearStr, monthStr] = point.month.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const lastDay = new Date(year, month, 0).getDate();
    return {
      startDate: `${yearStr}-${monthStr}-01`,
      endDate: `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`
    };
  }

  percentOfTotal(value: number): number {
    const total = this.stats?.totals.all ?? 0;
    if (!total) return 0;
    return Math.round((value / total) * 100);
  }

  get monthVariationLabel(): string {
    const perf = this.stats?.performance;
    if (!perf) return 'Sem comparativo';
    if (perf.previousMonthCount === 0) {
      return perf.currentMonthCount > 0 ? 'Novo volume neste mês' : 'Estável em relação ao mês anterior';
    }
    const diff = perf.currentMonthCount - perf.previousMonthCount;
    const pct = Math.round((Math.abs(diff) / perf.previousMonthCount) * 100);
    if (diff === 0) return 'Mesmo volume do mês anterior';
    return diff > 0 ? `+${pct}% vs. mês anterior (${perf.previousMonthCount})` : `-${pct}% vs. mês anterior (${perf.previousMonthCount})`;
  }

  statusClass(status: OccurrenceStatus): string {
    return `status-${status.toLowerCase()}`;
  }
}
