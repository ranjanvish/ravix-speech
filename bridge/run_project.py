"""Run ordered speech turns through the paired local extension bridge."""
import argparse, json, shutil, sys, time, urllib.error, urllib.request, wave
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'speech-bridge-data'
BASE='http://127.0.0.1:17842'

def request(path, token, data=None):
    headers={'Authorization':'Bearer '+token}
    if data is not None: headers['Content-Type']='application/json'
    req=urllib.request.Request(BASE+path,headers=headers,data=json.dumps(data,ensure_ascii=False).encode() if data is not None else None)
    with urllib.request.urlopen(req,timeout=10) as response: return json.load(response)

def execute(action, payload, token, timeout=300):
    job=request('/enqueue',token,{'action':action,'payload':payload})['id']
    print(f'{action}: queued {job}',flush=True)
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        jobs=request('/status',token)['jobs']
        match=next((j for j in jobs if j['id']==job),None)
        if match and match['state'] in ('completed','failed'):
            result=json.loads(match['result'])
            if match['state']!='completed' or not result.get('ok'): raise RuntimeError(f'{action} failed: {result.get("error",result)}')
            return result
        time.sleep(2)
    raise TimeoutError(f'{action} {job} timed out; inspect bridge status before retrying')

def save_audio(result, target):
    source=Path(result['filename'])
    if not source.is_file() or source.stat().st_size != result['bytes']: raise RuntimeError('Downloaded file is missing or size changed')
    with wave.open(str(source),'rb') as audio:
        if audio.getnframes()<=0: raise RuntimeError('Downloaded WAV has no audio frames')
        info={'duration':audio.getnframes()/audio.getframerate(),'sample_rate':audio.getframerate(),'channels':audio.getnchannels()}
    if target.exists(): raise FileExistsError(f'Refusing to overwrite {target}')
    shutil.copy2(source,target)
    if target.stat().st_size != source.stat().st_size: raise RuntimeError('Copied file failed size verification')
    return info

def main():
    ap=argparse.ArgumentParser();ap.add_argument('project',type=Path);ap.add_argument('--output',type=Path,required=True);args=ap.parse_args()
    project=json.loads(args.project.read_text(encoding='utf-8-sig'));turns=project.get('turns')
    if not isinstance(turns,list) or not 1<=len(turns)<=100: raise SystemExit('Project must contain 1–100 turns')
    for i,t in enumerate(turns,1):
        if not all(isinstance(t.get(k),str) and t[k].strip() for k in ('speaker','voice','style','text')): raise SystemExit(f'Turn {i}: speaker, voice, style and text are required')
    token=(DATA/'pairing-token.txt').read_text(encoding='utf-8').strip();out=args.output.resolve();out.mkdir(parents=True,exist_ok=True)
    report={'project':str(args.project.resolve()),'turns':[],'state':'running'};report_file=out/'generation-manifest.json'
    if report_file.exists(): raise SystemExit('Output already has a manifest; choose a new folder')
    def save(): report_file.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    save()
    try:
        scan=execute('scan',{},token)
        if any(x.lower()=='download' for x in scan.get('data',{}).get('controls',[])):
            previous=execute('download',{},token);save_audio(previous,out/'00-previous-output.wav')
        for i,t in enumerate(turns,1):
            execute('prepare_turn',{'model':project.get('model','gemini-3.8-flash-tts'),'voice':t['voice'],'style':t['style'],'text':t['text']},token)
            execute('run_turn',{},token,timeout=420)
            downloaded=execute('download',{},token,timeout=420)
            path=out/f'{i:03d}-turn.wav';info=save_audio(downloaded,path)
            report['turns'].append({'sequence':i,**t,'file':str(path),**info});save()
        report['state']='completed';save()
    except Exception as exc:
        report['state']='failed';report['error']=str(exc);save();raise
if __name__=='__main__':
    try:main()
    except Exception as e:print(f'Stopped: {e}',file=sys.stderr);sys.exit(1)
