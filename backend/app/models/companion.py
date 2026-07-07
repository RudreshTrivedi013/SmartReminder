"""
AI Productivity Companion models.

Tables
------
- productivity_logs  : Immutable log of productivity sessions / focus blocks.
- current_task       : One-row-per-user view of what the user is working on right now.
- chat_messages      : Chronological AI companion conversation history per user.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Integer, Enum, Index, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class ProductivityStatus(str, enum.Enum):
    focused = "focused"
    distracted = "distracted"
    break_ = "break"
    idle = "idle"


# ---------------------------------------------------------------------------
# ProductivityLog
# ---------------------------------------------------------------------------


class ProductivityLog(Base):
    """
    Immutable append-only record of a productivity session.

    Each row captures a discrete focus block or state-change event for a user.
    Foreign-keyed to ``tasks`` so you can correlate focus sessions with the
    task the user was working on (nullable — a session may not target a task).
    """

    __tablename__ = "productivity_logs"
    __table_args__ = (
        # Hot query: fetch all logs for a user ordered by time
        Index("ix_productivity_logs_user_id", "user_id"),
        # Range queries on start_at (e.g. "last 7 days")
        Index("ix_productivity_logs_start_at", "start_at"),
        # Composite: user's logs within a time window (most common dashboard query)
        Index("ix_productivity_logs_user_start", "user_id", "start_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Optional link to the task that was being worked on during this session
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status: Mapped[ProductivityStatus] = mapped_column(
        Enum(ProductivityStatus, name="productivity_status"),
        nullable=False,
        default=ProductivityStatus.idle,
    )

    # Wall-clock start / end of the session (UTC, timezone-aware)
    start_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )
    end_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Duration in seconds — denormalised for fast aggregation queries
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Freeform note / AI observation attached to this session
    note: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "User", foreign_keys=[user_id]
    )
    task: Mapped["Task | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Task", foreign_keys=[task_id]
    )


# ---------------------------------------------------------------------------
# CurrentTask
# ---------------------------------------------------------------------------


class CurrentTask(Base):
    """
    One row per user — tracks what the user has declared as their active task
    right now.  Acts like a lightweight "focus mode" pointer.

    Uses ``user_id`` as primary key so upserts are trivial (no duplicate rows).
    """

    __tablename__ = "current_task"

    # PK is the user — one row per user, no extra id needed
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # The task the user is currently focused on (nullable — user may clear focus)
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Free-form context the AI companion stores for the current session
    context_note: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Whether the user is actively in focus mode
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "User", foreign_keys=[user_id]
    )
    task: Mapped["Task | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Task", foreign_keys=[task_id]
    )


# ---------------------------------------------------------------------------
# ChatMessage
# ---------------------------------------------------------------------------


class ChatMessage(Base):
    """
    Persistent AI companion conversation history.

    Every turn (user prompt + assistant reply) is stored as two rows with
    complementary ``role`` values so the full thread can be replayed for
    context injection.
    """

    __tablename__ = "chat_messages"
    __table_args__ = (
        # Most common query: all messages for a user in chronological order
        Index("ix_chat_messages_user_id", "user_id"),
        # Composite: user + created_at for efficient paginated history fetch
        Index("ix_chat_messages_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Optional: pin a message to the task it was about
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    role: Mapped[MessageRole] = mapped_column(
        Enum(MessageRole, name="message_role"),
        nullable=False,
    )

    # Full message text — use Text (unbounded) for AI responses
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Token count for context-window budget tracking
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "User", foreign_keys=[user_id]
    )
    task: Mapped["Task | None"] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Task", foreign_keys=[task_id]
    )
