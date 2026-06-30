import os

from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(
    os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+asyncpg://"),
)
