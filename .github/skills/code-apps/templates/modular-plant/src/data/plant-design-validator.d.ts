import type { ErrorObject } from "ajv"
declare const validate: { (data: unknown): boolean; errors?: ErrorObject[] | null }
export default validate