"""現場コックピットの本格デモデータを投入する。

- 工事 16 件（施工中 9 / 計画中 2 / 1 年以内に完了 4 / 1 年以上前に完了 1）
- 3D モデル種別ごとの工程テンプレート（先行作業・3D 部位・工程順・阻害要因）
- 直近 3 週間の日報（工事写真キー・監督確認状態）、KY、ヒヤリハット、ナレッジ、重機稼働

日付は実行日からの相対値で生成し、レコード名は固定キーにするため、再実行すると
同じレコードを当日基準の日付・進捗で更新する（べき等）。
"""

from __future__ import annotations

import json
import os
import random
import sys
import zlib
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".github" / "skills" / "standard" / "scripts"))

from auth_helper import api_delete, api_get, api_patch, api_post  # noqa: E402

SOLUTION = os.environ["SOLUTION_NAME"]
TODAY = date.today()
JST = timezone(timedelta(hours=9))

ACTIVE, PLANNED, COMPLETED = 100000001, 100000000, 100000002
CIVIL, BUILDING = 100000000, 100000001
BRIDGE, EARTHWORK, TUNNEL, ARCHITECTURE, CHANNEL, ROAD = (100000000 + i for i in range(6))
SUNNY, CLOUDY, RAIN, SNOW, WIND = (100000000 + i for i in range(5))
REVIEW_DRAFT, REVIEW_SUBMITTED, REVIEW_APPROVED, REVIEW_RETURNED = (100000000 + i for i in range(4))
RISK = {"高": 100000000, "中": 100000001, "低": 100000002}
CAD_MODEL_URL = "dataverse:${PUBLISHER_PREFIX}_modelfile"
# CAD 取り込み（BIM 書き出しの GLB）のデモに使う工事
CAD_SAMPLE_PROJECTS = {"P-2026-004"}


def rng(*keys: object) -> random.Random:
    return random.Random(zlib.crc32("|".join(map(str, keys)).encode("utf-8")))


# ---------------------------------------------------------------------------
# Dataverse ヘルパー（EntitySetName・NavProp・名前索引をキャッシュする）
# ---------------------------------------------------------------------------
_entity_sets: dict[str, str] = {}
_navs: dict[tuple[str, str], str] = {}
_indexes: dict[str, dict[str, str]] = {}


def entity_set(logical: str) -> str:
    if logical not in _entity_sets:
        _entity_sets[logical] = api_get(
            f"EntityDefinitions(LogicalName='{logical}')?$select=EntitySetName"
        )["EntitySetName"]
    return _entity_sets[logical]


def nav(source: str, attribute: str) -> str:
    key = (source, attribute)
    if key not in _navs:
        rows = api_get(
            f"EntityDefinitions(LogicalName='{source}')/ManyToOneRelationships"
            f"?$filter=ReferencingAttribute eq '{attribute}'"
            f"&$select=ReferencingEntityNavigationPropertyName"
        ).get("value", [])
        if not rows:
            raise RuntimeError(f"Navigation property not found: {source}.{attribute}")
        _navs[key] = rows[0]["ReferencingEntityNavigationPropertyName"]
    return _navs[key]


def bind(data: dict, source: str, attribute: str, target: str, target_id: str | None) -> dict:
    if target_id:
        data[f"{nav(source, attribute)}@odata.bind"] = f"/{entity_set(target)}({target_id})"
    return data


def record_key(logical: str, row: dict) -> str:
    # 作業は工事ごとに同名があるため、工事 ID と名前の組で識別する
    if logical == "${PUBLISHER_PREFIX}_task":
        return f"{row.get('_${PUBLISHER_PREFIX}_project_value') or ''}|{row['${PUBLISHER_PREFIX}_name']}"
    return row["${PUBLISHER_PREFIX}_name"]


def index(logical: str) -> dict[str, str]:
    if logical not in _indexes:
        select = f"{logical}id,${PUBLISHER_PREFIX}_name" + (",_${PUBLISHER_PREFIX}_project_value" if logical == "${PUBLISHER_PREFIX}_task" else "")
        rows = api_get(f"{entity_set(logical)}?$select={select}").get("value", [])
        _indexes[logical] = {record_key(logical, row): row[f"{logical}id"] for row in rows if row.get("${PUBLISHER_PREFIX}_name")}
    return _indexes[logical]


def upsert(logical: str, name: str, data: dict, key: str | None = None) -> str:
    key = key or name
    known = index(logical)
    if key in known:
        api_patch(f"{entity_set(logical)}({known[key]})", data)
        return known[key]
    record_id = api_post(entity_set(logical), {"${PUBLISHER_PREFIX}_name": name, **data}, solution=SOLUTION)
    if not record_id:
        raise RuntimeError(f"Could not create {logical}: {name}")
    known[key] = record_id
    return record_id


# ---------------------------------------------------------------------------
# マスタ
# ---------------------------------------------------------------------------
WORKTYPES = [
    ("掘削工", "EW-01", 0, "バックホウによる切土・床掘・積込み"),
    ("盛土工", "EW-02", 0, "まき出し・敷均し・締固めによる盛土"),
    ("擁壁工", "EW-03", 0, "プレキャスト擁壁・護岸ブロックの据付"),
    ("排水構造物工", "EW-04", 0, "側溝・集水桝・プレキャスト水路の布設"),
    ("法面工", "EW-05", 0, "植生基材吹付・法枠による法面保護"),
    ("仮設工", "GN-01", 0, "仮設道路・仮締切・規制・仮設備"),
    ("杭打ち工", "FD-01", 1, "鋼管杭・場所打ち杭・既製杭の施工"),
    ("地盤改良工", "FD-02", 1, "セメント系固化材による路床・地盤改良"),
    ("橋梁架設工", "BR-01", 2, "橋梁上部工の架設"),
    ("コンクリート工", "BR-02", 2, "躯体コンクリートの打設・養生"),
    ("山岳トンネル掘削", "TN-01", 3, "NATM による掘削・支保工"),
    ("覆工コンクリート工", "TN-02", 3, "セントルによる覆工コンクリート"),
    ("アスファルト舗装工", "PV-01", 4, "基層・表層アスファルトの舗設"),
    ("路盤工", "PV-02", 4, "下層・上層路盤の敷均し・転圧"),
    ("鉄筋・型枠工", "ST-01", 5, "鉄筋組立と型枠の組立・解体"),
    ("足場組立工", "ST-02", 5, "外部足場・作業構台の組立"),
    ("鉄骨工", "ST-03", 5, "鉄骨建方・高力ボルト締付け"),
    ("外装工", "FN-01", 6, "外装パネル・カーテンウォールの取付"),
    ("防水工", "FN-02", 6, "屋上・外壁の防水"),
    ("内装工", "FN-03", 6, "軽量鉄骨下地・ボード・仕上げ"),
    ("設備工", "ME-01", 7, "空調・衛生・電気設備"),
]

EQUIPMENT = [
    ("バックホウ 0.7m³", 0, "EQ-001"), ("ラフタークレーン 25t", 1, "EQ-002"), ("ダンプ 10t", 2, "EQ-003"),
    ("杭打ち機", 4, "EQ-004"), ("高所作業車 12m", 5, "EQ-005"), ("バックホウ 0.45m³", 0, "EQ-006"),
    ("バックホウ 1.4m³", 0, "EQ-007"), ("クローラクレーン 100t", 1, "EQ-008"),
    ("ラフタークレーン 50t", 1, "EQ-009"), ("ダンプ 10t (2号車)", 2, "EQ-010"),
    ("ブルドーザ 15t", 3, "EQ-011"), ("ブルドーザ 7t", 3, "EQ-012"),
    ("杭打ち機 (中掘り)", 4, "EQ-013"), ("高所作業車 20m", 5, "EQ-014"),
]


@dataclass
class TaskTemplate:
    key: str
    name: str
    worktype: str
    zone: str
    duration: float
    predecessor: str | None
    lag: float
    phrases: list[str]
    scene: str
    equipment: list[str] = field(default_factory=list)


