'use client'

import { UserRole } from '@/types/auth'
import { switchRole, getCurrentRole } from '@/services/auth'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function RoleSwitcher() {
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null)
  const router = useRouter()

  useEffect(() => {
    setCurrentRole(getCurrentRole())
  }, [])

  const roles: { value: UserRole; label: string }[] = [
    { value: 'CUSTOMER_USER', label: 'Customer User' },
    { value: 'CUSTOMER_ADMIN', label: 'Customer Admin' },
    { value: 'OPS', label: 'Ops' },
    { value: 'ADMIN', label: 'Admin' },
  ]

  const handleRoleChange = (role: UserRole) => {
    switchRole(role)
    setCurrentRole(role)
    
    // Navigate to appropriate landing page
    if (role === 'CUSTOMER_USER') {
      router.push('/console/ingestion')
    } else if (role === 'CUSTOMER_ADMIN') {
      router.push('/console/ingestion/inbox')
    } else if (role === 'OPS') {
      router.push('/ops/ingestion/monitor')
    } else if (role === 'ADMIN') {
      router.push('/admin/tenants')
    }
  }

  if (!currentRole) return null

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Switch Role (Mock)
        </label>
        <select
          value={currentRole}
          onChange={(e) => handleRoleChange(e.target.value as UserRole)}
          className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          {roles.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
