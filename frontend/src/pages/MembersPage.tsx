import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/api/client'
import { TeamMember, WorkSchedule } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { Plus, Pencil, Trash2, Upload, Camera, MailPlus, UserPlus, Users, X } from 'lucide-react'
import { GoogleIcon } from '@/components/icons/GoogleIcon'
import { getInitials, generateAvatarUrl, getAvatarColor } from '@/lib/utils'
import { motion } from 'framer-motion'
import { WarningDialog } from '@/components/ui/warning-dialog'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { useSort } from '@/hooks/use-sort'
import { SortableTableHeader } from '@/components/SortableTableHeader'

type MemberSortKey = 'firstName' | 'email' | 'createdAt'

export default function MembersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [uploadingAvatarFor, setUploadingAvatarFor] = useState<TeamMember | null>(null)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [workSchedule, setWorkSchedule] = useState<WorkSchedule>({
    sun: false,
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
  })
  const [inviteDialog, setInviteDialog] = useState<{
    memberId: number
    email: string
  } | null>(null)
  const [deleteDialog, setDeleteDialog] = useState<{
    memberId: number
    memberName: string
    cascadeInfo: {
      assignments: number
      dayAssignments: number
      dayOffs: number
      teamLinks: number
    } | null
  } | null>(null)
  const [selectedMemberForTeams, setSelectedMemberForTeams] = useState<TeamMember | null>(null)
  const [showManageTeamsDialog, setShowManageTeamsDialog] = useState(false)
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>([])

  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const response = await api.get('/members')
      return response.data as TeamMember[]
    },
  })

  const { data: allTeams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await api.get('/teams')
      return response.data
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; email: string | null; workSchedule: string }) => {
      const avatarUrl = generateAvatarUrl(data.firstName, data.lastName)
      const response = await api.post('/members', { ...data, avatarUrl })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      setIsCreateOpen(false)
      resetForm()
      toast({ title: 'Team member created successfully' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number
      firstName: string
      lastName: string
      email: string | null
      workSchedule: string
    }) => {
      const response = await api.put(`/members/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      setEditingMember(null)
      resetForm()
      toast({ title: 'Team member updated successfully' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/members/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      toast({ title: 'Team member deleted successfully' })
    },
  })

  const uploadAvatarMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData()
      formData.append('avatar', file)
      const response = await api.post(`/members/${id}/avatar`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      setUploadingAvatarFor(null)
      setSelectedFile(null)
      setPreviewUrl(null)
      toast({ title: 'Avatar uploaded successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to upload avatar',
        description: error.response?.data?.error || 'Something went wrong',
        variant: 'destructive',
      })
    },
  })

  const inviteMutation = useMutation({
    mutationFn: async (memberId: number) => {
      const response = await api.post(`/members/${memberId}/invite`)
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
      if (data.linked) {
        toast({
          title: 'User linked!',
          description: `User ${data.email} has been linked to this member`
        })
      } else {
        toast({
          title: 'Invitation sent!',
          description: `Invitation link created for ${data.email}`
        })
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to send invitation',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive'
      })
    },
  })

  const resetForm = () => {
    setFirstName('')
    setLastName('')
    setEmail('')
    setWorkSchedule({
      sun: false,
      mon: true,
      tue: true,
      wed: true,
      thu: true,
      fri: true,
      sat: false,
    })
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleUploadAvatar = () => {
    if (!uploadingAvatarFor || !selectedFile) return
    uploadAvatarMutation.mutate({
      id: uploadingAvatarFor.id,
      file: selectedFile,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const workScheduleString = JSON.stringify(workSchedule)
    if (editingMember) {
      updateMutation.mutate({
        id: editingMember.id,
        firstName,
        lastName,
        email: email || null,
        workSchedule: workScheduleString,
      })
    } else {
      createMutation.mutate({ firstName, lastName, email: email || null, workSchedule: workScheduleString })
    }
  }

  const handleManageTeams = async (member: TeamMember) => {
    setSelectedMemberForTeams(member)
    setShowManageTeamsDialog(true)

    // Load member's current teams
    try {
      const response = await api.get('/teams/members/relationships')
      const memberTeams = response.data
        .filter((rel: any) => rel.teamMemberId === member.id)
        .map((rel: any) => rel.teamId)
      setSelectedTeamIds(memberTeams)
    } catch (error) {
      setSelectedTeamIds([])
    }
  }

  const handleToggleTeam = async (teamId: number, isCurrentlyAssigned: boolean) => {
    if (!selectedMemberForTeams) return

    try {
      if (isCurrentlyAssigned) {
        // Remove from team
        await api.delete(`/teams/${teamId}/members/${selectedMemberForTeams.id}`)
        setSelectedTeamIds(prev => prev.filter(id => id !== teamId))
        toast({
          title: 'Success',
          description: 'Member removed from team',
        })
      } else {
        // Add to team
        await api.post(`/teams/${teamId}/members/${selectedMemberForTeams.id}`)
        setSelectedTeamIds(prev => [...prev, teamId])
        toast({
          title: 'Success',
          description: 'Member added to team',
        })
      }

      queryClient.invalidateQueries({ queryKey: ['teams'] })
    } catch (error) {
      toast({
        title: 'Error',
        description: isCurrentlyAssigned ? 'Failed to remove from team' : 'Failed to add to team',
        variant: 'destructive',
      })
    }
  }

  const filteredMembers = members.filter((member) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const fullName = `${member.firstName} ${member.lastName}`.toLowerCase()
    return fullName.includes(query)
  })

  const { sortedData: sortedMembers, sortKey, sortOrder, toggleSort } =
    useSort<TeamMember, MemberSortKey>(filteredMembers, 'firstName')

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
            <h1 className="text-3xl font-bold">Team Members</h1>
            <p className="text-muted-foreground">Manage your team members</p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Member
            </Button>
          </motion.div>
        </motion.div>

        <div className="flex items-center gap-4">
          <Input
            placeholder="Search members by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Avatar</TableHead>
                <SortableTableHeader
                  label="Name"
                  sortKey="firstName"
                  currentSortKey={sortKey}
                  currentSortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <SortableTableHeader
                  label="Email"
                  sortKey="email"
                  currentSortKey={sortKey}
                  currentSortOrder={sortOrder}
                  onSort={toggleSort}
                />
                <TableHead className="hidden lg:table-cell">Schedule</TableHead>
                <SortableTableHeader
                  label="Added"
                  sortKey="createdAt"
                  currentSortKey={sortKey}
                  currentSortOrder={sortOrder}
                  onSort={toggleSort}
                  className="hidden lg:table-cell"
                />
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMembers.map((member) => {
                const schedule = JSON.parse(member.workSchedule) as WorkSchedule
                const workDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
                  .filter((day) => schedule[day as keyof WorkSchedule])
                  .map((day) => day.charAt(0).toUpperCase() + day.slice(1, 3))
                  .join(', ')
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.avatarUrl || undefined} />
                        <AvatarFallback
                          style={{
                            backgroundColor: getAvatarColor(member.firstName, member.lastName).bg,
                            color: getAvatarColor(member.firstName, member.lastName).text,
                          }}
                        >
                          {getInitials(member.firstName, member.lastName)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      {member.firstName} {member.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {member.email || '-'}
                        {member.hasGoogleAuth && (
                          <GoogleIcon className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                      {workDays || 'No schedule'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {new Date(member.createdAt).toLocaleDateString('de-AT')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {member.email && !member.userId && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setInviteDialog({
                                memberId: member.id,
                                email: member.email || '',
                              })
                            }}
                            disabled={inviteMutation.isPending}
                            title="Invite User"
                            aria-label="Invite user"
                          >
                            <MailPlus className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setUploadingAvatarFor(member)}
                          title="Upload Avatar"
                          aria-label="Upload avatar"
                        >
                          <Camera className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingMember(member)
                            setFirstName(member.firstName)
                            setLastName(member.lastName)
                            setEmail(member.email || '')
                            setWorkSchedule(JSON.parse(member.workSchedule))
                          }}
                          title="Edit"
                          aria-label="Edit member"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleManageTeams(member)}
                          title="Manage Teams"
                          aria-label="Manage teams"
                        >
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              const response = await api.get(`/members/${member.id}/cascade-info`)
                              setDeleteDialog({
                                memberId: member.id,
                                memberName: `${member.firstName} ${member.lastName}`,
                                cascadeInfo: response.data,
                              })
                            } catch (error) {
                              toast({
                                title: 'Failed to load member info',
                                description: 'Proceeding without cascade information',
                                variant: 'destructive',
                              })
                              setDeleteDialog({
                                memberId: member.id,
                                memberName: `${member.firstName} ${member.lastName}`,
                                cascadeInfo: null,
                              })
                            }
                          }}
                          className="text-destructive hover:text-destructive"
                          title="Delete"
                          aria-label="Delete member"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        <Dialog
          open={isCreateOpen || !!editingMember}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateOpen(false)
              setEditingMember(null)
              resetForm()
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingMember ? 'Edit Member' : 'Add Team Member'}
              </DialogTitle>
              <DialogDescription>
                {editingMember
                  ? 'Update the team member details'
                  : 'Add a new team member'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="member@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Required to invite member as a user
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Work Schedule</Label>
                  <div className="grid grid-cols-7 gap-2">
                    {[
                      { key: 'mon' as keyof WorkSchedule, label: 'Mon' },
                      { key: 'tue' as keyof WorkSchedule, label: 'Tue' },
                      { key: 'wed' as keyof WorkSchedule, label: 'Wed' },
                      { key: 'thu' as keyof WorkSchedule, label: 'Thu' },
                      { key: 'fri' as keyof WorkSchedule, label: 'Fri' },
                      { key: 'sat' as keyof WorkSchedule, label: 'Sat' },
                      { key: 'sun' as keyof WorkSchedule, label: 'Sun' },
                    ].map((day) => (
                      <div key={day.key} className="flex flex-col items-center space-y-1">
                        <Label htmlFor={day.key} className="text-xs">
                          {day.label}
                        </Label>
                        <Checkbox
                          id={day.key}
                          checked={workSchedule[day.key]}
                          onCheckedChange={(checked) =>
                            setWorkSchedule({
                              ...workSchedule,
                              [day.key]: checked === true,
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? (editingMember ? 'Saving...' : 'Adding...')
                    : (editingMember ? 'Update' : 'Add')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Avatar Upload Dialog */}
        <Dialog
          open={!!uploadingAvatarFor}
          onOpenChange={(open) => {
            if (!open) {
              setUploadingAvatarFor(null)
              setSelectedFile(null)
              setPreviewUrl(null)
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Avatar</DialogTitle>
              <DialogDescription>
                Upload a profile picture for {uploadingAvatarFor?.firstName}{' '}
                {uploadingAvatarFor?.lastName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Current Avatar */}
              <div className="flex justify-center">
                <Avatar className="h-24 w-24">
                  <AvatarImage
                    src={
                      previewUrl ||
                      uploadingAvatarFor?.avatarUrl ||
                      undefined
                    }
                  />
                  <AvatarFallback
                    style={
                      uploadingAvatarFor
                        ? {
                          backgroundColor: getAvatarColor(
                            uploadingAvatarFor.firstName,
                            uploadingAvatarFor.lastName
                          ).bg,
                          color: getAvatarColor(
                            uploadingAvatarFor.firstName,
                            uploadingAvatarFor.lastName
                          ).text,
                        }
                        : undefined
                    }
                  >
                    {uploadingAvatarFor &&
                      getInitials(
                        uploadingAvatarFor.firstName,
                        uploadingAvatarFor.lastName
                      )}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* File Input */}
              <div className="space-y-2">
                <Label htmlFor="avatar">Select Image</Label>
                <Input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                />
                <p className="text-xs text-muted-foreground">
                  Supported formats: JPEG, PNG, GIF, WebP. Max size: 5MB
                </p>
              </div>

              {/* Preview Info */}
              {selectedFile && (
                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    <strong>Selected:</strong> {selectedFile.name} (
                    {(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setUploadingAvatarFor(null)
                  setSelectedFile(null)
                  setPreviewUrl(null)
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUploadAvatar}
                disabled={!selectedFile || uploadAvatarMutation.isPending}
                className="gap-2"
              >
                {uploadAvatarMutation.isPending ? (
                  'Uploading...'
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Invitation Confirmation Dialog */}
        <WarningDialog
          open={!!inviteDialog}
          onOpenChange={() => setInviteDialog(null)}
          title="Send Invitation"
          message={`Send an invitation email to ${inviteDialog?.email}? This will allow them to register and access the system.`}
          confirmLabel="Send Invitation"
          onConfirm={() => {
            if (inviteDialog) {
              inviteMutation.mutate(inviteDialog.memberId)
              setInviteDialog(null)
            }
          }}
        />

        {/* Delete Member Confirmation Dialog */}
        <AlertDialog
          open={!!deleteDialog}
          onOpenChange={() => setDeleteDialog(null)}
          title="Delete Team Member"
          description="This will permanently delete the team member and all associated data. This action cannot be undone."
          entityName={deleteDialog?.memberName}
          cascadeWarning={deleteDialog?.cascadeInfo ? {
            items: [
              { type: 'project assignments', count: deleteDialog.cascadeInfo.assignments },
              { type: 'day assignments', count: deleteDialog.cascadeInfo.dayAssignments },
              { type: 'day-offs', count: deleteDialog.cascadeInfo.dayOffs },
              { type: 'team links', count: deleteDialog.cascadeInfo.teamLinks },
            ].filter(item => item.count > 0)
          } : undefined}
          confirmLabel="Delete Member"
          onConfirm={() => {
            if (deleteDialog) {
              deleteMutation.mutate(deleteDialog.memberId)
              setDeleteDialog(null)
            }
          }}
          isLoading={deleteMutation.isPending}
        />

        {/* Manage Teams Dialog */}
        <Dialog open={showManageTeamsDialog} onOpenChange={setShowManageTeamsDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Manage Teams - {selectedMemberForTeams?.firstName} {selectedMemberForTeams?.lastName}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Teams</Label>
                <ScrollArea className="h-64 rounded-md border p-4">
                  <div className="space-y-2">
                    {allTeams.map((team: any) => {
                      const isAssigned = selectedTeamIds.includes(team.id)
                      return (
                        <div
                          key={team.id}
                          className="flex items-center justify-between p-2 rounded-lg hover:bg-muted"
                        >
                          <span className="text-sm">{team.name}</span>
                          <Button
                            size="sm"
                            variant={isAssigned ? 'destructive' : 'default'}
                            onClick={() => handleToggleTeam(team.id, isAssigned)}
                          >
                            {isAssigned ? (
                              <>
                                <X className="h-4 w-4 mr-1" />
                                Remove
                              </>
                            ) : (
                              <>
                                <UserPlus className="h-4 w-4 mr-1" />
                                Add
                              </>
                            )}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowManageTeamsDialog(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </div>
  )
}
