import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'
import { GoogleLogin, CredentialResponse } from '@react-oauth/google'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

export default function RegisterPage() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get('email') || '')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const token = searchParams.get('token') || ''

  const { register, googleLogin, isLoading } = useAuthStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  useEffect(() => {
    if (!token && !GOOGLE_CLIENT_ID) {
      toast({
        title: 'Invalid invitation',
        description: 'No invitation token found',
        variant: 'destructive',
      })
      navigate('/login')
    }
  }, [token, navigate, toast])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure both passwords are the same',
        variant: 'destructive',
      })
      return
    }

    if (password.length < 8) {
      toast({
        title: 'Password too short',
        description: 'Password must be at least 8 characters',
        variant: 'destructive',
      })
      return
    }

    try {
      await register(email, password, token)
      navigate('/dashboard')
    } catch (error: any) {
      toast({
        title: 'Registration failed',
        description: error.response?.data?.error || 'Failed to register',
        variant: 'destructive',
      })
    }
  }

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return
    try {
      await googleLogin(response.credential)
      navigate('/dashboard')
    } catch (error: any) {
      toast({
        title: 'Google sign-up failed',
        description: error.response?.data?.error || 'Could not sign up with Google',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-700 dark:to-purple-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-gradient-primary bg-clip-text">
            {token ? 'Complete Registration' : 'Create Account'}
          </CardTitle>
          <CardDescription>
            {token
              ? 'Create your account to join ovos Sprint 🏃‍♂️‍➡️'
              : 'Sign up for ovos Sprint 🏃‍♂️‍➡️'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Creating account...' : 'Create account'}
              </Button>
            </form>
          )}

          {GOOGLE_CLIENT_ID && (
            <>
              {token && (
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or</span>
                  </div>
                </div>
              )}

              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => {
                    toast({
                      title: 'Google sign-up failed',
                      description: 'Could not initialize Google sign-in',
                      variant: 'destructive',
                    })
                  }}
                  size="large"
                  width={350}
                  text="signup_with"
                />
              </div>
            </>
          )}

          {!token && !GOOGLE_CLIENT_ID && (
            <p className="text-sm text-muted-foreground text-center">
              Registration requires an invitation link.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex items-center justify-center border-t pt-6">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
