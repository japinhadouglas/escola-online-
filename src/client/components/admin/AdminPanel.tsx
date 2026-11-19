import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Users, School, ShieldAlert, UserPlus, KeyRound,
  FileSpreadsheet, Plus, RefreshCw, Search, CheckCircle,
} from 'lucide-react';

export const AdminPanel: React.FC = () => {
  const { user, token } = useAuth();

  const [activeTab, setActiveTab] = useState<'users' | 'classes' | 'batch' | 'audit'>('users');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [classesList, setClassesList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [showCreateClassModal, setShowCreateClassModal] = useState(false);
  const [resetPassUser, setResetPassUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');

  const [userName, setUserName] = useState('');
  const [userRA, setUserRA] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('STUDENT');
  const [userClassId, setUserClassId] = useState('');

  const [className, setClassName] = useState('');
  const [classGrade, setClassGrade] = useState('');
  const [classShift, setClassShift] = useState('MANHA');
  const [classCode, setClassCode] = useState('');

  const [batchJson, setBatchJson] = useState(
    JSON.stringify([
      { name: 'Ana Clara Souza', registrationNumber: 'RA202610', role: 'STUDENT', classCode: '8ANO-A' },
      { name: 'Matheus Henrique', registrationNumber: 'RA202611', role: 'STUDENT', classCode: '8ANO-A' },
      { name: 'Profª. Fernanda Lima', registrationNumber: 'PROF03', role: 'TEACHER', classCode: '8ANO-A' },
    ], null, 2)
  );
  const [batchResult, setBatchResult] = useState<string | null>(null);

  const fetchUsers = () => {
    setIsLoading(true);
    fetch('/api/v1/users', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setUsersList(data); })
      .finally(() => setIsLoading(false));
  };

  const fetchClasses = () => {
    fetch('/api/v1/classes', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setClassesList(data); });
  };

  const fetchAudit = () => {
    fetch('/api/v1/audit', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => { if (data.logs) setAuditLogs(data.logs); });
  };

  useEffect(() => {
    if (activeTab === 'users') fetchUsers();
    if (activeTab === 'classes') fetchClasses();
    if (activeTab === 'audit') fetchAudit();
  }, [activeTab]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: userName, registrationNumber: userRA, email: userEmail || undefined, password: userPassword, role: userRole, classId: userClassId || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateUserModal(false);
        setUserName(''); setUserRA(''); setUserEmail(''); setUserPassword('');
        fetchUsers();
      } else {
        alert(data.error || 'Erro ao cadastrar usuário.');
      }
    } catch (err) { console.error(err); }
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: className, grade: classGrade, shift: classShift, code: classCode, year: 2026 }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateClassModal(false);
        setClassName(''); setClassGrade(''); setClassCode('');
        fetchClasses();
      } else {
        alert(data.error || 'Erro ao criar turma.');
      }
    } catch (err) { console.error(err); }
  };

  const handleBatchImport = async () => {
    try {
      const parsed = JSON.parse(batchJson);
      const res = await fetch('/api/v1/users/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ users: parsed }),
      });
      const data = await res.json();
      if (res.ok) { setBatchResult(data.message); fetchUsers(); }
      else { alert(data.error || 'Erro na importação.'); }
    } catch (err: any) { alert(`JSON inválido: ${err.message}`); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPassUser || !newPassword) return;
    try {
      const res = await fetch(`/api/v1/users/${resetPassUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (res.ok) { alert(data.message); setResetPassUser(null); setNewPassword(''); }
      else { alert(data.error); }
    } catch (err) { console.error(err); }
  };

  const filteredUsers = usersList.filter(
    (u) => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.registrationNumber.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="h-12 px-4 flex items-center border-b border-[#1f2023] bg-[#313338] flex-shrink-0">
        <ShieldAlert className="w-5 h-5 text-[#5865F2] mr-2" />
        <span className="font-bold text-sm text-white">Painel Administrativo</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {/* Tabs */}
        <div className="flex border-b border-[#3f4147] gap-1 overflow-x-auto pb-px">
          {([
            { key: 'users' as const, icon: Users, label: 'Usuários', count: usersList.length },
            { key: 'classes' as const, icon: School, label: 'Turmas', count: classesList.length },
            { key: 'batch' as const, icon: FileSpreadsheet, label: 'Importação' },
            { key: 'audit' as const, icon: ShieldAlert, label: 'Auditoria', count: auditLogs.length },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`py-2.5 px-3 font-semibold text-xs flex items-center gap-1.5 border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.key ? 'border-[#5865F2] text-[#5865F2]' : 'border-transparent text-[#949BA4] hover:text-[#dbdee1]'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {activeTab === 'users' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-[#949BA4] absolute left-3 top-2.5" />
                <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Buscar por nome ou RA..."
                  className="w-full pl-9 pr-4 py-2 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-xs text-[#dbdee1] placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              </div>
              <button onClick={fetchUsers} className="p-2 text-[#949BA4] hover:text-white bg-[#1e1f22] rounded-lg" title="Atualizar">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => setShowCreateUserModal(true)} className="py-2 px-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-lg text-xs flex items-center gap-1.5">
                <UserPlus className="w-4 h-4" /> Novo
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#949BA4] uppercase text-[10px] tracking-wider border-b border-[#3f4147]">
                  <tr>
                    <th className="p-2.5">Nome</th>
                    <th className="p-2.5">RA</th>
                    <th className="p-2.5">Perfil</th>
                    <th className="p-2.5">Turmas</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3f4147]/50">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#2b2d31] transition-colors">
                      <td className="p-2.5 font-semibold text-white">{u.name}</td>
                      <td className="p-2.5 text-[#949BA4]">{u.registrationNumber}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'TEACHER' ? 'bg-[#5865F2]/20 text-[#949CF7]' :
                          u.role === 'ADMIN' ? 'bg-[#FEE75C]/20 text-[#F0B232]' :
                          u.role === 'COORDINATOR' ? 'bg-[#ED4245]/20 text-[#F47B67]' :
                          'bg-[#23A559]/20 text-[#57F287]'
                        }`}>{u.role}</span>
                      </td>
                      <td className="p-2.5 text-[#949BA4]">
                        {u.enrollments?.map((e: any) => e.class.name).join(', ') || 'Nenhuma'}
                      </td>
                      <td className="p-2.5"><span className="text-[#23A559] font-semibold text-[11px]">Ativo</span></td>
                      <td className="p-2.5 text-right">
                        <button onClick={() => setResetPassUser(u)} className="p-1.5 bg-[#1e1f22] hover:bg-[#2b2d31] text-[#949BA4] hover:text-white rounded-lg transition-colors" title="Resetar Senha">
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Classes tab */}
        {activeTab === 'classes' && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <button onClick={() => setShowCreateClassModal(true)} className="py-2 px-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-semibold rounded-lg text-xs flex items-center gap-1.5">
                <Plus className="w-4 h-4" /> Nova Turma
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {classesList.map((c) => (
                <div key={c.id} className="bg-[#2b2d31] border border-[#1f2023] rounded-xl p-4 space-y-2 hover:border-[#5865F2]/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#949CF7] bg-[#5865F2]/15 px-2 py-0.5 rounded">{c.grade}</span>
                    <span className="text-[10px] text-[#6d6f78]">Cód: {c.code}</span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{c.name}</h3>
                  <p className="text-[11px] text-[#949BA4]">Turno: {c.shift} • {c.year}</p>
                  <div className="pt-2 border-t border-[#3f4147] flex items-center justify-between text-[11px] text-[#949BA4]">
                    <span>{c.studentCount || 0} alunos</span>
                    <span>{c.channels?.length || 0} canais</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Batch import tab */}
        {activeTab === 'batch' && (
          <div className="bg-[#2b2d31] border border-[#1f2023] rounded-xl p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">Importação em Lote</h3>
              <p className="text-xs text-[#949BA4] mt-1">Cole o JSON com a lista de alunos/professores para importação.</p>
            </div>
            {batchResult && (
              <div className="p-3 bg-[#23A559]/10 border border-[#23A559]/30 rounded-lg text-[#57F287] text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> {batchResult}
              </div>
            )}
            <textarea value={batchJson} onChange={(e) => setBatchJson(e.target.value)} rows={10}
              className="w-full font-mono text-xs p-3 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-[#57F287] focus:outline-none focus:border-[#5865F2]" />
            <button onClick={handleBatchImport} className="py-2.5 px-5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-lg text-xs transition-colors">
              Processar Importação
            </button>
          </div>
        )}

        {/* Audit tab */}
        {activeTab === 'audit' && (
          <div className="bg-[#2b2d31] border border-[#1f2023] rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-white">Auditoria & LGPD</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[#949BA4] uppercase text-[10px] tracking-wider border-b border-[#3f4147]">
                  <tr>
                    <th className="p-2.5">Data/Hora</th>
                    <th className="p-2.5">Usuário</th>
                    <th className="p-2.5">Ação</th>
                    <th className="p-2.5">Recurso</th>
                    <th className="p-2.5">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3f4147]/50 font-mono text-[11px]">
                  {auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#35373c]">
                      <td className="p-2.5 text-[#949BA4]">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="p-2.5 text-white font-semibold">{log.user?.name || 'Sistema'}</td>
                      <td className="p-2.5 text-[#949CF7] font-bold">{log.action}</td>
                      <td className="p-2.5 text-[#949BA4]">{log.resource}</td>
                      <td className="p-2.5 text-[#6d6f78]">{log.ipAddress || '127.0.0.1'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Novo Usuário */}
      {showCreateUserModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#2b2d31] border border-[#1f2023] rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="text-base font-bold text-white">Cadastrar Usuário</h3>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <input type="text" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Nome completo" required className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <input type="text" value={userRA} onChange={(e) => setUserRA(e.target.value)} placeholder="RA / Matrícula" required className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <input type="email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="E-mail (opcional)" className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <input type="password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="Senha" required className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <select value={userRole} onChange={(e) => setUserRole(e.target.value)} className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs focus:outline-none focus:border-[#5865F2]">
                <option value="STUDENT">Aluno</option>
                <option value="TEACHER">Professor</option>
                <option value="COORDINATOR">Coordenador</option>
                <option value="ADMIN">Administrador</option>
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateUserModal(false)} className="flex-1 py-2.5 bg-[#1e1f22] hover:bg-[#35373c] text-[#dbdee1] rounded-lg text-xs font-semibold transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-lg text-xs transition-colors">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nova Turma */}
      {showCreateClassModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#2b2d31] border border-[#1f2023] rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="text-base font-bold text-white">Criar Turma</h3>
            <form onSubmit={handleCreateClass} className="space-y-3">
              <input type="text" value={className} onChange={(e) => setClassName(e.target.value)} placeholder="Nome da turma" required className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <input type="text" value={classGrade} onChange={(e) => setClassGrade(e.target.value)} placeholder="Série / Etapa" required className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <input type="text" value={classCode} onChange={(e) => setClassCode(e.target.value)} placeholder="Código único" required className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <select value={classShift} onChange={(e) => setClassShift(e.target.value)} className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs focus:outline-none focus:border-[#5865F2]">
                <option value="MANHA">Manhã</option>
                <option value="TARDE">Tarde</option>
                <option value="NOITE">Noite</option>
                <option value="INTEGRAL">Integral</option>
              </select>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreateClassModal(false)} className="flex-1 py-2.5 bg-[#1e1f22] hover:bg-[#35373c] text-[#dbdee1] rounded-lg text-xs font-semibold transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-lg text-xs transition-colors">Criar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {resetPassUser && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#2b2d31] border border-[#1f2023] rounded-xl max-w-md w-full p-5 space-y-3">
            <h3 className="text-base font-bold text-white">Redefinir Senha — {resetPassUser.name}</h3>
            <form onSubmit={handleResetPassword} className="space-y-3">
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Nova senha (mín. 6 caracteres)" required className="w-full p-2.5 bg-[#1e1f22] border border-[#1f2023] rounded-lg text-white text-xs placeholder-[#6d6f78] focus:outline-none focus:border-[#5865F2]" />
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setResetPassUser(null); setNewPassword(''); }} className="flex-1 py-2.5 bg-[#1e1f22] hover:bg-[#35373c] text-[#dbdee1] rounded-lg text-xs font-semibold transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-lg text-xs transition-colors">Atualizar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
