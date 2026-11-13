import sys
import json
from pathlib import Path

sys.path.insert(0, r"C:\Users\ranja\AppData\Local\Programs\RAVIX")
import voice_timing

audio_path = r"R:\Google-AI Studio\test-audio\08-rama-ravana-cinematic.wav"
script_text = """राम! आज स्वयं मृत्यु भी तुम्हें मुझसे नहीं बचा सकती!
रावण! आज तुम्हारा अहंकार ही तुम्हारी मृत्यु बनेगा!
मैं लंकापति दशानन हूँ! मुझे कोई नहीं हरा सकता!
अधर्म कितना भी शक्तिशाली हो, उसका अंत निश्चित है!
नहींऽऽऽ!
यह विजय राम की नहीं, धर्म की है!"""

task_id = "align-08-rama-ravana-final"
try:
    res = voice_timing.analyze({
        "audio": audio_path,
        "transcript": script_text,
        "language": "hi"
    }, task_id)
    print("Alignment completed successfully!")
    print(f"Total Words Aligned: {len(res.get('words', []))}")
    output_json = Path(r"R:\Google-AI Studio\test-audio\08-rama-ravana-alignment.json")
    output_json.write_text(json.dumps(res, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Saved alignment JSON to: {output_json}")
    words = res.get("words", [])
    for w in words:
        print(f"  [{w.get('start', 0.0):05.2f}s - {w.get('end', 0.0):05.2f}s] {w.get('word', '')}")
except Exception as e:
    print(f"Alignment error: {e}")
