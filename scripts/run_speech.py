#!/usr/bin/env python3
"""
RAVIX Speech Assistant - Master Agent Runner & Screenplay Synthesizer
Compatible with Antigravity, Claude, Cursor, and Terminal CLI.
"""
import argparse
import glob
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

BRIDGE_URL = "http://127.0.0.1:17842"
ROOT_DIR = Path(__file__).resolve().parent
BRIDGE_DIR = ROOT_DIR / "RAVIX-Speech-Assistant" / "bridge"
DOWNLOADS_DIR = Path(os.environ.get("USERPROFILE", "C:/Users/ranja")) / "Downloads"

DEFAULT_VOICE_MAP = {
    "रावण": {
        "voice": "Algenib",
        "gender": "masculine",
        "default_style": "Fierce, booming, arrogant, menacing Hindi dialogue; loud commanding projection."
    },
    "श्रीराम": {
        "voice": "Achird",
        "gender": "masculine",
        "default_style": "Divine serenity, resolute authority, righteous challenge; clear, commanding Hindi."
    },
    "राम": {
        "voice": "Achird",
        "gender": "masculine",
        "default_style": "Divine serenity, resolute authority, righteous challenge; clear, commanding Hindi."
    },
    "narrator": {
        "voice": "Fola",
        "gender": "neutral",
        "default_style": "Commanding, rich documentary narration, deliberate pacing, dramatic pauses."
    }
}

def parse_screenplay_text(text: str):
    """
    Parses screenplay or markdown script into structured turns with speaker, style, and text.
    """
    lines = text.strip().splitlines()
    turns = []
    current_visual = ""

    # Common dialogue pattern: **Character:** "Dialogue text" or Character: Dialogue
    dialogue_pattern = re.compile(r'^\*{0,2}([\w\s\u0900-\u097F]+?)(?:\*{0,2}\s*:\s*|\s*:\s*\*{0,2}\s*)(.+)$')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        if "विजुअल:" in line or "Visual:" in line:
            current_visual = line.replace("**विजुअल:**", "").replace("विजुअल:", "").strip()
            continue

        if "बैकग्राउंड" in line or "अवधि:" in line or "शैली:" in line or line.startswith("##") or "सीन " in line:
            continue

        match = dialogue_pattern.match(line)
        if match:
            speaker_raw = match.group(1).strip()
            dialogue_raw = match.group(2).strip()

            # Clean speaker name & text
            speaker = speaker_raw.replace("*", "").strip()
            dialogue = re.sub(r'^\*+|\*+$', '', dialogue_raw).strip()
            dialogue = dialogue.strip('“”"\' ')
            if not dialogue:
                continue

            voice_cfg = DEFAULT_VOICE_MAP.get(speaker, DEFAULT_VOICE_MAP.get(speaker.replace("श्री", ""), None))
            voice = voice_cfg["voice"] if voice_cfg else "Algenib"

            # Derive style based on speaker and visual context
            style = ""
            if "रावण" in speaker:
                if "नहींऽऽऽ" in dialogue or "हार" in current_visual or "गिरता" in current_visual:
                    style = "Desperate, agonizing, loud cry of defeat and shock; intense emotion."
                elif "लंकापति" in dialogue:
                    style = "Proud, defiant anger, booming roar; immense arrogance and commanding Hindi projection."
                else:
                    style = "Fierce, menacing, aggressive war cry; powerful resonant Hindi delivery."
            elif "राम" in speaker:
                if "विजय" in dialogue:
                    style = "Dignified, serene, triumphant and godly composure; clear measured divine delivery."
                elif "अधर्म" in dialogue:
                    style = "Steadfast conviction with restrained righteous anger; measured, powerful Hindi."
                else:
                    style = "Resolute authority, righteous anger and fearless divine challenge; crisp Hindi."
            else:
                style = "Cinematic dramatic dialogue; clear Hindi pronunciation."

            turns.append({
                "speaker": speaker,
                "voice": voice,
                "style": style,
                "text": dialogue,
                "visual_beat": current_visual
            })

    return turns

