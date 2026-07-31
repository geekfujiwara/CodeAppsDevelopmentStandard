import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  getContact,
  getLinkRequests,
  linkContactToAccount,
  rejectLinkRequest,
  searchAccounts,
} from "@/services/account-link-service"

export function useLinkRequests(onlyOpen = true) {
  return useQuery({
    queryKey: ["accountLinkRequests", onlyOpen],
    queryFn: () => getLinkRequests(onlyOpen),
  })
}

export function useContact(contactId: string | null) {
  return useQuery({
    queryKey: ["contact", contactId],
    queryFn: () => getContact(contactId as string),
    enabled: Boolean(contactId),
  })
}

export function useAccountSearch(keyword: string) {
  return useQuery({
    queryKey: ["accounts", keyword],
    queryFn: () => searchAccounts(keyword),
  })
}

export function useLinkContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { requestId: string; contactId: string; accountId: string; note?: string }) =>
      linkContactToAccount(input.requestId, input.contactId, input.accountId, input.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accountLinkRequests"] })
      qc.invalidateQueries({ queryKey: ["contact"] })
    },
  })
}

export function useRejectLinkRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { requestId: string; reason: string }) =>
      rejectLinkRequest(input.requestId, input.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accountLinkRequests"] }),
  })
}