T = TaskTemplate
TEMPLATES: dict[int, list[TaskTemplate]] = {
    BRIDGE: [
        T("site", "準備工・仮設桟橋", "仮設工", "site", 30, None, 1.0,
          ["仮設桟橋の覆工板 {n} 枚を設置", "濁水処理設備の据付と試運転を実施", "工事用道路に敷鉄板を敷設し誘導員配置を確認"],
          "site-prep", ["ラフタークレーン 25t", "バックホウ 0.45m³"]),
        T("a1pile", "A1 橋台 場所打ち杭", "杭打ち工", "A1-pile", 28, "site", 0.6,
          ["A1 場所打ち杭 φ1200 を {n} 本施工（オールケーシング）", "鉄筋かご建込みとトレミー管によるコンクリート打設 {m}m³"],
          "pile", ["クローラクレーン 100t", "バックホウ 0.7m³"]),
        T("p1pile", "P1 橋脚 鋼管杭打設", "杭打ち工", "P1-pile", 30, "site", 0.8,
          ["P1 鋼管杭 φ800 を {n} 本打設、溶接継手の外観検査を実施", "P1 杭芯測量と打止め管理（リバウンド計測）を実施"],
          "pile", ["杭打ち機", "ラフタークレーン 25t"]),
        T("p2pile", "P2 橋脚 鋼管杭打設", "杭打ち工", "P2-pile", 30, "p1pile", 0.7,
          ["P2 鋼管杭 φ800 を {n} 本打設、溶接継手の外観検査を実施", "P2 杭芯測量と打止め管理（リバウンド計測）を実施"],
          "pile", ["杭打ち機", "ラフタークレーン 25t"]),
        T("p1foot", "P1 フーチング 鉄筋・型枠", "鉄筋・型枠工", "P1-footing", 24, "p1pile", 1.0,
          ["P1 フーチング下段鉄筋 D32 を組立（{n} 段目）", "P1 フーチング型枠を組立、かぶり厚さを検査"],
          "rebar", ["ラフタークレーン 25t"]),
        T("p2foot", "P2 フーチング 鉄筋・型枠", "鉄筋・型枠工", "P2-footing", 24, "p2pile", 1.0,
          ["P2 フーチング下段鉄筋 D32 を組立（{n} 段目）", "P2 フーチング型枠を組立、かぶり厚さを検査"],
          "rebar", ["ラフタークレーン 25t"]),
        T("p1col", "P1 柱・梁 コンクリート打設", "コンクリート工", "P1-column", 36, "p1foot", 1.0,
          ["P1 柱 第{n}リフト コンクリート打設（{m}m³）", "P1 柱の養生とせき板解体、出来形計測"],
          "pier", ["ラフタークレーン 50t"]),
        T("p2col", "P2 柱・梁 コンクリート打設", "コンクリート工", "P2-column", 36, "p2foot", 1.0,
          ["P2 柱 第{n}リフト コンクリート打設（{m}m³）", "P2 柱の養生とせき板解体、出来形計測"],
          "pier", ["ラフタークレーン 50t"]),
        T("a1body", "A1 橋台 躯体構築", "コンクリート工", "A1-body", 40, "a1pile", 1.0,
          ["A1 竪壁 第{n}リフトの鉄筋組立", "A1 胸壁の型枠組立とコンクリート打設 {m}m³"],
          "concrete", ["ラフタークレーン 25t"]),
        T("a2body", "A2 橋台 杭・躯体構築", "コンクリート工", "A2-body", 55, "a1pile", 0.7,
          ["A2 杭頭処理と底版鉄筋の組立", "A2 竪壁コンクリート打設 {m}m³"],
          "concrete", ["バックホウ 0.7m³", "ラフタークレーン 25t"]),
        T("river", "仮設撤去・護岸復旧", "仮設工", "river", 28, "p2col", 1.0,
          ["仮設桟橋の撤去（{n} スパン）", "護岸ブロックの復旧と河床整正"],
          "revetment", ["クローラクレーン 100t", "バックホウ 0.7m³"]),
    ],
    EARTHWORK: [
        T("site", "準備工・伐採除根", "仮設工", "site", 20, None, 1.0,
          ["伐採・除根 {n}a を完了、仮設沈砂池を設置", "工事用仮囲いと仮設道路を整備"],
          "site-prep", ["バックホウ 0.7m³", "ダンプ 10t"]),
        T("cut1", "第1工区 切土", "掘削工", "cut-1", 45, "site", 0.8,
          ["第1工区 切土 {m}m³ を掘削・運搬", "第1工区 丁張り確認と法面整形"],
          "excavation", ["バックホウ 1.4m³", "ダンプ 10t", "ダンプ 10t (2号車)"]),
        T("cut2", "第2工区 切土", "掘削工", "cut-2", 45, "cut1", 0.6,
          ["第2工区 切土 {m}m³ を掘削", "第2工区 岩塊の小割と運搬"],
          "excavation", ["バックホウ 1.4m³", "ダンプ 10t"]),
        T("fill1", "第1工区 盛土・締固め", "盛土工", "fill-1", 50, "cut1", 0.3,
          ["第1工区 盛土 {m}m³ を 30cm 層で締固め", "第1工区 現場密度試験を {n} 箇所で実施"],
          "embankment", ["ブルドーザ 15t", "ダンプ 10t"]),
        T("fill2", "第2工区 盛土・締固め", "盛土工", "fill-2", 50, "cut2", 0.4,
          ["第2工区 盛土 {m}m³ を敷均し・締固め", "第2工区 沈下板 {n} 箇所を計測"],
          "embankment", ["ブルドーザ 15t", "ダンプ 10t (2号車)"]),
        T("wall", "L型擁壁工", "擁壁工", "retaining", 40, "fill1", 0.5,
          ["L型擁壁 {n} 基を据付", "擁壁の裏込め砕石を投入し転圧"],
          "retaining", ["ラフタークレーン 25t"]),
        T("drain", "雨水排水工", "排水構造物工", "drain", 35, "fill2", 0.5,
          ["U型側溝 {m}m を布設", "集水桝 {n} 基を設置"],
          "drainage", ["バックホウ 0.45m³"]),
        T("slope", "法面保護工", "法面工", "slope", 30, "wall", 0.6,
          ["法面 {m}m² に植生基材を吹付け", "法枠のアンカー削孔 {n} 本を実施"],
          "slope", ["高所作業車 12m"]),
        T("road", "造成道路 路盤・舗装", "アスファルト舗装工", "road", 30, "drain", 1.0,
          ["造成道路 下層路盤 {m}m² を敷均し", "造成道路 表層アスファルト {m}m² を舗設"],
          "paving", ["ブルドーザ 7t"]),
    ],
    TUNNEL: [
        T("portal", "坑口付け・仮設備", "仮設工", "portal", 40, None, 1.0,
          ["坑口斜面の補強と仮設ヤードを整備", "換気設備・濁水処理設備を据付"],
          "site-prep", ["ラフタークレーン 25t", "バックホウ 0.7m³"]),
        T("upper", "本坑 上半掘削・支保工", "山岳トンネル掘削", "upper", 260, "portal", 1.0,
          ["上半掘削 {n} 進行（{m}m）、鋼製支保工を建込み", "吹付けコンクリートとロックボルト {n} 本を施工"],
          "tunnel-face", ["バックホウ 0.7m³", "ダンプ 10t"]),
        T("lower", "本坑 下半掘削", "山岳トンネル掘削", "lower", 220, "upper", 0.35,
          ["下半掘削 {m}m を施工、ずり出しを実施", "下半の支保工と吹付けを施工"],
          "tunnel-face", ["バックホウ 1.4m³", "ダンプ 10t (2号車)"]),
        T("invert", "インバート工", "コンクリート工", "invert", 160, "lower", 0.3,
          ["インバート {n} スパンのコンクリート打設", "インバート埋戻しと中央排水管の布設"],
          "concrete", ["バックホウ 0.45m³"]),
        T("lining", "覆工コンクリート", "覆工コンクリート工", "lining", 180, "invert", 0.25,
          ["覆工 第{n}スパン（10.5m）を打設", "セントル移動と養生、打音検査を実施"],
          "tunnel-lining", []),
        T("portalf", "坑門工・明かり部", "コンクリート工", "portal-finish", 60, "lining", 0.8,
          ["坑門工の鉄筋組立", "明かり巻きコンクリート打設 {m}m³"],
          "concrete", ["ラフタークレーン 25t"]),
        T("equip", "トンネル設備・舗装", "アスファルト舗装工", "equip", 70, "lining", 0.9,
          ["トンネル照明 {n} 基を設置", "坑内舗装 基層 {m}m² を舗設"],
          "paving", ["高所作業車 12m"]),
    ],
    ARCHITECTURE: [
        T("pile", "山留め・杭工事", "杭打ち工", "pile", 35, None, 1.0,
          ["既製杭 {n} 本を打設（中掘り工法）", "山留め SMW の芯材建込み"],
          "pile", ["杭打ち機 (中掘り)", "クローラクレーン 100t"]),
        T("found", "根切り・基礎躯体", "鉄筋・型枠工", "foundation", 45, "pile", 0.9,
          ["根切り {m}m³ を掘削・搬出", "基礎梁の鉄筋組立と型枠"],
          "rebar", ["バックホウ 0.7m³", "ダンプ 10t"]),
        T("frame", "鉄骨建方", "鉄骨工", "frame", 70, "found", 1.0,
          ["{n} 節目の鉄骨柱・梁を建方", "建入れ直しと高力ボルト本締め"],
          "steel-frame", ["クローラクレーン 100t"]),
        T("slab", "床デッキ・スラブ打設", "コンクリート工", "slab", 70, "frame", 0.35,
          ["{n} 階 床デッキ敷込み", "{n} 階 スラブコンクリート打設（{m}m³）"],
          "concrete", ["ラフタークレーン 50t"]),
        T("scaf", "外部足場 組立", "足場組立工", "scaffold", 50, "frame", 0.2,
          ["外部足場 {n} 段目を組立（東面）", "足場の点検と壁つなぎ確認"],
          "scaffold", ["高所作業車 12m"]),
        T("facade", "外装パネル・カーテンウォール", "外装工", "envelope", 70, "slab", 0.5,
          ["外装 ALC パネル {n} 枚を取付", "カーテンウォール方立を取付"],
          "facade", ["ラフタークレーン 25t", "高所作業車 20m"]),
        T("roof", "屋上防水", "防水工", "roof", 25, "slab", 1.0,
          ["屋上 アスファルト防水 {m}m² を施工", "防水立上りと伸縮目地を施工"],
          "facade", []),
        T("mep", "設備工事", "設備工", "mep", 90, "slab", 0.4,
          ["{n} 階 空調ダクトの吊込み", "幹線ケーブルの敷設と盤据付"],
          "interior", ["高所作業車 12m"]),
        T("interior", "内装仕上げ", "内装工", "interior", 80, "facade", 0.4,
          ["{n} 階 軽量鉄骨下地を施工", "{n} 階 石膏ボード張り"],
          "interior", []),
        T("ext", "外構工事", "アスファルト舗装工", "exterior", 35, "facade", 0.85,
          ["構内舗装 {m}m² の路盤を敷均し", "外構フェンス・植栽を施工"],
          "paving", ["バックホウ 0.45m³"]),
    ],
    CHANNEL: [
        T("site", "準備工・仮締切", "仮設工", "site", 20, None, 1.0,
          ["大型土のうによる仮締切を設置", "仮排水ポンプ {n} 台を据付"],
          "site-prep", ["バックホウ 0.7m³"]),
        T("excav", "床掘・掘削", "掘削工", "excavation", 40, "site", 0.8,
          ["床掘 {m}m³ を施工", "掘削土の場外搬出（{n} 台）"],
          "excavation", ["バックホウ 0.7m³", "ダンプ 10t"]),
        T("base", "基礎砕石・均しコンクリート", "コンクリート工", "base", 30, "excav", 0.4,
          ["基礎砕石 {m}m² を敷均し転圧", "均しコンクリート {m}m³ を打設"],
          "concrete", ["バックホウ 0.45m³"]),
        T("precast", "プレキャスト水路 据付", "排水構造物工", "precast", 45, "base", 0.4,
          ["プレキャスト U 型水路 {n} 本を据付", "目地モルタル充填と通水確認"],
          "precast", ["ラフタークレーン 25t"]),
        T("revet", "護岸ブロック張り", "擁壁工", "revetment", 45, "precast", 0.4,
          ["護岸ブロック {m}m² を張立", "天端コンクリート打設"],
          "revetment", ["バックホウ 0.7m³", "ラフタークレーン 25t"]),
        T("backfill", "埋戻し・転圧", "盛土工", "backfill", 30, "precast", 0.5,
          ["埋戻し {m}m³ を 30cm 層で転圧", "沈下板 {n} 箇所を計測"],
          "embankment", ["ブルドーザ 7t"]),
        T("pave", "管理用通路 舗装", "アスファルト舗装工", "pave", 20, "backfill", 1.0,
          ["管理用通路 路盤 {m}m² を整正", "管理用通路 表層 {m}m² を舗設"],
          "paving", []),
    ],
    ROAD: [
        T("site", "交通規制・準備工", "仮設工", "site", 14, None, 1.0,
          ["片側交互通行規制を設置", "既設舗装の切断・撤去 {m}m²"],
          "site-prep", ["バックホウ 0.45m³"]),
        T("subgrade", "路床改良", "地盤改良工", "subgrade", 30, "site", 0.8,
          ["路床 セメント改良 {m}m² を施工", "CBR 試験用の試料を {n} 箇所で採取"],
          "road-base", ["ブルドーザ 15t"]),
        T("subbase", "下層路盤", "路盤工", "subbase", 25, "subgrade", 0.6,
          ["下層路盤 RC-40 {m}m² を敷均し転圧", "プルーフローリングを実施"],
          "road-base", ["ブルドーザ 7t"]),
        T("base", "上層路盤", "路盤工", "base", 25, "subbase", 0.6,
          ["上層路盤 粒調砕石 {m}m² を施工", "路盤の平坦性を {n} 測線で測定"],
          "road-base", ["ブルドーザ 7t"]),
        T("binder", "基層 アスファルト", "アスファルト舗装工", "binder", 20, "base", 0.7,
          ["基層 アスファルト {m}m² を舗設", "舗設温度管理と締固め"],
          "paving", []),
        T("surface", "表層 アスファルト", "アスファルト舗装工", "surface", 20, "binder", 0.8,
          ["表層 密粒度アスコン {m}m² を舗設", "平坦性・密度の出来形検査"],
          "paving", []),
        T("marking", "区画線・付属物", "仮設工", "marking", 14, "surface", 0.9,
          ["区画線 {m}m を施工", "防護柵・標識 {n} 基を設置"],
          "road-marking", []),
    ],
}

