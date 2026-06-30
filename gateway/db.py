import os

from sqlalchemy.ext.asyncio import create_async_engine

_DATABASE_URL = os.environ["DATABASE_URL"]
engine = create_async_engine(
    _DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
)
