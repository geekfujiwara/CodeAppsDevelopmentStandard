// src/shared/services/inquiryService.ts
// geek_inquiry の読み取り・作成サービス

import {
  powerPagesFetch,
  powerPagesFetchResponse,
  buildODataUrl,
  extractRecordId,
  bindLookup,
  type ODataCollectionResponse,
} from "@/shared/powerPagesApi";
import {
  mapInquiryEntity,
  INQUIRY_STATUS,
  type Inquiry,
  type InquiryEntity,
  type InquiryInput,
} from "@/types/inquiry";

const INQUIRY_SELECT = [
  "geek_inquiryid",
  "geek_name",
  "geek_description",
  "geek_contactname",
  "geek_contactemail",
  "geek_organization",
  "geek_contacttype",
  "geek_priority",
  "geek_status",
  "geek_response",
  "geek_respondeddate",
  "_geek_m365incidentid_value",
  "_geek_inquirerid_value",
  "createdon",
].join(",");

const PREFER =
  'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=50';

/** 特定インシデントに紐づく問い合わせを取得する */
export const listInquiriesByIncident = async (
  incidentId: string,
): Promise<Inquiry[]> => {
  const url = buildODataUrl("geek_inquiries", {
    $select: INQUIRY_SELECT,
    $filter: `_geek_m365incidentid_value eq ${incidentId}`,
    $orderby: "createdon desc",
  });
  const response = await powerPagesFetch<
    ODataCollectionResponse<InquiryEntity>
  >(url, {
    headers: { Prefer: PREFER },
  });
  return (response?.value ?? []).map(mapInquiryEntity);
};

/** 問い合わせを作成し、作成されたレコード ID を返す */
export const createInquiry = async (
  input: InquiryInput,
): Promise<string | null> => {
  const body: Record<string, unknown> = {
    geek_name: input.name,
    geek_description: input.description,
    geek_contactname: input.contactName,
    geek_contactemail: input.contactEmail,
    geek_priority: input.priority,
    geek_status: INQUIRY_STATUS.Received,
  };
  // 報告者 Contact への Lookup（ログインユーザー）
  // ナビゲーションプロパティ名は SchemaName (PascalCase) を使用する必要がある
  if (input.inquirerId) {
    bindLookup(body, "geek_InquirerId", "contacts", input.inquirerId);
  }
  if (input.incidentId) {
    bindLookup(
      body,
      "geek_m365incidentid",
      "geek_m365incidents",
      input.incidentId,
    );
  }

  console.log("[InquiryService] POST body:", JSON.stringify(body, null, 2));
  const response = await powerPagesFetchResponse("/_api/geek_inquiries", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return extractRecordId(response);
};