CREW = {BRIDGE: 16, EARTHWORK: 20, TUNNEL: 24, ARCHITECTURE: 38, CHANNEL: 12, ROAD: 14}


@dataclass
class ProjectSpec:
    name: str
    number: str
    client: str
    kind: int
    address: str
    latitude: float
    longitude: float
    model: int
    start: int
    end: int
    manager: str
    status: int
    performance: float
    description: str
    params: str = ""


PROJECTS = [
    ProjectSpec("青葉川橋梁下部工事", "P-2026-001", "架空県 仙台土木事務所", CIVIL, "宮城県仙台市太白区長町",
                38.2290, 140.8590, BRIDGE, -210, 240, "佐藤 健一", ACTIVE, 0.86,
                "一級河川青葉川を渡る県道橋の下部工。橋台 2 基・橋脚 2 基を出水期を避けて施工する。"),
    ProjectSpec("若葉台造成工事", "P-2026-002", "架空市 都市整備部", CIVIL, "千葉県千葉市若葉区若松町",
                35.6350, 140.1960, EARTHWORK, -160, 200, "鈴木 美咲", ACTIVE, 1.0,
                "約 12ha の住宅地造成。切盛土量 18 万 m³、L 型擁壁と雨水排水を整備する。"),
    ProjectSpec("山の辺トンネル工事", "P-2026-003", "架空高速道路株式会社", CIVIL, "静岡県静岡市葵区牛妻",
                35.0420, 138.3550, TUNNEL, -320, 420, "高橋 誠", ACTIVE, 0.93,
                "延長 1,280m の 2 車線道路トンネル。NATM で上半先進掘削。"),
    ProjectSpec("港南物流センター新築工事", "P-2026-004", "架空物流株式会社", BUILDING, "大阪府大阪市住之江区南港北",
                34.6170, 135.4380, ARCHITECTURE, -140, 260, "田中 大輔", ACTIVE, 1.02,
                "S 造 4 階建て、延床 42,000m² のマルチテナント型物流倉庫。", "floors=4;width=9;depth=5"),
    ProjectSpec("緑町排水路改修工事", "P-2026-005", "架空市 下水道部", CIVIL, "福岡県福岡市東区香椎",
                33.6230, 130.4210, CHANNEL, 25, 240, "伊藤 翔", PLANNED, 1.0,
                "老朽化した開水路 L=620m をプレキャスト水路に改修する。"),
    ProjectSpec("北陸新港 臨港道路舗装工事", "P-2026-006", "架空県 港湾空港課", CIVIL, "新潟県新潟市東区臨港町",
                37.9390, 139.0950, ROAD, -90, 120, "渡辺 さくら", ACTIVE, 0.97,
                "臨港道路 L=1.8km の舗装打換え。大型車交通を確保しながら夜間に施工する。"),
    ProjectSpec("栄町再開発ビル新築工事", "P-2026-007", "架空都市開発株式会社", BUILDING, "愛知県名古屋市中区栄",
                35.1700, 136.9080, ARCHITECTURE, -260, 380, "山本 拓也", ACTIVE, 0.9,
                "S 造 12 階建て複合ビル（店舗・オフィス）。狭隘地のためタワークレーンで揚重する。",
                "floors=12;width=4;depth=4"),
    ProjectSpec("白川護岸改修工事", "P-2026-008", "架空県 河川課", CIVIL, "熊本県熊本市中央区新屋敷",
                32.8000, 130.7150, CHANNEL, -100, 150, "中村 優", ACTIVE, 1.0,
                "白川左岸 L=450m の護岸改修。出水期前に仮締切を撤去する。"),
    ProjectSpec("北郷跨線橋耐震補強工事", "P-2026-009", "架空市 建設局", CIVIL, "北海道札幌市白石区北郷",
                43.0560, 141.4270, BRIDGE, -60, 300, "小林 直樹", ACTIVE, 0.95,
                "鉄道をまたぐ跨線橋の橋脚補強と橋台改築。き電停止時間帯に施工する。"),
    ProjectSpec("屋島台住宅団地造成工事", "P-2026-010", "架空住宅供給公社", CIVIL, "香川県高松市屋島西町",
                34.3490, 134.0980, EARTHWORK, -40, 330, "加藤 真由", ACTIVE, 1.0,
                "丘陵地 8ha の住宅団地造成。着工直後で伐採と第 1 工区の切土に着手。"),
    ProjectSpec("新都心市民体育館新築工事", "P-2026-011", "架空市 教育委員会", BUILDING, "沖縄県那覇市おもろまち",
                26.2190, 127.6950, ARCHITECTURE, 45, 600, "吉田 亮", PLANNED, 1.0,
                "RC 造一部 S 造 2 階建ての市民体育館。台風期を考慮した工程で計画中。", "floors=2;width=8;depth=6"),
    ProjectSpec("桜台市民会館耐震改修", "P-2025-018", "架空市 建築保全課", BUILDING, "東京都練馬区桜台",
                35.7480, 139.6540, ARCHITECTURE, -320, -45, "山田 恵", COMPLETED, 1.0,
                "市民会館の耐震補強と外装改修。供用しながら施工し竣工済み。", "floors=3;width=6;depth=4"),
    ProjectSpec("北浜歩道橋更新工事", "P-2025-024", "架空県 道路保全課", CIVIL, "神奈川県横浜市中区北仲通",
                35.4440, 139.6380, BRIDGE, -410, -190, "佐々木 隆", COMPLETED, 1.0,
                "老朽化した歩道橋の架替え。夜間通行止めで架設し竣工済み。"),
    ProjectSpec("柏の葉雨水幹線工事", "P-2025-031", "架空市 下水道部", CIVIL, "千葉県柏市若柴",
                35.8930, 139.9520, CHANNEL, -380, -120, "松本 陽介", COMPLETED, 1.0,
                "雨水幹線水路 L=820m の新設。竣工済み。"),
    ProjectSpec("盛岡中央通り舗装補修工事", "P-2025-036", "架空県 道路課", CIVIL, "岩手県盛岡市中央通",
                39.7020, 141.1450, ROAD, -200, -30, "井上 彩", COMPLETED, 1.0,
                "中心市街地の舗装補修 L=1.1km。冬期前に完了。"),
    ProjectSpec("金沢港町倉庫新築工事", "P-2024-012", "架空海運株式会社", BUILDING, "石川県金沢市大野町",
                36.6070, 136.6020, ARCHITECTURE, -760, -420, "木村 拓海", COMPLETED, 1.0,
                "S 造 3 階建て倉庫。1 年以上前に竣工した参考工事。", "floors=3;width=7;depth=4"),
]

