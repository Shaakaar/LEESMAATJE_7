from __future__ import annotations

"""Simple pool that reuses realtime analysis engines between recordings."""

from dataclasses import dataclass, field
from typing import Dict, Tuple

from . import realtime


@dataclass
class EnginePool:
    """Keep already initialised :class:`RealtimeSession` objects warm."""

    _pool: Dict[Tuple[int, int], realtime.RealtimeSession] = field(default_factory=dict)

    def get(
        self,
        teacher_id: int,
        student_id: int,
        sentence: str,
        sample_rate: int,
        filler_audio: str | None,
    ) -> realtime.RealtimeSession:
        """Return an initialised session for the given user pair.

        The first request creates a new session.  Subsequent calls reset the
        existing session so that the heavy recogniser objects stay in memory.
        """

        key = (teacher_id, student_id)
        sess = self._pool.get(key)
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
            sess.reset(
                sentence,
                sample_rate=sample_rate,
                filler_audio=filler_audio,
                teacher_id=teacher_id,
                student_id=student_id,
            )
        return sess

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
