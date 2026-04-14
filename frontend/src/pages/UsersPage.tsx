import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { useAuthStore } from '@/store/auth'
import { UserPlus, Copy, Mail, Trash2, Shield, Briefcase } from 'lucide-react'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { motion } from 'framer-motion'
import { AlertDialog } from '@/components/ui/alert-dialog'
import type { User } from '@/types'
import type { UserCascadeInfo as CascadeInfo } from './types'

export default function UsersPage() {
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'user' | 'project_manager' | 'admin'>('user')
  const [invitationLink, setInvitationLink] = useState<string | null>(null)
  const [confirmRoleChange, setConfirmRoleChange] = useState<{
    userId: number
    newRole: 'user' | 'project_manager' | 'admin'
  } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    userId: number
    userEmail: string
    cascadeInfo: CascadeInfo | null
  } | null>(null)

  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuthStore()

  // Fetch users - we'll need to add this endpoint
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const response = await api.get('/users')
        return response.data as User[]
      } catch (error) {
        return []
      }
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: 'user' | 'project_manager' | 'admin' }) => {
      const response = await api.post('/auth/invite', data)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] })
      setInvitationLink(data.invitationLink)
      toast({
        title: 'Invitation created!',
        description: 'The invitation link has been generated. Copy it and send it to the user.',
      })
      setEmail('')
      setRole('user')
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create invitation',
        description: error.response?.data?.error || 'Something went wrong',
        variant: 'destructive',
      })
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: 'user' | 'project_manager' | 'admin' }) => {
      const response = await api.patch(`/users/${userId}/role`, { role })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'Role updated',
        description: 'User role has been changed successfully.',
      })
      setConfirmRoleChange(null)
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update role',
        description: error.response?.data?.error || 'Something went wrong',
        variant: 'destructive',
      })
      setConfirmRoleChange(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (userId: number) => {
      await api.delete(`/users/${userId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      toast({
        title: 'User deleted',
        description: 'The user has been removed successfully.',
      })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete user',
        description: error.response?.data?.error || 'Something went wrong',
        variant: 'destructive',
      })
    },
  })

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault()
    inviteMutation.mutate({ email, role })
  }

  const handleDeleteUser = async (user: User) => {
    try {
      const response = await api.get(`/users/${user.id}/cascade-info`)
      setDeleteDialog({
        userId: user.id,
        userEmail: user.email,
        cascadeInfo: response.data,
      })
    } catch (error) {
      toast({
        title: 'Failed to load user info',
        description: 'Proceeding without cascade information',
        variant: 'destructive',
      })
      setDeleteDialog({
        userId: user.id,
        userEmail: user.email,
        cascadeInfo: null,
      })
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard!' })
  }

  return (
    <div className="container mx-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-6"
      >
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="flex justify-between items-center"
        >
          <div>
            <h1 className="text-3xl font-bold">User Management</h1>
            <p className="text-muted-foreground">Invite and manage users</p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={() => setIsInviteOpen(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Invite User
            </Button>
          </motion.div>
        </motion.div>

        {/* Existing Users */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>
                Users who have completed their registration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {users.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No users yet. Invite users to get started!
                </p>
              ) : (
                <div className="space-y-2">
                  {users.map((user, index) => (
                    <motion.div
                      key={user.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.3 }}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <div className="font-medium flex items-center gap-1.5">
                          {user.email}
                          {user.googleId && (
                            <GoogleIcon className="h-4 w-4 shrink-0" />
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Joined{' '}
                          {new Date(user.createdAt).toLocaleDateString('de-AT')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {currentUser?.id === user.id ? (
                          <div
                            className={`px-3 py-1 rounded-full text-xs font-medium ${user.role === 'admin'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                : user.role === 'project_manager'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                          >
                            {user.role === 'project_manager' ? 'PM' : user.role}
                          </div>
                        ) : (
                          <Select
                            value={user.role}
                            onValueChange={(newRole: 'user' | 'project_manager' | 'admin') => {
                              setConfirmRoleChange({ userId: user.id, newRole })
                            }}
                          >
                            <SelectTrigger className="w-[175px] h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">
                                <span>User</span>
                              </SelectItem>
                              <SelectItem value="project_manager">
                                <div className="flex items-center gap-2">
                                  <Briefcase className="h-3 w-3" />
                                  <span>Project Manager</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-2">
                                  <Shield className="h-3 w-3" />
                                  <span>Admin</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {currentUser?.id !== user.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete user"
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleteMutation.isPending}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Invite Dialog */}
        <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite New User</DialogTitle>
              <DialogDescription>
                Enter the email address of the user you want to invite. They will
                receive a registration link.
              </DialogDescription>
            </DialogHeader>

            {!invitationLink ? (
              <form onSubmit={handleInvite}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <RadioGroup value={role} onValueChange={(value) => setRole(value as 'user' | 'project_manager' | 'admin')}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="user" id="role-user" />
                        <Label htmlFor="role-user" className="font-normal cursor-pointer">
                          User - Can view and interact with the timeline
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="project_manager" id="role-pm" />
                        <Label htmlFor="role-pm" className="font-normal cursor-pointer">
                          Project Manager - Can manage their own projects and customers
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="admin" id="role-admin" />
                        <Label htmlFor="role-admin" className="font-normal cursor-pointer">
                          Admin - Full access including user management
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsInviteOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? 'Creating...' : 'Create Invitation'}
                  </Button>
                </DialogFooter>
              </form>
            ) : (
              <div className="space-y-4 py-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-blue-900 mb-1">
                        Invitation Link Created
                      </h4>
                      <p className="text-sm text-blue-700 mb-3">
                        Copy this link and send it to the user via email. The
                        link expires in 7 days.
                      </p>
                      <div className="bg-white dark:text-black rounded border border-blue-300 p-3 mb-3">
                        <code className="text-xs break-all">
                          {invitationLink}
                        </code>
                      </div>
                      <Button
                        onClick={() => copyToClipboard(invitationLink)}
                        className="gap-2"
                        size="sm"
                      >
                        <Copy className="h-4 w-4" />
                        Copy Link
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800">
                    <strong>Note:</strong> The link has also been sent to the email provided.
                  </p>
                </div>

                <DialogFooter>
                  <Button
                    onClick={() => {
                      setIsInviteOpen(false)
                      setInvitationLink(null)
                      setEmail('')
                    }}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Role Change Confirmation Dialog */}
        <Dialog open={!!confirmRoleChange} onOpenChange={() => setConfirmRoleChange(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Role Change</DialogTitle>
              <DialogDescription>
                {confirmRoleChange && (
                  <>
                    Are you sure you want to change this user's role to{' '}
                    <strong>{confirmRoleChange.newRole === 'project_manager' ? 'Project Manager' : confirmRoleChange.newRole}</strong>?
                    {confirmRoleChange.newRole === 'admin' && (
                      <div className="mt-2 text-amber-600 dark:text-amber-500">
                        This will grant the user full administrative privileges including user management.
                      </div>
                    )}
                    {confirmRoleChange.newRole === 'project_manager' && (
                      <div className="mt-2 text-purple-600 dark:text-purple-500">
                        This will allow the user to create and manage their own projects and customers.
                      </div>
                    )}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmRoleChange(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (confirmRoleChange) {
                    updateRoleMutation.mutate({
                      userId: confirmRoleChange.userId,
                      role: confirmRoleChange.newRole,
                    })
                  }
                }}
                disabled={updateRoleMutation.isPending}
              >
                {updateRoleMutation.isPending ? 'Updating...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete User Confirmation Dialog */}
        <AlertDialog
          open={!!deleteDialog}
          onOpenChange={() => setDeleteDialog(null)}
          title="Delete User"
          description="This will permanently delete the user and all associated data. This action cannot be undone."
          entityName={deleteDialog?.userEmail}
          cascadeWarning={deleteDialog?.cascadeInfo ? {
            items: [
              { type: 'user settings', count: deleteDialog.cascadeInfo.settings },
              { type: 'linked team member profiles', count: deleteDialog.cascadeInfo.linkedTeamMembers },
            ].filter(item => item.count > 0)
          } : undefined}
          confirmLabel="Delete User"
          onConfirm={() => {
            if (deleteDialog) {
              deleteMutation.mutate(deleteDialog.userId)
              setDeleteDialog(null)
            }
          }}
          isLoading={deleteMutation.isPending}
        />
      </motion.div>
    </div>
  )
}