HAZARDS: dict[str, list[tuple[str, str, str]]] = {
    "掘削工": [("バックホウ旋回範囲への作業員の立入り", "旋回範囲をカラーコーンで区画し合図者を配置。立入り時はエンジン停止を徹底する", "高"),
             ("掘削法面の崩壊による生き埋め", "掘削勾配を厳守し、降雨後は法面点検後に作業を開始する", "高"),
             ("ダンプ後退時の接触", "誘導員の合図で後退し、バックモニターと警報装置を確認する", "中")],
    "盛土工": [("ブルドーザと作業員の接触", "作業範囲を区分し、重機稼働中は立入禁止とする", "中"),
             ("法肩からの重機転落", "法肩から 1m 以内への接近を禁止し、路肩表示を設置する", "高"),
             ("締固め不足による沈下", "まき出し厚 30cm 以下とし、含水比を毎朝確認する", "中")],
    "擁壁工": [("吊り荷の落下", "玉掛け有資格者が作業し、吊り荷の下への立入りを禁止する", "高"),
             ("据付時の手指の挟まれ", "介錯ロープを使用し、製品の間に手を差し込まない", "中")],
    "排水構造物工": [("溝掘削部への転落", "開口部に単管バリケードを設置し、夜間は点滅灯を付ける", "中"),
               ("製品据付時の挟まれ", "合図を統一し、据付は 2 名で確認する", "中")],
    "法面工": [("法面からの墜落", "親綱とフルハーネスを使用し、昇降設備を設置する", "高"),
             ("吹付け材の飛散による目の負傷", "保護メガネと防じんマスクを着用する", "低")],
    "仮設工": [("覆工板の段差による転倒", "段差をすり付けし、通路を明示する", "低"),
             ("仮設電気設備での感電", "漏電遮断器の作動とキャブタイヤの損傷を点検する", "中"),
             ("一般車両の誤進入", "規制帯にクッションドラムと保安員を配置する", "高")],
    "杭打ち工": [("強風時の吊り荷・リーダーの振れ", "平均風速 10m/s 以上で作業を中止し、介錯ロープを使用する", "高"),
              ("杭打ち機の転倒", "敷鉄板で地盤を養生し、アウトリガーの張出しを確認する", "高"),
              ("溶接作業の火傷・火災", "防火シートと消火器を配置し、火気使用届を提出する", "中")],
    "地盤改良工": [("セメント粉じんの吸入", "防じんマスクを着用し、散水で飛散を防止する", "低"),
               ("改良機と作業員の接触", "作業半径を区画し、誘導員を配置する", "中")],
    "橋梁架設工": [("桁上からの墜落", "親綱支柱と安全ネットを先行設置する", "高")],
    "コンクリート工": [("ポンプ車ブームの接触・倒壊", "アウトリガー下に敷板を敷き、ブーム下への立入りを禁止する", "高"),
                ("型枠支保工の崩壊", "打設前に支保工を点検し、偏打ちを避ける", "高"),
                ("バイブレータによる感電", "絶縁手袋を着用し、アース接続を確認する", "低")],
    "山岳トンネル掘削": [("切羽からの肌落ち", "掘進ごとに切羽観察を行い、鏡吹付けを先行する", "高"),
                  ("発破時の飛石", "退避距離 200m 以上を確保し、退避完了を確認する", "高"),
                  ("ずり出し重機との接触", "坑内の歩行帯を明示し、重機に回転灯を付ける", "中")],
    "覆工コンクリート工": [("セントル移動時の挟まれ", "移動前に合図と周囲確認を行い、レール上への立入りを禁止する", "中"),
                   ("高所作業台からの墜落", "手すりを設置し、フルハーネスを使用する", "中")],
    "アスファルト舗装工": [("フィニッシャ・ローラとの接触", "施工帯を区画し、後進時は誘導員を付ける", "中"),
                   ("高温合材による火傷", "長袖と耐熱手袋を着用する", "低"),
                   ("一般車両の誤進入", "規制帯にクッションドラムと保安員を配置する", "高")],
    "路盤工": [("ダンプ荷下ろし時の接触", "荷台の下への立入りを禁止し、誘導員の合図で荷下ろしする", "中")],
    "鉄筋・型枠工": [("鉄筋端部での負傷", "鉄筋端部にキャップを装着する", "低"),
               ("開口部からの墜落", "開口部を養生し、手すりを設置する", "高")],
    "足場組立工": [("足場からの墜落", "先行手すり工法とフルハーネスを使用する", "高"),
              ("足場材の落下", "上下作業を禁止し、資材を結束して揚重する", "中")],
    "鉄骨工": [("鉄骨建方時の墜落", "親綱と垂直ネットを先行設置する", "高"),
             ("強風時の吊り荷の振れ", "平均風速 10m/s 以上で中止し、介錯ロープを使用する", "高")],
    "外装工": [("パネル揚重時の落下", "吊り治具を点検し、吊り荷の下への立入りを禁止する", "高")],
    "防水工": [("屋上端部からの墜落", "端部に手すりと親綱を設置する", "高"),
             ("トーチ使用時の火災", "消火器を配置し、作業後に残火を確認する", "中")],
    "内装工": [("脚立からの転落", "可搬式作業台を使用し、天板での作業を禁止する", "中"),
             ("ボード搬入時の腰痛", "2 人で搬送し、台車を使用する", "低")],
    "設備工": [("高所作業車での挟まれ", "上昇時の周囲確認と過上昇防止装置を確認する", "中"),
             ("活線近接作業での感電", "停電と検電を確認し、絶縁用保護具を使用する", "高")],
}

