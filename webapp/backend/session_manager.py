from __future__ import annotations

"""Simple pool that reuses realtime analysis engines between recordings."""

from dataclasses import dataclass, field
from typing import Dict

from . import realtime


@dataclass
class EnginePool:
    """Keep already initialised :class:`RealtimeSession` objects warm."""

    _pool: Dict[tuple[int, int], realtime.RealtimeSession] = field(default_factory=dict)

    def get(
        self,
        teacher_id: int,
        student_id: int,
        sentence: str,
        sample_rate: int,
        filler_audio: str | None,
    ) -> tuple[realtime.RealtimeSession, str | None]:
        """Return an initialised session for the given user pair.

        The first request creates a new session.  Subsequent calls reset the
        existing session so that the heavy recogniser objects stay in memory.
        Returns the session and, if an existing session was reused, the previous
        ``session_id`` so callers can drop obsolete references.
        """

        key = (teacher_id, student_id)
        sess = self._pool.get(key)
        old_id: str | None = None
        if sess is None:
            sess = realtime.RealtimeSession(
                sentence,
                sample_rate,
                filler_audio=filler_audio,
                teacher_id=teacher_id,
                student_id=student_id,
            )
            self._pool[key] = sess
        else:
            # Preserve the previous identifier so the caller can discard it from
            # any lookup structures.  ``RealtimeSession.reset`` only clears
            # per-recording buffers and reuses the already loaded recogniser
            # models, keeping them warm for the next request.
            old_id = sess.id
            sess.reset(
                sentence,
                sample_rate=sample_rate,
                filler_audio=filler_audio,
                teacher_id=teacher_id,
                student_id=student_id,
            )
        return sess, old_id

    def cleanup(self, max_idle: float = 600.0) -> None:
        """Remove sessions that have been idle for ``max_idle`` seconds."""
        to_remove = [
            key
            for key, sess in self._pool.items()
            if sess.idle_seconds > max_idle
        ]
        for key in to_remove:
            sess = self._pool.pop(key)
            try:
                sess.shutdown()
            except Exception:
                pass
