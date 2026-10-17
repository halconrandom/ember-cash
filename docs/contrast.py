def lum(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c:c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=lum(a),lum(b); 
    if la<lb: la,lb=lb,la
    return (la+0.05)/(lb+0.05)
def mix(fg,bg,a):
    f=[int(fg.lstrip('#')[i:i+2],16) for i in (0,2,4)]; b=[int(bg.lstrip('#')[i:i+2],16) for i in (0,2,4)]
    return '#%02X%02X%02X'%tuple(round(f[i]*a+b[i]*(1-a)) for i in range(3))
if __name__=='__main__':
    P=[('white/emberfill','#FFFFFF','#C6500B'),('white/grad1','#FFFFFF','#C84F00'),('white/grad2','#FFFFFF','#B24509'),('embertext/white','#BD490A','#FFFFFF'),('embertext/ember50','#BD490A','#FFF3EB'),
    ('text2/white','#56565C','#FFFFFF'),('text3/white','#6D6D71','#FFFFFF'),('text3/canvas','#6D6D71','#F5F5F7'),('text3/surface2','#6D6D71','#F5F5F7'),
    ('green/green_bg','#177B52','#E6F6EE'),('green/white','#177B52','#FFFFFF'),('red/red_bg','#C03C41','#FDECEC'),('blue/blue_bg','#3069C7','#E8F0FE'),('violet/violet_bg','#784FD4','#F0EAFE'),('amber/amber_bg','#936316','#FEF3DC'),('pink/pink_bg','#C24A75','#FDEAF1'),
    ('teal','#0B7468','#E3F5F2'),('olive','#566F14','#EEF3DD'),('slate','#475569','#EEF1F6'),('white/sofia','#FFFFFF','#5F6B85'),
    ('ember/white','#F26B1D','#FFFFFF'),('greeng/white','#1EA26C','#FFFFFF'),('tealg/white','#0F9E8E','#FFFFFF'),('olive_g','#6F8F1E','#FFFFFF'),('slate_g','#64748B','#FFFFFF'),('amber_g','#C2821C','#FFFFFF'),('pink_g','#EC5A8F','#FFFFFF'),('neutral_g','#6D6D71','#FFFFFF'),('red_g','#E5484D','#FFFFFF'),('blue_g','#3B82F6','#FFFFFF'),
    ('heroLabel',mix('#FFFFFF','#C84F00',0.9),'#C84F00'),('heroLabel2',mix('#FFFFFF','#B24509',0.9),'#B24509'),
    ('D text2/surface','#A1A1A8','#171719'),('D text3/surface','#8A8A90','#171719'),('D text3/surface2','#8A8A90','#212125'),('D embertext/ember50','#FF9552','#2B1A10'),('D green/bg','#3DD68C','#12271E'),('D red/bg','#FF6369','#2D1618'),('D blue','#5B9BFF','#15223C'),('D violet','#A78BFA','#231C3D'),('D amber','#FFB224','#2E230E'),('D pink','#FF7AA8','#2E1620'),
    ('D teal','#2DD4BF','#0F2B28'),('D olive','#A3C94A','#1F2610'),('D slate','#A8B3C7','#23262D'),('D sofia','#101114','#A7B1CC'),('D isaac','#1D1D1F','#E8E8ED'),('D income/surface','#A6EBCB','#171719'),('D expense','#FF7A2E','#171719'),('D track/surface','#3B3B40','#171719'),('D white/emberfill','#FFFFFF','#C6500B'),('D emberfill/surface','#C6500B','#171719')]
    for n,a,b in P: print(f"{n:22s} {cr(a,b):.2f}")
