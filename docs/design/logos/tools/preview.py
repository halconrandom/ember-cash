from PIL import Image, ImageDraw, ImageFont
import glob
fnt=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',22) if glob.glob('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf') else ImageFont.load_default()
def checker(sz,s=24):
    im=Image.new('RGB',(sz,sz),'#FFFFFF'); d=ImageDraw.Draw(im)
    for y in range(0,sz,s):
        for x in range(0,sz,s):
            if (x//s+y//s)%2: d.rectangle([x,y,x+s-1,y+s-1],fill='#D9D9D9')
    return im
cells=[('icon-with-background','png/icon-with-background-1024.png',None),
('icon-transparent (checker)','png/icon-transparent-2048.png','check'),
('icon-orange-tile #C6500B','png/icon-orange-tile-2048.png',None),
('icon-orange-tile brand orange','png/icon-orange-tile-brandorange-2048.png',None),
('isotype on white','png/isotype-2048.png','#FFFFFF'),
('isotype on dark','png/isotype-2048.png','#16161A'),
('isotype-black on white','png/isotype-black-2048.png','#FFFFFF'),
('isotype-black on checker','png/isotype-black-2048.png','check'),
('isotype-white on dark','png/isotype-white-2048.png','#16161A'),
('isotype-white on #C6500B','png/isotype-white-2048.png','#C6500B'),
('isotype-white on mid-gray','png/isotype-white-2048.png','#6B6B73'),
('icon-fullbleed (iOS)','png/icon-fullbleed-cream-1024.png',None)]
C=360;P=30;cols=4;rows=3;H=C+60
W=Image.new('RGB',(cols*(C+P)+P,rows*(H+P)+P),'#EDEDED'); d=ImageDraw.Draw(W)
for i,(lab,f,bg) in enumerate(cells):
    x=P+(i%cols)*(C+P); y=P+(i//cols)*(H+P)
    im=Image.open(f).convert('RGBA').resize((C,C),Image.LANCZOS)
    if bg=='check': base=checker(C)
    elif bg: base=Image.new('RGB',(C,C),bg)
    else: base=Image.new('RGB',(C,C),'#EDEDED')
    base.paste(im,(0,0),im); W.paste(base,(x,y)); d.text((x,y+C+12),lab,fill='#222',font=fnt)
W.save('preview.png'); print(W.size)
