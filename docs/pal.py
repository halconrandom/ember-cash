import colorsys
def rgb(h):h=h.lstrip('#');return [int(h[i:i+2],16)/255 for i in (0,2,4)]
def hx(c):return '#%02X%02X%02X'%tuple(round(max(0,min(1,v))*255) for v in c)
def L(h):
    f=lambda c:c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    r,g,b=[f(v) for v in rgb(h)];return 0.2126*r+0.7152*g+0.0722*b
def cr(a,b):
    x,y=L(a),L(b);x,y=max(x,y),min(x,y);return (x+0.05)/(y+0.05)
def mix(h,t,k):
    a=rgb(h);b=rgb(t);return hx([a[i]+(b[i]-a[i])*k for i in range(3)])
def fit(base,bgs,target,direction):
    t='#000000' if direction=='dark' else '#FFFFFF'
    for i in range(0,101):
        c=mix(base,t,i/100)
        if all(cr(c,b)>=target for b in bgs):return c
    return None
if __name__=='__main__':
    R=[]
    # LIGHT
    ember_action=fit('#F26B1D',['#FFFFFF'],4.6,'dark')   # white text on it
    R.append(('ember-action (fill, white text)',ember_action,'#FFFFFF'))
    R.append(('ember-action-hi (gradient end deeper)',fit('#D9540B',['#FFFFFF'],5.2,'dark'),'#FFFFFF'))
    R.append(('ember-grad-start',fit('#FF8A3D',['#FFFFFF'],4.5,'dark'),'#FFFFFF'))
    R.append(('ember-text (small text/link on white & ember50)',fit('#D9540B',['#FFFFFF','#FFF3EB'],4.6,'dark'),'#FFFFFF/#FFF3EB'))
    for n,b,bg in [('text3',"#A1A1A6",['#FFFFFF','#F5F5F7']),]:
        R.append((n+' (light)',fit(b,bg,4.6,'dark'),'#FFFFFF/#F5F5F7'))
    for n,b,bgc in [('positive-text','#1FA971','#E6F6EE'),('negative-text','#E5484D','#FDECEC'),('info-text','#3B82F6','#E8F0FE'),('violet-text','#8B5CF6','#F0EAFE'),('amber-text','#F5A524','#FEF3DC'),('pink-text','#EC5A8F','#FFFFFF')]:
        R.append((n+' (chip text)',fit(b,[bgc,'#FFFFFF'],4.6,'dark'),bgc))
    for n,b in [('positive-graphic','#1FA971'),('negative-graphic','#E5484D'),('amber-graphic','#F5A524'),('violet-graphic','#8B5CF6'),('blue-graphic','#3B82F6'),('pink-graphic','#EC5A8F'),('teal-graphic','#14B8A6'),('slate-graphic','#64748B')]:
        R.append((n+' (bars/rings/dots vs white)',fit(b,['#FFFFFF'],3.2,'dark'),'#FFFFFF'))
    for n,v,bg in R:
        print(f"{n:55s} {v}  vs {bg}  ratio_white={cr(v,'#FFFFFF'):.2f} ratio_ember50={cr(v,'#FFF3EB'):.2f}")
    print('--- DARK (on surface #171719, canvas #0B0B0D)')
    D=[]
    D.append(('text3-dark',fit('#6E6E76',['#171719','#0B0B0D','#212125'],4.6,'light')))
    D.append(('ember-text-dark',fit('#FF9552',['#171719','#2B1A10'],4.6,'light')))
    for n,b in [('positive','#3D D68C'.replace(' ','')),('negative','#FF6369'),('info','#5B9BFF'),('violet','#A78BFA'),('amber','#FFB224'),('pink','#FF7AA8'),('ember','#FF7A2E')]:
        D.append((n+'-dark',fit(b,['#171719'],4.6,'light')))
    D.append(('income-bar-dark (graphic)',fit('#3DD68C',['#171719'],3.2,'light')))
    D.append(('expense-bar-dark (graphic)',fit('#FF7A2E',['#171719'],3.2,'light')))
    D.append(('track-dark (graphic-ish)',fit('#2C2C32',['#171719'],1.6,'light')))
    for n,v in D: print(f"{n:35s} {v}  vs surface={cr(v,'#171719'):.2f} canvas={cr(v,'#0B0B0D'):.2f} surface2={cr(v,'#212125'):.2f}")
    print('white on dark hero candidates:')
    for c in ['#D9540B','#C2410C','#B8420A']: print(c, round(cr('#FFFFFF',c),2))
    print('dark text on ember500', round(cr('#1D1D1F','#F26B1D'),2))
