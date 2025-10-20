# DataverseスキーマをXMLから抽出するPowerShellスクリプト

## customizations.xmlからChoice値を抽出

Dataverseソリューションをエクスポートした`customizations.xml`から、選択肢列（Picklist）の値を自動的に抽出するスクリプトです。

### 使用方法

```powershell
# 1. Dataverseソリューションをエクスポート
# Power Platform Maker Portal → ソリューション → エクスポート → アンマネージド

# 2. ZIPを展開してcustomizations.xmlを取得

# 3. このスクリプトを実行
.\Extract-DataverseChoices.ps1 -XmlPath "C:\path\to\customizations.xml"
```

### スクリプト: Extract-DataverseChoices.ps1

```powershell
param(
    [Parameter(Mandatory=$true)]
    [string]$XmlPath,
    
    [Parameter(Mandatory=$false)]
    [string]$EntityName = "geek_project_task"
)

# XMLを読み込み（UTF-8エンコーディング）
Write-Host "Reading XML file..." -ForegroundColor Cyan
$xmlContent = Get-Content -Path $XmlPath -Encoding UTF8 -Raw

# XMLをパース
[xml]$xml = $xmlContent

# 名前空間マネージャーを設定
$nsManager = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
$nsManager.AddNamespace("", $xml.DocumentElement.NamespaceURI)

# エンティティを検索
$entities = $xml.ImportExportXml.Entities.Entity

Write-Host "`nSearching for entity: $EntityName" -ForegroundColor Yellow

foreach ($entity in $entities) {
    $entityLogicalName = $entity.EntityInfo.entity.Name
    
    if ($entityLogicalName -eq $EntityName) {
        Write-Host "`nFound entity: $entityLogicalName" -ForegroundColor Green
        
        # 属性を取得
        $attributes = $entity.EntityInfo.entity.attributes.attribute
        
        # Picklist属性のみをフィルター
        $picklistAttributes = $attributes | Where-Object { $_.Type -eq 'picklist' }
        
        Write-Host "`nPicklist Attributes Found: $($picklistAttributes.Count)" -ForegroundColor Cyan
        
        foreach ($attr in $picklistAttributes) {
            $attrName = $attr.Name
            $attrDisplayName = $attr.displaynames.displayname | Where-Object { $_.languagecode -eq '1041' } | Select-Object -ExpandProperty description
            
            Write-Host "`n=== $attrName ($attrDisplayName) ===" -ForegroundColor Yellow
            
            # optionset要素を取得
            if ($attr.optionset) {
                $options = $attr.optionset.options.option
                
                if ($options) {
                    Write-Host "Choice Values:" -ForegroundColor Cyan
                    foreach ($option in $options) {
                        $value = $option.value
                        $label = $option.labels.label | Where-Object { $_.languagecode -eq '1041' } | Select-Object -ExpandProperty description
                        Write-Host "  $value : $label" -ForegroundColor White
                    }
                } else {
                    Write-Host "  No options defined (global optionset?)" -ForegroundColor Gray
                }
            } else {
                Write-Host "  No optionset element found" -ForegroundColor Gray
            }
        }
    }
}

Write-Host "`nDone!" -ForegroundColor Green
```

### 実行例

```powershell
PS> .\Extract-DataverseChoices.ps1 -XmlPath "C:\Users\hirom\Desktop\customizations.xml" -EntityName "geek_project_task"

Reading XML file...

Searching for entity: geek_project_task

Found entity: geek_project_task

Picklist Attributes Found: 3

=== geek_priority (優先度) ===
Choice Values:
  0 : Critical
  1 : High

=== geek_category (カテゴリ) ===
Choice Values:
  0 : Planning

=== geek_status (状態) ===
Choice Values:
  0 : Completed
  1 : InProgress
  2 : NotStarted

Done!
```

### TypeScript変換スクリプト

抽出した値をTypeScriptのマッピングファイルに変換:

```powershell
# Convert-ToTypeScriptMapping.ps1
param(
    [Parameter(Mandatory=$true)]
    [string]$XmlPath,
    
    [Parameter(Mandatory=$false)]
    [string]$OutputPath = ".\dataverseChoiceMapping.ts"
)

# ... (上記のXML解析ロジック) ...

# TypeScriptコードを生成
$tsCode = @"
/**
 * Dataverse Choice(選択肢)フィールドの値マッピング
 * 
 * 生成元: customizations.xml
 * 生成日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
 */

import type { Task, Project } from '@/data/sampleProjects';

// geek_priority（優先度）のマッピング
export const PriorityChoiceMap = {
  Critical: 0,
  High: 1
} as const;

export const PriorityChoiceReverseMap: Record<number, Task['priority']> = {
  0: 'Critical',
  1: 'High'
};

// ... (他の選択肢も同様に生成) ...
"@

$tsCode | Out-File -FilePath $OutputPath -Encoding UTF8
Write-Host "TypeScript mapping file generated: $OutputPath" -ForegroundColor Green
```

---

## 手動でのXML確認方法

### 1. 選択肢列の検索

```powershell
# geek_priorityの定義を検索
Select-String -Path "customizations.xml" -Pattern "geek_priority" -Context 0,80
```

### 2. XML構造

```xml
<attribute PhysicalName="geek_priority">
  <Type>picklist</Type>
  <Name>geek_priority</Name>
  <LogicalName>geek_priority</LogicalName>
  <!-- ... 他のメタデータ ... -->
  <optionset>
    <options>
      <option value="0">
        <labels>
          <label languagecode="1041" description="Critical" />
          <label languagecode="1033" description="Critical" />
        </labels>
      </option>
      <option value="1">
        <labels>
          <label languagecode="1041" description="High" />
          <label languagecode="1033" description="High" />
        </labels>
      </option>
    </options>
  </optionset>
</attribute>
```

---

## 注意事項

### グローバル選択肢セット

一部の選択肢列は「グローバル選択肢セット」として定義されている場合があります。
その場合、`<attribute>`要素内に`<optionset>`が含まれず、別の`<optionsets>`セクションに定義されます。

```xml
<optionsets>
  <optionset Name="geek_priority_global">
    <options>
      <option value="0">
        <labels>
          <label languagecode="1041" description="Critical" />
        </labels>
      </option>
    </options>
  </optionset>
</optionsets>
```

### ローカライゼーション

`languagecode`属性でロケールを指定できます:
- `1041`: 日本語
- `1033`: 英語

---

## まとめ

### ✅ メリット

1. **正確性**: 実際のDataverse環境の値を直接取得
2. **自動化**: PowerShellスクリプトで自動抽出可能
3. **CI/CD統合**: ビルドプロセスに組み込み可能
4. **バージョン管理**: customizations.xmlをGitで管理

### ⚠️ デメリット

1. ソリューションエクスポートが必要（手動操作）
2. XMLファイルが大きい（数MB〜数十MB）
3. グローバル選択肢セットの扱いが複雑

### 📝 ベストプラクティス

1. **初回**: Maker Portalで手動確認 → ドキュメント化
2. **開発中**: customizations.xmlから自動抽出
3. **本番前**: 最終確認としてMaker Portalで再チェック
