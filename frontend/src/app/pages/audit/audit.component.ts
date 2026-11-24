import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuditLog } from '../../core/models';
import { formatDateTime, roleLabel } from '../../core/view-helpers';

const DETAIL_KEY_LABELS: Record<string, string> = {
  protocol: 'Protocolo',
  status: 'Status',
  previousStatus: 'Status anterior',
  newStatus: 'Novo status',
  priority: 'Prioridade',
  name: 'Nome',
  email: 'E-mail',
  registration: 'Matrícula',
  className: 'Turma',
  active: 'Ativo',
  action: 'Operação',
  result: 'Resultado',
  reason: 'Motivo',
  changes: 'Alterações',
  processed: 'Processados',
  successCount: 'Novos',
  updatedCount: 'Atualizados',
  duplicateCount: 'Duplicados',
  errorCount: 'Erros'
};

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.scss'
})
export class AuditComponent implements OnInit {
  private readonly api = inject(ApiService);
  logs: AuditLog[] = [];
  loading = true;
  error = '';
  filters = { search: '', action: '', entity: '', startDate: '', endDate: '' };
  readonly formatDateTime = formatDateTime;
  readonly roleLabel = roleLabel;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = '';
    this.api.getAuditLogs(this.filters).subscribe({
      next: (logs) => { this.logs = logs; this.loading = false; },
      error: () => {
        this.error = 'Não foi possível carregar o histórico de auditoria.';
        this.loading = false;
      }
    });
  }

  clearFilters(): void {
    this.filters = { search: '', action: '', entity: '', startDate: '', endDate: '' };
    this.load();
  }

  actionLabel(action: string, entity: string): string {
    if (action === 'LOGIN_FAILED') return 'Tentativa de login negada';
    if (action === 'CREATE' && entity === 'STUDENT') return 'Aluno cadastrado';
    if (action === 'UPDATE' && entity === 'STUDENT') return 'Aluno atualizado';
    if (action === 'CREATE' && entity === 'TEACHER') return 'Professor cadastrado';
    if (action === 'UPDATE' && entity === 'TEACHER') return 'Professor atualizado';
    if (action === 'CREATE' && entity === 'CATEGORY') return 'Categoria criada';
    if (action === 'UPDATE' && entity === 'CATEGORY') return 'Categoria atualizada';
    if (action === 'CREATE' && entity === 'LOCATION') return 'Local criado';
    if (action === 'UPDATE' && entity === 'LOCATION') return 'Local atualizado';
    if (action === 'UPDATE' && entity === 'USER') return 'Senha alterada';
    return ({ LOGIN: 'Login realizado', CREATE: 'Ocorrência criada', UPDATE: 'Ocorrência atualizada' } as Record<string, string>)[action] ?? action;
  }

  formatDetails(raw: string | null): string {
    if (!raw) return '—';
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      return Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => {
          const label = DETAIL_KEY_LABELS[k] ?? k;
          const formatted = Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : String(v);
          return `${label}: ${formatted}`;
        })
        .join(' · ');
    } catch {
      return raw;
    }
  }
}
