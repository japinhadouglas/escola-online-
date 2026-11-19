import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  GraduationCap,
  Menu,
  X,
  Home,
  BookOpen,
  Calendar,
  Bell,
  Shield,
  LogOut,
  Folder,
} from 'lucide-react';

interface MobileNavProps {
  currentView: 'dashboard' | 'class' | 'admin' | 'calendar' | 'notices' | 'files';
  selectedClassId: string | null;
  onNavigate: (view: 'dashboard' | 'class' | 'admin' | 'calendar' | 'notices' | 'files', classId?: string) => void;
  classes: any[];
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentView, selectedClassId, onNavigate, classes }) => {
  const { user, logout } = useAuth();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isAdminOrCoord = user?.role === 'ADMIN' || user?.role === 'COORDINATOR' || user?.role === 'SUPERADMIN';

  const handleItemClick = (view: any, classId?: string) => {
    onNavigate(view, classId);
    setIsDrawerOpen(false);
  };

  return (
    <>
      {/* Barra Superior Mobile (Compatível iPhone / Android) */}
      <header className="lg:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-tr from-brand-600 to-brand-400 rounded-xl flex items-center justify-center shadow-md">
            <GraduationCap className="w-5 h-5 text-slate-950 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="font-extrabold text-xs text-white">ESCOLA ONLINE</h1>
            <p className="text-[10px] text-brand-400 font-medium truncate max-w-[150px]">
              {user?.schoolName || 'Ambiente Escolar'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsDrawerOpen(true)}
          className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-xl"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      {/* Drawer Lateral Mobile */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Conteúdo da Gaveta */}
          <div className="fixed inset-y-0 left-0 w-4/5 max-w-xs bg-slate-900 border-r border-slate-800 p-4 flex flex-col justify-between shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-6 h-6 text-brand-400" />
                  <span className="font-bold text-white text-sm">ESCOLA ONLINE</span>
                </div>
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Links da Gaveta */}
              <nav className="mt-4 space-y-1">
                <button
                  onClick={() => handleItemClick('dashboard')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl text-xs font-semibold"
                >
                  <Home className="w-4 h-4 text-brand-400" />
                  <span>Início</span>
                </button>

                <button
                  onClick={() => handleItemClick('calendar')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl text-xs font-semibold"
                >
                  <Calendar className="w-4 h-4 text-blue-400" />
                  <span>Calendário</span>
                </button>

                <button
                  onClick={() => handleItemClick('notices')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl text-xs font-semibold"
                >
                  <Bell className="w-4 h-4 text-amber-400" />
                  <span>Avisos Gerais</span>
                </button>

                <button
                  onClick={() => handleItemClick('files')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-slate-300 hover:bg-slate-800 rounded-xl text-xs font-semibold"
                >
                  <Folder className="w-4 h-4 text-purple-400" />
                  <span>Arquivos</span>
                </button>

                {isAdminOrCoord && (
                  <button
                    onClick={() => handleItemClick('admin')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl text-xs font-semibold"
                  >
                    <Shield className="w-4 h-4 text-purple-400" />
                    <span>Painel da Escola</span>
                  </button>
                )}
              </nav>

              {/* Lista de Turmas */}
              <div className="mt-6">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-2 px-1">
                  Minhas Turmas
                </span>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {classes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleItemClick('class', c.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        currentView === 'class' && selectedClassId === c.id
                          ? 'bg-brand-500 text-slate-950 font-bold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span className="truncate">{c.name}</span>
                      </div>
                      <span className="text-[10px] opacity-75">{c.shift.slice(0, 1)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Logout Mobile */}
            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  logout();
                  setIsDrawerOpen(false);
                }}
                className="w-full py-2.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair da Conta</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
