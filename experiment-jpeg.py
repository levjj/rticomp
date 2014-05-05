'''
File compress.py
Created on 11 Feb 2014
@author: Christopher Schuster, cschuste@ucsc.edu
'''

# General imports
from __future__ import print_function
import os,sys,subprocess,struct,io

# Possible use of matplotlib from http://http://matplotlib.sourceforge.net/
from pylab import *
import matplotlib.pyplot as plt

# More imports
import Image
import numpy
import ImageOps

'''
Get 2D matrix from an image file, possibly displayed with matplotlib 
@param path: Image file path on HD
@return A 2D matrix
'''
def img_matrix(path):
    img=Image.open(str(path))
    imgData=img.getdata()
    imgTab=numpy.array(imgData)
    w,h=img.size
    imgMat=numpy.reshape(imgTab / 255.0,(h,w,4))
    return imgMat

def render(rti, light):
    script = os.path.dirname(__file__) + "/render.js"
    inp = os.path.dirname(__file__) + "/../data/" + rti
    outp = os.path.dirname(__file__) + "/../out/" + rti + ".png"
    cmd = "node " + script + " -i " + inp + " -o " + outp + \
          " --lx=" + str(light[0]) + " --ly=" + str(light[1])
    # print(cmd)
    subprocess.call(cmd, shell=True)
    return outp

def nextline(f):
    line = f.readline()
    if line == "":
        raise Exception("EOF")
    if line[0] == "#":
        return nextline(f)
    return line.split(" ")

def compress(rtifile,qua):
    # print ("Compressing " + rtifile)
    fi = open("data/" + rtifile, 'r')
    if nextline(fi) != ["3\n"]:
        raise Exception("Wrong file")
    w,h,ch = [int(i) for i in nextline(fi)]
    c_num,c_type,c_size = [int(i) for i in nextline(fi)]
    if c_type != 2:
        raise Exception("Not supported")
    scales = struct.unpack('f'*c_num,fi.read(4*c_num))
    biases = struct.unpack('f'*c_num,fi.read(4*c_num))
    c_data = numpy.zeros((c_num,h,w,ch),dtype=numpy.uint8)
    for y in range(h):
        for x in range(w):
            for i in range(ch):
                for c in range(c_num):
                    c_data[c,y,x,i] = struct.unpack('B',fi.read(1))[0]
    fi.close()

    fo = open("out/vase-comp.jrti", 'w')
    for scale in scales:
      fo.write(struct.pack('f', scale))
    for bias in biases:
      fo.write(struct.pack('f', bias))
    for i in range(c_num):
        img = Image.new("RGB",(w,h))
        cd = [tuple(c_data[i,y,x]) for y in range(h) for x in range(w)]
        img.putdata(cd)
        mem = io.BytesIO()
        img.save(mem, "JPEG", quality=qua)
        jpegdata = mem.getvalue()
        mem.close()
        fo.write(struct.pack('i', len(jpegdata)))
        for b in jpegdata:
            fo.write(b)
    fo.close()
    return "vase-comp.jrti"

def decompress(crtifile):
    # print ("Decompressing " + crtifile)
    fi = open("out/" + crtifile, 'r')
    scales = struct.unpack('f'*9,fi.read(4*9))
    biases = struct.unpack('f'*9,fi.read(4*9))
    c_images = []
    for i in range(9):
        size = struct.unpack('i', fi.read(4))[0]
        mem = io.BytesIO(fi.read(size))
        jpeg = Image.open(mem)
        #c = numpy.reshape(numpy.array(jpeg),(470,320)).astype(numpy.uint8)
        c_images.append(numpy.array(jpeg.convert('RGB')))
        mem.close()
    fi.close()

    fo = open("data/vase-jcomp.rti", 'w')
    fo.write("#HSH1.2\n")
    fo.write("3\n")
    fo.write("320 470 3\n")
    fo.write("9 2 1\n")
    for scale in scales:
      fo.write(struct.pack('f', scale))
    for bias in biases:
      fo.write(struct.pack('f', bias))
    for y in range(470):
        for x in range(320):
            for i in range(3):
                for c in range(9):
                    fo.write(struct.pack('B', c_images[c][y,x,i]))
    fo.close()
    return "vase-jcomp.rti"

def ploti(img, qua):
    imgOutMat = img_matrix(img)
    plt.imshow(imgOutMat, interpolation='nearest', hold=True)
    plt.xticks([])
    plt.yticks([])
    plt.xlim(100, 200)
    plt.ylim(100, 200)
    #plt.show()
    fn = 'out/j_' + str(int(qua)) + '.png'
    plt.savefig(fn, dpi=80,bbox_inches='tight')

def measure(ucrti, lightx, lighty, qua):
    uncomp = render('vase.rti', [lightx, lighty])
    comp = render(ucrti, [lightx, lighty])
    ploti(comp, qua)
    res = {}
    cmd = "dssim/dssim " + uncomp + " " + comp
    res["ssim"] = subprocess.check_output(cmd, shell=True)
    cmd = "compare -metric PSNR " + uncomp + " " + comp + " /dev/null 2>&1"
    res["psnr"] = subprocess.check_output(cmd, shell=True)
    cmd = "compare -metric RMSE " + uncomp + " " + comp + " /dev/null 2>&1"
    res["rmse"] = subprocess.check_output(cmd, shell=True)
    res["osize"] = os.path.getsize("data/vase.rti")
    res["csize"] = os.path.getsize("out/vase-comp.jrti")
    res["comp"] = (res["osize"] + 0.0) / res["csize"]
    return res

def run(qua):
    crti = compress("vase.rti", qua)
    ucrti = decompress(crti)
    res = measure(ucrti, 50.0, 50.0, qua)
    print("JPEG", end=";")
    print("vase.rti", end=";")
    print(res["comp"], end=";")
    print(res["psnr"].strip(), end=";")
    print(res["rmse"].strip(), end=";")
    print(res["ssim"].strip(), end=";")
    print(qua)

print("Method;File;CompRatio;PSNR;RMSE;SSIM;Qua")
for qua in range(1,5,1):
    run(qua)
