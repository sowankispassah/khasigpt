"""Create a contact sheet from the actual encoded MP4 for visual verification."""
from pathlib import Path
import subprocess
import sys
from PIL import Image, ImageDraw

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'out/review-tools'))
import imageio_ffmpeg
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
video=root/'out/KhasiGPT-white-motion.mp4'
times=[1,3,4.4,6,8,10,12,14.8,16.8,18.8,20,22,24.5,27,29.7,32.5,35,37.5,39.5,41.5,42.7,44,45.5,47]
sheet=Image.new('RGB',(216*8,410*3),'#e5e7e9')
draw=ImageDraw.Draw(sheet)
for i,time in enumerate(times):
    result=subprocess.run([str(ffmpeg),'-v','error','-ss',str(time),'-i',str(video),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],capture_output=True,check=True)
    image=Image.frombytes('RGB',(1080,1920),result.stdout).resize((216,384))
    x=(i%8)*216;y=(i//8)*410
    sheet.paste(image,(x,y+26))
    draw.text((x+8,y+6),f'{time:.1f}s',fill='#111111')
sheet.save(root/'out/video-contact-sheet.png')
print(root/'out/video-contact-sheet.png')
