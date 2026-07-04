import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getQuotes, createQuote, updateQuote, deleteQuote,
  getQuoteLines, createQuoteLine, updateQuoteLine, deleteQuoteLine,
  getInvoices, createInvoice, updateInvoice, deleteInvoice,
  getCurrentUserId,
} from "@/services/dataverse-service"

export function useQuotes() {
  return useQuery({ queryKey: ["quotes"], queryFn: getQuotes })
}
export function useCreateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createQuote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  })
}
export function useUpdateQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateQuote(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  })
}
export function useDeleteQuote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quotes"] }),
  })
}

export function useQuoteLines() {
  return useQuery({ queryKey: ["quote_lines"], queryFn: getQuoteLines })
}
export function useCreateQuoteLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createQuoteLine,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote_lines"] }),
  })
}
export function useUpdateQuoteLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateQuoteLine(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote_lines"] }),
  })
}
export function useDeleteQuoteLine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteQuoteLine,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quote_lines"] }),
  })
}

export function useInvoices() {
  return useQuery({ queryKey: ["invoices"], queryFn: getInvoices })
}
export function useCreateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createInvoice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  })
}
export function useUpdateInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateInvoice(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  })
}
export function useDeleteInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
