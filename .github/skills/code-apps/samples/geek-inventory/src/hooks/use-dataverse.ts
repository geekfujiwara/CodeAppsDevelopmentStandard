import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  getStockMovements, createStockMovement, updateStockMovement, deleteStockMovement,
  getOrders, createOrder, updateOrder, deleteOrder,
  getCurrentUserId,
} from "@/services/dataverse-service"

// Products
export function useProducts() {
  return useQuery({ queryKey: ["products"], queryFn: getProducts })
}
export function useCreateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  })
}
export function useUpdateProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateProduct(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  })
}
export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  })
}

// StockMovements
export function useStockMovements() {
  return useQuery({ queryKey: ["stock-movements"], queryFn: getStockMovements })
}
export function useCreateStockMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createStockMovement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-movements"] })
      qc.invalidateQueries({ queryKey: ["products"] }) // refresh stock counts
    },
  })
}
export function useUpdateStockMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateStockMovement(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-movements"] })
      qc.invalidateQueries({ queryKey: ["products"] })
    },
  })
}
export function useDeleteStockMovement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteStockMovement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-movements"] })
      qc.invalidateQueries({ queryKey: ["products"] })
    },
  })
}

// Orders
export function useOrders() {
  return useQuery({ queryKey: ["orders"], queryFn: getOrders })
}
export function useCreateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  })
}
export function useUpdateOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => updateOrder(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  })
}
export function useDeleteOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  })
}

export function useCurrentUserId() {
  return useQuery({ queryKey: ["currentUser"], queryFn: getCurrentUserId })
}
