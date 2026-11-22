from PIL import Image, ImageFilter
import numpy as np
A="/cursor/stores/user/grok-bot/agents/0f85d2f6-7fcf-4b58-983f-8cb56dc1c5ef/assets/"
m={'zebra-night':('83c4bd59180426415a5cda7a8f4d2de51e4dad1cff71138713289b9dd58be720','61bb548ddb8428b15c462b5a3b0e6bf7ce2eac07e424f908100fe8bcc6144d4b'),
 'consigliere':('31631afe7abd01125edc9de4b4ba3b9dd6ef5fe6c34beb16ec251e3a5a7e988e','b8645969a91853a4513582f0e4417815ab30da5f87016cfef500f27294ff2f09'),
 'leopard-don':('68e5011f181dcdbfc238dcfb40f5ecef7d457c7621cf914903ed6eda190b5b89','bf39afc8ffcd0db1cb2f3e1d940ef4c175b7d4494eb55f785f29a4369d27dc53'),
 'lilac-hour':('d27fc512a25dbc2a657a08c0b8a2a14b5ba2c2e4b4cdca6acee901b1a06ae120','0a3483ad8499f8cadd75eaf77a8c407d6ebf2c59979056abbf9a5b9c628f9192')}
for slug,(h,d) in m.items():
  H=Image.open(A+h+'.jpg').convert('RGB').resize((768,1024),Image.LANCZOS); H.save(f'public/img/{slug}-1.webp',quality=82,method=4)
  Image.open(A+d+'.jpg').convert('RGB').resize((768,1024),Image.LANCZOS).save(f'public/img/{slug}-2.webp',quality=82,method=4)
  w,hh=H.size; H.crop((int(w*.14),int(hh*.12),int(w*.86),int(hh*.84))).resize((768,1024),Image.LANCZOS).save(f'public/img/{slug}-3.webp',quality=82,method=4)
  print(slug,flush=True)
L=np.asarray(Image.open(A+'8d5a2744ddba46007595f3789cde86adf81e71fd5e775b6250dfb118ec70248f.jpg').convert('RGB')).astype(np.float32)/255
r,g,b=L[...,0],L[...,1],L[...,2]
gd=g-np.maximum(r,b)
alpha=1-np.clip((gd-0.12)/0.25,0,1)
g2=np.minimum(g,np.maximum(r,b)+0.02)
im=Image.fromarray((np.dstack([r,g2,b,alpha])*255).astype(np.uint8),'RGBA')
a=im.getchannel('A').filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8)); im.putalpha(a)
bb=im.getchannel('A').point(lambda v:255 if v>20 else 0).getbbox(); print(bb, im.size)
im=im.crop((max(0,bb[0]-10),max(0,bb[1]-10),min(im.size[0],bb[2]+10),im.size[1]))
im.save('public/tailor/lorenzo.webp',quality=88,method=4); print(im.size)
bg=Image.new('RGB',im.size,(60,10,14)); bg.paste(im,(0,0),im); bg.save('work/lorenzo-prev.png')
