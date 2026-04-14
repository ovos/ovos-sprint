import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/api/client'
import { Team, TeamMember, TeamWithMembers } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Plus, Pencil, Trash2, Users, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { getInitials, getAvatarColor } from '@/lib/utils'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { useSort } from '@/hooks/use-sort'
import { SortableTableHeader } from '@/components/SortableTableHeader'

type TeamSortKey = 'name' | 'createdAt'

export default function TeamsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [managingTeam, setManagingTeam] = useState<Team | null>(null)
  const [teamName, setTeamName] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<number[]>([])
  const [selectedCurrentIds, setSelectedCurrentIds] = useState<number[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<{
    teamId: number
    teamName: string
    cascadeInfo: {
      memberLinks: number
    } | null
  } | null>(null)

  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const response = await api.get('/teams')
      return response.data as Team[]
    },
  })

  const { data: allMembers = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const response = await api.get('/members')
      return response.data as TeamMember[]
    },
  })

  const { data: teamDetails } = useQuery({
    queryKey: ['teams', managingTeam?.id],
    queryFn: async () => {
      const response = await api.get(`/teams/${managingTeam?.id}`)
      return response.data as TeamWithMembers
    },
    enabled: !!managingTeam,
  })

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/teams', { name })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setIsCreateOpen(false)
      setTeamName('')
      toast({ title: 'Team created successfully' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await api.put(`/teams/${id}`, { name })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setEditingTeam(null)
      setTeamName('')
      toast({ title: 'Team updated successfully' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/teams/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      toast({ title: 'Team deleted successfully' })
    },
  })

  const batchAddMembersMutation = useMutation({
    mutationFn: async ({ teamId, memberIds }: { teamId: number; memberIds: number[] }) => {
      const response = await api.post(`/teams/${teamId}/members/batch`, { memberIds })
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['teams', 'members', 'relationships'] })
      toast({
        title: 'Success',
        description: `Added ${data.added} member(s)${data.skipped > 0 ? `, ${data.skipped} already assigned` : ''}`,
      })
      setSelectedMemberIds([])
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to add members to team',
        variant: 'destructive',
      })
    },
  })

  const batchRemoveMembersMutation = useMutation({
    mutationFn: async ({ teamId, memberIds }: { teamId: number; memberIds: number[] }) => {
      await api.delete(`/teams/${teamId}/members/batch`, { data: { memberIds } })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      queryClient.invalidateQueries({ queryKey: ['teams', 'members', 'relationships'] })
      toast({
        title: 'Success',
        description: 'Members removed from team',
      })
      setSelectedCurrentIds([])
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to remove members',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingTeam) {
      updateMutation.mutate({ id: editingTeam.id, name: teamName })
    } else {
      createMutation.mutate(teamName)
    }
  }

  const handleBatchAddMembers = () => {
    if (managingTeam && selectedMemberIds.length > 0) {
      batchAddMembersMutation.mutate({
        teamId: managingTeam.id,
        memberIds: selectedMemberIds
      })
    }
  }

  const handleBatchRemoveMembers = () => {
    if (managingTeam && selectedCurrentIds.length > 0) {
      batchRemoveMembersMutation.mutate({
        teamId: managingTeam.id,
        memberIds: selectedCurrentIds
      })
    }
  }

  const availableMembers = allMembers.filter(
    (member) => !teamDetails?.members?.some((tm) => tm.id === member.id)
  )

  const filteredTeams = teams.filter((team) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return team.name.toLowerCase().includes(query)
  })

  const { sortedData: sortedTeams, sortKey, sortOrder, toggleSort } =
    useSort<Team, TeamSortKey>(filteredTeams, 'name')

  const handleDeleteClick = async (team: Team) => {
    try {
      const response = await api.get(`/teams/${team.id}/cascade-info`)
      setDeleteDialog({
        teamId: team.id,
        teamName: team.name,
        cascadeInfo: response.data,
      })
    } catch (error) {
      toast({
        title: 'Failed to load team info',
        description: 'Proceeding without cascade information',
        variant: 'destructive',
      })
      setDeleteDialog({
        teamId: team.id,
        teamName: team.name,
        cascadeInfo: null,
      })
    }
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
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground">Manage your teams</p>
        </div>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Team
          </Button>
        </motion.div>
      </motion.div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search teams by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHeader
                label="Name"
                sortKey="name"
                currentSortKey={sortKey}
                currentSortOrder={sortOrder}
                onSort={toggleSort}
              />
              <SortableTableHeader
                label="Created"
                sortKey="createdAt"
                currentSortKey={sortKey}
                currentSortOrder={sortOrder}
                onSort={toggleSort}
              />
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedTeams.map((team) => (
              <TableRow key={team.id}>
                <TableCell className="font-medium">{team.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(team.createdAt).toLocaleDateString('de-AT')}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" aria-label="Manage members" onClick={() => setManagingTeam(team)}>
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Edit team"
                      onClick={() => {
                        setEditingTeam(team)
                        setTeamName(team.name)
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Delete team"
                      onClick={() => handleDeleteClick(team)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {filteredTeams.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          {teams.length > 0 ? `No teams found matching "${searchQuery}".` : 'No teams yet. Click "Create Team" to get started.'}
        </p>
      )}

      <Dialog
        open={isCreateOpen || !!editingTeam}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false)
            setEditingTeam(null)
            setTeamName('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTeam ? 'Edit Team' : 'Create Team'}
            </DialogTitle>
            <DialogDescription>
              {editingTeam
                ? 'Update the team name'
                : 'Create a new team'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Team Name</Label>
                <Input
                  id="name"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending
                  ? (editingTeam ? 'Saving...' : 'Creating...')
                  : (editingTeam ? 'Update' : 'Create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!managingTeam}
        onOpenChange={(open) => {
          if (!open) {
            setManagingTeam(null)
            setSelectedMemberIds([])
            setSelectedCurrentIds([])
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Members - {managingTeam?.name}</DialogTitle>
            <DialogDescription>
              Add or remove members from this team
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Current Members - Multi-select */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Current Members ({teamDetails?.members?.length || 0})
                </h3>
                {teamDetails?.members && teamDetails.members.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleBatchRemoveMembers}
                    disabled={selectedCurrentIds.length === 0 || batchRemoveMembersMutation.isPending}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove Selected ({selectedCurrentIds.length})
                  </Button>
                )}
              </div>
              <ScrollArea className="h-48 rounded-md border p-4">
                {teamDetails?.members && teamDetails.members.length > 0 ? (
                  <div className="space-y-2">
                    {teamDetails.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center p-2 rounded-lg hover:bg-muted cursor-pointer"
                        onClick={() => {
                          setSelectedCurrentIds(prev =>
                            prev.includes(member.id)
                              ? prev.filter(id => id !== member.id)
                              : [...prev, member.id]
                          )
                        }}
                      >
                        <Checkbox
                          checked={selectedCurrentIds.includes(member.id)}
                          onCheckedChange={(checked) => {
                            setSelectedCurrentIds(prev =>
                              checked
                                ? [...prev, member.id]
                                : prev.filter(id => id !== member.id)
                            )
                          }}
                          className="mr-3"
                        />
                        <Avatar className="h-8 w-8 mr-3">
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
                        <span className="text-sm">
                          {member.firstName} {member.lastName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No members in this team yet
                  </p>
                )}
              </ScrollArea>
            </div>

            {/* Available Members - Multi-select */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Available Members</h3>
              <ScrollArea className="h-48 rounded-md border p-4">
                {availableMembers.length > 0 ? (
                  <div className="space-y-2">
                    {availableMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center p-2 rounded-lg hover:bg-muted cursor-pointer"
                        onClick={() => {
                          setSelectedMemberIds(prev =>
                            prev.includes(member.id)
                              ? prev.filter(id => id !== member.id)
                              : [...prev, member.id]
                          )
                        }}
                      >
                        <Checkbox
                          checked={selectedMemberIds.includes(member.id)}
                          onCheckedChange={(checked) => {
                            setSelectedMemberIds(prev =>
                              checked
                                ? [...prev, member.id]
                                : prev.filter(id => id !== member.id)
                            )
                          }}
                          className="mr-3"
                        />
                        <Avatar className="h-8 w-8 mr-3">
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
                        <span className="text-sm">
                          {member.firstName} {member.lastName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    All members already assigned
                  </p>
                )}
              </ScrollArea>

              {/* Action Buttons */}
              <div className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={() => setSelectedMemberIds(availableMembers.map(m => m.id))}
                  disabled={availableMembers.length === 0}
                >
                  Select All
                </Button>
                <Button
                  onClick={handleBatchAddMembers}
                  disabled={selectedMemberIds.length === 0 || batchAddMembersMutation.isPending}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add {selectedMemberIds.length > 0 ? `(${selectedMemberIds.length})` : ''}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Team Confirmation Dialog */}
      <AlertDialog
        open={!!deleteDialog}
        onOpenChange={() => setDeleteDialog(null)}
        title="Delete Team"
        description="This will permanently delete the team. This action cannot be undone."
        entityName={deleteDialog?.teamName}
        cascadeWarning={deleteDialog?.cascadeInfo ? {
          items: [
            { type: 'team member links', count: deleteDialog.cascadeInfo.memberLinks },
          ].filter(item => item.count > 0)
        } : undefined}
        confirmLabel="Delete Team"
        onConfirm={() => {
          if (deleteDialog) {
            deleteMutation.mutate(deleteDialog.teamId)
            setDeleteDialog(null)
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </motion.div>
    </div>
  )
}
