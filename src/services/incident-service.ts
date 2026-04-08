/**
 * インシデント管理 — Dataverse サービス
 *
 * Power Apps SDK の getClient() + DataClient パターンで CRUD 操作を統一。
 *
 * 注: `pac code add-data-source -a dataverse -t geek_incident` 実行後、
 *     生成される DataSources 情報でこのファイルの dataSourcesInfo を更新してください。
 */

import { getClient } from "@microsoft/power-apps/data";
import type { DataClient } from "@microsoft/power-apps/data";
import type {
  Incident,
  IncidentCategory,
  Location,
  IncidentComment,
  CreateIncidentPayload,
  UpdateIncidentPayload,
} from "@/lib/incident-types";

const PREFIX = "geek";

/**
 * DataSources 情報のプレースホルダー。
 * `pac code add-data-source` 実行後に生成される設定で置き換えてください。
 * Power Apps ランタイム上では SDK が自動で解決します。
 */
const dataSourcesInfo: Record<
  string,
  { tableId: string; apis: Record<string, never> }
> = {
  [`${PREFIX}_incidents`]: { tableId: `${PREFIX}_incident`, apis: {} },
  [`${PREFIX}_incidentcategories`]: {
    tableId: `${PREFIX}_incidentcategory`,
    apis: {},
  },
  [`${PREFIX}_locations`]: { tableId: `${PREFIX}_location`, apis: {} },
  [`${PREFIX}_incidentcomments`]: {
    tableId: `${PREFIX}_incidentcomment`,
    apis: {},
  },
};

function client(): DataClient {
  return getClient(dataSourcesInfo);
}

const INCIDENT_SELECT = [
  `${PREFIX}_incidentid`,
  `${PREFIX}_name`,
  `${PREFIX}_description`,
  `${PREFIX}_status`,
  `${PREFIX}_priority`,
  `${PREFIX}_duedate`,
  "createdon",
  "modifiedon",
  `_${PREFIX}_incidentcategoryid_value`,
  `_${PREFIX}_locationid_value`,
  `_${PREFIX}_assignedtoid_value`,
];

// ── インシデント ─────────────────────────────────────────

export async function getIncidents(): Promise<Incident[]> {
  const c = client();
  const result = await c.retrieveMultipleRecordsAsync<Incident>(
    `${PREFIX}_incidents`,
    {
      select: INCIDENT_SELECT,
      orderBy: ["createdon desc"],
    },
  );
  return result.data;
}

export async function getIncident(id: string): Promise<Incident> {
  const c = client();
  const result = await c.retrieveRecordAsync<Incident>(
    `${PREFIX}_incidents`,
    id,
    { select: INCIDENT_SELECT },
  );
  return result.data;
}

export async function createIncident(
  payload: CreateIncidentPayload,
): Promise<unknown> {
  const c = client();
  const result = await c.createRecordAsync(`${PREFIX}_incidents`, payload);
  return result.data;
}

export async function updateIncident(
  id: string,
  payload: UpdateIncidentPayload,
): Promise<void> {
  const c = client();
  await c.updateRecordAsync(`${PREFIX}_incidents`, id, payload);
}

export async function deleteIncident(id: string): Promise<void> {
  const c = client();
  await c.deleteRecordAsync(`${PREFIX}_incidents`, id);
}

// ── カテゴリ ─────────────────────────────────────────────

export async function getCategories(): Promise<IncidentCategory[]> {
  const c = client();
  const result = await c.retrieveMultipleRecordsAsync<IncidentCategory>(
    `${PREFIX}_incidentcategories`,
    {
      select: [`${PREFIX}_incidentcategoryid`, `${PREFIX}_name`],
      orderBy: [`${PREFIX}_name`],
    },
  );
  return result.data;
}

// ── 場所 ─────────────────────────────────────────────────

export async function getLocations(): Promise<Location[]> {
  const c = client();
  const result = await c.retrieveMultipleRecordsAsync<Location>(
    `${PREFIX}_locations`,
    {
      select: [`${PREFIX}_locationid`, `${PREFIX}_name`],
      orderBy: [`${PREFIX}_name`],
    },
  );
  return result.data;
}

// ── コメント ─────────────────────────────────────────────

export async function getComments(
  incidentId: string,
): Promise<IncidentComment[]> {
  const c = client();
  const result = await c.retrieveMultipleRecordsAsync<IncidentComment>(
    `${PREFIX}_incidentcomments`,
    {
      select: [
        `${PREFIX}_incidentcommentid`,
        `${PREFIX}_name`,
        `${PREFIX}_content`,
        "createdon",
      ],
      filter: `_${PREFIX}_incidentid_value eq '${incidentId}'`,
      orderBy: ["createdon desc"],
    },
  );
  return result.data;
}

export async function createComment(
  incidentId: string,
  name: string,
  content: string,
): Promise<unknown> {
  const c = client();
  const result = await c.createRecordAsync(`${PREFIX}_incidentcomments`, {
    [`${PREFIX}_name`]: name,
    [`${PREFIX}_content`]: content,
    [`${PREFIX}_incidentid@odata.bind`]: `/${PREFIX}_incidents(${incidentId})`,
  });
  return result.data;
}
