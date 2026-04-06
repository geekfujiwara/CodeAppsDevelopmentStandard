/**
 * サービス - PAC CLI 自動生成ファイル
 *
 * このディレクトリには PAC CLI (`pac code add-data-source`) によって
 * 自動生成されるコネクタサービスファイルが配置されます。
 *
 * ## サポートされるコネクタ
 * - SQL Server (Azure SQL 含む)
 * - SharePoint
 * - Office 365 Users
 * - Office 365 Groups
 * - Azure Data Explorer
 * - OneDrive for Business
 * - Microsoft Teams
 * - MSN Weather
 * - Microsoft Translator V2
 * - Dataverse
 *
 * ## 追加方法
 * ```bash
 * pac connection list
 * pac code add-data-source -a {api-name} -c {connection-id}
 * ```
 */

export { Office365UsersService } from "./Office365UsersService";
