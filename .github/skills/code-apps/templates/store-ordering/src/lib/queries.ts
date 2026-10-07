import { useQuery } from "@tanstack/react-query"
import { addDays } from "@/lib/order-rules"
import {
  fetchDaily,
  fetchEvents,
  fetchInventory,
  fetchItems,
  fetchOrders,
  fetchSetting,
  fetchTrends,
  fetchWeather,
} from "@/lib/store-api"

const STALE = 30_000

export const useSetting = () => useQuery({ queryKey: ["setting"], queryFn: fetchSetting, staleTime: STALE })
export const useItems = () => useQuery({ queryKey: ["items"], queryFn: fetchItems, staleTime: 5 * 60_000 })
export const useInventory = () => useQuery({ queryKey: ["inventory"], queryFn: fetchInventory, staleTime: STALE })
export const useTrends = () => useQuery({ queryKey: ["trends"], queryFn: fetchTrends, staleTime: STALE })
export const useOrders = () => useQuery({ queryKey: ["orders"], queryFn: fetchOrders, staleTime: 5_000 })

/** 今日の days 日前から昨日までの日次実績（全品目） */
export function useRecentDaily(businessDate: string | undefined, days: number) {
  return useQuery({
    queryKey: ["daily", businessDate, days],
    queryFn: () => fetchDaily(addDays(businessDate!, -days)),
    enabled: Boolean(businessDate),
    staleTime: 5 * 60_000,
  })
}

/** 1 品目の直近 days 日の日次実績 */
export function useItemDaily(businessDate: string | undefined, sku: string | undefined, days: number) {
  return useQuery({
    queryKey: ["daily-item", businessDate, sku, days],
    queryFn: () => fetchDaily(addDays(businessDate!, -days), sku),
    enabled: Boolean(businessDate && sku),
    staleTime: 5 * 60_000,
  })
}

export function useWeather(businessDate: string | undefined) {
  return useQuery({
    queryKey: ["weather", businessDate],
    queryFn: () => fetchWeather(addDays(businessDate!, -7)),
    enabled: Boolean(businessDate),
    staleTime: STALE,
  })
}

export function useEvents(businessDate: string | undefined) {
  return useQuery({
    queryKey: ["events", businessDate],
    queryFn: () => fetchEvents(addDays(businessDate!, -30)),
    enabled: Boolean(businessDate),
    staleTime: STALE,
  })
}
