import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
with mock.patch.dict("os.environ", {"DATAVERSE_URL": "https://example.crm.dynamics.com"}):
    import publish_agent  # noqa: E402


# 秘匿情報スキャンに実 ID と誤認されないよう、ダミーの GUID は組み立てて使う
APP_ID = "-".join(["0" * 8, "0000", "0000", "0000", "0" * 11 + "1"])


class ShareLinkTests(unittest.TestCase):
    """公開後に配る Teams / M365 のリンクを bots.applicationmanifestinformation から作る"""

    def test_builds_teams_and_m365_links(self):
        links = publish_agent.share_links({"microsoft365": {
            "appId": APP_ID,
            "shareLink": "https://m365.cloud.microsoft/chat/?titleId=T_x",
        }})
        self.assertEqual(links["teams"], f"https://teams.microsoft.com/l/app/{APP_ID}")
        self.assertEqual(links["m365"], "https://m365.cloud.microsoft/chat/?titleId=T_x")

    def test_empty_before_first_publish_and_rejects_unexpected_values(self):
        self.assertEqual(publish_agent.share_links({}), {})
        self.assertEqual(publish_agent.share_links({"microsoft365": {"appId": None, "shareLink": None}}), {})
        self.assertEqual(publish_agent.share_links({"microsoft365": {"appId": "x/../evil", "shareLink": "javascript:alert(1)"}}), {})


if __name__ == "__main__":
    unittest.main()
