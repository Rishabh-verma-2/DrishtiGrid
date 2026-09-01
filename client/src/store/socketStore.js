import { create } from 'zustand';

const useSocketStore = create((set, get) => ({
  socket: null,
  isConnected: false,
  onlineUsers: 0,

  setSocket: (socket) => set({ socket }),
  setConnected: (status) => set({ isConnected: status }),
  setOnlineUsers: (count) => set({ onlineUsers: count }),

  emit: (event, data) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit(event, data);
    }
  },
}));

export default useSocketStore;
