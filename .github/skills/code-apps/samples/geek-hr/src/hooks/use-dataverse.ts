import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { PUBLISHER_PREFIX } from "@/config"
import {
  getCurrentUserId,
  getEmployees, createEmployee, updateEmployee, deleteEmployee,
  getRecruitments, createRecruitment, updateRecruitment, deleteRecruitment,
  getCandidates, createCandidate, updateCandidate, deleteCandidate,
  getEvaluations, createEvaluation, updateEvaluation, deleteEvaluation,
} from "@/services/dataverse-service"

const P = PUBLISHER_PREFIX

const QK = {
  currentUser:  ["currentUser"] as const,
  employees:    ["employees"] as const,
  recruitments: ["recruitments"] as const,
  candidates:   (recruitmentId?: string) =>
    recruitmentId ? ["candidates", recruitmentId] as const : ["candidates"] as const,
  evaluations:  ["evaluations"] as const,
}

// ── System ────────────────────────────────────────────────────

export function useCurrentUserId() {
  return useQuery({ queryKey: QK.currentUser, queryFn: getCurrentUserId, staleTime: Infinity })
}

// ── Employee ──────────────────────────────────────────────────

export function useEmployees() {
  return useQuery({ queryKey: QK.employees, queryFn: getEmployees })
}

export function useCreateEmployee() {
  const qc = useQueryClient()
  const f = () => ({
    name:            `${P}_name`,
    department:      `${P}_department`,
    position:        `${P}_position`,
    employment_type: `${P}_employment_type`,
    hire_date:       `${P}_hire_date`,
    status:          `${P}_status`,
    email:           `${P}_email`,
    phone:           `${P}_phone`,
    notes:           `${P}_notes`,
  })
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return createEmployee({ ...mapped, [fMap.status]: mapped[fMap.status] ?? 100000000 })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.employees }),
  })
}

export function useUpdateEmployee() {
  const qc = useQueryClient()
  const f = () => ({
    name:            `${P}_name`,
    department:      `${P}_department`,
    position:        `${P}_position`,
    employment_type: `${P}_employment_type`,
    hire_date:       `${P}_hire_date`,
    status:          `${P}_status`,
    email:           `${P}_email`,
    phone:           `${P}_phone`,
    notes:           `${P}_notes`,
  })
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return updateEmployee(id, mapped)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.employees }),
  })
}

export function useDeleteEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.employees }),
  })
}

// ── Recruitment ───────────────────────────────────────────────

export function useRecruitments() {
  return useQuery({ queryKey: QK.recruitments, queryFn: getRecruitments })
}

export function useCreateRecruitment() {
  const qc = useQueryClient()
  const f = () => ({
    title:          `${P}_title`,
    department:     `${P}_department`,
    required_count: `${P}_required_count`,
    status:         `${P}_status`,
    deadline:       `${P}_deadline`,
    description:    `${P}_description`,
  })
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return createRecruitment({ ...mapped, [fMap.status]: mapped[fMap.status] ?? 100000000 })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.recruitments }),
  })
}

export function useUpdateRecruitment() {
  const qc = useQueryClient()
  const f = () => ({
    title:          `${P}_title`,
    department:     `${P}_department`,
    required_count: `${P}_required_count`,
    status:         `${P}_status`,
    deadline:       `${P}_deadline`,
    description:    `${P}_description`,
  })
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return updateRecruitment(id, mapped)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.recruitments }),
  })
}

export function useDeleteRecruitment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteRecruitment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.recruitments }),
  })
}

// ── Candidate ─────────────────────────────────────────────────

export function useCandidates(recruitmentId?: string) {
  return useQuery({
    queryKey: QK.candidates(recruitmentId),
    queryFn: () => getCandidates(recruitmentId),
  })
}

export function useCreateCandidate() {
  const qc = useQueryClient()
  const f = () => ({
    full_name:      `${P}_full_name`,
    stage:          `${P}_stage`,
    score:          `${P}_score`,
    interview_date: `${P}_interview_date`,
    notes:          `${P}_notes`,
  })
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => {
      const fMap = f()
      const { recruitment_id, ...rest } = data
      const mapped = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      if (recruitment_id) {
        mapped[`${P}_recruitment_id@odata.bind`] = `/${P}_recruitments(${recruitment_id as string})`
      }
      return createCandidate({ ...mapped, [fMap.stage]: mapped[fMap.stage] ?? 100000000 })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["candidates"] })
    },
  })
}

export function useUpdateCandidate() {
  const qc = useQueryClient()
  const f = () => ({
    full_name:      `${P}_full_name`,
    stage:          `${P}_stage`,
    score:          `${P}_score`,
    interview_date: `${P}_interview_date`,
    notes:          `${P}_notes`,
  })
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return updateCandidate(id, mapped)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  })
}

export function useDeleteCandidate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteCandidate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  })
}

// ── Evaluation ────────────────────────────────────────────────

export function useEvaluations() {
  return useQuery({ queryKey: QK.evaluations, queryFn: getEvaluations })
}

export function useCreateEvaluation() {
  const qc = useQueryClient()
  const f = () => ({
    period:          `${P}_period`,
    score:           `${P}_score`,
    comment:         `${P}_comment`,
    evaluation_date: `${P}_evaluation_date`,
  })
  return useMutation({
    mutationFn: (data: Partial<Record<string, unknown>>) => {
      const fMap = f()
      const { employee_id, ...rest } = data
      const mapped = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      if (employee_id) {
        mapped[`${P}_employee_id@odata.bind`] = `/${P}_employees(${employee_id as string})`
      }
      return createEvaluation(mapped)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.evaluations }),
  })
}

export function useUpdateEvaluation() {
  const qc = useQueryClient()
  const f = () => ({
    period:          `${P}_period`,
    score:           `${P}_score`,
    comment:         `${P}_comment`,
    evaluation_date: `${P}_evaluation_date`,
  })
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Record<string, unknown>> }) => {
      const fMap = f()
      const mapped = Object.fromEntries(
        Object.entries(data).map(([k, v]) => [fMap[k as keyof ReturnType<typeof f>] ?? k, v])
      )
      return updateEvaluation(id, mapped)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.evaluations }),
  })
}

export function useDeleteEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteEvaluation(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.evaluations }),
  })
}
