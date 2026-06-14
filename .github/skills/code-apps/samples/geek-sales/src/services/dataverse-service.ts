import { getClient } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
import type { IContext } from "@microsoft/power-apps/app";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
import { PUBLISHER_PREFIX } from "@/config";
import type {
  Customer,
  CustomerCreate,
  Opportunity,
  OpportunityCreate,
  Activity,
  ActivityCreate,
  Territory,
  TerritoryCreate,
  NewsInsight,
} from "@/types/dataverse";
import type { Incident, IncidentCreate } from "@/types/incident";

// テーブル名・フィールド名はパブリッシャープレフィックスから動的に構築する
// PUBLISHER_PREFIX（= VITE_PUBLISHER_PREFIX の値）を変えるだけで別環境に対応できる
const P = PUBLISHER_PREFIX

function client() {
  return getClient(dataSourcesInfo);
}

// ── ログインユーザー systemuserid 解決 ──
let _sdkContext: IContext | null = null;
async function getSdkContext(): Promise<IContext | null> {
  if (_sdkContext) return _sdkContext;
  try {
    _sdkContext = await getContext();
    return _sdkContext;
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const ctx = await getSdkContext();
    const entraId = ctx?.user?.objectId;
    if (!entraId) return null;

    const result = await client().retrieveMultipleRecordsAsync("systemusers", {
      select: ["systemuserid"],
      filter: `azureactivedirectoryobjectid eq '${entraId}'`,
      top: 1,
    });
    if (result?.success && result.data?.length > 0) {
      const uid = (result.data[0] as Record<string, unknown>)
        ?.systemuserid as string;
      if (uid) return uid.toLowerCase();
    }
  } catch (e) {
    console.warn("[getCurrentUserId] failed:", e);
  }
  return null;
}

// ── 顧客 ──
export async function getCustomers(): Promise<Customer[]> {
  const result = await client().retrieveMultipleRecordsAsync(
    `${P}_customers`,
    {
      select: [
        `${P}_customerid`,
        `${P}_name`,
        `${P}_industry`,
        `${P}_contactperson`,
        `${P}_email`,
        `${P}_phone`,
        `${P}_address`,
        `${P}_notes`,
        "createdon",
      ],
      orderBy: [`${P}_name asc`],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as Customer[];
}

export async function createCustomer(data: CustomerCreate) {
  const result = await client().createRecordAsync(
    `${P}_customers`,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Customer;
}

export async function updateCustomer(
  id: string,
  data: Partial<CustomerCreate>,
) {
  const result = await client().updateRecordAsync(
    `${P}_customers`,
    id,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Customer;
}

export async function deleteCustomer(id: string) {
  const result = await client().deleteRecordAsync(`${P}_customers`, id);
  if (!result.success) throw result.error;
}

// ── 商談 ──
export async function getOpportunities(): Promise<Opportunity[]> {
  const result = await client().retrieveMultipleRecordsAsync(
    `${P}_opportunities`,
    {
      select: [
        `${P}_opportunityid`,
        `${P}_name`,
        `${P}_stage`,
        `${P}_amount`,
        `${P}_probability`,
        `${P}_expectedclosedate`,
        `${P}_description`,
        `${P}_aiinsights`,
        `_${P}_customerid_value`,
        "_createdby_value",
        "createdon",
      ],
      orderBy: ["createdon desc"],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as Opportunity[];
}

export async function createOpportunity(data: OpportunityCreate) {
  const result = await client().createRecordAsync(
    `${P}_opportunities`,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Opportunity;
}

export async function updateOpportunity(
  id: string,
  data: Partial<OpportunityCreate>,
) {
  const result = await client().updateRecordAsync(
    `${P}_opportunities`,
    id,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Opportunity;
}

export async function deleteOpportunity(id: string) {
  const result = await client().deleteRecordAsync(`${P}_opportunities`, id);
  if (!result.success) throw result.error;
}

// ── 活動履歴 ──
export async function getActivities(): Promise<Activity[]> {
  const result = await client().retrieveMultipleRecordsAsync(
    `${P}_activities`,
    {
      select: [
        `${P}_activityid`,
        `${P}_name`,
        `${P}_type`,
        `${P}_activitydate`,
        `${P}_content`,
        `${P}_nextaction`,
        `_${P}_customerid_value`,
        `_${P}_opportunityid_value`,
        "createdon",
      ],
      orderBy: [`${P}_activitydate desc`],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as Activity[];
}

export async function createActivity(data: ActivityCreate) {
  const result = await client().createRecordAsync(
    `${P}_activities`,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Activity;
}

export async function updateActivity(
  id: string,
  data: Partial<ActivityCreate>,
) {
  const result = await client().updateRecordAsync(
    `${P}_activities`,
    id,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Activity;
}

export async function deleteActivity(id: string) {
  const result = await client().deleteRecordAsync(`${P}_activities`, id);
  if (!result.success) throw result.error;
}

// ── テリトリー ──
export async function getTerritories(): Promise<Territory[]> {
  const result = await client().retrieveMultipleRecordsAsync(
    `${P}_territories`,
    {
      orderBy: [`${P}_name asc`],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as Territory[];
}

export async function createTerritory(data: TerritoryCreate) {
  const result = await client().createRecordAsync(
    `${P}_territories`,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Territory;
}

export async function updateTerritory(
  id: string,
  data: Partial<TerritoryCreate>,
) {
  const result = await client().updateRecordAsync(
    `${P}_territories`,
    id,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Territory;
}

export async function deleteTerritory(id: string) {
  const result = await client().deleteRecordAsync(`${P}_territories`, id);
  if (!result.success) throw result.error;
}

// ── インシデント ──
export async function getIncidents(): Promise<Incident[]> {
  const result = await client().retrieveMultipleRecordsAsync(
    `${P}_incidents`,
    {
      select: [
        `${P}_incidentid`,
        `${P}_title`,
        `${P}_description`,
        `${P}_status`,
        `${P}_priority`,
        `${P}_assettype`,
        `${P}_assetstatus`,
        `${P}_reportedby`,
        `${P}_assignedto`,
        `${P}_resolvedon`,
        `${P}_resolution`,
        "createdon",
      ],
      orderBy: ["createdon desc"],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as Incident[];
}

export async function createIncident(data: IncidentCreate) {
  const result = await client().createRecordAsync(
    `${P}_incidents`,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Incident;
}

export async function updateIncident(
  id: string,
  data: Partial<IncidentCreate>,
) {
  const result = await client().updateRecordAsync(
    `${P}_incidents`,
    id,
    data as Record<string, unknown>,
  );
  if (!result.success) throw result.error;
  return result.data as Incident;
}

export async function deleteIncident(id: string) {
  const result = await client().deleteRecordAsync(`${P}_incidents`, id);
  if (!result.success) throw result.error;
}

// ── ニュースインサイト ──
export async function getNewsInsights(): Promise<NewsInsight[]> {
  const result = await client().retrieveMultipleRecordsAsync(
    `${P}_newsinsights`,
    {
      select: [
        `${P}_newsinsightid`,
        `${P}_headline`,
        `${P}_summary`,
        `${P}_action`,
        `${P}_impact`,
        `${P}_category`,
        `${P}_relatedcustomers`,
        `${P}_generateddate`,
        "createdon",
      ],
      orderBy: [`${P}_generateddate desc`],
    },
  );
  if (!result.success) throw result.error;
  return (result.data ?? []) as NewsInsight[];
}
