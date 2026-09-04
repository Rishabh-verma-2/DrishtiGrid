import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../api';
import useAuthStore from '../../store/authStore';
import useSocketStore from '../../store/socketStore';
import { useThemeStore } from '../../store/themeStore';
import {
  Bell, CheckCheck, Clock, FileText, Shield, Video,
  MessageSquare, AlertTriangle, ExternalLink, X
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Fetch notifications
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationAPI.getAll({ limit: 25 }).then((r) => r.data),
    refetchInterval: 12000,
  });

  const notifications = data?.data || [];
  const unreadCount = data?.unreadCount || 0;

  // Real-time socket listener
  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = (notification) => {
      // Audio or toast alert
      toast(
        (t) => (
          <div
            onClick={() => {
              toast.dismiss(t.id);
              if (notification.actionUrl) navigate(notification.actionUrl);
            }}
            className="cursor-pointer"
          >
            <p className="font-bold text-xs text-blue-400">{notification.title}</p>
            <p className="text-xs text-slate-300 line-clamp-2">{notification.message}</p>
          </div>
        ),
        {
          icon: '🔔',
          duration: 5000,
        }
      );

      // Invalidate queries
      queryClient.invalidateQueries(['notifications']);
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
    };

    socket.on('notification:new', handleNewNotification);

    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket, navigate, queryClient]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Mark single as read
  const markReadMutation = useMutation({
    mutationFn: (id) => notificationAPI.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    },
  });

  // Mark all as read
  const markAllReadMutation = useMutation({
    mutationFn: () => notificationAPI.markAllRead(),
    onSuccess: () => {
      toast.success('All notifications marked as read');
      queryClient.invalidateQueries(['notifications']);
    },
  });

  const handleNotificationClick = (item) => {
    if (!item.isRead) {
      markReadMutation.mutate(item._id);
    }
    setIsOpen(false);
    if (item.actionUrl) {
      navigate(item.actionUrl);
    } else if (item.ticketId) {
      navigate(`/footage-requests?ticket=${item.ticketId}`);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'TICKET_CREATED':
        return <FileText className="w-4 h-4 text-blue-400" />;
      case 'EVIDENCE_UPLOADED':
        return <Video className="w-4 h-4 text-emerald-400" />;
      case 'TICKET_ACCEPTED':
        return <Shield className="w-4 h-4 text-cyan-400" />;
      case 'RESPONSE_ADDED':
        return <MessageSquare className="w-4 h-4 text-purple-400" />;
      case 'TICKET_CLOSED':
        return <CheckCheck className="w-4 h-4 text-slate-400" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Trigger */}
      <button
        onClick={() => setIsOpen((p) => !p)}
        className={`relative p-2 rounded-xl transition-all cursor-pointer ${
          isLight
            ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            : 'text-slate-300 hover:bg-white/5 hover:text-white'
        }`}
        title="Department Notifications & Alerts"
        aria-label="Notifications"
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl shadow-2xl border z-50 overflow-hidden flex flex-col transition-all ${
            isLight
              ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/60'
              : 'bg-[#0f1422] border-white/10 text-slate-100 shadow-black/80'
          }`}
          style={{ maxHeight: '480px' }}
        >
          {/* Header */}
          <div className={`px-4 py-3 border-b flex items-center justify-between shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#151b2e] border-white/5'
          }`}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs uppercase tracking-wider text-blue-500">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  className="text-[11px] font-semibold text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {isLoading ? (
              <div className="p-6 text-center text-xs text-slate-400">Loading alerts...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
                <p className="text-xs font-semibold text-slate-400">No notifications</p>
                <p className="text-[11px] text-slate-500 mt-0.5">You're all caught up with your department</p>
              </div>
            ) : (
              notifications.map((item) => {
                const unread = !item.isRead && !item.readBy?.some((r) => r.user === user?._id);
                return (
                  <div
                    key={item._id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 transition-all cursor-pointer flex gap-3 items-start ${
                      unread
                        ? isLight
                          ? 'bg-blue-50/60 hover:bg-blue-50 border-l-3 border-blue-600'
                          : 'bg-blue-500/10 hover:bg-blue-500/15 border-l-3 border-blue-500'
                        : isLight
                        ? 'hover:bg-slate-50'
                        : 'hover:bg-white/5 opacity-80'
                    }`}
                  >
                    <div className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-black/20 border border-white/5">
                      {getNotificationIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <p className={`text-xs font-bold truncate ${unread ? 'text-blue-400' : isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          {item.title}
                        </p>
                        {item.priority === 'urgent' && (
                          <span className="text-[9px] font-black px-1 rounded bg-red-500/20 text-red-400 shrink-0">
                            URGENT
                          </span>
                        )}
                      </div>
                      <p className={`text-xs line-clamp-2 leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {item.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-500">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>·</span>
                        <span className="truncate">{item.recipientDepartment}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className={`p-2.5 text-center border-t shrink-0 ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#151b2e] border-white/5'
          }`}>
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/footage-requests');
              }}
              className="text-[11px] font-bold text-blue-500 hover:text-blue-400 flex items-center justify-center gap-1.5 w-full py-1"
            >
              <span>Go to Footage Requests</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
