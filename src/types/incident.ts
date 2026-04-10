// Incident Status
export const IncidentStatus = {
  NEW: 100000000,
  IN_PROGRESS: 100000001,
  RESOLVED: 100000002,
  CLOSED: 100000003,
} as const;

export const statusLabels: Record<number, string> = {
  100000000: "新規",
  100000001: "対応中",
  100000002: "解決済",
  100000003: "クローズ",
};

export const statusColors: Record<number, string> = {
  100000000: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  100000001:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  100000002:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  100000003: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export const assetTypeLabels: Record<number, string> = {
  100000000: "PC",
  100000001: "サーバー",
  100000002: "プリンター",
  100000003: "ネットワーク機器",
  100000004: "モバイルデバイス",
  100000005: "ソフトウェア",
  100000006: "その他",
};

export const assetTypeColors: Record<number, string> = {
  100000000: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  100000001:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  100000002:
    "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  100000003:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  100000004: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  100000005:
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  100000006: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

export const assetStatusLabels: Record<number, string> = {
  100000000: "稼働中",
  100000001: "故障中",
  100000002: "メンテナンス中",
  100000003: "廃棄済",
};

export const assetStatusColors: Record<number, string> = {
  100000000:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  100000001: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  100000002:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  100000003: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};
