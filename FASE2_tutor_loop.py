"""
FASE2_tutor_loop.py
-------------------
End-to-end tutoring loop:
  TTS prompt → RecorderPipeline → GPT feedback → TTS feedback
"""

import asyncio, os, time, json, textwrap, uuid
import openai, os, soundfile as sf, sounddevice as sd, tempfile
from rich.console import Console
from rich.panel import Panel

from FASE2_recorder_pipeline import RecorderPipeline
from tutor import prompt_builder, gpt_client
from FASE2_TTS import speak, start_filler, STREAMING_TTS
from dotenv import load_dotenv
load_dotenv()

console = Console()


# ────────────────── CONFIG ──────────────────

openai.api_key = os.getenv("OPENAI_API_KEY")

SENTENCES = [
    "De kip zit in het hok.",
    "De vis zwemt in de kom.",
    "De hond blaft naar de kat.",
    "De muis eet kaas.",
    "De kat zit op de mat.",
    "De boot is mooi.",
    "Ik eet een appel."
]

#==============================================================================================================
# Voice choices (per OpenAI docs): alloy, coral, nova, shimmer, ash, echo, river, flow, amber, opal, sapphir
#==============================================================================================================
VOICE_MODEL         = "gpt-4o-mini-tts"
VOICE_NAME          = "nova"            # pick any from the list above
VOICE_INSTRUCTIONS  = (
    "Nederlandse vrouwelijke leerkracht, vriendelijk, bemoedigend, "
    "spreek langzaam en duidelijk voor een kind van vijf jaar. "
    "Maak korte pauzes tussen de woorden en leg nadruk op fout verbeteringen."
)

# Delay before filler TTS after recording stops (seconds)
FILLER_DELAY = 0.5

# Use streaming TTS endpoint? Controlled via ``STREAMING_TTS`` imported from
# ``FASE2_TTS``. Set the environment variable before starting the program.

# Realtime settings per engine. Set any of these to ``False`` to run the
# corresponding analysis step on the saved WAV file instead of in realtime.
REALTIME_FLAGS = {
    "azure_pron": True,
    "azure_plain": True,
    "w2v2_phonemes": False,
    "w2v2_asr": True,
}

# Run offline engines in parallel?
PARALLEL_OFFLINE = True
CHUNK_DURATION = 10

def save_json(payload: dict):
    """Serialize results to file for later analysis."""
    fn = f"results_{payload['session_id']}.json"
    with open(fn, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    console.print(Panel.fit(f"💾  Saved results to [cyan]{fn}[/cyan]",
                            border_style="blue"))
    
# ────────────────── MAIN LOOP ───────────────
def main():
    pipeline = RecorderPipeline(rt_flags=REALTIME_FLAGS,
                                chunk_duration=CHUNK_DURATION)

    for sentence in SENTENCES:
        need_prompt = True
        while True:
            if need_prompt:
                speak(
                    f"Lees de zin: {sentence}",
                    VOICE_MODEL=VOICE_MODEL,
                    VOICE_NAME=VOICE_NAME,
                    VOICE_INSTRUCTIONS=VOICE_INSTRUCTIONS,
                    stream=STREAMING_TTS,
                )

            # 1. record & gather JSON
            filler_fn = lambda text, t: start_filler(
                text, t, delay_seconds=FILLER_DELAY, stream=STREAMING_TTS
            )
            results, filler_thread = pipeline.record_sentence(
                sentence,
                filler_cb=filler_fn,
                parallel_offline=PARALLEL_OFFLINE,
            )

            # 2. build GPT request & call
            _, messages = prompt_builder.build(results, state={})
            tutor_resp = asyncio.run(gpt_client.chat(messages))
            t_gpt_ready = time.perf_counter()
            print(json.dumps(messages, ensure_ascii=False, indent=2))
            if filler_thread is not None:
                filler_thread.join()
            
            # 2a. Handle empty GPT feedback
            if not tutor_resp.feedback_text.strip():
                console.print("[yellow]⚠️ GPT returned empty feedback. Inserting default silence prompt.[/yellow]")
                tutor_resp.feedback_text = "Ik heb je niet gehoord. Lees de zin opnieuw."
                tutor_resp.repeat = True

            # 3. speak GPT feedback
            speak(
                tutor_resp.feedback_text,
                timing_dict=results["timing"],
                VOICE_MODEL=VOICE_MODEL,
                VOICE_NAME=VOICE_NAME,
                VOICE_INSTRUCTIONS=VOICE_INSTRUCTIONS,
                stream=STREAMING_TTS,
            )
            
            t_first_byte = results["timing"].get("tts_first_byte")
            t_play_start = results["timing"].get("tts_play_start")
            stop_press = results["timing"]["stop_press"]
            json_ready = results["timing"]["json_ready"]

            # ── latency banner ─────────────────────────────────────────
            parts = [
                f"Stop→JSON {(json_ready - stop_press):.3f}s",
                f"JSON→GPT {(t_gpt_ready - json_ready):.3f}s",
            ]
            if t_first_byte is not None:
                parts.append(f"GPT→1stByte {(t_first_byte - t_gpt_ready):.3f}s")
            if t_play_start is not None:
                parts.append(f"GPT→Play {(t_play_start - t_gpt_ready):.3f}s")
                parts.append(f"Total {(t_play_start - stop_press):.3f}s")
            eng = results["timing"].get("engines", {})
            for name, ts in eng.items():
                if "start" in ts and "end" in ts:
                    parts.append(f"{name} {(ts['end'] - ts['start']):.3f}s")
            print("TIME: " + " | ".join(parts))

            # Persist results
            print(tutor_resp)
            save_json(results)

            if tutor_resp.repeat:
                need_prompt = False      # GPT already said “Lees de zin opnieuw”
                continue                 # same sentence again
            else:
                break                    # next sentence

    speak("Goed gedaan! Tot de volgende keer.", stream=STREAMING_TTS)

if __name__ == "__main__":
    main()

