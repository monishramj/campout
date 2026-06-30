import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"

down_revision = None

branch_labels = None

depends_on = None


def upgrade() -> None:
    op.create_table(
        "players",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.Text(), nullable=False, unique=True),
        sa.Column("password_hash", sa.Text(), nullable=True),
        sa.Column("is_guest", sa.Boolean(), server_default="false"),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("cosmetics", postgresql.JSONB(), server_default="{}"),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "player_id",
            sa.BigInteger(),
            sa.ForeignKey("players.id"),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("ended_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("days_survived", sa.Integer(), server_default="0"),
        sa.Column("kills", sa.Integer(), server_default="0"),
        sa.Column("times_starved", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
    )
    op.create_index(
        "ix_sessions_player_active", "sessions", ["player_id", "is_active"]
    )
    op.create_index("ix_sessions_days_survived", "sessions", ["days_survived"])

    op.create_table(
        "item_definitions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("item_type", sa.Text(), nullable=False, unique=True),
        sa.Column("display_name", sa.Text(), nullable=False),
        sa.Column("properties", postgresql.JSONB(), server_default="{}"),
    )
    op.execute("""
    INSERT INTO item_definitions (item_type, display_name, properties) VALUES
    ('FUEL',  'Fuel',         '{"restore": 25}'),
    ('MELEE', 'Melee Weapon', '{"damage": 10, "range": 1.5}'),
    ('FOOD',  'Food',         '{"restore": 50}')
  """)

    op.create_table(
        "campsites",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "session_id",
            sa.BigInteger(),
            sa.ForeignKey("sessions.id"),
            nullable=False,
        ),
        sa.Column(
            "player_id",
            sa.BigInteger(),
            sa.ForeignKey("players.id"),
            nullable=False,
        ),
        sa.Column("xpos", sa.Float(), nullable=False),
        sa.Column("ypos", sa.Float(), nullable=False),
        sa.Column("fuel_level", sa.Float(), server_default="100"),
    )

    op.create_table(
        "map_state",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column(
            "session_id",
            sa.BigInteger(),
            sa.ForeignKey("sessions.id"),
            nullable=False,
        ),
        sa.Column("tile_data", postgresql.JSONB(), nullable=False),
        sa.Column(
            "generated_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
        ),
    )

    # leaderboard
    op.execute("""
        CREATE MATERIALIZED VIEW leaderboard AS
        SELECT p.id AS player_id, p.username,
               MAX(s.days_survived) AS best_days_survived,
               SUM(s.kills) AS total_kills
        FROM players p
        JOIN sessions s ON s.player_id = p.id
        WHERE p.is_guest = false
        GROUP BY p.id, p.username
        ORDER BY best_days_survived DESC, total_kills DESC
    """)

    op.execute(
        "CREATE UNIQUE INDEX ix_leaderboard_player_id "
        "ON leaderboard (player_id)"
    )


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS leaderboard")
    op.drop_table("map_state")
    op.drop_table("campsites")
    op.drop_table("item_definitions")
    op.drop_index("ix_sessions_days_survived", table_name="sessions")
    op.drop_index("ix_sessions_player_active", table_name="sessions")
    op.drop_table("sessions")
    op.drop_table("players")