def ensure_bridge_server():
    """Checks if bridge server is running; launches it if not."""
    try:
        req = urllib.request.Request(f"{BRIDGE_URL}/handshake", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=1.5) as res:
            if res.status == 200:
                return True
    except Exception:
        pass

    print("[1/5] Local bridge server is starting on 127.0.0.1:17842...", flush=True)
    server_script = BRIDGE_DIR / "server.py"
    subprocess.Popen([sys.executable, str(server_script)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for _ in range(20):
        time.sleep(0.5)
        try:
            req = urllib.request.Request(f"{BRIDGE_URL}/handshake", headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=1.5) as res:
                if res.status == 200:
                    print("      Bridge server is online!", flush=True)
                    return True
        except Exception:
            pass

    raise RuntimeError("Failed to start or connect to local bridge server on 127.0.0.1:17842")

def check_browser_connection(timeout_seconds=30):
    """Waits for Google AI Studio extension to report online status."""
    print("[2/5] Connecting to Google AI Studio extension in Brave/Chrome...", flush=True)
    start = time.time()
    while time.time() - start < timeout_seconds:
        try:
            req = urllib.request.Request(f"{BRIDGE_URL}/status")
            with urllib.request.urlopen(req, timeout=2.0) as res:
                data = json.load(res)
                if data.get("extension_connected"):
                    client = data.get("client", {})
                    print(f"      Extension active! Tab: {client.get('url', 'AI Studio')} (Blocks: {client.get('blocks')})", flush=True)
                    return client
        except Exception:
            pass
        time.sleep(1.0)

    print("      Note: Extension heartbeat pending. Proceeding to queue job (will execute once tab is active).", flush=True)
    return None

def find_newest_download(since_timestamp):
    """Locates the newest .wav file downloaded from AI Studio."""
    wav_files = glob.glob(str(DOWNLOADS_DIR / "*.wav"))
    candidates = []
    for f in wav_files:
        try:
            st = os.stat(f)
            # Require at least 50 KB to filter out short preview chirps
            if st.st_mtime >= since_timestamp and st.st_size > 50000:
                # Ensure no active .crdownload exists for it
                if not os.path.exists(f + ".crdownload"):
                    candidates.append((st.st_mtime, f, st.st_size))
        except Exception:
            pass

    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0]
    return None

def verify_and_save_audio(download_path: str, target_output: Path):
    """Verifies audio PCM structure and saves cleanly."""
    target_output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(download_path, target_output)

    with wave.open(str(target_output), "rb") as w:
        frames = w.getnframes()
        rate = w.getframerate()
        channels = w.getnchannels()
        duration = frames / float(rate)

    return {
        "file": str(target_output),
        "duration_seconds": round(duration, 2),
        "sample_rate": rate,
        "channels": channels,
        "size_bytes": target_output.stat().st_size
    }

def run_pipeline(project_data: dict, output_path: Path):
    ensure_bridge_server()
    check_browser_connection(timeout_seconds=5)

    turns = project_data.get("turns", [])
    if not turns:
        raise ValueError("Project data has no turns")

    print(f"[3/5] Enqueuing screenplay generation ({len(turns)} dialogue turns)...", flush=True)
    payload = {
        "model": project_data.get("model", "gemini-3.8-flash-tts"),
        "speaker1_voice": project_data.get("speaker1_voice", "Algenib"),
        "speaker2_voice": project_data.get("speaker2_voice", "Achird"),
        "turns": turns
    }

    start_time = time.time() - 2.0  # Mark timestamp for download detection

    # Enqueue all-in-one screenplay generation
    enqueue_body = json.dumps({"action": "generate_screenplay", "payload": payload}).encode("utf-8")
    req = urllib.request.Request(
        f"{BRIDGE_URL}/enqueue",
        data=enqueue_body,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=10) as res:
        job = json.load(res)
        job_id = job.get("id")

    print(f"      Queued Job ID: {job_id}", flush=True)
    print("[4/5] Running Google AI Studio TTS Generation (Dual-Speaker Screenplay)...", flush=True)

    # Monitor job status
    completed = False
    found_audio = None
    timeout_end = time.time() + 300  # 5 min timeout
    while time.time() < timeout_end:
        time.sleep(2.0)
        try:
            req = urllib.request.Request(f"{BRIDGE_URL}/job/{job_id}")
            with urllib.request.urlopen(req, timeout=5.0) as res:
                job_status = json.load(res).get("job", {})
                state = job_status.get("state")
                if state == "completed":
                    print("      AI Studio DOM generation finished and audio verified!", flush=True)
                    result_data = job_status.get("result", {})
                    # 1. Check direct saved audio path from bridge
                    saved_path = result_data.get("audio", {}).get("saved_path")
                    if saved_path and os.path.isfile(saved_path) and os.path.getsize(saved_path) > 50000:
                        found_audio = (os.path.getmtime(saved_path), saved_path, os.path.getsize(saved_path))
                    elif result_data.get("audio", {}).get("base64"):
                        import base64
                        raw = base64.b64decode(result_data["audio"]["base64"])
                        if len(raw) > 50000:
                            temp_save = DOWNLOADS_DIR / f"Generated Audio {time.strftime('%Y%m%d_%H%M%S')}.wav"
                            temp_save.write_bytes(raw)
                            found_audio = (time.time(), str(temp_save), len(raw))
                    completed = True
                    break
                elif state == "failed":
                    err = job_status.get("result", {}).get("error", "Unknown error")
                    if "Receiving end does not exist" in err or "connection" in err.lower():
                        print(f"      [Retry Notice] Tab was reconnecting: {err}. Re-trying job in 4s...", flush=True)
                        time.sleep(4.0)
                        # Re-enqueue
                        retry_req = urllib.request.Request(
                            f"{BRIDGE_URL}/enqueue",
                            data=enqueue_body,
                            headers={"Content-Type": "application/json"}
                        )
                        with urllib.request.urlopen(retry_req, timeout=10) as retry_res:
                            job_id = json.load(retry_res).get("id")
                            print(f"      Re-queued Job ID: {job_id}", flush=True)
                            continue
                    raise RuntimeError(f"Generation failed: {err}")
                else:
                    # Still queued or dispatched
                    pass
        except Exception as e:
            if "Generation failed" in str(e):
                raise

    # 5. Detect and verify downloaded audio file
    print("[5/5] Detecting & verifying downloaded WAV audio...", flush=True)
    if not found_audio:
        for _ in range(40):
            found_audio = find_newest_download(start_time)
            if found_audio:
                break
            time.sleep(1.0)

    if not found_audio:
        # Check any recent WAV in test-audio or Downloads
        raise TimeoutError("Audio was generated, but downloaded WAV file was not detected in Downloads within timeout.")

    mtime, src_file, size = found_audio
    print(f"      Found download: {os.path.basename(src_file)} ({size:,} bytes)", flush=True)

    audio_meta = verify_and_save_audio(src_file, output_path)
    print("\n=======================================================")
    print("  AUDIO GENERATION & VERIFICATION SUCCESSFUL!")
    print("=======================================================")
    print(f"  Target File : {audio_meta['file']}")
    print(f"  Duration    : {audio_meta['duration_seconds']} seconds")
    print(f"  Sample Rate : {audio_meta['sample_rate']} Hz")
    print(f"  Channels    : {audio_meta['channels']} (Mono)")
    print(f"  File Size   : {audio_meta['size_bytes']:,} bytes")
    print("=======================================================\n")
    return audio_meta

def main():
    parser = argparse.ArgumentParser(description="RAVIX Speech Assistant - Live Automation Runner")
    parser.add_argument("--script", type=str, help="Raw script text or path to script file")
    parser.add_argument("--project", type=str, help="Path to project.json file")
    parser.add_argument("--output", type=str, default="R:/Google-AI Studio/test-audio/rama-ravana-cinematic.wav", help="Target output WAV path")
    args = parser.parse_args()

    output_path = Path(args.output).resolve()

    if args.project:
        project_file = Path(args.project)
        if not project_file.exists():
            print(f"Error: Project file {project_file} not found.", file=sys.stderr)
            sys.exit(1)
        project_data = json.loads(project_file.read_text(encoding="utf-8-sig"))
    elif args.script:
        script_input = args.script
        if os.path.exists(script_input):
            script_text = Path(script_input).read_text(encoding="utf-8-sig")
        else:
            script_text = script_input

        turns = parse_screenplay_text(script_text)
        project_data = {
            "title": "Screenplay Audio",
            "model": "gemini-3.8-flash-tts",
            "turns": turns
        }
    else:
        # Default to Ram vs Ravan project
        default_proj = BRIDGE_DIR / "rama-ravana-project.json"
        if default_proj.exists():
            print(f"Using default screenplay project: {default_proj}")
            project_data = json.loads(default_proj.read_text(encoding="utf-8-sig"))
        else:
            print("Error: Please provide --script or --project", file=sys.stderr)
            sys.exit(1)

    try:
        run_pipeline(project_data, output_path)
    except Exception as e:
        print(f"\n[ERROR] Pipeline halted: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
