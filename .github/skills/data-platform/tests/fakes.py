"""テスト用の HTTP フェイク。ルールに一致した応答を順に返し、送信内容を記録する。"""
from __future__ import annotations

import json
import re


class FakeResponse:
    def __init__(self, status_code: int = 200, body=None, headers: dict | None = None, text: str | None = None):
        self.status_code = status_code
        self.headers = headers or {}
        if text is not None:
            self.text = text
        elif body is None:
            self.text = ""
        else:
            self.text = json.dumps(body)
        self.content = self.text.encode("utf-8")

    def json(self):
        return json.loads(self.text)


class FakeSession:
    def __init__(self):
        self.rules: list[tuple[str, re.Pattern, list[FakeResponse]]] = []
        self.calls: list[dict] = []

    def add(self, method: str, pattern: str, *responses: FakeResponse) -> "FakeSession":
        self.rules.append((method, re.compile(pattern), list(responses)))
        return self

    def request(self, method, url, data=None, params=None, headers=None, timeout=None):
        body = data.decode("utf-8") if isinstance(data, bytes) else data
        self.calls.append({"method": method, "url": url, "body": body, "headers": headers or {}})
        for rule_method, pattern, responses in self.rules:
            if rule_method == method and pattern.search(url):
                if len(responses) > 1:
                    return responses.pop(0)
                return responses[0]
        raise AssertionError(f"unexpected request: {method} {url}")

    def bodies(self, method: str, pattern: str) -> list:
        regex = re.compile(pattern)
        return [json.loads(call["body"]) if call["body"] and call["body"][0] in "[{" else call["body"]
                for call in self.calls if call["method"] == method and regex.search(call["url"])]


def token_provider(_kind: str) -> str:
    return "header.eyJvaWQiOiAidXNlci1vaWQifQ.signature"


def no_sleep(_seconds: float) -> None:
    return None
