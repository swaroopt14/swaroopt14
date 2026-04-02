'use client'

import { User, UserRole } from '@/types/auth'
import { STORAGE_KEYS } from '@/constants'

// Mock authentication - stores in localStorage
const AUTH_KEY = STORAGE_KEYS.AUTH
const ROLE_KEY = STORAGE_KEYS.CURRENT_ROLE

export function getCurrentUser(): User | null {
  if (typeof window === 'undefined') return null
  
  const auth = localStorage.getItem(AUTH_KEY)
  if (!auth) return null
  
  try {
    return JSON.parse(auth)
  } catch {
    return null
  }
}

export function setCurrentUser(user: User): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
}

export function clearAuth(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_KEY)
  localStorage.removeItem(ROLE_KEY)
}

// Convenience alias used by UI components.
export function logout(): void {
  clearAuth()
}

export function getCurrentRole(): UserRole | null {
  if (typeof window === 'undefined') return null
  const role = localStorage.getItem(ROLE_KEY)
  return role as UserRole | null
}

export function setCurrentRole(role: UserRole): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ROLE_KEY, role)
}

export function switchRole(role: UserRole): void {
  const user = getCurrentUser()
  if (!user) return
  
  setCurrentRole(role)
  // Update user role for this session
  const updatedUser = { ...user, role }
  setCurrentUser(updatedUser)
}

export function isAuthenticated(): boolean {
  return getCurrentUser() !== null
}
