import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/api/client'
import { Project, ProjectStatus, Customer } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import AssignMemberDialog from '@/components/AssignMemberDialog'
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
import { useAuthStore } from '@/store/auth'
import { Plus, Pencil, Trash2, CheckCircle2, Clock, Users, Archive, Check, ChevronsUpDown, UserPlus } from 'lucide-react'
import { CommandSeparator } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { AlertDialog } from '@/components/ui/alert-dialog'
import type { ProjectCascadeInfo as CascadeInfo } from './types'
import { useSort } from '@/hooks/use-sort'
import { SortableTableHeader } from '@/components/SortableTableHeader'

type ProjectSortKey = 'name' | 'status' | 'customerName' | 'managerEmail'

export default function ProjectsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [assigningProject, setAssigningProject] = useState<Project | null>(null)
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false)
  const [name, setName] = useState('')
  const [status, setStatus] = useState<ProjectStatus>('confirmed')
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerIcon, setNewCustomerIcon] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<{
    projectId: number
    projectName: string
    cascadeInfo: CascadeInfo | null
  } | null>(null)

  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuthStore()

  const isAdmin = user?.role === 'admin'
  const isProjectManager = user?.role === 'project_manager'

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await api.get('/projects')
      return response.data as Project[]
    },
  })

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const response = await api.get('/customers')
      return response.data as Customer[]
    },
  })

  const createMutation = useMutation({
    mutationFn: async (data: {
      customerId: number
      name: string
      status: ProjectStatus
    }) => {
      const response = await api.post('/projects', data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setIsCreateOpen(false)
      resetForm()
      toast({ title: 'Project created successfully' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: number
      customerId: number
      name: string
      status: ProjectStatus
    }) => {
      const response = await api.put(`/projects/${id}`, data)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setEditingProject(null)
      resetForm()
      toast({ title: 'Project updated successfully' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/projects/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast({ title: 'Project deleted successfully' })
    },
  })

  const createCustomerMutation = useMutation({
    mutationFn: async (data: { name: string; icon: string | null }) => {
      const response = await api.post('/customers', data)
      return response.data
    },
    onSuccess: (newCustomer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setCustomerId(newCustomer.id)
      setIsCreatingCustomer(false)
      setNewCustomerName('')
      setNewCustomerIcon('')
      setCustomerSelectOpen(false)
      toast({ title: 'Customer created and selected' })
    },
  })

  const handleCreateCustomer = () => {
    if (!newCustomerName.trim()) {
      toast({ title: 'Please enter a customer name', variant: 'destructive' })
      return
    }
    createCustomerMutation.mutate({
      name: newCustomerName.trim(),
      icon: newCustomerIcon.trim() || null,
    })
  }

  const resetCustomerForm = () => {
    setIsCreatingCustomer(false)
    setNewCustomerName('')
    setNewCustomerIcon('')
  }

  const resetForm = () => {
    setCustomerId('')
    setName('')
    setStatus('confirmed')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (customerId === '') {
      toast({ title: 'Please select a customer', variant: 'destructive' })
      return
    }
    if (editingProject) {
      updateMutation.mutate({
        id: editingProject.id,
        customerId: Number(customerId),
        name,
        status,
      })
    } else {
      createMutation.mutate({ customerId: Number(customerId), name, status })
    }
  }

  const filteredProjects = projects.filter((project) => {
    // Filter by archived status
    if (!showArchived && project.status === 'archived') {
      return false
    }

    // Filter by search query
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const customerName = project.customer?.name?.toLowerCase() || ''
    const projectName = project.name.toLowerCase()
    return customerName.includes(query) || projectName.includes(query)
  })

  // Enrich projects with sortable fields
  type EnrichedProject = Project & {
    customerName: string
    managerEmail: string
  }

  const enrichedProjects: EnrichedProject[] = filteredProjects.map(project => ({
    ...project,
    customerName: project.customer?.name || '',
    managerEmail: project.manager?.email || '',
  }))

  const { sortedData: sortedProjects, sortKey, sortOrder, toggleSort } =
    useSort<EnrichedProject, ProjectSortKey>(enrichedProjects, 'name')

  // Split projects for project managers
  const myProjects = sortedProjects.filter((p) => p.managerId === user?.id)
  const otherProjects = sortedProjects.filter((p) => p.managerId !== user?.id)

  const handleDeleteClick = async (project: Project) => {
    try {
      const response = await api.get(`/projects/${project.id}/cascade-info`)
      setDeleteDialog({
        projectId: project.id,
        projectName: project.name,
        cascadeInfo: response.data,
      })
    } catch (error) {
      toast({
        title: 'Failed to load project info',
        description: 'Proceeding without cascade information',
        variant: 'destructive',
      })
      setDeleteDialog({
        projectId: project.id,
        projectName: project.name,
        cascadeInfo: null,
      })
    }
  }

  const ProjectTable = ({
    projects,
    canEdit,
    onEdit,
    onDelete,
    onAssign,
  }: {
    projects: Project[]
    canEdit: (project: Project) => boolean
    onEdit: (project: Project) => void
    onDelete: (project: Project) => void
    onAssign: (project: Project) => void
  }) => (
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
              label="Customer"
              sortKey="customerName"
              currentSortKey={sortKey}
              currentSortOrder={sortOrder}
              onSort={toggleSort}
              className="hidden md:table-cell"
            />
            <SortableTableHeader
              label="Status"
              sortKey="status"
              currentSortKey={sortKey}
              currentSortOrder={sortOrder}
              onSort={toggleSort}
            />
            <SortableTableHeader
              label="Manager"
              sortKey="managerEmail"
              currentSortKey={sortKey}
              currentSortOrder={sortOrder}
              onSort={toggleSort}
              className="hidden lg:table-cell"
            />
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id} className={cn(!canEdit(project) && 'opacity-75')}>
              <TableCell className="font-medium">{project.name}</TableCell>
              <TableCell className="hidden md:table-cell" >
                {project.customer?.icon && `${project.customer.icon} `}
                {project.customer?.name || 'Unknown'}
              </TableCell>
              <TableCell>
                <Select
                  value={project.status}
                  onValueChange={(value) => {
                    updateMutation.mutate({
                      id: project.id,
                      customerId: project.customerId,
                      name: project.name,
                      status: value as ProjectStatus,
                    })
                  }}
                  disabled={!canEdit(project)}
                >
                  <SelectTrigger
                    className={cn(
                      'w-[130px] h-7 border-0',
                      project.status === 'confirmed'
                        ? 'bg-confirmed text-green-700 dark:bg-confirmed/40 dark:text-green-400'
                        : project.status === 'tentative'
                          ? 'bg-tentative text-slate-700 dark:bg-tentative/20 dark:text-slate-300'
                          : 'bg-slate-400 text-slate-800 dark:bg-slate-600 dark:text-slate-200'
                    )}
                  >
                    <SelectValue>
                      <div className="flex items-center gap-1.5">
                        {project.status === 'confirmed' ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : project.status === 'tentative' ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <Archive className="h-3 w-3" />
                        )}
                        <span className="capitalize">{project.status}</span>
                      </div>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3" />
                        Confirmed
                      </div>
                    </SelectItem>
                    <SelectItem value="tentative">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        Tentative
                      </div>
                    </SelectItem>
                    <SelectItem value="archived">
                      <div className="flex items-center gap-1.5">
                        <Archive className="h-3 w-3" />
                        Archived
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="hidden lg:table-cell text-muted-foreground">
                {project.manager?.email || '-'}
              </TableCell>
              <TableCell className="text-right">
                {canEdit(project) ? (
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onAssign(project)}>
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(project)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(project)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">View only</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )

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
            <h1 className="text-3xl font-bold">Projects</h1>
            <p className="text-muted-foreground">Manage your projects</p>
          </div>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Project
            </Button>
          </motion.div>
        </motion.div>

        <div className="flex items-center gap-4">
          <Input
            placeholder="Search projects by name or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
          <div className="flex items-center gap-2">
            <Switch
              checked={showArchived}
              onCheckedChange={setShowArchived}
              id="show-archived"
            />
            <Label htmlFor="show-archived" className="text-sm cursor-pointer">
              Show archived projects
            </Label>
          </div>
        </div>

        {/* Project Manager: Show "My Projects" and "Other Projects" sections */}
        {isProjectManager ? (
          <>
            {/* My Projects Section */}
            {myProjects.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">My Projects</h2>
                <ProjectTable
                  projects={myProjects}
                  canEdit={() => isAdmin}
                  onEdit={(project) => {
                    setEditingProject(project)
                    setCustomerId(project.customerId)
                    setName(project.name)
                    setStatus(project.status)
                  }}
                  onDelete={handleDeleteClick}
                  onAssign={(project) => setAssigningProject(project)}
                />
              </div>
            )}

            {/* Other Projects Section */}
            {otherProjects.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-muted-foreground">Other Projects</h2>
                <ProjectTable
                  projects={otherProjects}
                  canEdit={() => false}
                  onEdit={() => { }}
                  onDelete={() => { }}
                  onAssign={() => { }}
                />
              </div>
            )}

            {myProjects.length === 0 && otherProjects.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No projects found. Create your first project!
              </p>
            )}
          </>
        ) : (
          /* Admin: Show all projects together */
          <>
            <ProjectTable
              projects={sortedProjects}
              canEdit={() => true}
              onEdit={(project) => {
                setEditingProject(project)
                setCustomerId(project.customerId)
                setName(project.name)
                setStatus(project.status)
              }}
              onDelete={handleDeleteClick}
              onAssign={(project) => setAssigningProject(project)}
            />

            {sortedProjects.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No projects found. Create your first project!
              </p>
            )}
          </>
        )}

        <Dialog
          open={isCreateOpen || !!editingProject}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateOpen(false)
              setEditingProject(null)
              resetForm()
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingProject ? 'Edit Project' : 'Create Project'}
              </DialogTitle>
              <DialogDescription>
                {editingProject
                  ? 'Update the project details'
                  : 'Create a new project'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Popover
                    open={customerSelectOpen}
                    onOpenChange={(open) => {
                      setCustomerSelectOpen(open)
                      if (!open) resetCustomerForm()
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={customerSelectOpen}
                        className="w-full justify-start"
                      >
                        {customerId !== '' ? (
                          <>
                            {customers.find((c) => c.id === customerId)?.icon && (
                              <span className="mr-2">
                                {customers.find((c) => c.id === customerId)?.icon}
                              </span>
                            )}
                            <span className="text-left w-full">{customers.find((c) => c.id === customerId)?.name}</span>
                          </>
                        ) : (
                          <span className="text-left w-full">Select a customer</span>
                        )}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      {isCreatingCustomer ? (
                        <div className="p-3 space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <UserPlus className="h-4 w-4" />
                            New Customer
                          </div>
                          <div className="space-y-2">
                            <Input
                              placeholder="Customer name"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              autoFocus
                            />
                            <Input
                              placeholder="Emoji (optional)"
                              value={newCustomerIcon}
                              onChange={(e) => setNewCustomerIcon(e.target.value)}
                              maxLength={10}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={resetCustomerForm}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="flex-1"
                              onClick={handleCreateCustomer}
                              disabled={createCustomerMutation.isPending}
                              data-testid="create-customer-inline"
                            >
                              {createCustomerMutation.isPending ? 'Creating...' : 'Create'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Command>
                          <CommandInput placeholder="Search customers..." />
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            <ScrollArea className="h-64">
                              {customers.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={customer.name}
                                  onSelect={() => {
                                    setCustomerId(customer.id)
                                    setCustomerSelectOpen(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      customerId === customer.id ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  {customer.icon && <span className="mr-2">{customer.icon}</span>}
                                  {customer.name}
                                </CommandItem>
                              ))}
                            </ScrollArea>
                          </CommandGroup>
                          {(isAdmin || isProjectManager) && (
                            <>
                              <CommandSeparator />
                              <CommandGroup>
                                <CommandItem
                                  onSelect={() => setIsCreatingCustomer(true)}
                                  className="text-primary"
                                >
                                  <Plus className="mr-2 h-4 w-4" />
                                  New Customer
                                </CommandItem>
                              </CommandGroup>
                            </>
                          )}
                        </Command>
                      )}
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => setStatus(value as ProjectStatus)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="tentative">Tentative</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? (editingProject ? 'Saving...' : 'Creating...')
                    : (editingProject ? 'Update' : 'Create')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {assigningProject && (
          <AssignMemberDialog
            project={assigningProject}
            open={!!assigningProject}
            onOpenChange={(open) => !open && setAssigningProject(null)}
          />
        )}

        {/* Delete Project Confirmation Dialog */}
        <AlertDialog
          open={!!deleteDialog}
          onOpenChange={() => setDeleteDialog(null)}
          title="Delete Project"
          description="This will permanently delete the project and all associated data. This action cannot be undone."
          entityName={deleteDialog?.projectName}
          cascadeWarning={deleteDialog?.cascadeInfo ? {
            items: [
              { type: 'project assignments', count: deleteDialog.cascadeInfo.assignments },
              { type: 'day assignments', count: deleteDialog.cascadeInfo.dayAssignments },
              { type: 'milestones', count: deleteDialog.cascadeInfo.milestones },
            ].filter(item => item.count > 0)
          } : undefined}
          confirmLabel="Delete Project"
          onConfirm={() => {
            if (deleteDialog) {
              deleteMutation.mutate(deleteDialog.projectId)
              setDeleteDialog(null)
            }
          }}
          isLoading={deleteMutation.isPending}
        />
      </motion.div>
    </div>
  )
}