ISSUES = [
    "降雨により作業中止 {n} 日。後続工程の開始が遅れている",
    "資材（{mat}）の納入が {n} 日遅延",
    "地中障害物（既設管）の撤去に {n} 日を要した",
    "近隣協議により作業時間が 9 時〜16 時に制限されている",
    "湧水対策の追加施工が発生",
    "強風による揚重作業の中止が {n} 日発生",
]
MATERIALS = ["鋼管杭", "生コンクリート", "プレキャスト製品", "鉄骨部材", "アスファルト合材", "鉄筋 D32"]

INCIDENTS: dict[str, list[tuple[str, int, str, str, str]]] = {
    "掘削工": [("旋回範囲への立ち入り", 100000000, "バックホウの旋回範囲に誘導員が入りかけ、オペレーターが急停止した",
              "誘導員の立ち位置が決まっておらず、死角に入った", "旋回範囲をカラーコーンで区画し、誘導員の立ち位置を朝礼で指示する"),
             ("掘削法面の小崩落", 100000000, "前日の降雨後、法尻付近で約 1m³ の小崩落が発生。けが人なし",
              "降雨後の法面点検を省略して掘削を再開した", "降雨後は法面点検を作業開始条件とし、シート養生を行う")],
    "盛土工": [("締固め不足", 100000002, "現場密度試験で基準値（90%）を下回る 86% を記録した",
              "含水比が高い状態でまき出し厚が 40cm になっていた", "まき出し厚 30cm 以下を徹底し、含水比を毎朝確認する")],
    "杭打ち工": [("強風時の吊り荷の振れ", 100000000, "突風で鋼管杭の吊り荷が大きく振れ、作業員の近くを通過した",
              "風速計の確認が作業開始時のみで、作業中に風が強まった", "風速計を常時監視し 10m/s 以上で作業中止、介錯ロープを 2 本使う"),
             ("杭打ち機の沈下", 100000003, "杭打ち機のクローラ片側が約 5cm 沈下した",
              "敷鉄板の継ぎ目が地盤の軟弱部と重なっていた", "敷鉄板を千鳥配置にし、地盤の支持力を事前に確認する")],
    "コンクリート工": [("ポンプ車ブームの架空線接近", 100000000, "ポンプ車ブームが架空線に約 2m まで接近した",
                  "架空線の位置表示がなく、ブーム旋回範囲が未確認だった", "架空線に防護管と表示旗を付け、監視員を配置する"),
                 ("コールドジョイントの発生", 100000002, "柱の打継ぎ部にコールドジョイントが発生した",
                  "生コン車の到着が 40 分遅れ、打重ね時間を超過した", "打重ね時間の管理表を作成し、出荷間隔をプラントと事前調整する")],
    "山岳トンネル掘削": [("切羽からの肌落ち", 100000001, "吹付け前に切羽天端から小規模な肌落ちが発生。けが人なし",
                    "湧水で地山が緩み、鏡吹付けが遅れた", "湧水時は鏡吹付けを先行し、切羽観察の頻度を上げる")],
    "足場組立工": [("足場板の固定漏れ", 100000000, "足場板 1 枚の緊結を忘れ、作業員がつまずいた",
                "組立後の点検がチェックリストで行われていなかった", "組立後にチェックリストで緊結を確認し、点検者を明示する")],
    "鉄骨工": [("ボルト落下", 100000000, "高力ボルトが 1 本落下し、下階の立入禁止区域内に落ちた",
              "ボルト袋の口が開いたまま運搬していた", "ボルトは蓋付き容器で運搬し、下階の立入禁止区画を拡大する")],
    "アスファルト舗装工": [("一般車両の規制帯進入", 100000000, "夜間規制中に一般車両が規制帯に進入しかけた",
                     "規制開始地点の予告看板が少なかった", "予告看板を 200m 手前から 3 枚設置し、矢印板を点灯式にする")],
    "擁壁工": [("吊り荷の接触", 100000000, "据付中の L 型擁壁が既設擁壁に接触し、角が欠けた",
              "介錯ロープが 1 本で振れを制御できなかった", "介錯ロープを 2 本使用し、合図者を 1 名に統一する")],
    "仮設工": [("覆工板の段差でつまずき", 100000000, "覆工板の段差（約 3cm）で作業員がつまずいた",
              "覆工板の据付高さの調整が不十分だった", "段差部をすり付け、通路を色分けして明示する")],
}

