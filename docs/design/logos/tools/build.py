import json, numpy as np, os, cairosvg
from PIL import Image
paths=[p for p in json.load(open('trace.json')) if not (len(p)<=6 and min(q[0] for o,ps in p for q in ps)<=440.5)]
# geometry (source pixel coords)
TCX,TCY,TS=640.0,340.5,523.0
def d_for(f):
    out=[]
    for segs in paths:
        for op,pts in segs:
            q=' '.join('%.2f,%.2f'%f(*p) for p in pts)
            out.append(op+q)
        out.append('Z')
    return ''.join(out)
# colours sampled from source
OR='#FB5A0E'; CREAM='#FFF9EE'; EMB='#C6500B'
import sys
# isotype viewBox: mark bbox with padding
allp=[p for s in paths for op,pts in s for p in pts]
xs=[p[0] for p in allp]; ys=[p[1] for p in allp]
bx0,bx1,by0,by1=min(xs),max(xs),min(ys),max(ys)
print('bbox',bx0,bx1,by0,by1)
mw,mh=bx1-bx0,by1-by0
pad=0.06*max(mw,mh)
side=max(mw,mh)+2*pad
iso_f=lambda x,y:(x-(bx0+bx1)/2+side/2, y-(by0+by1)/2+side/2)
def iso_svg(fill):
    d=d_for(iso_f)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side:.2f} {side:.2f}" width="{side:.0f}" height="{side:.0f}"><path fill="{fill}" fill-rule="evenodd" d="{d}"/></svg>\n'
def tile_svg(tilefill,markfill,transparent_bg=True,bg=None,radius=0.2237):
    sc=1024/TS
    f=lambda x,y:((x-TCX)*sc+512,(y-TCY)*sc+512)
    d=d_for(f)
    r=1024*radius
    bgrect=f'<rect width="1024" height="1024" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{bgrect}<rect width="1024" height="1024" rx="{r:.2f}" ry="{r:.2f}" fill="{tilefill}"/><path fill="{markfill}" fill-rule="evenodd" d="{d}"/></svg>\n'
def write(name,svg,pngs=()):
    open(name+'.svg','w').write(svg)
    for s in pngs:
        cairosvg.svg2png(bytestring=svg.encode(),write_to=f'{name}-{s}.png',output_width=s,output_height=s)
os.makedirs('svg',exist_ok=True); os.makedirs('png',exist_ok=True)
P=(1024,2048)
write('svg/icon-with-background',tile_svg(CREAM,OR,bg='#FAFAFA'),P)
write('svg/icon-transparent',tile_svg(CREAM,OR),P)
write('svg/isotype',iso_svg(OR),(2048,))
write('svg/isotype-black',iso_svg('#000000'),(2048,))
write('svg/isotype-white',iso_svg('#FFFFFF'),(2048,))
write('svg/icon-orange-tile',tile_svg(EMB,'#FFFFFF'),P)
write('svg/icon-orange-tile-brandorange',tile_svg(OR,'#FFFFFF'),P)
write('svg/icon-fullbleed-cream',tile_svg(CREAM,OR,radius=0),(1024,))
write('svg/icon-orange-tile-fullbleed',tile_svg(EMB,'#FFFFFF',radius=0),(1024,))
