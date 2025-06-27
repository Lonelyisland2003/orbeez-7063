// AuthContext.js
import React, { useState, useContext, createContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext();

// API Configuration
const API_BASE_URL = 'https://your-api-domain.com/api';

// API Service
const authAPI = {
  login: async (email, password) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Invalid credentials');
    }

    return response.json();
  },

  refreshToken: async (refreshToken) => {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      throw new Error('Failed to refresh token');
    }

    return response.json();
  },

  fetchProtectedData: async (accessToken) => {
    const response = await fetch(`${API_BASE_URL}/protected-data`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch protected data');
    }

    return response.json();
  },
};

// Auth Provider Component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state from AsyncStorage on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      const storedAccessToken = await AsyncStorage.getItem('accessToken');
      const storedRefreshToken = await AsyncStorage.getItem('refreshToken');

      if (storedUser && storedAccessToken && storedRefreshToken) {
        setUser(JSON.parse(storedUser));
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const storeAuthData = async (userData, accessTok, refreshTok) => {
    try {
      await AsyncStorage.multiSet([
        ['user', JSON.stringify(userData)],
        ['accessToken', accessTok],
        ['refreshToken', refreshTok],
      ]);
    } catch (error) {
      console.error('Error storing auth data:', error);
    }
  };

  const clearAuthData = async () => {
    try {
      await AsyncStorage.multiRemove(['user', 'accessToken', 'refreshToken']);
    } catch (error) {
      console.error('Error clearing auth data:', error);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);
      
      setUser(response.user);
      setAccessToken(response.accessToken);
      setRefreshToken(response.refreshToken);
      
      await storeAuthData(response.user, response.accessToken, response.refreshToken);
      
      return response;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    await clearAuthData();
  };

  const refreshAccessToken = async () => {
    try {
      if (!refreshToken) throw new Error('No refresh token available');
      
      const response = await authAPI.refreshToken(refreshToken);
      
      setAccessToken(response.accessToken);
      setRefreshToken(response.refreshToken);
      
      await AsyncStorage.multiSet([
        ['accessToken', response.accessToken],
        ['refreshToken', response.refreshToken],
      ]);
      
      return response.accessToken;
    } catch (error) {
      // If refresh fails, logout user
      await logout();
      throw error;
    }
  };

  const makeAuthenticatedRequest = async (apiCall) => {
    try {
      // Try with current access token
      return await apiCall(accessToken);
    } catch (error) {
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('401') || 
          error.message.includes('unauthorized')) {
        try {
          // Try to refresh token and retry
          const newAccessToken = await refreshAccessToken();
          return await apiCall(newAccessToken);
        } catch (refreshError) {
          throw refreshError;
        }
      }
      throw error;
    }
  };

  const value = {
    user,
    accessToken,
    refreshToken,
    login,
    logout,
    refreshAccessToken,
    makeAuthenticatedRequest,
    isAuthenticated: !!user,
    loading,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};