KNOWLEDGE = [
    ("バックホウの旋回範囲での接触リスク", "掘削工", 100000000, "バックホウの旋回範囲に人が入る",
     "誘導員の立ち位置と合図が曖昧", "旋回範囲をカラーコーンで区画し、誘導員の立ち位置を決めておく", "バックホウ、旋回、誘導員", "旋回範囲への立ち入り"),
    ("掘削の法面の崩落", "掘削工", 100000000, "降雨で法面が崩落する",
     "降雨後の点検手順がない", "掘削勾配を守り、降雨前に法面をシートで養生する", "法面、崩落、降雨", "掘削法面の小崩落"),
    ("盛土の締固め不足", "盛土工", 100000001, "現場密度が基準を下回る",
     "含水比とまき出し厚の管理不足", "仕上がり厚さを 30cm 以下にし、含水比を毎日確認する", "締固め、含水比、密度", "締固め不足"),
    ("強風時の吊り作業", "杭打ち工", 100000000, "強風で吊り荷が振れる",
     "風速の監視が作業開始時だけ", "平均風速 10m/s 以上で吊り作業を中止し、介錯ロープを使う", "強風、クレーン、吊り荷", "強風時の吊り荷の振れ"),
    ("杭打ち機の据付地盤", "杭打ち工", 100000000, "杭打ち機が軟弱部で沈下する",
     "敷鉄板の配置が地盤条件に合っていない", "敷鉄板を千鳥配置にし、事前に平板載荷で支持力を確認する", "杭打ち機、転倒、敷鉄板", "杭打ち機の沈下"),
    ("ポンプ車と架空線", "コンクリート工", 100000000, "ブームが架空線に接近する",
     "架空線の位置表示がない", "架空線に防護管と表示旗を付け、監視員を配置する", "ポンプ車、架空線、感電", "ポンプ車ブームの架空線接近"),
    ("打重ね時間の管理", "コンクリート工", 100000001, "コールドジョイントが発生する",
     "生コン車の到着遅れ", "打重ね時間の管理表を作り、出荷間隔をプラントと事前に調整する", "コールドジョイント、打重ね、生コン", "コールドジョイントの発生"),
    ("雨の後の切羽の肌落ち", "山岳トンネル掘削", 100000000, "降雨後に切羽が肌落ちする",
     "湧水で地山が緩む", "切羽観察の時間を延ばし、鏡吹付けを先行する", "切羽、肌落ち、湧水", "切羽からの肌落ち"),
    ("足場板の緊結確認", "足場組立工", 100000000, "足場板の固定が不足する",
     "組立後の点検手順がない", "組立後にチェックリストで緊結を確認する", "足場、緊結、墜落", "足場板の固定漏れ"),
    ("高力ボルトの落下防止", "鉄骨工", 100000000, "ボルトや工具が落下する",
     "運搬容器に蓋がない", "蓋付き容器で運搬し、下階の立入禁止区画を拡大する", "鉄骨、落下、ボルト", "ボルト落下"),
    ("夜間規制の予告", "アスファルト舗装工", 100000000, "一般車両が規制帯に進入する",
     "予告看板が不足", "予告看板を 200m 手前から 3 枚設置し、点灯式矢印板を使う", "規制、夜間、一般車両", "一般車両の規制帯進入"),
    ("擁壁据付の振れ止め", "擁壁工", 100000001, "据付中の製品が既設構造物に接触する",
     "介錯ロープ 1 本では振れを制御できない", "介錯ロープを 2 本使い、合図者を 1 名に統一する", "擁壁、据付、介錯ロープ", "吊り荷の接触"),
    ("覆工板の段差", "仮設工", 100000000, "覆工板の段差でつまずく",
     "据付高さの調整不足", "段差部をすり付け、通路を色分けして明示する", "覆工板、段差、転倒", "覆工板の段差でつまずき"),
    ("出水期を避けた河川内工程", "仮設工", 100000002, "出水期に仮締切が流される恐れがある",
     "河川内作業の工程が出水期と重なった", "河川内作業は 11 月〜5 月に集約し、出水期前に仮設を撤去する", "出水期、仮締切、河川", None),
    ("上半先進工法の工程管理", "山岳トンネル掘削", 100000002, "下半掘削の着手が遅れ、覆工が後ろ倒しになる",
     "上半と下半の離隔管理が不十分", "上半と下半の離隔を 150m 以内で管理し、ずり出し動線を分離する", "上半、下半、工程", None),
    ("鉄骨建方の歪み直し", "鉄骨工", 100000003, "建入れ精度が許容値を超える",
     "建方順序と仮ボルトの本数が不適切", "建入れ直しを節ごとに行い、本締め前に計測記録を残す", "建方、建入れ、精度", None),
    ("寒冷期のコンクリート養生", "コンクリート工", 100000001, "初期凍害で表面がスケーリングする",
     "給熱養生の開始が遅れた", "日平均気温 4℃以下では打設直後から給熱養生し、温度を記録する", "寒中、養生、凍害", None),
    ("路床改良の配合確認", "地盤改良工", 100000003, "改良後の CBR が目標に届かない",
     "現地土の含水比が配合試験時と異なる", "施工前に現地土で配合を再確認し、添加量を調整する", "路床、改良、CBR", None),
    ("プレキャスト水路の目地漏水", "排水構造物工", 100000001, "目地から漏水する",
     "目地モルタルの充填不足", "目地材を規格品に統一し、通水試験を区間ごとに実施する", "水路、目地、漏水", None),
    ("屋上防水の端部処理", "防水工", 100000001, "立上り端部から漏水する",
     "端部の押さえ金物の施工不良", "端部の納まりを施工前に図示し、散水試験で確認する", "防水、端部、漏水", None),
    ("可搬式作業台の徹底", "内装工", 100000000, "脚立の天板で作業して転落しそうになる",
     "作業台の数が不足", "フロアごとに可搬式作業台を配備し、脚立の使用を制限する", "脚立、転落、内装", None),
    ("活線近接作業の手順", "設備工", 100000000, "盤内の活線に接近する",
     "停電範囲の確認不足", "作業前に停電範囲を図示し、検電と短絡接地を行う", "感電、活線、検電", None),
]

LEGACY = {
    "${PUBLISHER_PREFIX}_equipmentusage": ["稼働 青葉川 杭打ち機", "稼働 若葉台 バックホウ", "稼働 若葉台 ダンプ", "稼働 港南 高所作業車"],
    "${PUBLISHER_PREFIX}_kyactivity": ["KY 青葉川 今日", "KY 若葉台 今日", "KY 山の辺 今日", "KY 港南 今日", "KY 若葉台 昨日"],
    "${PUBLISHER_PREFIX}_incident": ["旋回範囲への立ち入り", "強風時の吊り荷の振れ", "切羽からの肌落ち", "足場板の固定漏れ", "締固め不足"],
    "${PUBLISHER_PREFIX}_dailyreport": ["日報 青葉川 D-2", "日報 若葉台 D-2", "日報 山の辺 D-2", "日報 青葉川 D-1", "日報 港南 D-1"],
    "${PUBLISHER_PREFIX}_task": ["P2 橋脚 杭打ち", "P2 橋脚 鉄筋組立", "第2工区 掘削", "第1工区 盛土", "本坑 掘削(上半)", "外部足場 組立"],
}


# ---------------------------------------------------------------------------
# 工程計算
# ---------------------------------------------------------------------------
@dataclass
class PlannedTask:
    template: TaskTemplate
    sequence: int
    start: date
    end: date
    progress: int
    expected: int
    issue: str = ""
    record_id: str = ""


def schedule(spec: ProjectSpec) -> list[PlannedTask]:
    templates = TEMPLATES[spec.model]
    raw: dict[str, tuple[float, float]] = {}
    for item in templates:
        begin = 0.0
        if item.predecessor:
            pred_start, pred_end = raw[item.predecessor]
            begin = pred_start + item.lag * (pred_end - pred_start)
        raw[item.key] = (begin, begin + item.duration)
    span = max(end for _, end in raw.values())
    project_start = TODAY + timedelta(days=spec.start)
    usable = (spec.end - spec.start) - 14
    scale = usable / span
    planned = []
    for sequence, item in enumerate(templates, start=1):
        begin, finish = raw[item.key]
        start = project_start + timedelta(days=round(begin * scale))
        end = project_start + timedelta(days=max(round(begin * scale) + 3, round(finish * scale)))
        total = max(1, (end - start).days)
        expected_ratio = min(1.0, max(0.0, (TODAY - start).days / total))
        r = rng(spec.number, item.key, "progress")
        if spec.status == COMPLETED:
            progress = 100
        elif spec.status == PLANNED or expected_ratio <= 0:
            progress = 0
        else:
            factor = spec.performance * r.uniform(0.9, 1.06)
            if expected_ratio >= 1.0:
                progress = 100 if factor >= 0.93 else round(r.uniform(85, 97))
            else:
                progress = max(3, min(97, round(expected_ratio * factor * 100)))
        expected = round(expected_ratio * 100) if spec.status == ACTIVE else progress
        task = PlannedTask(item, sequence * 10, start, end, progress, expected)
        if spec.status == ACTIVE and expected - progress >= 8:
            template = r.choice(ISSUES)
            task.issue = template.format(n=r.randint(2, 6), mat=r.choice(MATERIALS))
        planned.append(task)
    return planned


def phrase(task: PlannedTask, r: random.Random) -> str:
    return r.choice(task.template.phrases).format(n=r.randint(2, 12), m=r.choice([45, 60, 80, 120, 150, 240, 320, 480]))


def tasks_on(planned: list[PlannedTask], day: date) -> list[PlannedTask]:
    active = [task for task in planned if task.start <= day <= task.end and task.progress > 0]
    return active or [min(planned, key=lambda task: abs((task.start - day).days))]


