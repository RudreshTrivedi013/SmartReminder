import { useEffect } from 'react'
import { SignupForm } from '@/components/auth/SignupForm'
import { useAuthStore } from '@/stores/authStore'
import { useNavigate } from 'react-router-dom'

export default function SignupPage() {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard')
    }
  }, [isAuthenticated, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg relative px-4 overflow-hidden select-none">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

      <SignupForm />
    </div>
  )
}
