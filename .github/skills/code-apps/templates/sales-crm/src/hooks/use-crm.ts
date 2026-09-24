import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import {
  getEntity, listEntity, loadAccounts, loadActivities, loadContacts, loadOpportunities, loadPeriods, loadTargets,
  loadUsers, removeEntity, saveEntity, updateActivity, updateOpportunity, type FormValues,
} from "@/crm/api"
import { ENTITIES, type EntityKey } from "@/crm/schema"
import { currentEntraObjectId, type DataverseRow } from "@/lib/dataverse-client"

const KEY = "crm"

export const useOpportunities = () => useQuery({ queryKey: [KEY, "opportunities"], queryFn: loadOpportunities })
export const useActivities = () => useQuery({ queryKey: [KEY, "activities"], queryFn: loadActivities })
export const useTargets = () => useQuery({ queryKey: [KEY, "targets"], queryFn: loadTargets })
export const usePeriods = () => useQuery({ queryKey: [KEY, "periods"], queryFn: loadPeriods })
export const useUsers = () => useQuery({ queryKey: [KEY, "users"], queryFn: loadUsers, staleTime: 30 * 60_000 })
export const useAccounts = () => useQuery({ queryKey: [KEY, "accounts"], queryFn: loadAccounts })
export const useContacts = () => useQuery({ queryKey: [KEY, "contacts"], queryFn: loadContacts })

export const useEntityRows = (key: EntityKey) =>
  useQuery({ queryKey: [KEY, "entity", key], queryFn: () => listEntity(ENTITIES[key]) })

export const useEntityRow = (key: EntityKey, id?: string) =>
  useQuery({ queryKey: [KEY, "entity", key, id], queryFn: () => getEntity(ENTITIES[key], id!), enabled: !!id })

export function useCurrentUser() {
  const users = useUsers()
  const entra = useQuery({ queryKey: [KEY, "me"], queryFn: currentEntraObjectId, staleTime: Number.POSITIVE_INFINITY })
  const me = useMemo(
    () => users.data?.find((u) => u.entraId && u.entraId.toLowerCase() === entra.data?.toLowerCase()),
    [users.data, entra.data],
  )
  return { me, isLoading: users.isLoading || entra.isLoading }
}

export function useUserMap() {
  const users = useUsers()
  return useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data])
}

export interface LookupChoice { value: string; label: string }

export function useLookupChoices(): Partial<Record<EntityKey, LookupChoice[]>> {
  const accounts = useAccounts()
  const contacts = useContacts()
  const opportunities = useOpportunities()
  const periods = usePeriods()
  return useMemo(() => ({
    account: (accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
    contact: (contacts.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    opportunity: (opportunities.data ?? []).map((o) => ({ value: o.id, label: o.name })),
    period: (periods.data ?? []).map((p) => ({ value: p.id, label: p.name })),
  }), [accounts.data, contacts.data, opportunities.data, periods.data])
}

function useInvalidate() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: [KEY] })
}

export function useSaveEntity(key: EntityKey) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ values, id }: { values: FormValues; id?: string }) => saveEntity(ENTITIES[key], values, id),
    onSuccess: invalidate,
  })
}

export function useDeleteEntity(key: EntityKey) {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: string) => removeEntity(ENTITIES[key], id), onSuccess: invalidate })
}

export function usePatchOpportunity() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: DataverseRow }) => updateOpportunity(id, body), onSuccess: invalidate })
}

export function usePatchActivity() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, body }: { id: string; body: DataverseRow }) => updateActivity(id, body), onSuccess: invalidate })
}
