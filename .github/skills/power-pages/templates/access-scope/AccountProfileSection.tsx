/**
 * プロファイル画面の取引先企業セクション。
 *
 * - 紐づけ済み: 会社情報を「読み取り専用」で表示する（入力欄にしない）
 * - 未紐づけ  : 「管理者に紐づけを依頼する」ボタンを表示する
 *
 * 利用者に取引先企業を選ばせてはいけない（他社を選べば他社データが見えるため）。
 */
import { useState } from "react";

import { useAccountAccess } from "./use-account-access";

interface AccountProfileSectionProps {
  contactId: string | null;
}

export const AccountProfileSection = ({ contactId }: AccountProfileSectionProps) => {
  const { account, isLinked, hasPendingRequest, loading, error, submitLinkRequest } =
    useAccountAccess(contactId);
  const [requestedCompany, setRequestedCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitLinkRequest(requestedCompany.trim());
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "依頼の送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <section aria-busy="true">取引先企業を確認しています...</section>;
  }

  if (error) {
    return <section role="alert">{error}</section>;
  }

  if (isLinked && account) {
    return (
      <section>
        <h2>所属取引先企業</h2>
        {/* 読み取り専用表示。変更はアプリ管理者のみが行う */}
        <dl>
          <dt>会社名</dt>
          <dd>{account.name ?? "-"}</dd>
          <dt>電話番号</dt>
          <dd>{account.telephone1 ?? "-"}</dd>
          <dt>住所</dt>
          <dd>{account.address1_composite ?? "-"}</dd>
        </dl>
        <p>会社情報の変更が必要な場合は、システム管理者にご連絡ください。</p>
      </section>
    );
  }

  if (hasPendingRequest) {
    return (
      <section>
        <h2>所属取引先企業</h2>
        <p>紐づけを依頼済みです。管理者の対応をお待ちください。</p>
      </section>
    );
  }

  return (
    <section>
      <h2>所属取引先企業</h2>
      <p>
        取引先企業がまだ紐づけられていないため、会社のデータを表示できません。
        管理者に紐づけを依頼してください。
      </p>
      <label htmlFor="requested-company">会社名（任意）</label>
      <input
        id="requested-company"
        type="text"
        value={requestedCompany}
        maxLength={100}
        onChange={(e) => setRequestedCompany(e.target.value)}
        placeholder="例: 株式会社サンプル"
      />
      <button type="button" onClick={handleSubmit} disabled={submitting}>
        {submitting ? "送信中..." : "管理者に紐づけを依頼する"}
      </button>
      {submitError ? <p role="alert">{submitError}</p> : null}
    </section>
  );
};
