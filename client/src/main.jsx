import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from "./App.jsx";
import './index.css'
import ThemeProvider from './components/theme-provider.jsx';
import { queryClientInstance } from './lib/query-client.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClientInstance}>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </QueryClientProvider>
)
