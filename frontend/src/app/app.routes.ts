import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/auth.guard';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'painel', loadComponent: () => import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      {
        path: 'nova-ocorrencia',
        canActivate: [roleGuard],
        data: { roles: ['PROFESSOR', 'ADMINISTRADOR'] },
        loadComponent: () => import('./pages/occurrence-form/occurrence-form.component').then((m) => m.OccurrenceFormComponent)
      },
      { path: 'ocorrencias', loadComponent: () => import('./pages/occurrences/occurrences.component').then((m) => m.OccurrencesComponent) },
      { path: 'ocorrencias/:id', loadComponent: () => import('./pages/occurrence-detail/occurrence-detail.component').then((m) => m.OccurrenceDetailComponent) },
      {
        path: 'alunos',
        canActivate: [roleGuard],
        data: { roles: ['PROFESSOR', 'ADMINISTRADOR'] },
        loadComponent: () => import('./pages/students/students.component').then((m) => m.StudentsComponent)
      },
      {
        path: 'auditoria',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR'] },
        loadComponent: () => import('./pages/audit/audit.component').then((m) => m.AuditComponent)
      },
      {
        path: 'professores',
        canActivate: [roleGuard],
        data: { roles: ['ADMINISTRADOR'] },
        loadComponent: () => import('./pages/teachers/teachers.component').then((m) => m.TeachersComponent)
      },
      { path: '', pathMatch: 'full', redirectTo: 'painel' }
    ]
  },
  { path: '**', redirectTo: '' }
];
