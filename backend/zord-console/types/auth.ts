export type UserRole = 'CUSTOMER_USER' | 'CUSTOMER_ADMIN' | 'OPS' | 'ADMIN'

export interface User {
  id: string
  email: string
  role: UserRole
  tenant?: string
  name: string
}
