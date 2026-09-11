import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, Clock, FileText, Shield, Video,
  AlertTriangle, ExternalLink, Trash2, Search, Filter,
  RefreshCw, CheckCircle2, ChevronRight, MessageSquare,
  Activity, ShieldAlert, Sparkles, Inbox, Archive
} from 'lucide-react';
import { notificationAPI } from '../api';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';

export default function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Filters state
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, UNREAD, READ
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const limit = 30;

  // Fetch notifications with react-query
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['notifications', { category: selectedCategory, priority: selectedPriority, status: statusFilter, search: searchQuery, page }],
    queryFn: async () => {
      const params = {
        page,
        limit,
      };
      if (selectedCategory !== 'ALL') params.category = selectedCategory;
      if (selectedPriority !== 'ALL') params.priority = selectedPriority.toLowerCase();
      if (statusFilter !== 'ALL') params.status = statusFilter.toLowerCase();
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await notificationAPI.getAll(params);
      return res.data;
    },
    keepPreviousData: true,
    staleTime: 15000,
  });

  const notifications = data?.data || [];
  const pagination = data?.pagination || { total: 0, page: 1, pages: 1 };
  const unreadCount = data?.unreadCount || 0;

  // Socket listener for real-time notification arrivals
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification) => {
      queryClient.invalidateQueries(['notifications']);
    };

    socket.on('notification:new', handleNewNotification);
    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, queryClient]);

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: (id) => notificationAPI.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    },
    onError: () => toast.error('Failed to mark notification as read'),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationAPI.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      toast.success('All notifications marked as read');
    },
    onError: () => toast.error('Failed to mark all notifications as read'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => notificationAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
      toast.success('Notification removed');
    },
    onError: () => toast.error('Failed to remove notification'),
  });

  const clearReadMutation = useMutation({
    mutationFn: () => notificationAPI.clearRead(),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['notifications']);
      toast.success(res?.data?.message || 'Read notifications cleared');
    },
    onError: () => toast.error('Failed to clear read notifications'),
  });

  // Calculate high level stats from current dataset
  const stats = useMemo(() => {
    let reqCount = 0;
    let deptCount = 0;
    let alertCount = 0;
    notifications.forEach((item) => {
      const type = (item.type || '').toLowerCase();
      if (type.includes('requisition') || type.includes('ticket') || type.includes('footage')) reqCount++;
      else if (type.includes('department') || type.includes('report')) deptCount++;
      else if (type.includes('alert') || type.includes('health') || type.includes('camera')) alertCount++;
    });
    return { reqCount, deptCount, alertCount };
  }, [notifications]);

  const getNotificationIcon = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('requisition') || t.includes('footage')) return <FileText className="w-5 h-5 text-amber-500" />;
    if (t.includes('report') || t.includes('department')) return <MessageSquare className="w-5 h-5 text-blue-500" />;
    if (t.includes('alert') || t.includes('surge') || t.includes('plate')) return <ShieldAlert className="w-5 h-5 text-red-500" />;
    if (t.includes('health') || t.includes('camera')) return <Activity className="w-5 h-5 text-emerald-500" />;
    return <Bell className="w-5 h-5 text-blue-500" />;
  };

  const getPriorityBadge = (priority) => {
    const p = (priority || '').toLowerCase();
    if (p === 'urgent') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
          Urgent
        </span>
      );
    }
    if (p === 'high') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          High
        </span>
      );
    }
    if (p === 'medium') {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          Medium
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400">
        Normal
      </span>
    );
  };

  const handleNotificationClick = (item) => {
    // Mark as read if not already read
    const isUnread = !item.isRead && !item.readBy?.some((r) => r.user === user?._id);
    if (isUnread) {
      markReadMutation.mutate(item._id);
    }

    if (item.actionUrl) {
      navigate(item.actionUrl);
    } else if (item.data?.ticketId) {
      navigate(`/footage-requests?ticket=${item.data.ticketId}`);
    } else if (item.data?.reportId) {
      navigate(`/reports?reportId=${item.data.reportId}`);
    } else if (item.data?.cameraId) {
      navigate(`/gis-map?cam=${item.data.cameraId}`);
    }
  };

  const categories = [
    { key: 'ALL', label: 'All Feeds', icon: Inbox },
    { key: 'requisition', label: 'Footage Requisitions', icon: FileText },
    { key: 'department_report', label: 'Dept Escalations', icon: MessageSquare },
    { key: 'camera_health', label: 'Camera Health', icon: Activity },
    { key: 'security_alert', label: 'Security & ANPR', icon: ShieldAlert },
  ];

  return (
    <div className={`p-4 md:p-6 space-y-6 min-h-screen ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#080c16] text-slate-100'}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold tracking-widest rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 uppercase">
              STATE SURVEILLANCE GRID · NIC GOV
            </span>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-500 text-white animate-pulse">
                {unreadCount} UNREAD
              </span>
            )}
          </div>
          <h1 className={`text-2xl md:text-3xl font-black tracking-tight mt-1 ${isLight ? 'text-slate-900' : 'gradient-text'}`}>
            Notification & Alerts Hub
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Inter-department footage requisitions, administrative escalations, and mission-critical surveillance alerts.
          </p>
        </div>

        {/* Global Hub Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              isLight
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin text-blue-500' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isLoading || unreadCount === 0}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              unreadCount === 0
                ? 'opacity-50 cursor-not-allowed bg-slate-200 text-slate-400 dark:bg-white/5 dark:text-slate-500'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/20'
            }`}
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark All Read</span>
          </button>

          <button
            onClick={() => clearReadMutation.mutate()}
            disabled={clearReadMutation.isLoading}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
              isLight
                ? 'bg-white border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Clear Read</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f172a]/60 border-white/5 shadow-inner'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Unread Alerts</span>
            <div className="p-2 rounded-xl bg-red-500/10 text-red-500">
              <Bell className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl md:text-3xl font-black mt-2 text-red-500">{unreadCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Pending user review</p>
        </div>

        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f172a]/60 border-white/5 shadow-inner'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Footage Requisitions</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl md:text-3xl font-black mt-2 text-amber-500">{stats.reqCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Inter-dept footage requests</p>
        </div>

        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f172a]/60 border-white/5 shadow-inner'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Escalation Reports</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl md:text-3xl font-black mt-2 text-blue-600 dark:text-blue-400">{stats.deptCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Inter-agency escalations</p>
        </div>

        <div className={`p-4 rounded-2xl border transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f172a]/60 border-white/5 shadow-inner'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Surveillance & Health</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl md:text-3xl font-black mt-2 text-emerald-500">{stats.alertCount}</p>
          <p className="text-[11px] text-slate-400 mt-1">Camera feeds & ANPR flags</p>
        </div>
      </div>

      {/* Category Tabs & Filter Controls */}
      <div className={`p-3.5 rounded-2xl border space-y-3 ${
        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f172a]/60 border-white/5'
      }`}>
        {/* Category selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          {categories.map(({ key, label, icon: CatIcon }) => {
            const active = selectedCategory === key;
            return (
              <button
                key={key}
                onClick={() => {
                  setSelectedCategory(key);
                  setPage(1);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 flex items-center gap-2 transition-all ${
                  active
                    ? isLight
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : isLight
                    ? 'text-slate-600 hover:bg-slate-100'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <CatIcon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Toolbar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-2 border-t border-slate-200 dark:border-white/5">
          {/* Search bar */}
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by title, ticket #, camera ID, keyword..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border transition-colors outline-none focus:ring-1 focus:ring-blue-500 ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
                  : 'bg-[#151b2e] border-white/10 text-slate-200 placeholder-slate-500'
              }`}
            />
          </div>

          {/* Status filter */}
          <div className="md:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className={`w-full px-3 py-2 rounded-xl text-xs border transition-colors outline-none cursor-pointer ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-[#151b2e] border-white/10 text-slate-200'
              }`}
            >
              <option value="ALL">All Statuses (Read & Unread)</option>
              <option value="UNREAD">Unread Only</option>
              <option value="READ">Read Only</option>
            </select>
          </div>

          {/* Priority filter */}
          <div className="md:col-span-3">
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value);
                setPage(1);
              }}
              className={`w-full px-3 py-2 rounded-xl text-xs border transition-colors outline-none cursor-pointer ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-[#151b2e] border-white/10 text-slate-200'
              }`}
            >
              <option value="ALL">All Priority Levels</option>
              <option value="URGENT">Urgent Priority</option>
              <option value="HIGH">High Priority</option>
              <option value="MEDIUM">Medium Priority</option>
              <option value="LOW">Low Priority</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className={`p-12 text-center rounded-2xl border ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#0f172a]/40 border-white/5'
          }`}>
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
            <p className="text-xs text-slate-400 font-medium">Synchronizing notification feeds...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className={`p-16 text-center rounded-2xl border ${
            isLight ? 'bg-white border-slate-200' : 'bg-[#0f172a]/40 border-white/5'
          }`}>
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto mb-3">
              <Inbox className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">No Notifications Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              {searchQuery || selectedCategory !== 'ALL' || selectedPriority !== 'ALL' || statusFilter !== 'ALL'
                ? 'No items match your active search filters. Try resetting the filter controls above.'
                : 'You are completely caught up! All department updates and CCTV requisitions have been processed.'}
            </p>
          </div>
        ) : (
          notifications.map((item) => {
            const isUnread = !item.isRead && !item.readBy?.some((r) => r.user === user?._id);
            const timeFormatted = new Date(item.createdAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            });

            return (
              <div
                key={item._id}
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                  isUnread
                    ? isLight
                      ? 'bg-blue-50/70 hover:bg-blue-50 border-blue-200 shadow-sm border-l-4 border-l-blue-600'
                      : 'bg-blue-500/10 hover:bg-blue-500/15 border-blue-500/30 border-l-4 border-l-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                    : isLight
                    ? 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                    : 'bg-[#0f172a]/50 hover:bg-[#0f172a]/80 border-white/5 opacity-90'
                }`}
              >
                {/* Left side: Icon + Content */}
                <div className="flex items-start gap-3.5 flex-1 min-w-0">
                  <div className={`p-2.5 rounded-xl shrink-0 mt-0.5 border ${
                    isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/10'
                  }`}>
                    {getNotificationIcon(item.type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-2 mb-1">
                      <h4 className={`text-sm font-bold truncate ${
                        isUnread ? 'text-blue-600 dark:text-blue-400 font-black' : isLight ? 'text-slate-900' : 'text-slate-200'
                      }`}>
                        {item.title}
                      </h4>
                      {getPriorityBadge(item.priority)}
                      {isUnread && (
                        <span className="text-[10px] font-bold text-blue-500 px-1.5 py-0.2 rounded bg-blue-500/10">
                          NEW
                        </span>
                      )}
                    </div>

                    <p className={`text-xs leading-relaxed mb-2.5 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                      {item.message}
                    </p>

                    {/* Meta info tags */}
                    <div className="flex items-center flex-wrap gap-3 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {timeFormatted}
                      </span>
                      {item.recipientDepartment && (
                        <span className="px-2 py-0.5 rounded bg-slate-500/10 font-mono text-[10px]">
                          Target: {item.recipientDepartment}
                        </span>
                      )}
                      {item.type && (
                        <span className="px-2 py-0.5 rounded bg-slate-500/10 font-mono text-[10px]">
                          Type: {item.type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {(item.actionUrl || item.data?.ticketId || item.data?.cameraId) && (
                    <button
                      onClick={() => handleNotificationClick(item)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-sm"
                      title="Open linked resource"
                    >
                      <span>View Resource</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {isUnread ? (
                    <button
                      onClick={() => markReadMutation.mutate(item._id)}
                      disabled={markReadMutation.isLoading}
                      className={`p-2 rounded-xl text-xs font-semibold transition-colors border ${
                        isLight
                          ? 'bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 border-slate-200'
                          : 'bg-white/5 hover:bg-blue-500/20 text-slate-300 hover:text-blue-400 border-white/10'
                      }`}
                      title="Mark as Read"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="text-slate-400 p-2" title="Already Read">
                      <CheckCheck className="w-4 h-4" />
                    </span>
                  )}

                  <button
                    onClick={() => deleteMutation.mutate(item._id)}
                    disabled={deleteMutation.isLoading}
                    className={`p-2 rounded-xl text-xs font-semibold transition-colors border ${
                      isLight
                        ? 'bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 border-slate-200'
                        : 'bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 border-white/10'
                    }`}
                    title="Delete Notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/5">
          <p className="text-xs text-slate-500">
            Page {pagination.page} of {pagination.pages} ({pagination.total} total notifications)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40 ${
                isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border disabled:opacity-40 ${
                isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
