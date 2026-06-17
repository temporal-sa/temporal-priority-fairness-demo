# ABOUTME: Connection-config helper shared by the worker and the API. Loads the connect
# ABOUTME: config via Temporal envconfig and always attaches the Pydantic data converter.

import os
from collections.abc import Callable
from typing import Any

from temporalio.client import Client
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.envconfig import ClientConfig

Loader = Callable[[str | None], dict[str, Any]]


def _default_loader(profile: str | None) -> dict[str, Any]:
    """Load a connect-config mapping from Temporal envconfig for the given profile."""
    return dict(ClientConfig.load_client_connect_config(profile))


def _resolve_profile(profile: str | None) -> str | None:
    """Use the explicit profile when given, else fall back to TEMPORAL_PROFILE."""
    return profile if profile is not None else os.environ.get("TEMPORAL_PROFILE")


def build_connect_config(
    profile: str | None = None,
    *,
    loader: Loader = _default_loader,
) -> dict[str, Any]:
    """Build Client.connect kwargs with the Pydantic data converter always attached.

    The loader is injectable so worker and API share one connection path and tests can
    avoid the filesystem and environment.
    """
    config = loader(_resolve_profile(profile))
    config["data_converter"] = pydantic_data_converter
    return config


async def connect_client(profile: str | None = None) -> Client:
    """Connect a Temporal client using the resolved profile and Pydantic converter."""
    return await Client.connect(**build_connect_config(profile))
