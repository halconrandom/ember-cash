import numpy as np, json
from PIL import Image
import potrace
from scipy import ndimage as ndi
K=4
im=np.array(Image.open('source.jpg').convert('RGB')).astype(float)
B=im[...,2]
t=np.clip((235-B)/(235-14),0,1)
# crop around mark with margin
x0,y0,x1,y1=440,115,860,560
c=t[y0:y1,x0:x1]
big=ndi.zoom(c,K,order=3)
big=ndi.gaussian_filter(big,K*0.35)
mask=big>0.5
bm=potrace.Bitmap(mask)
pl=bm.trace(turdsize=40,turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,alphamax=1.0,opticurve=True,opttolerance=0.4)
def pt(p): return ((p.x/K)+x0,(p.y/K)+y0)
paths=[]
for curve in pl:
    segs=[]; s=pt(curve.start_point)
    segs.append(('M',[s]))
    for seg in curve.segments:
        if seg.is_corner: segs.append(('L',[pt(seg.c),pt(seg.end_point)]))
        else: segs.append(('C',[pt(seg.c1),pt(seg.c2),pt(seg.end_point)]))
    paths.append(segs)
json.dump(paths,open('trace.json','w'))
print(len(paths),[len(p) for p in paths])
Image.fromarray((mask*255).astype('uint8')).save('mask_big.png')
