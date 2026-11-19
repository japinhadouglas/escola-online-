import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GraduationCap,
  Home,
  BookOpen,
  Calendar,
  Bell,
  Folder,
  Shield,
  LogOut,
  ChevronRight,
  School,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  currentView: 'dashboard' | 'class' | 'admin' | 'calendar' | 'notices' | 'files';
  selectedClassId: string | null;
  onNavigate: (view: 'dashboard' | 'class' | 'admin' | 'calendar' | 'notices' | 'files', classId?: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, selectedClassId, onNavigate }) => {
  const { user, token, logout } = useAuth();
  const [classes, setClasses] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/classes', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setClasses(data);
      })
      .catch((err) => console.error(err));
  }, [token]);

  const isAdminOrCoord = user?.role === 'ADMIN' || user?.role === 'COORDINATOR' || user?.role === 'SUPERADMIN';

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/20 flex-shrink-0">
          <GraduationCap className="w-6 h-6 text-slate-950 stroke-[2.2]" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-extrabold text-sm text-white tracking-tight truncate">ESCOLA ONLINE</h1>
          <p className="text-[10px] text-brand-400 font-semibold truncate">
            {user?.schoolName || 'Rede Nacional'}
          </p>
        </div>
      </div>

      {/* Navegação Principal */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {/* Seção: Escola */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 block mb-2">
            Escola
          </span>
          <nav className="space-y-1">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'dashboard'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Início</span>
            </button>

            <button
              onClick={() => onNavigate('calendar')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'calendar'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Calendário</span>
            </button>

            <button
              onClick={() => onNavigate('notices')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'notices'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Avisos Gerais</span>
            </button>

            <button
              onClick={() => onNavigate('files')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                currentView === 'files'
                  ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Folder className="w-4 h-4" />
              <span>Arquivos & Materiais</span>
            </button>
          </nav>
        </div>

        {/* Seção: Turmas Digitais */}
        <div>
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Minhas Turmas
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded font-semibold">
              {classes.length}
            </span>
          </div>

          <div className="space-y-1">
            {classes.map((c) => {
              const isSelected = currentView === 'class' && selectedClassId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onNavigate('class', c.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isSelected
                      ? 'bg-brand-500 text-slate-950 font-bold shadow-md shadow-brand-500/20'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <BookOpen className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{c.name}</span>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                      isSelected ? 'bg-slate-900/30 text-slate-950' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {c.shift.slice(0, 1)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seção: Gestão Administrativa */}
        {isAdminOrCoord && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 block mb-2">
              Administração
            </span>
            <nav className="space-y-1">
              <button
                onClick={() => onNavigate('admin')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  currentView === 'admin'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Shield className="w-4 h-4 text-purple-400" />
                <span>Painel da Escola</span>
              </button>
            </nav>
          </div>
        )}
      </div>

      {/* Rodapé: Perfil do Usuário e Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/50">
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 font-bold flex items-center justify-center text-xs">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" />
                ) : (
                  user?.name.slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-900 absolute -bottom-0.5 -right-0.5" />
            </div>

            <div className="min-w-0 truncate">
              <p className="text-xs font-bold text-white truncate">{user?.name}</p>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-semibold inline-block ${
                  user?.role === 'TEACHER'
                    ? 'bg-blue-500/20 text-blue-300'
                    : user?.role === 'ADMIN'
                    ? 'bg-amber-500/20 text-amber-300'
                    : user?.role === 'COORDINATOR'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {user?.role === 'TEACHER'
                  ? 'Professor'
                  : user?.role === 'ADMIN'
                  ? 'Direção'
                  : user?.role === 'COORDINATOR'
                  ? 'Coordenação'
                  : 'Aluno'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
            title="Sair da Plataforma"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
