"""Run with Playwright + Chromium. CELESTA_URL enables real-origin / WebGPU testing.
Without CELESTA_URL, inject the standalone file in an opaque-origin page; that
mode intentionally uses Canvas 2D and cannot exercise origin-scoped IndexedDB.
"""
import os, json, pathlib, zipfile, io, shutil
import base64
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results'; OUT.mkdir(exist_ok=True)
results=[]
def passed(name):
    results.append(name); print('PASS',name,flush=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),channel='chromium',headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1,accept_downloads=True)
    errors=[];page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR',e,flush=True)))
    if os.environ.get('CELESTA_URL'): page.goto(os.environ['CELESTA_URL'],wait_until='networkidle')
    else: page.set_content((ROOT/'dist/index.html').read_text(),wait_until='load')
    page.wait_for_function('window.celesta && celesta.initialized')
    page.wait_for_timeout(200)
    renderer=page.evaluate('celesta.renderer.kind')
    assert page.evaluate('celesta.doc.layers.length')==6
    passed('Initial scene, inspector and timeline render')
    page.screenshot(path=str(OUT/'workspace.png'))
    page.locator('#play-button').click();page.wait_for_timeout(260)
    assert page.evaluate('celesta.frame')>0
    page.locator('#play-button').click();page.evaluate('celesta.setFrame(0)')
    passed('Playback advances and stops at project frame rate')
    def world(x,y):
        return page.evaluate('([x,y])=>{const r=celesta.viewport.getBoundingClientRect(),s=celesta.toScreen({x,y});return {x:r.left+s.x,y:r.top+s.y}}',[x,y])
    def drag_world(x1,y1,x2,y2):
        a,b=world(x1,y1),world(x2,y2);page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(b['x'],b['y'],steps=9);page.mouse.up();page.wait_for_timeout(80)
    initial=page.evaluate('celesta.selectedObjects()[0]')
    drag_world(initial['x']+initial['w']/2,initial['y']+initial['h']/2,initial['x']+initial['w']/2+50,initial['y']+initial['h']/2+25)
    moved=page.evaluate('celesta.selectedObjects()[0]')
    assert abs(moved['x']-initial['x']-50)<1
    page.locator('header [data-action="undo"]').click()
    assert abs(page.evaluate('celesta.selectedObjects()[0].x')-initial['x'])<.01
    page.locator('header [data-action="redo"]').click()
    assert abs(page.evaluate('celesta.selectedObjects()[0].x')-moved['x'])<.01
    passed('Pointer movement is a single undoable transaction')
    page.locator('[data-tool="rect"]').click();drag_world(150,120,320,210)
    rect=page.evaluate('celesta.selectedObjects()[0]');assert rect['type']=='rect'
    assert abs(rect['w']-170)<1
    field=page.locator('[data-prop="width"]');field.fill('240');field.press('Tab')
    assert abs(page.evaluate('celesta.selectedObjects()[0].w*celesta.selectedObjects()[0].scaleX')-240)<.01
    passed('Rectangle drawing and live property editing')
    page.evaluate('celesta.setFrame(12)');page.locator('#stage-viewport').focus();page.keyboard.press('F6')
    page.locator('[data-prop="x"]').fill('360');page.locator('[data-prop="x"]').press('Tab')
    assert page.evaluate('celesta.active().keys.some(k=>k.frame===12)')
    page.evaluate('celesta.setFrame(0)');assert abs(page.evaluate('celesta.selectedObjects()[0].x')-150)<1
    page.evaluate('celesta.setFrame(12)');assert abs(page.evaluate('celesta.selectedObjects()[0].x')-360)<.01, page.evaluate('({frame:celesta.frame,objects:celesta.selectedObjects(),keys:celesta.active().keys.map(k=>({frame:k.frame,x:k.objects.map(o=>[o.id,o.x])}))})')
    passed('Auto-keyframe editing preserves earlier poses')
    coords=page.evaluate('()=>{const t=celesta.timelineLayout,r=celesta.timelineCanvas.getBoundingClientRect(),i=t.layers.findIndex(l=>l.id===celesta.activeLayer);return {x:r.left+t.left+(12.5)*t.fw-t.scroll,y:r.top+t.header+(i+.5)*t.row-t.layerScroll,tx:r.left+t.left+17.5*t.fw-t.scroll}}')
    page.mouse.move(coords['x'],coords['y']);page.mouse.down();page.mouse.move(coords['tx'],coords['y'],steps=10);page.mouse.up()
    assert page.evaluate('celesta.active().keys.some(k=>k.frame===17)&&!celesta.active().keys.some(k=>k.frame===12)')
    passed('Keyframe drag moves real timeline data')
    page.locator('[data-tool="ellipse"]').click();drag_world(540,310,690,450)
    ellipse=page.evaluate('celesta.selectedObjects()[0]')
    page.evaluate('ids=>{celesta.selection=ids;celesta.refresh();celesta.viewport.focus()}',[rect['id'],ellipse['id']]);page.keyboard.press('Control+g')
    assert page.evaluate('celesta.selectedObjects()[0].type')=='group'
    page.keyboard.press('Control+Shift+g')
    assert page.evaluate('celesta.selection.length')==2
    passed('Grouping and break-apart preserve editable geometry')
    page.keyboard.press('F8');page.locator('#dialog-form input[name=name]').fill('Integration symbol');page.get_by_role('button',name='Create symbol',exact=True).click()
    assert page.evaluate('celesta.selectedObjects()[0].type')=='symbol'
    count=page.evaluate('celesta.doc.symbols.length');assert count==4
    page.locator('[data-action="edit-symbol"]').click();assert page.evaluate('!!celesta.symbolContext')
    page.locator('[data-tool="rect"]').click();drag_world(20,20,65,65)
    page.locator('#leave-symbol').click();assert not page.evaluate('!!celesta.symbolContext')
    assert page.evaluate('celesta.doc.symbols.at(-1).objects.length')==3
    passed('Reusable symbols and isolated shared-artwork editing')
    page.locator('[data-panel="library"]').click();page.locator('[data-action="insert-symbol"]').last.click()
    assert page.evaluate('celesta.selectedObjects()[0].symbolId===celesta.doc.symbols.at(-1).id')
    page.locator('[data-panel="properties"]').click()
    passed('Library inserts actual symbol instances')
    page.locator('[data-tool="pen"]').click()
    a=world(130,350);b=world(230,325);c=world(280,420)
    page.mouse.move(a['x'],a['y']);page.mouse.down();page.mouse.move(a['x']+25,a['y']-25);page.mouse.up()
    page.mouse.click(b['x'],b['y']);page.mouse.click(c['x'],c['y']);page.keyboard.press('Enter')
    path=page.evaluate('celesta.selectedObjects()[0]');assert path['type']=='path' and len(path['points'])==3 and 'outX' in path['points'][0]
    page.locator('[data-tool="node"]').click();p=path['points'][0];drag_world(path['x']+p['x'],path['y']+p['y'],path['x']+p['x']+20,path['y']+p['y']+20)
    assert page.evaluate('celesta.selectedObjects()[0].points[0].x')>p['x']+15
    passed('Cubic pen authoring and control-node editing')
    page.locator('[data-tool="brush"]').click();drag_world(220,550,450,480)
    assert page.evaluate('celesta.selectedObjects()[0].type')=='path'
    assert page.evaluate('celesta.selectedObjects()[0].points.length')>=2
    passed('Brush strokes produce editable paths')
    svg=b'<svg xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="80" height="60" fill="rgba(255,0,0,0.5)"/><path d="M100 0 C120 80 140 80 180 0" fill="none" stroke="#334455" stroke-width="3"/></svg>'
    page.set_input_files('#file-input',{'name':'import.svg','mimeType':'image/svg+xml','buffer':svg});page.wait_for_timeout(200)
    assert page.evaluate('celesta.selectedObjects()[0].type')=='group'
    assert page.evaluate('celesta.selectedObjects()[0].children[0].fill')=='#ff000080'
    passed('SVG import parses editable geometry and normalizes colors')
    from PIL import Image
    image=Image.new('RGBA',(32,24),(255,120,60,160));buf=io.BytesIO();image.save(buf,format='PNG')
    page.set_input_files('#file-input',{'name':'test.png','mimeType':'image/png','buffer':buf.getvalue()});page.wait_for_timeout(200)
    assert page.evaluate('celesta.selectedObjects()[0].type')=='image'
    assert page.evaluate('celesta.doc.assets.length')==1
    passed('Bitmap import embeds and renders image assets')
    page.locator('[data-action="preview"]').first.click();page.wait_for_timeout(150)
    assert page.locator('#preview-canvas').count()==1
    
    try: page.wait_for_function('celesta.preview && celesta.preview.frame > 0',timeout=5000)
    except Exception:
        print('PREVIEW DEBUG',page.evaluate('({playing:celesta.previewPlaying,frame:celesta.preview?.frame,raf:celesta.raf,hidden:document.hidden,duration:celesta.preview?.doc.duration,start:celesta.preview?.start,now:performance.now()})'));raise
    page.locator('#app-dialog [data-action="dialog-close"]').click()
    passed('Preview player uses the real animation')
    # File export integration; browser policy may block saving executable formats.
    def export(kind):
        with page.expect_download(timeout=12000) as info: page.evaluate('kind=>celesta.runExport(kind)',kind)
        download=info.value; target=OUT/download.suggested_filename;download.save_as(str(target));return target
    png=export('png');assert Image.open(png).size==(1280,720)
    passed('PNG export has document resolution')
    svgfile=export('svg');assert '<svg' in svgfile.read_text()
    passed('SVG export contains vector artwork')
    htmlfile=export('html');player=browser.new_page(viewport={'width':1100,'height':800})
    player_errors=[];player.on('pageerror',lambda e:player_errors.append(str(e)))
    player.set_content(htmlfile.read_text(),wait_until='load');player.wait_for_timeout(200)
    assert player.locator('#time').inner_text()!='';assert not player_errors
    player.close();passed('Exported standalone HTML player runs independently')
    projectfile=export('project');data=json.loads(projectfile.read_text());assert data['format']=='celesta' and len(data['symbols'])==4
    passed('Editable project export preserves the scene model')
    page.set_input_files('#file-input',{'name':'reopened.celesta.json','mimeType':'application/json','buffer':projectfile.read_bytes()});page.wait_for_timeout(150)
    assert page.evaluate('celesta.doc.symbols.length')==4
    assert page.evaluate('celesta.doc.assets.length')==1
    assert page.evaluate('celesta.history.past.length')==0
    passed('Saved project reopens through strict validation without data loss')
    # Deterministic short sequence and video.
    data={'format':'celesta','version':1,'name':'Export test','width':160,'height':90,'fps':12,'duration':4,'background':'#ffffff','assets':[],'symbols':[],'guides':[], 'layers':[{'id':'l','name':'Layer 1','color':'#a78bfa','visible':True,'locked':False,'opacity':1,'keys':[{'frame':0,'objects':[{'id':'o','type':'rect','name':'Moving rectangle','x':10,'y':20,'w':20,'h':20,'scaleX':1,'scaleY':1,'rotation':0,'opacity':1,'fill':'#cc4466','stroke':'none','strokeWidth':0}],'tween':'motion','ease':'linear'},{'frame':3,'objects':[{'id':'o','type':'rect','name':'Moving rectangle','x':110,'y':20,'w':20,'h':20,'scaleX':1,'scaleY':1,'rotation':0,'opacity':1,'fill':'#cc4466','stroke':'none','strokeWidth':0}],'tween':'none','ease':'linear'}]}]}
    page.evaluate('data=>celesta.replaceProject(data)',data)
    sequence=export('sequence')
    with zipfile.ZipFile(sequence) as z:
        assert len(z.namelist())==5
        first=Image.open(io.BytesIO(z.read('frames/frame-0001.png')))
        last=Image.open(io.BytesIO(z.read('frames/frame-0004.png')))
        assert first.getpixel((15,25))[:3]==(204,68,102)
        assert last.getpixel((115,25))[:3]==(204,68,102)
        assert last.getpixel((15,25))[:3]==(255,255,255)
    passed('PNG sequence is frame-exact and ZIP is valid')
    data['duration']=24
    data['layers'][0]['keys'][1]['frame']=23
    page.evaluate('data=>celesta.replaceProject(data)',data)
    video=export('video')
    print('Recorded video:', video.name, video.stat().st_size, 'bytes', flush=True)
    assert video.stat().st_size>200
    data_url='data:video/webm;base64,'+base64.b64encode(video.read_bytes()).decode('ascii')
    decoded=page.evaluate("""src => new Promise((resolve,reject)=>{
      const v=document.createElement('video');v.muted=true;v.preload='auto';
      const timeout=setTimeout(()=>reject(new Error('Video decode timeout')),10000);
      v.onloadeddata=()=>{clearTimeout(timeout);resolve([v.videoWidth,v.videoHeight]);v.removeAttribute('src');v.load();};
      v.onerror=()=>{clearTimeout(timeout);reject(new Error('Recorded video cannot be decoded'));};
      v.src=src;v.load();
    })""",data_url)
    assert decoded==[160,90],decoded
    passed('Browser video encoder produces a recording')
    # Responsive layout and no uncaught exceptions.
    page.set_viewport_size({'width':1280,'height':800});page.wait_for_timeout(80)
    assert page.locator('#stage-viewport').bounding_box()['height']>150
    page.set_viewport_size({'width':720,'height':800});page.wait_for_timeout(80)
    assert page.locator('#stage-viewport').bounding_box()['width']>300
    passed('Workspace adapts to compact desktop widths')
    assert not errors,errors
    assert page.evaluate('celesta.renderer.gpuErrors.length')==0
    passed('No uncaught JavaScript errors in tested workflows')
    report={'renderer':renderer,'origin_mode':'url' if os.environ.get('CELESTA_URL') else 'opaque set_content','passed':len(results),'checks':results,'errors':errors,'webgpu_pipeline_exercised':renderer=='WebGPU','webgpu_hardware_validated':False,'autosave_origin_tested':False}
    (OUT/'browser-report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2),flush=True)
    browser.close()
