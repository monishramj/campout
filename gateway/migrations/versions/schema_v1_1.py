import sqlalchemy as sa
from alembic import op

# from sqlalchemy.dialects import postgresql

revision: str = "v1_1"

down_revision = "a1b2c3d4e5f6"

branch_labels = None

depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.add_column(
        "sessions",
        sa.Column(
            "token_id",
            sa.Uuid(),
            nullable=False,
            # unique=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
    )

    op.create_unique_constraint("uq_s_token_id", "sessions", ["token_id"])


def downgrade() -> None:
    op.drop_column("sessions", "token_id")
