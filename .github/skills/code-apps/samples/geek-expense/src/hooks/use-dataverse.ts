import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getCurrentUserId, getExpenses, getExpenseById,
  createExpense, updateExpense, deleteExpense,
  submitExpense, approveExpense, rejectExpense,
} from "@/services/dataverse-service"
import { triggerApprovalNotification } from "@/services/approval-flow-service"
import { FEATURE_APPROVAL_FLOW, PUBLISHER_PREFIX } from "@/config"

const QK = {
  expenses: ["expenses"] as const,
  expense:  (id: string) => ["expenses", id] as const,
  currentUser: ["currentUser"] as const,
}

export function useCurrentUserId() {
  return useQuery({ queryKey: QK.currentUser, queryFn: getCurrentUserId, staleTime: Infinity })
}

export function useExpenses() {
  return useQuery({ queryKey: QK.expenses, queryFn: getExpenses })
}

export function useExpenseById(id: string) {
  return useQuery({ queryKey: QK.expense(id), queryFn: () => getExpenseById(id), enabled: !!id })
}

export function useCreateExpense() {
  const qc = useQueryClient()
  const f = () => ({
    title:       `${PUBLISHER_PREFIX}_title`,
    amount:      `${PUBLISHER_PREFIX}_amount`,
    category:    `${PUBLISHER_PREFIX}_category`,
    expensedate: `${PUBLISHER_PREFIX}_expensedate`,
    description: `${PUBLISHER_PREFIX}_description`,
    status:      `${PUBLISHER_PREFIX}_status`,
    department:  `${PUBLISHER_PREFIX}_department`,
    notes:       `${PUBLISHER_PREFIX}_notes`,
  })
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return createExpense({ ...mapped, [fMap.status]: 100000000 }) // default: 下書き
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.expenses }),
  })
}

export function useUpdateExpense() {
  const qc = useQueryClient()
  const f = () => ({
    title:       `${PUBLISHER_PREFIX}_title`,
    amount:      `${PUBLISHER_PREFIX}_amount`,
    category:    `${PUBLISHER_PREFIX}_category`,
    expensedate: `${PUBLISHER_PREFIX}_expensedate`,
    description: `${PUBLISHER_PREFIX}_description`,
    status:      `${PUBLISHER_PREFIX}_status`,
    department:  `${PUBLISHER_PREFIX}_department`,
    notes:       `${PUBLISHER_PREFIX}_notes`,
  })
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return updateExpense(id, mapped)
    },
    onSuccess: (_r, { id }) => {
      qc.invalidateQueries({ queryKey: QK.expenses })
      qc.invalidateQueries({ queryKey: QK.expense(id) })
    },
  })
}

export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.expenses }),
  })
}

export function useSubmitExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; title: string; amount: number; submittedBy: string }) => {
      await submitExpense(params.id)
      if (FEATURE_APPROVAL_FLOW) {
        await triggerApprovalNotification({
          expenseId:    params.id,
          expenseTitle: params.title,
          amount:       params.amount,
          submittedBy:  params.submittedBy,
        })
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.expenses }),
  })
}

export function useApproveExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => approveExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.expenses }),
  })
}

export function useRejectExpense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rejectExpense(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.expenses }),
  })
}
