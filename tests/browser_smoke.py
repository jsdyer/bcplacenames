"""Deterministic user flows at a project subpath; BC API fixtures avoid live CI dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json, os, shutil, tempfile, threading
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
def feature(i,name='Golden Ears',official=True):
    return {'type':'Feature','properties':{'uri':f'apps.gov.bc.ca/pub/bcgnws/names/{i}','name':name,'status':'adopted' if official else 'rescinded','isOfficial':int(official),'featureType':'Peaks' if official else 'Brook','position':'CENTRE' if official else 'MOUTH','decisionDate':'1957-07-04','feature':{'id':'17137','names':[f'apps.gov.bc.ca/pub/bcgnws/names/{i}']}},'geometry':{'type':'Point','coordinates':[-122.5075,49.36277]}}
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
def main():
    shots=ROOT/'browser-checks';shots.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        shutil.copytree(ROOT/'dist',Path(temp)/'bcplacenames')
        server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=temp));threading.Thread(target=server.serve_forever,daemon=True).start()
        try:
            with sync_playwright() as p:
                browser=p.chromium.launch(executable_path=os.environ.get("BROWSER_EXECUTABLE"));page=browser.new_page(viewport={'width':1440,'height':1100});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                def api(route):
                    u=urlsplit(route.request.url);q=parse_qs(u.query)
                    if u.path.endswith('.json'):
                        i=u.path.split('/')[-1].split('.')[0];d={'feature':feature(i,'Macdonald Brook',False) if i=='52219' else feature(i)}
                    elif q.get('name')==['failure']:
                        route.fulfill(status=503,body='Unavailable');return
                    else:
                        items=[feature('9757'),feature('9758','Golden Ears Park')];total=2
                        if '/near' in u.path:items=[feature('9757'),feature('52219','Macdonald Brook',False)]
                        if q.get('name')==['unsafe']:items=[feature('999','<img src=x onerror=alert(1)>')]
                        if q.get('name')==['empty']:items=[];total=0
                        if q.get('name')==['pages']:
                            total=51;items=[feature('999','Second page')] if q.get('startIndex')==['51'] else [feature(str(i)) for i in range(1,51)]
                        d={'type':'FeatureCollection','crs':{'properties':{'name':'EPSG:4326'}},'properties':{'totalResults':total},'features':items}
                    route.fulfill(status=200,content_type='application/json',body=json.dumps(d))
                page.route('https://apps.gov.bc.ca/pub/bcgnws/**',api)
                # No bulk external tile requests in CI; actual map integration is checked separately.
                page.route('https://tile.openstreetmap.org/**',lambda r:r.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dce4d5"/></svg>'))
                base=f'http://127.0.0.1:{server.server_port}/bcplacenames/'
                page.goto(base);page.locator('[data-example="golden"]').click();page.locator('.result').first.wait_for();assert page.locator('.result').count()==2
                page.locator('.result').first.click();page.get_by_text('Decision dates describe naming decisions',exact=False).wait_for();assert '#name=9757' in page.url
                assert page.get_by_role('link',name='Official record & history').get_attribute('href').endswith('/9757.html')
                with page.expect_download() as info:page.locator('#csv').click()
                assert info.value.suggested_filename=='bc-place-names.csv'
                page.locator('[data-example="langley"]').click();page.locator('#status-filter').select_option('recorded');page.locator('#submit').click();page.locator('.result').filter(has_text='Macdonald Brook').wait_for();assert page.locator('.result').count()==1
                page.locator('.result').first.click();page.get_by_text('Decision dates describe naming decisions',exact=False).wait_for();assert page.locator('#detail').inner_text().find('MOUTH')>=0
                page.locator('#detail').screenshot(path=str(shots/'record.png'))
                page.locator('#name-mode').click();page.locator('#status-filter').select_option('all');page.locator('#query').fill('pages');page.locator('#submit').click();page.get_by_text('1 / 2',exact=True).wait_for();page.locator('#next').click();page.get_by_text('Second page',exact=True).wait_for();assert page.locator('#next').is_disabled()
                page.locator('#query').fill('unsafe');page.locator('#submit').click();page.get_by_text('<img src=x onerror=alert(1)>',exact=True).wait_for();assert page.locator('#results img').count()==0
                page.locator('#query').fill('empty');page.locator('#submit').click();page.get_by_text('No matching records.',exact=False).wait_for();assert page.locator('#csv').is_disabled()
                page.locator('#query').fill('failure');page.locator('#submit').click();page.get_by_text('The BC service returned HTTP 503.',exact=False).wait_for();assert not page.locator('#submit').is_disabled()
                page.goto(base+'#name=52219');page.get_by_text('Macdonald Brook',exact=True).wait_for();page.get_by_text('Decision dates describe naming decisions',exact=False).wait_for()
                page.locator('[data-example="golden"]').click();page.locator('.result').first.wait_for();page.locator('.result').first.click();page.get_by_text('Decision dates describe naming decisions',exact=False).wait_for();page.screenshot(path=str(shots/'desktop.png'),full_page=True)
                page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth');page.screenshot(path=str(shots/'mobile.png'),full_page=True)
                assert not errors,errors;browser.close()
            print('Browser checks passed: search, nearby/status, details, exports, pagination, deep links, empty/error states, safe text and mobile layout')
        finally:server.shutdown()
if __name__=='__main__':main()
