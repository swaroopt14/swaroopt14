'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, isAuthenticated, getCurrentRole } from '@/services/auth'
import { User, UserRole } from '@/types/auth'

export function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const currentUser = getCurrentUser()
    const currentRole = getCurrentRole()
    setUser(currentUser)
    setRole(currentRole)
    setIsLoading(false)
  }, [])

  const checkAuth = () => {
    if (!isAuthenticated()) {
      router.push('/console/login')
      return false
    }
    return true
  }

  return {
    user,
    role,
    isLoading,
    isAuthenticated: isAuthenticated(),
    checkAuth,
  }
}
