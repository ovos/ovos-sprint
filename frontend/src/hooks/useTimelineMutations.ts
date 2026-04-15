import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/api/client'
import { useToast } from '@/hooks/use-toast'
import { AssignmentPriority } from '@/types'

/**
 * Custom hook for all timeline mutations
 *
 * Provides mutation objects for:
 * - Creating day assignments
 * - Deleting day assignments
 * - Creating milestones
 * - Deleting milestones
 * - Creating day offs
 * - Deleting day offs
 * - Saving assignment groups
 *
 * All mutations include proper cache invalidation and toast notifications.
 *
 * @returns Object with all mutation objects
 */
export function useTimelineMutations() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  /**
   * Create a new day assignment
   */
  const createDayAssignmentMutation = useMutation({
    mutationFn: async (data: {
      projectAssignmentId: number
      date: string
    }) => {
      const response = await api.post('/assignments/days', data)
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assignments', 'days'] })
      // Day mutations can trigger group merges, so refetch groups too
      await queryClient.refetchQueries({
        queryKey: ['assignment-groups'],
        type: 'all'
      })
      toast({ title: 'Assignment created' })
    },
  })

  /**
   * Delete a day assignment
   */
  const deleteDayAssignmentMutation = useMutation({
    mutationFn: async (dayAssignmentId: number) => {
      await api.delete(`/assignments/days/${dayAssignmentId}`)
    },
    onSuccess: async () => {
      // Force immediate refetch of day assignments
      await queryClient.refetchQueries({
        queryKey: ['assignments', 'days'],
        type: 'all'
      })
      // Day deletions can trigger group splits/deletions, so refetch groups too
      await queryClient.refetchQueries({
        queryKey: ['assignment-groups'],
        type: 'all'
      })
      toast({ title: 'Assignment deleted' })
    },
  })

  /**
   * Batch create multiple day assignments at once
   */
  const createBatchDayAssignmentsMutation = useMutation({
    mutationFn: async (data: { projectAssignmentId: number; dates: string[] }) => {
      const response = await api.post('/assignments/days/batch', data)
      return response.data
    },
    onMutate: async () => {
      // Cancel outgoing refetches to avoid race conditions
      await queryClient.cancelQueries({ queryKey: ['assignments', 'days'] })

      // Snapshot previous value for potential rollback
      const previousDays = queryClient.getQueryData(['assignments', 'days'])

      return { previousDays }
    },
    onError: (_err, _newData, context) => {
      // Rollback on error
      if (context?.previousDays) {
        queryClient.setQueryData(['assignments', 'days'], context.previousDays)
      }
    },
    onSuccess: () => {
      toast({ title: 'Assignment created' })
    },
    onSettled: () => {
      // Refetch once after mutation settles (success or error)
      queryClient.invalidateQueries({ queryKey: ['assignments', 'days'] })
      queryClient.invalidateQueries({ queryKey: ['assignment-groups'] })
    },
  })

  /**
   * Batch delete multiple day assignments at once
   */
  const deleteBatchDayAssignmentsMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await api.delete('/assignments/days/batch', { data: { ids } })
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ['assignments', 'days'],
        type: 'all'
      })
      await queryClient.refetchQueries({
        queryKey: ['assignment-groups'],
        type: 'all'
      })
      toast({ title: 'Assignments deleted' })
    },
  })

  /**
   * Create a new milestone
   */
  const createMilestoneMutation = useMutation({
    mutationFn: async (data: { projectId: number; date: string }) => {
      const response = await api.post('/milestones', data)
      return response.data
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ['milestones'],
        type: 'all'
      })
      toast({ title: 'Milestone created' })
    },
  })

  /**
   * Delete a milestone
   */
  const deleteMilestoneMutation = useMutation({
    mutationFn: async (milestoneId: number) => {
      await api.delete(`/milestones/${milestoneId}`)
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ['milestones'],
        type: 'all'
      })
      toast({ title: 'Milestone deleted' })
    },
  })

  /**
   * Create a new day off
   */
  const createDayOffMutation = useMutation({
    mutationFn: async ({ teamMemberId, date }: { teamMemberId: number; date: string }) => {
      await api.post('/day-offs', { teamMemberId, date })
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ['day-offs'],
        type: 'all'
      })
      await queryClient.refetchQueries({
        queryKey: ['assignments', 'days'],
        type: 'all'
      })
      toast({ title: 'Day off added' })
    },
  })

  /**
   * Delete a day off
   */
  const deleteDayOffMutation = useMutation({
    mutationFn: async (dayOffId: number) => {
      await api.delete(`/day-offs/${dayOffId}`)
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ['day-offs'],
        type: 'all'
      })
      toast({ title: 'Day off removed' })
    },
  })

  /**
   * Save assignment group (create or update)
   */
  const saveAssignmentGroupMutation = useMutation({
    mutationFn: async (data: {
      groupId?: number
      projectAssignmentId: number
      startDate: string
      endDate: string
      priority: AssignmentPriority
      comment: string | null
    }) => {
      if (data.groupId) {
        // Update existing group
        const response = await api.put(`/assignments/groups/${data.groupId}`, {
          priority: data.priority,
          comment: data.comment,
        })
        return response.data
      } else {
        // Try to create new group
        try {
          const response = await api.post('/assignments/groups', {
            projectAssignmentId: data.projectAssignmentId,
            startDate: data.startDate,
            endDate: data.endDate,
            priority: data.priority,
            comment: data.comment,
          })
          return response.data
        } catch (error: unknown) {
          // If overlapping group exists, update it instead
          const axiosError = error as { response?: { data?: { existingGroupId?: number } } }
          if (axiosError.response?.data?.existingGroupId) {
            const response = await api.put(`/assignments/groups/${axiosError.response.data.existingGroupId}`, {
              priority: data.priority,
              comment: data.comment,
            })
            return response.data
          }
          throw error
        }
      }
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ['assignment-groups'],
        type: 'all'
      })
      toast({ title: 'Assignment updated' })
    },
    onError: (error) => {
      console.error('Failed to save assignment group:', error)
      toast({ title: 'Failed to update assignment', variant: 'destructive' })
    },
  })

  /**
   * Move assignment block to new date range with merge support
   */
  const moveAssignmentMutation = useMutation({
    mutationFn: async (data: {
      projectAssignmentId: number
      oldStartDate?: string
      oldEndDate?: string
      newStartDate: string
      newEndDate: string
    }) => {
      const response = await api.post(
        `/assignments/projects/${data.projectAssignmentId}/move`,
        {
          oldStartDate: data.oldStartDate,
          oldEndDate: data.oldEndDate,
          newStartDate: data.newStartDate,
          newEndDate: data.newEndDate,
        }
      )
      return response.data
    },
    onSuccess: async (data) => {
      // Refetch day assignments and groups
      await queryClient.refetchQueries({
        queryKey: ['assignments', 'days'],
        type: 'all'
      })
      await queryClient.refetchQueries({
        queryKey: ['assignment-groups'],
        type: 'all'
      })

      // Show toast with merge info
      toast({
        title: 'Assignment moved',
        description:
          data.mergedDays > 0
            ? `Merged with ${data.mergedDays} overlapping day(s)`
            : 'Assignment moved successfully',
      })
    },
    onError: (error: any) => {
      console.error('Failed to move assignment:', error)
      toast({
        title: 'Failed to move assignment',
        description: error.response?.data?.error || 'Unknown error',
        variant: 'destructive',
      })
    },
  })

  return {
    createDayAssignmentMutation,
    deleteDayAssignmentMutation,
    createBatchDayAssignmentsMutation,
    deleteBatchDayAssignmentsMutation,
    createMilestoneMutation,
    deleteMilestoneMutation,
    createDayOffMutation,
    deleteDayOffMutation,
    saveAssignmentGroupMutation,
    moveAssignmentMutation,
  }
}
