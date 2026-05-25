import { getClient } from "@microsoft/power-apps/data";
import { getContext } from "@microsoft/power-apps/app";
import type { IContext } from "@microsoft/power-apps/app";
import { dataSourcesInfo } from "@/lib/dataSourcesInfo";
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
  } catch { return null; }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const ctx = await getSdkContext();
    const entraId = ctx?.user?.objectId;
    if (!entraId) return null;

    const result = await client().retrieveMultipleRecordsAsync(
      "systemusers",
      {
        select: ["systemuserid"],
        filter: `azureactivedirectoryobjectid eq '${entraId}'`,
        top: 1,
      }
    );
    if (result?.success && result.data?.length > 0) {
      const uid = (result.data[0] as Record<string, unknown>)?.systemuserid as string;
      if (uid) return uid.toLowerCase();
    }
  } catch (e) {
    console.warn("[getCurrentUserId] failed:", e);
  }
  return null;
}

// ── 顧客 ──
export async function getCustomers(): Promise<Customer[]> {
  const result = await client().retrieveMultipleRecordsAsync<Customer>(
    "geek_customers",
    {
      select: [
        "geek_customerid",
        "geek_name",
        "geek_industry",
        "geek_contactperson",
        "geek_email",
        "geek_phone",
        "geek_address",
        "geek_notes",
        "createdon",
      ],
      orderBy: ["geek_name asc"],
    }
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}

export async function createCustomer(data: CustomerCreate) {
  const result = await client().createRecordAsync<CustomerCreate, Customer>(
    "geek_customers",
    data
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateCustomer(id: string, data: Partial<CustomerCreate>) {
  const result = await client().updateRecordAsync<Partial<CustomerCreate>, Customer>(
    "geek_customers",
    id,
    data
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteCustomer(id: string) {
  const result = await client().deleteRecordAsync("geek_customers", id);
  if (!result.success) throw result.error;
}

// ── 商談 ──
export async function getOpportunities(): Promise<Opportunity[]> {
  const result = await client().retrieveMultipleRecordsAsync<Opportunity>(
    "geek_opportunities",
    {
      select: [
        "geek_opportunityid",
        "geek_name",
        "geek_stage",
        "geek_amount",
        "geek_probability",
        "geek_expectedclosedate",
        "geek_description",
        "geek_aiinsights",
        "_geek_customerid_value",
        "_createdby_value",
        "createdon",
      ],
      orderBy: ["createdon desc"],
    }
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}

export async function createOpportunity(data: OpportunityCreate) {
  const result = await client().createRecordAsync<OpportunityCreate, Opportunity>(
    "geek_opportunities",
    data
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateOpportunity(id: string, data: Partial<OpportunityCreate>) {
  const result = await client().updateRecordAsync<Partial<OpportunityCreate>, Opportunity>(
    "geek_opportunities",
    id,
    data
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteOpportunity(id: string) {
  const result = await client().deleteRecordAsync("geek_opportunities", id);
  if (!result.success) throw result.error;
}

// ── 活動履歴 ──
export async function getActivities(): Promise<Activity[]> {
  const result = await client().retrieveMultipleRecordsAsync<Activity>(
    "geek_activities",
    {
      select: [
        "geek_activityid",
        "geek_name",
        "geek_type",
        "geek_activitydate",
        "geek_content",
        "geek_nextaction",
        "_geek_customerid_value",
        "_geek_opportunityid_value",
        "createdon",
      ],
      orderBy: ["geek_activitydate desc"],
    }
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}

export async function createActivity(data: ActivityCreate) {
  const result = await client().createRecordAsync<ActivityCreate, Activity>(
    "geek_activities",
    data
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateActivity(id: string, data: Partial<ActivityCreate>) {
  console.log('[dataverse-service] updateActivity called, id:', id, 'data:', JSON.stringify(data));
  const result = await client().updateRecordAsync<Partial<ActivityCreate>, Activity>(
    "geek_activities",
    id,
    data
  );
  console.log('[dataverse-service] updateActivity result:', result.success, result.error);
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteActivity(id: string) {
  const result = await client().deleteRecordAsync("geek_activities", id);
  if (!result.success) throw result.error;
}

// ── テリトリー ──
export async function getTerritories(): Promise<Territory[]> {
  const result = await client().retrieveMultipleRecordsAsync<Territory>(
    "geek_territories",
    {
      orderBy: ["geek_name asc"],
    }
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}

export async function createTerritory(data: TerritoryCreate) {
  const result = await client().createRecordAsync<TerritoryCreate, Territory>(
    "geek_territories",
    data
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function updateTerritory(id: string, data: Partial<TerritoryCreate>) {
  const result = await client().updateRecordAsync<Partial<TerritoryCreate>, Territory>(
    "geek_territories",
    id,
    data
  );
  if (!result.success) throw result.error;
  return result.data;
}

export async function deleteTerritory(id: string) {
  const result = await client().deleteRecordAsync("geek_territories", id);
  if (!result.success) throw result.error;
}

// ── ニュースインサイト ──
export async function getNewsInsights(): Promise<NewsInsight[]> {
  const result = await client().retrieveMultipleRecordsAsync<NewsInsight>(
    "geek_newsinsights",
    {
      select: [
        "geek_newsinsightid",
        "geek_headline",
        "geek_summary",
        "geek_action",
        "geek_impact",
        "geek_category",
        "geek_relatedcustomers",
        "geek_generateddate",
        "createdon",
      ],
      orderBy: ["geek_generateddate desc"],
    }
  );
  if (!result.success) throw result.error;
  return result.data ?? [];
}
