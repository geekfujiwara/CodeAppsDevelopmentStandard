// Dataverse テーブル型定義

// ── 顧客 (geek_customer) ──
export interface Customer {
  [key: string]: unknown;
  geek_customerid: string;
  geek_name: string;
  geek_industry?: number;
  geek_industryname?: string;
  geek_contactperson?: string;
  geek_email?: string;
  geek_phone?: string;
  geek_address?: string;
  geek_notes?: string;
  createdon?: string;
  modifiedon?: string;
  _createdby_value?: string;
}

export type CustomerCreate = Omit<Customer, "geek_customerid" | "createdon" | "modifiedon" | "_createdby_value" | "geek_industryname">;

// ── 商談 (geek_opportunity) ──
export interface Opportunity {
  [key: string]: unknown;
  geek_opportunityid: string;
  geek_name: string;
  geek_stage?: number;
  geek_stagename?: string;
  geek_amount?: number;
  geek_probability?: number;
  geek_expectedclosedate?: string;
  geek_description?: string;
  geek_aiinsights?: string;
  _geek_customerid_value?: string;
  geek_customeridname?: string;
  createdon?: string;
  modifiedon?: string;
  _createdby_value?: string;
}

export type OpportunityCreate = Omit<Opportunity, "geek_opportunityid" | "createdon" | "modifiedon" | "_createdby_value" | "geek_stagename" | "geek_customeridname">;

// ── 活動履歴 (geek_activity) ──
export interface Activity {
  [key: string]: unknown;
  geek_activityid: string;
  geek_name: string;
  geek_type?: number;
  geek_typename?: string;
  geek_activitydate?: string;
  geek_content?: string;
  geek_nextaction?: string;
  _geek_customerid_value?: string;
  geek_customeridname?: string;
  _geek_opportunityid_value?: string;
  geek_opportunityidname?: string;
  createdon?: string;
  modifiedon?: string;
  _createdby_value?: string;
}

export type ActivityCreate = Omit<Activity, "geek_activityid" | "createdon" | "modifiedon" | "_createdby_value" | "geek_typename" | "geek_customeridname" | "geek_opportunityidname">;

// ── テリトリー (geek_territory) ──
export interface Territory {
  [key: string]: unknown;
  geek_territoryid: string;
  geek_name: string;
  geek_budget?: number;
  geek_budget_base?: number;
  geek_fiscalyear?: number;
  geek_notes?: string;
  _geek_customerid_value?: string;
  geek_customeridname?: string;
  _ownerid_value?: string;
  owneridname?: string;
  createdon?: string;
  modifiedon?: string;
}

export type TerritoryCreate = Omit<Territory, "geek_territoryid" | "createdon" | "modifiedon" | "geek_customeridname" | "owneridname" | "geek_budget_base">;

// ── ニュースインサイト (geek_newsinsight) ──
export interface NewsInsight {
  [key: string]: unknown;
  geek_newsinsightid: string;
  geek_headline: string;
  geek_summary?: string;
  geek_action?: string;
  geek_impact?: number;
  geek_category?: string;
  geek_relatedcustomers?: string;
  geek_generateddate?: string;
  createdon?: string;
}

// ── Choice 値マッピング ──
export const IndustryOptions: Record<number, string> = {
  100000000: "製造",
  100000001: "IT",
  100000002: "商社",
  100000003: "小売",
  100000004: "金融",
  100000005: "その他",
};

export const StageOptions: Record<number, string> = {
  100000000: "リード",
  100000001: "提案",
  100000002: "見積",
  100000003: "交渉",
  100000004: "受注",
  100000005: "失注",
  100000006: "キャンセル",
};

export const ActivityTypeOptions: Record<number, string> = {
  100000000: "訪問",
  100000001: "電話",
  100000002: "メール",
  100000003: "オンライン会議",
  100000004: "その他",
};
