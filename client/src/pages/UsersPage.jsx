import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import {
  Users, UserPlus, Search, Shield, Filter, CheckCircle2,
  XCircle, Edit2, ShieldAlert, KeyRound, Phone, MapPin, Building,
  X, RefreshCw, Lock, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PERMISSION_DEFINITIONS, ROLE_DEFAULT_PERMISSIONS } from '../utils/permissions';

export default function UsersPage() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'POLICE',
    department: 'Gujarat Police Department',
    designation: 'Sub-Inspector',
    phone: '',
    district: 'Ahmedabad',
    permissions: [...ROLE_DEFAULT_PERMISSIONS.POLICE],
  });

  // Query users
  const { data: usersData, isLoading, refetch } = useQuery({
    queryKey: ['users', { search, role: roleFilter, department: deptFilter }],
    queryFn: () =>
      userAPI
        .getAll({ search, role: roleFilter, department: deptFilter })
        .then((r) => r.data),
  });

  // Create User Mutation
  const createMutation = useMutation({
    mutationFn: (data) => userAPI.create(data),
    onSuccess: () => {
      toast.success('User account created successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to create user');
    },
  });

  // Update User Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => userAPI.update(id, data),
    onSuccess: () => {
      toast.success('User updated successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setModalOpen(false);
      setEditingUser(null);
      resetForm();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to update user');
    },
  });

  // Toggle Status Mutation
  const toggleMutation = useMutation({
    mutationFn: (id) => userAPI.toggleStatus(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'User status updated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to toggle status');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      password: '',
      role: 'POLICE',
      department: 'Gujarat Police Department',
      designation: 'Sub-Inspector',
      phone: '',
      district: 'Ahmedabad',
      permissions: [...ROLE_DEFAULT_PERMISSIONS.POLICE],
    });
  };

  const openCreateModal = () => {
    setEditingUser(null);
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    const existingPermissions = Array.isArray(u.permissions) && u.permissions.length > 0
      ? u.permissions
      : (u.effectivePermissions || ROLE_DEFAULT_PERMISSIONS[u.role] || []);

    setFormData({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      department: u.department || '',
      designation: u.designation || '',
      phone: u.phone || '',
      district: u.district || '',
      permissions: [...existingPermissions],
    });
    setModalOpen(true);
  };

  const togglePermission = (permKey) => {
    setFormData((prev) => {
      const current = prev.permissions || [];
      const updated = current.includes(permKey)
        ? current.filter((k) => k !== permKey)
        : [...current, permKey];
      return { ...prev, permissions: updated };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingUser) {
      updateMutation.mutate({ id: editingUser._id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const usersList = usersData?.data || [];

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              User Management &amp; Role-Based Access Control
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-500 border border-purple-500/30">
              ADMIN ONLY
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage authenticated accounts, security designations, and role clearances across Gujarat state departments.
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-500/25 transition-all cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Create New User</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
      }`}>
        <div className="flex flex-1 items-center gap-3 min-w-[260px]">
          <div className={`relative flex-1 rounded-xl border flex items-center px-3 py-2 ${
            isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/8'
          }`}>
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search user by name, email, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-0 outline-none text-xs w-full text-slate-200 placeholder-slate-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border outline-none ${
              isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-[#0e1322] border-white/10 text-slate-200'
            }`}
          >
            <option value="all">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="POLICE">Police</option>
            <option value="TRAFFIC_POLICE">Traffic Police</option>
          </select>

          <button
            onClick={() => refetch()}
            className={`p-2 rounded-xl border transition-all ${
              isLight ? 'bg-white border-slate-300 hover:bg-slate-50' : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-200'
            }`}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className={`rounded-3xl border overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
      }`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b text-[10px] font-black uppercase tracking-wider ${
                isLight ? 'bg-slate-50/70 border-slate-200 text-slate-500' : 'bg-white/2 border-white/6 text-slate-400'
              }`}>
                <th className="py-3.5 px-5">User</th>
                <th className="py-3.5 px-5">Department &amp; Designation</th>
                <th className="py-3.5 px-5">Assigned Role</th>
                <th className="py-3.5 px-5">Feature Clearances</th>
                <th className="py-3.5 px-5">Contact</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/4'}`}>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">Loading users...</td>
                </tr>
              ) : usersList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">No users found matching query.</td>
                </tr>
              ) : (
                usersList.map((u) => {
                  const effectivePerms = u.effectivePermissions || u.permissions || ROLE_DEFAULT_PERMISSIONS[u.role] || [];
                  return (
                  <tr key={u._id} className="hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors">
                    {/* User Identity */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-white text-xs shrink-0 ${
                          u.role === 'ADMIN'
                            ? 'bg-purple-600 shadow-sm'
                            : u.role === 'TRAFFIC_POLICE'
                            ? 'bg-amber-600 shadow-sm'
                            : 'bg-blue-600 shadow-sm'
                        }`}>
                          {u.name?.charAt(0) || 'U'}
                        </div>
                        <div>
                          <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                            {u.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-mono">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Department & Designation */}
                    <td className="py-3.5 px-5">
                      <p className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {u.department || 'Gujarat Government'}
                      </p>
                      <p className="text-[11px] text-slate-400">{u.designation || 'Officer'} · {u.district || 'State'}</p>
                    </td>

                    {/* Role Badge */}
                    <td className="py-3.5 px-5">
                      <span className={`inline-flex items-center gap-1 font-mono text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                          : u.role === 'TRAFFIC_POLICE'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                      }`}>
                        <Shield className="w-3 h-3" />
                        {u.role}
                      </span>
                    </td>

                    {/* Feature Clearances */}
                    <td className="py-3.5 px-5">
                      {u.role === 'ADMIN' ? (
                        <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          ALL MODULES (FULL COMMAND)
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {effectivePerms.slice(0, 4).map((permKey) => {
                            const def = PERMISSION_DEFINITIONS.find((p) => p.key === permKey);
                            return (
                              <span
                                key={permKey}
                                title={def?.description}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                  ['camera_add', 'bulk_import'].includes(permKey)
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : ['anpr', 'crowd'].includes(permKey)
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                }`}
                              >
                                {def?.label || permKey}
                              </span>
                            );
                          })}
                          {effectivePerms.length > 4 && (
                            <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">
                              +{effectivePerms.length - 4} more
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Contact */}
                    <td className="py-3.5 px-5 font-mono text-[11px] text-slate-400">
                      {u.phone || '—'}
                    </td>

                    {/* Status Toggle */}
                    <td className="py-3.5 px-5">
                      <button
                        onClick={() => toggleMutation.mutate(u._id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer ${
                          u.isActive
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20'
                        }`}
                        title="Click to toggle account active status"
                      >
                        {u.isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        <span>{u.isActive ? 'Active' : 'Deactivated'}</span>
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-5 text-right">
                      <button
                        onClick={() => openEditModal(u)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          isLight
                            ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700'
                            : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                        }`}
                        title="Edit User"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className={`max-w-lg w-full p-6 rounded-3xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#0e1322] border-white/10 text-slate-100'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-white/8">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                <h2 className="text-base font-black">
                  {editingUser ? 'Edit User Credentials' : 'Create New User Account'}
                </h2>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/10 text-white'
                    }`}
                    placeholder="e.g. Inspector Ramesh Shah"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Official Email *</label>
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      editingUser ? 'opacity-60 cursor-not-allowed' : ''
                    } ${isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/10 text-white'}`}
                    placeholder="officer@gujarat.gov.in"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">
                    {editingUser ? 'New Password (leave empty to keep)' : 'Password *'}
                  </label>
                  <input
                    type="password"
                    required={!editingUser}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/10 text-white'
                    }`}
                    placeholder={editingUser ? '••••••••' : 'Min 8 characters'}
                  />
                </div>

                {/* Standardized 3 Roles */}
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">RBAC Role Clearance *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      const defaultPerms = newRole === 'ADMIN'
                        ? PERMISSION_DEFINITIONS.map((p) => p.key)
                        : (ROLE_DEFAULT_PERMISSIONS[newRole] || ROLE_DEFAULT_PERMISSIONS.POLICE);

                      setFormData({
                        ...formData,
                        role: newRole,
                        department:
                          newRole === 'TRAFFIC_POLICE'
                            ? 'Gujarat Traffic Police'
                            : newRole === 'POLICE'
                            ? 'Gujarat Police Department'
                            : 'Gujarat Home Department',
                        permissions: [...defaultPerms],
                      });
                    }}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-[#080c16] border-white/10 text-white'
                    }`}
                  >
                    <option value="ADMIN">Admin (Full System &amp; Statewide Command)</option>
                    <option value="POLICE">Police (Law &amp; Order Operations)</option>
                    <option value="TRAFFIC_POLICE">Traffic Police (Junction &amp; Traffic Command)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Department</label>
                  <input
                    type="text"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/10 text-white'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Designation</label>
                  <input
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/10 text-white'
                    }`}
                    placeholder="e.g. Circle Inspector"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-bold">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/10 text-white'
                    }`}
                    placeholder="+91-79-XXXXXXX"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-bold">District</label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-slate-50 border-slate-300' : 'bg-white/4 border-white/10 text-white'
                    }`}
                    placeholder="Ahmedabad"
                  />
                </div>
              </div>

              {/* Module Permissions & Clearances Matrix */}
              <div className="pt-3 border-t border-slate-200 dark:border-white/8 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className={`block font-bold text-xs ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                      Feature &amp; Module Access Authorities
                    </label>
                    <p className="text-[10px] text-slate-400">
                      Grant or revoke access to tools. Only enabled modules will appear on this user's panel.
                    </p>
                  </div>
                  {formData.role !== 'ADMIN' && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            permissions: PERMISSION_DEFINITIONS.map((p) => p.key),
                          });
                        }}
                        className="text-[10px] font-bold text-blue-500 hover:text-blue-400 underline"
                      >
                        Grant All
                      </button>
                      <span className="text-slate-500 text-[10px]">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            permissions: [...(ROLE_DEFAULT_PERMISSIONS[formData.role] || [])],
                          });
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-slate-300 underline"
                      >
                        Reset to Role
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 custom-sidebar-scrollbar">
                  {PERMISSION_DEFINITIONS.map((perm) => {
                    const isChecked = (formData.permissions || []).includes(perm.key) || formData.role === 'ADMIN';
                    const isDisabled = formData.role === 'ADMIN';
                    return (
                      <label
                        key={perm.key}
                        className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? isLight
                              ? 'bg-blue-50/80 border-blue-300 text-blue-900'
                              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                            : isLight
                            ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-white/3 border-white/6 text-slate-400 hover:bg-white/6'
                        } ${isDisabled ? 'opacity-80 cursor-default' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isDisabled}
                          onChange={() => togglePermission(perm.key)}
                          className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-[11px] leading-tight flex items-center gap-1.5">
                            <span>{perm.label}</span>
                            {['camera_add', 'bulk_import', 'anpr', 'crowd'].includes(perm.key) && (
                              <span className="text-[8px] font-mono px-1 rounded bg-amber-500/20 text-amber-400">
                                KEY
                              </span>
                            )}
                          </div>
                          <p className="text-[9px] text-slate-400 line-clamp-1 mt-0.5">
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-200 dark:border-white/8">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                >
                  {editingUser ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
