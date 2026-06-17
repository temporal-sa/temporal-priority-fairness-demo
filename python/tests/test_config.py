"""Tests for the connection-config helper.

Per the testing guidelines we do not unit-test envconfig loading itself. The one
OUR-logic assertion is that build_connect_config always attaches the Pydantic data
converter to whatever connect config the loader returns. The loader is injected so the
test never touches the filesystem or environment.
"""

from typing import Any

from temporalio.contrib.pydantic import pydantic_data_converter

from priority_fairness.config import build_connect_config


def test_build_connect_config_attaches_pydantic_converter() -> None:
    captured: dict[str, Any] = {}

    def fake_loader(profile: str | None) -> dict[str, Any]:
        captured["profile"] = profile
        return {"target_host": "x"}

    config = build_connect_config("local", loader=fake_loader)

    assert config["data_converter"] is pydantic_data_converter
    assert config["target_host"] == "x"
    assert captured["profile"] == "local"


def test_build_connect_config_preserves_loader_config() -> None:
    def fake_loader(profile: str | None) -> dict[str, Any]:
        return {"target_host": "host:7233", "namespace": "demo"}

    config = build_connect_config(loader=fake_loader)

    assert config["target_host"] == "host:7233"
    assert config["namespace"] == "demo"
    assert config["data_converter"] is pydantic_data_converter