def weather_for(spec: ProjectSpec, day: date) -> int:
    r = rng(spec.number, day.isoformat(), "weather")
    roll = r.random()
    if spec.latitude > 42 and day.month in (11, 12, 1, 2, 3) and roll < 0.25:
        return SNOW
    if roll < 0.18:
        return RAIN
    if roll < 0.24:
        return WIND
    if roll < 0.5:
        return CLOUDY
    return SUNNY


def photo_weather(weather: int) -> str:
    return {RAIN: "rain", CLOUDY: "cloudy", SNOW: "cloudy"}.get(weather, "sunny")


def ky_prediction_json(worktype: str, hazards: list[tuple[str, str, str]]) -> str:
    risks = [{
        "title": title, "description": f"{worktype}で想定される危険: {title}", "countermeasure": counter,
        "level": level, "sourceKnowledgeTitles": [],
    } for title, counter, level in hazards[:3]]
    return json.dumps({"source": "fallback", "risks": risks}, ensure_ascii=False)


# ---------------------------------------------------------------------------
# 投入
# ---------------------------------------------------------------------------
def main() -> None:
    print("=== マスタ ===")
    worktypes = {
        name: upsert("${PUBLISHER_PREFIX}_worktype", name, {"${PUBLISHER_PREFIX}_code": code, "${PUBLISHER_PREFIX}_category": 100000000 + category, "${PUBLISHER_PREFIX}_description": text})
        for name, code, category, text in WORKTYPES
    }
    equipments = {
        name: upsert("${PUBLISHER_PREFIX}_equipment", name, {"${PUBLISHER_PREFIX}_equipmenttype": 100000000 + kind, "${PUBLISHER_PREFIX}_assetno": asset})
        for name, kind, asset in EQUIPMENT
    }
    print(f"worktypes={len(worktypes)} equipment={len(equipments)}")

    task_keys: set[str] = set()
    report_names: set[str] = set()
    counts = {"projects": 0, "tasks": 0, "reports": 0, "photos": 0, "ky": 0, "incidents": 0, "usage": 0}
    incident_ids: dict[str, str] = {}

    for spec in PROJECTS:
        planned = schedule(spec)
        weights = sum(max(1, (task.end - task.start).days) for task in planned)
        progress = round(sum(task.progress * max(1, (task.end - task.start).days) for task in planned) / weights)
        project_id = upsert("${PUBLISHER_PREFIX}_project", spec.name, {
            "${PUBLISHER_PREFIX}_projectno": spec.number, "${PUBLISHER_PREFIX}_client": spec.client, "${PUBLISHER_PREFIX}_projecttype": spec.kind,
            "${PUBLISHER_PREFIX}_address": spec.address, "${PUBLISHER_PREFIX}_latitude": spec.latitude, "${PUBLISHER_PREFIX}_longitude": spec.longitude,
            "${PUBLISHER_PREFIX}_startdate": (TODAY + timedelta(days=spec.start)).isoformat(),
            "${PUBLISHER_PREFIX}_enddate": (TODAY + timedelta(days=spec.end)).isoformat(),
            "${PUBLISHER_PREFIX}_progress": progress, "${PUBLISHER_PREFIX}_status": spec.status, "${PUBLISHER_PREFIX}_sitemanager": spec.manager,
            "${PUBLISHER_PREFIX}_modeltype": spec.model, "${PUBLISHER_PREFIX}_modelcenter": spec.params, "${PUBLISHER_PREFIX}_description": spec.description,
            # 橋梁は同梱の glTF（GLB）モデルを読み込む。CAD 取り込みのデモ工事は Dataverse のファイル列のモデルを使う
            # （scripts/upload_cad_model.py で登録する。未登録なら画面は標準モデルに切り替えて理由を表示する）
            "${PUBLISHER_PREFIX}_modelurl": CAD_MODEL_URL if spec.number in CAD_SAMPLE_PROJECTS else "bundled:bridge-3span" if spec.model == BRIDGE else "",
        })
        counts["projects"] += 1
        print(f"--- {spec.number} {spec.name}（進捗 {progress}%）")

        # 作業（先行作業は 2 パスで結ぶ）
        submitted = next((task for task in planned if 0 < task.progress < 100), None) if spec.status == ACTIVE else None
        returned = None
        if spec.number in ("P-2026-001", "P-2026-007"):
            returned = next((task for task in reversed(planned) if 0 < task.progress < 100 and task is not submitted), None)
        for task in planned:
            r = rng(spec.number, task.template.key, "review")
            review, reported, comment = REVIEW_DRAFT, task.progress, ""
            if task is submitted:
                review, reported = REVIEW_SUBMITTED, min(100, task.progress + r.randint(3, 8))
            elif task is returned:
                review, reported = REVIEW_RETURNED, min(100, task.progress + r.randint(8, 15))
                comment = "報告進捗が出来形写真と一致しません。打設範囲と数量を追記して再提出してください。"
            elif task.progress > 0:
                review = REVIEW_APPROVED
            data = {
                "${PUBLISHER_PREFIX}_plannedstart": task.start.isoformat(), "${PUBLISHER_PREFIX}_plannedend": task.end.isoformat(),
                "${PUBLISHER_PREFIX}_progress": task.progress, "${PUBLISHER_PREFIX}_reportedprogress": reported,
                "${PUBLISHER_PREFIX}_status": 100000002 if task.progress >= 100 else 100000001 if task.progress > 0 else 100000000,
                "${PUBLISHER_PREFIX}_reviewstatus": review, "${PUBLISHER_PREFIX}_reviewcomment": comment,
                "${PUBLISHER_PREFIX}_zone": task.template.zone, "${PUBLISHER_PREFIX}_sequence": task.sequence, "${PUBLISHER_PREFIX}_issue": task.issue,
            }
            bind(data, "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", project_id)
            bind(data, "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_worktype", "${PUBLISHER_PREFIX}_worktype", worktypes[task.template.worktype])
            key = f"{project_id}|{task.template.name}"
            task.record_id = upsert("${PUBLISHER_PREFIX}_task", task.template.name, data, key=key)
            task_keys.add(key)
            counts["tasks"] += 1
        by_key = {task.template.key: task for task in planned}
        for task in planned:
            if task.template.predecessor:
                api_patch(f"{entity_set('${PUBLISHER_PREFIX}_task')}({task.record_id})",
                          bind({}, "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_predecessor", "${PUBLISHER_PREFIX}_task", by_key[task.template.predecessor].record_id))

        if spec.status == PLANNED:
            continue

        # 日報・写真・重機稼働・KY
        if spec.status == ACTIVE:
            offsets = [o for o in range(0, 22) if (TODAY - timedelta(days=o)).weekday() != 6]
        else:
            end_day = TODAY + timedelta(days=spec.end)
            offsets = [(TODAY - (end_day - timedelta(days=d))).days for d in (2, 9, 16, 30, 44, 58)]
        crew = CREW[spec.model]
        for offset in offsets:
            day = TODAY - timedelta(days=offset)
            r = rng(spec.number, offset, "report")
            weather = weather_for(spec, day)
            todays = tasks_on(planned, day)
            main_task = todays[0] if len(todays) == 1 else r.choice(todays)
            others = [task for task in todays if task is not main_task][:1]
            lines = [f"{main_task.template.name}: {phrase(main_task, r)}"] + [f"{t.template.name}: {phrase(t, r)}" for t in others]
            workers = max(4, round(crew * r.uniform(0.75, 1.15)))
            crane_work = any("クレーン" in name for name in main_task.template.equipment)
            if weather == RAIN:
                workers = max(3, round(workers * 0.6))
                lines.append("降雨のため午後は屋外作業を中止し、資材整理と安全教育を実施")
            elif weather == WIND and crane_work:
                lines.append("強風（最大瞬間 13m/s）のため揚重作業を一時中止")
            next_task = next((task for task in planned if task.start > day), main_task)
            next_plan = f"{main_task.template.name}を継続。{next_task.template.name}の段取りを確認" if next_task is not main_task else f"{main_task.template.name}を継続"
            if spec.status == ACTIVE:
                if offset <= 1:
                    review = REVIEW_SUBMITTED if r.random() < 0.75 else REVIEW_APPROVED
                elif offset == 2 and spec.number in ("P-2026-002", "P-2026-006"):
                    review = REVIEW_RETURNED
                else:
                    review = REVIEW_APPROVED
            else:
                review = REVIEW_APPROVED
            comment = "作業人員の職種内訳と重機の稼働時間を追記してください。" if review == REVIEW_RETURNED else ""
            has_photo = r.random() < 0.8
            station = f"No.{r.randint(1, 48)}+{r.randint(0, 19):02d}"
            name = f"{spec.number} 日報 D-{offset:03d}"
            data = {
                "${PUBLISHER_PREFIX}_reportdate": day.isoformat(), "${PUBLISHER_PREFIX}_weather": weather, "${PUBLISHER_PREFIX}_workers": workers,
                "${PUBLISHER_PREFIX}_workdetail": "\n".join(lines), "${PUBLISHER_PREFIX}_nextplan": next_plan,
                "${PUBLISHER_PREFIX}_remarks": f"{main_task.template.worktype}の KY を実施。{HAZARDS.get(main_task.template.worktype, [('安全確認', '', '中')])[0][0]}に注意",
                "${PUBLISHER_PREFIX}_aidrafted": r.random() < 0.4, "${PUBLISHER_PREFIX}_status": 100000001 if review == REVIEW_APPROVED else 100000000,
                "${PUBLISHER_PREFIX}_reviewstatus": review, "${PUBLISHER_PREFIX}_reviewcomment": comment,
                "${PUBLISHER_PREFIX}_photourl": f"demo:{main_task.template.scene}:{photo_weather(weather)}" if has_photo else "",
                "${PUBLISHER_PREFIX}_photocaption": f"{main_task.template.name}（{main_task.template.worktype}）測点 {station}" if has_photo else "",
            }
            bind(data, "${PUBLISHER_PREFIX}_dailyreport", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", project_id)
            report_id = upsert("${PUBLISHER_PREFIX}_dailyreport", name, data)
            report_names.add(name)
            counts["reports"] += 1
            counts["photos"] += int(has_photo)

            if spec.status == ACTIVE and offset <= 9:
                for i, equipment in enumerate(main_task.template.equipment[:2], start=1):
                    hours = round(r.uniform(2.5, 4.5) if weather in (RAIN, WIND) else r.uniform(5.0, 8.0), 1)
                    usage = {"${PUBLISHER_PREFIX}_hours": hours}
                    bind(usage, "${PUBLISHER_PREFIX}_equipmentusage", "${PUBLISHER_PREFIX}_dailyreport", "${PUBLISHER_PREFIX}_dailyreport", report_id)
                    bind(usage, "${PUBLISHER_PREFIX}_equipmentusage", "${PUBLISHER_PREFIX}_equipment", "${PUBLISHER_PREFIX}_equipment", equipments[equipment])
                    upsert("${PUBLISHER_PREFIX}_equipmentusage", f"{spec.number} 稼働 D-{offset:03d}-{i}", usage)
                    counts["usage"] += 1

                hazards = HAZARDS.get(main_task.template.worktype, [])
                if hazards:
                    hazard = hazards[offset % len(hazards)]
                    level = hazard[2]
                    if weather in (RAIN, WIND, SNOW) and level == "中":
                        level = "高"
                    ky = {
                        "${PUBLISHER_PREFIX}_kydate": day.isoformat(), "${PUBLISHER_PREFIX}_workdetail": phrase(main_task, r), "${PUBLISHER_PREFIX}_weather": weather,
                        "${PUBLISHER_PREFIX}_equipmenttext": "、".join(main_task.template.equipment) or "なし",
                        "${PUBLISHER_PREFIX}_hazards": hazard[0], "${PUBLISHER_PREFIX}_countermeasures": hazard[1], "${PUBLISHER_PREFIX}_risklevel": RISK[level],
                        "${PUBLISHER_PREFIX}_aiprediction": ky_prediction_json(main_task.template.worktype, hazards) if offset <= 3 else "",
                    }
                    bind(ky, "${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", project_id)
                    bind(ky, "${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_task", main_task.record_id)
                    if main_task.template.equipment:
                        bind(ky, "${PUBLISHER_PREFIX}_kyactivity", "${PUBLISHER_PREFIX}_equipment", "${PUBLISHER_PREFIX}_equipment", equipments[main_task.template.equipment[0]])
                    upsert("${PUBLISHER_PREFIX}_kyactivity", f"{spec.number} KY D-{offset:03d}", ky)
                    counts["ky"] += 1

        # ヒヤリハット（工事の工種に応じて 2〜3 件）
        started = [task for task in planned if task.progress > 0 and task.template.worktype in INCIDENTS]
        r = rng(spec.number, "incidents")
        for index_, task in enumerate(r.sample(started, k=min(3, len(started)))):
            title, kind, description, cause, counter = r.choice(INCIDENTS[task.template.worktype])
            occurred_day = max(task.start, min(task.end, TODAY - timedelta(days=r.randint(1, 90))))
            if spec.status == COMPLETED:
                occurred_day = min(occurred_day, TODAY + timedelta(days=spec.end))
            occurred = datetime(occurred_day.year, occurred_day.month, occurred_day.day, r.randint(8, 16), r.choice([0, 15, 30, 45]), tzinfo=JST)
            name = f"{title}（{spec.number}）"
            incident = {
                "${PUBLISHER_PREFIX}_occurredon": occurred.astimezone(timezone.utc).isoformat(), "${PUBLISHER_PREFIX}_incidenttype": kind,
                "${PUBLISHER_PREFIX}_description": f"{task.template.name}: {description}", "${PUBLISHER_PREFIX}_cause": cause, "${PUBLISHER_PREFIX}_countermeasure": counter,
                "${PUBLISHER_PREFIX}_latitude": round(spec.latitude + r.uniform(-0.0015, 0.0015), 6),
                "${PUBLISHER_PREFIX}_longitude": round(spec.longitude + r.uniform(-0.0015, 0.0015), 6),
                "${PUBLISHER_PREFIX}_knowledgecreated": index_ % 2 == 0,
            }
            bind(incident, "${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_project", "${PUBLISHER_PREFIX}_project", project_id)
            bind(incident, "${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_task", "${PUBLISHER_PREFIX}_task", task.record_id)
            bind(incident, "${PUBLISHER_PREFIX}_incident", "${PUBLISHER_PREFIX}_worktype", "${PUBLISHER_PREFIX}_worktype", worktypes[task.template.worktype])
            incident_ids.setdefault(title, upsert("${PUBLISHER_PREFIX}_incident", name, incident))
            counts["incidents"] += 1

    print("=== ナレッジ ===")
    for name, worktype, kind, event, cause, lesson, keywords, source in KNOWLEDGE:
        data = {"${PUBLISHER_PREFIX}_knowledgetype": kind, "${PUBLISHER_PREFIX}_event": event, "${PUBLISHER_PREFIX}_cause": cause, "${PUBLISHER_PREFIX}_lesson": lesson, "${PUBLISHER_PREFIX}_keywords": keywords}
        bind(data, "${PUBLISHER_PREFIX}_knowledge", "${PUBLISHER_PREFIX}_worktype", "${PUBLISHER_PREFIX}_worktype", worktypes[worktype])
        bind(data, "${PUBLISHER_PREFIX}_knowledge", "${PUBLISHER_PREFIX}_sourceincident", "${PUBLISHER_PREFIX}_incident", incident_ids.get(source or ""))
        upsert("${PUBLISHER_PREFIX}_knowledge", name, data)

    print("=== 旧デモデータの整理 ===")
    removed = 0
    for logical, names in LEGACY.items():
        legacy = set(names)
        for key, record_id in list(index(logical).items()):
            name = key.split("|", 1)[-1]
            if name in legacy and key not in task_keys and name not in report_names:
                api_delete(f"{entity_set(logical)}({record_id})")
                index(logical).pop(key, None)
                removed += 1
    api_post("PublishAllXml", {})
    print(f"removed legacy={removed}")
    print("seed summary: " + ", ".join(f"{key}={value}" for key, value in counts.items()) + f", knowledge={len(KNOWLEDGE)}")


if __name__ == "__main__":
    main()
