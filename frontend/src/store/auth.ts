import { create } from 'zustand'
import { User } from '@/types'
import api from '@/api/client'

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  googleLogin: (idToken: string) => Promise<void>
  register: (email: string, password: string, token: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  resetPassword: (token: string, password: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const response = await api.post('/auth/login', { email, password })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      set({ token, user, isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  googleLogin: async (idToken: string) => {
    set({ isLoading: true })
    try {
      const response = await api.post('/auth/google', { idToken })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      set({ token, user, isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  register: async (email: string, password: string, token: string) => {
    set({ isLoading: true })
    try {
      const response = await api.post('/auth/register', { email, password, token })
      const { token: authToken, user } = response.data
      localStorage.setItem('token', authToken)
      set({ token: authToken, user, isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    set({ token: null, user: null })
  },

  fetchUser: async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      // Request user data with teams included for first-time filter initialization
      const response = await api.get('/auth/me?include=teams')
      set({ user: response.data })
    } catch (error) {
      localStorage.removeItem('token')
      set({ token: null, user: null })
    }
  },

  forgotPassword: async (email: string) => {
    set({ isLoading: true })
    try {
      await api.post('/auth/forgot-password', { email })
      set({ isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },

  resetPassword: async (token: string, password: string) => {
    set({ isLoading: true })
    try {
      await api.post('/auth/reset-password', { token, password })
      set({ isLoading: false })
    } catch (error) {
      set({ isLoading: false })
      throw error
    }
  },
}))
