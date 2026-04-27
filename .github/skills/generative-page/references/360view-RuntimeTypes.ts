// -------------------------------------------------------
// 360view-RuntimeTypes.ts — Object 360 View 汎用型定義
//
// 【カスタマイズ方法】
//   1. TableRegistrations に使用エンティティを追加する
//   2. 各エンティティの interface を実際のフィールドに合わせて定義する
//   3. 360view-example.tsx の SUBJECT_CONFIG / COLUMN_CONFIGS を変更する
//
// 【このサンプルで登録しているエンティティ】
//   取引先 (account) → 商談 (opportunity) → 見積 (quote) → 受注 (salesorder)
// -------------------------------------------------------

/** 型付き Dataverse テーブル行（GenPage ランタイムが提供する型と互換） */
export type ReadableTableRow<T> = {
  [K in keyof T]?: T[K] | null;
} & { [key: string]: any };

/** コンポーネント Props（GenPage ランタイムが注入） */
export interface GeneratedComponentProps {
  dataApi: {
    queryTable(
      table: keyof TableRegistrations | (string & {}),
      options?: {
        select?: string[];
        filter?: string;
        orderBy?: string;
        pageSize?: number;
      }
    ): Promise<{
      rows: any[];
      hasMoreRows: boolean;
      loadMoreRows?: () => Promise<any>;
    }>;
  };
}

/* ============================================================
 * ★ テーブル登録 — 使用するエンティティをここに追加する
 * ============================================================
 * カスタムエンティティの追加例:
 *   cr123_project: cr123_project;
 *   cr123_task: cr123_task;
 * ============================================================ */
export interface TableRegistrations extends BaseTableRegistrations {
  // ---- 標準 CRM エンティティ（このサンプルで使用） ----
  "account": account;
  "contact": contact;
  "opportunity": opportunity;
  "quote": quote;
  "salesorder": salesorder;
}

export interface EnumRegistrations extends BaseEnumRegistrations {}

// -------------------------------------------------------
// エンティティ型定義
// シナリオに合わせてフィールドを追加・変更してください
// -------------------------------------------------------

/** 取引先 */
export interface account {
  accountid: string;
  name?: string;
  telephone1?: string;
  emailaddress1?: string;
  address1_city?: string;
  revenue?: number;
  numberofemployees?: number;
  websiteurl?: string;
  description?: string;
  createdon?: string;
  statecode?: number;
}

/** 取引先担当者 */
export interface contact {
  contactid: string;
  fullname?: string;
  firstname?: string;
  lastname?: string;
  emailaddress1?: string;
  telephone1?: string;
  jobtitle?: string;
  _parentcustomerid_value?: any;
  createdon?: string;
  statecode?: number;
}

/** 商談 */
export interface opportunity {
  opportunityid: string;
  name?: string;
  estimatedvalue?: number;
  estimatedclosedate?: string;
  statecode?: number;
  statuscode?: number;
  _parentaccountid_value?: any;
  _parentcontactid_value?: any;
  description?: string;
  createdon?: string;
}

/** 見積 */
export interface quote {
  quoteid: string;
  name?: string;
  totalamount?: number;
  closedon?: string;
  statecode?: number;
  statuscode?: number;
  _customerid_value?: any;
  _opportunityid_value?: any;
  description?: string;
  createdon?: string;
}

/** 受注 */
export interface salesorder {
  salesorderid: string;
  name?: string;
  totalamount?: number;
  fulfilldate?: string;
  statecode?: number;
  statuscode?: number;
  _customerid_value?: any;
  _quoteid_value?: any;
  description?: string;
  createdon?: string;
}

/* ---- カスタムエンティティの定義例 ----
export interface cr123_project {
  cr123_projectid: string;
  cr123_name?: string;
  cr123_startdate?: string;
  cr123_enddate?: string;
  statecode?: number;
  _cr123_account_value?: any;
}

export interface cr123_task {
  cr123_taskid: string;
  cr123_name?: string;
  cr123_duedate?: string;
  cr123_statecode?: number;
  _cr123_project_value?: any;
}
---- */
