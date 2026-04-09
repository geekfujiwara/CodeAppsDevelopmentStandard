/**
 * インシデント管理 — Dataverse サービス
 *
 * SDK 生成サービス (src/generated/) のラッパー。
 * カスタム getClient() / dataSourcesInfo は使用禁止。
 * 必ず `npx power-apps add-data-source` で生成されたコードを経由する。
 */

import { Geek_incidentsService } from "@/generated/services/Geek_incidentsService";
import { Geek_incidentcategoriesService } from "@/generated/services/Geek_incidentcategoriesService";
import { Geek_locationsService } from "@/generated/services/Geek_locationsService";
import { Geek_incidentcommentsService } from "@/generated/services/Geek_incidentcommentsService";
import type { Geek_incidents, Geek_incidentsBase } from "@/generated/models/Geek_incidentsModel";
import type { Geek_incidentcategories } from "@/generated/models/Geek_incidentcategoriesModel";
import type { Geek_locations } from "@/generated/models/Geek_locationsModel";
import type { Geek_incidentcomments, Geek_incidentcommentsBase } from "@/generated/models/Geek_incidentcommentsModel";

// ── 型の re-export（ページ層はこのファイル経由で型を取得） ──

export type {
  Geek_incidents as Incident,
  Geek_incidentsBase as IncidentBase,
} from "@/generated/models/Geek_incidentsModel";
export type {
  Geek_incidentcategories as IncidentCategory,
} from "@/generated/models/Geek_incidentcategoriesModel";
export type {
  Geek_locations as Location,
} from "@/generated/models/Geek_locationsModel";
export type {
  Geek_incidentcomments as IncidentComment,
} from "@/generated/models/Geek_incidentcommentsModel";

// ── CreateIncidentPayload / UpdateIncidentPayload ────────
// SDK 生成型の Base には ownerid/statecode 等のシステム列が required だが、
// レコード作成時は Dataverse が自動設定するため除外する。

type SystemFields = "geek_incidentid" | "ownerid" | "owneridtype" | "statecode" | "statuscode";
export type CreateIncidentPayload = Omit<Geek_incidentsBase, SystemFields> & Partial<Pick<Geek_incidentsBase, "ownerid" | "owneridtype" | "statecode" | "statuscode">>;
export type UpdateIncidentPayload = Partial<Omit<Geek_incidentsBase, "geek_incidentid">>;

// ── インシデント CRUD ────────────────────────────────────

export async function getIncidents(): Promise<Geek_incidents[]> {
  const result = await Geek_incidentsService.getAll({
    orderBy: ["createdon desc"],
  });
  return result.data;
}

export async function getIncident(id: string): Promise<Geek_incidents> {
  const result = await Geek_incidentsService.get(id);
  return result.data;
}

export async function createIncident(
  payload: CreateIncidentPayload,
): Promise<Geek_incidents> {
  const result = await Geek_incidentsService.create(payload as Omit<Geek_incidentsBase, "geek_incidentid">);
  return result.data;
}

export async function updateIncident(
  id: string,
  payload: UpdateIncidentPayload,
): Promise<Geek_incidents> {
  const result = await Geek_incidentsService.update(id, payload);
  return result.data;
}

export async function deleteIncident(id: string): Promise<void> {
  await Geek_incidentsService.delete(id);
}

// ── カテゴリ ─────────────────────────────────────────────

export async function getCategories(): Promise<Geek_incidentcategories[]> {
  const result = await Geek_incidentcategoriesService.getAll({
    orderBy: ["geek_name"],
  });
  return result.data;
}

// ── 場所 ─────────────────────────────────────────────────

export async function getLocations(): Promise<Geek_locations[]> {
  const result = await Geek_locationsService.getAll({
    orderBy: ["geek_name"],
  });
  return result.data;
}

// ── コメント ─────────────────────────────────────────────

export async function getComments(
  incidentId: string,
): Promise<Geek_incidentcomments[]> {
  const result = await Geek_incidentcommentsService.getAll({
    filter: `_geek_incidentid_value eq '${incidentId}'`,
    orderBy: ["createdon desc"],
  });
  return result.data;
}

export async function createComment(
  incidentId: string,
  name: string,
  content: string,
): Promise<Geek_incidentcomments> {
  const result = await Geek_incidentcommentsService.create({
    geek_name: name,
    geek_content: content,
    "geek_incidentid@odata.bind": `/geek_incidents(${incidentId})`,
  } as Omit<Geek_incidentcommentsBase, "geek_incidentcommentid">);
  return result.data;
}
