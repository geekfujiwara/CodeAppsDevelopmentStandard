/**
 * Account アクセス用フック。
 *
 * - サインインユーザーの contact から所属取引先企業（parentcustomerid）を解決する
 * - 未紐づけの場合に「管理者に紐づけを依頼する」ためのレコードを作成する
 *
 * 取引先企業はユーザーに選ばせない（権限昇格になるため）。
 * 紐づけはアプリ管理者だけが行う。詳細は references/access-scope-design.md を参照。
 */
import { useCallback, useEffect, useState } from "react";

import { bindLookup, powerPagesFetch } from "@/lib/dataverse";

/** Dataverse のパブリッシャープレフィックス（環境に合わせて置き換える） */
const PREFIX = import.meta.env.VITE_PUBLISHER_PREFIX ?? "geek";
const LINK_REQUEST_SET = `${PREFIX}_accountlinkrequests`;
const STATUS_OPEN = 100000000;

export interface AccountInfo {
  accountid: string;
  name: string | null;
  telephone1: string | null;
  address1_composite: string | null;
}

export interface UseAccountAccessResult {
  /** 所属取引先企業の ID。未紐づけなら null */
  accountId: string | null;
  /** 所属取引先企業の情報。未紐づけなら null */
  account: AccountInfo | null;
  /** 取引先企業に紐づいているか */
  isLinked: boolean;
  /** 未対応の紐づけ依頼が既にあるか */
  hasPendingRequest: boolean;
  loading: boolean;
  error: string | null;
  /** 紐づけ依頼を作成する（管理者にメールが飛ぶ） */
  submitLinkRequest: (requestedCompany: string) => Promise<void>;
}

interface ContactResponse {
  _parentcustomerid_value: string | null;
  fullname: string | null;
}

export const useAccountAccess = (contactId: string | null): UseAccountAccessResult => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contactId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1) contact から所属取引先企業を解決する
      const contact = await powerPagesFetch<ContactResponse>(
        `/_api/contacts(${contactId})?$select=fullname,_parentcustomerid_value`,
      );
      setFullName(contact?.fullname ?? "");
      const linkedId = contact?._parentcustomerid_value ?? null;
      setAccountId(linkedId);

      if (linkedId) {
        // 2) Account スコープの権限があるので、自社のレコードだけが取得できる
        const acc = await powerPagesFetch<AccountInfo>(
          `/_api/accounts(${linkedId})` +
            `?$select=accountid,name,telephone1,address1_composite`,
        );
        setAccount(acc ?? null);
        setHasPendingRequest(false);
      } else {
        setAccount(null);
        // 3) 未紐づけなら、未対応の依頼が既にあるかを確認して二重送信を防ぐ
        const pending = await powerPagesFetch<{ value: unknown[] }>(
          `/_api/${LINK_REQUEST_SET}` +
            `?$select=${PREFIX}_accountlinkrequestid` +
            `&$filter=${PREFIX}_status eq ${STATUS_OPEN}&$top=1`,
        );
        setHasPendingRequest((pending?.value?.length ?? 0) > 0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "取引先企業の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitLinkRequest = useCallback(
    async (requestedCompany: string) => {
      if (!contactId) throw new Error("サインイン情報が取得できていません");
      const body: Record<string, unknown> = {
        [`${PREFIX}_name`]: `${fullName || "利用者"} の紐づけ依頼`,
        [`${PREFIX}_requestedcompany`]: requestedCompany,
        [`${PREFIX}_status`]: STATUS_OPEN,
      };
      // 依頼者を必ずバインドする（Contact スコープの絞り込みに必要）
      bindLookup(body, `${PREFIX}_contactid`, "contacts", contactId);

      await powerPagesFetch(`/_api/${LINK_REQUEST_SET}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setHasPendingRequest(true);
    },
    [contactId, fullName],
  );

  return {
    accountId,
    account,
    isLinked: Boolean(accountId),
    hasPendingRequest,
    loading,
    error,
    submitLinkRequest,
  };
};
