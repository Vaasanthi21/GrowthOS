import React, { createContext, useState, useContext, useEffect } from 'react';
import { apiClient, tokenStorage } from '@/api/apiClient';
import { queryClientInstance } from './query-client';

const AUTH_CONTEXT_KEY = '__creative_studio_auth_context__';
const AuthContext = globalThis[AUTH_CONTEXT_KEY] || createContext();

if (!globalThis[AUTH_CONTEXT_KEY]) {
  globalThis[AUTH_CONTEXT_KEY] = AuthContext;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const applyAuthenticatedUser = (nextUser, token) => {
    if (token) {
      tokenStorage.setUserToken(token);
    }
    setUser(nextUser ?? null);
    setIsAuthenticated(!!nextUser);
    setAuthError(null);
    setAuthChecked(true);
    setIsLoadingAuth(false);
  };

  const clearAuthState = () => {
    tokenStorage.clearUserToken();
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setAuthChecked(true);
    setIsLoadingAuth(false);
    try {
      queryClientInstance.clear();
      console.log('[AUTH] React Query cache cleared successfully on logout.');
    } catch (err) {
      console.error('[AUTH] Failed to clear React Query cache:', err);
    }
  };

  const checkUserAuth = async () => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      const token = tokenStorage.getUserToken();
      if (!token) {
        clearAuthState();
        return null;
      }

      const { user: sessionUser } = await apiClient.get('/auth/session', token);
      applyAuthenticatedUser(sessionUser ?? null);
      return sessionUser ?? null;
    } catch (error) {
      console.error('Auth initialization error:', error);
      clearAuthState();
      return null;
    }
  };

  useEffect(() => {
    checkUserAuth();
  }, []);

  const signUp = async (email, password, fullName, company, phone) => {
    try {
      setAuthError(null);
      const data = await apiClient.post('/auth/register', {
        email,
        password,
        fullName,
        company,
        phone,
      });

      if (data.token) {
        applyAuthenticatedUser(data.user, data.token);
      }
      return data;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const verifyEmail = async (email, otp) => {
    try {
      setAuthError(null);
      const data = await apiClient.post('/auth/verify-email', { email, otp });
      applyAuthenticatedUser(data.user, data.token);
      return data;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const verifySignUpOtp = async (email, otp) => {
    try {
      setAuthError(null);
      const data = await apiClient.post('/auth/verify-signup-otp', { email, otp });
      applyAuthenticatedUser(data.user, data.token);
      return data;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const resendVerificationOtp = async (email) => {
    try {
      setAuthError(null);
      const data = await apiClient.post('/auth/resend-verification-otp', { email });
      return data;
    } catch (error) {
      setAuthError(error.message);
      throw error;
    }
  };

  const signIn = async (email, password) => {
    try {
      setIsLoadingAuth(true);
      setAuthError(null);
      const data = await apiClient.post('/auth/login', { email, password });
      applyAuthenticatedUser(data.user, data.token);
      return data;
    } catch (error) {
      setAuthError(error.message || 'Login failed');
      setIsLoadingAuth(false);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      clearAuthState();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const navigateToLogin = () => {
    // Redirect to login page
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      authChecked,
      authError,
      signIn,
      signUp,
      verifyEmail,
      verifySignUpOtp,
      resendVerificationOtp,
      signOut,
      checkUserAuth,
      navigateToLogin,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
