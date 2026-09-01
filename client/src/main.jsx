import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';
import 'leaflet/dist/leaflet.css';
import './utils/leafletFix';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#1a1f2e',
              color: '#e2e8f0',
              border: '1px solid #2d3748',
              borderRadius: '12px',
              fontSize: '14px',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
