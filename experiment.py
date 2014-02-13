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
    print(cmd)
    subprocess.call(cmd, shell=True)
    return outp

def nextline(f):
    line = f.readline()
    if line == "":
        raise Exception("EOF")
    if line[0] == "#":
        return nextline(f)
    return line.split(" ")

def compress(rtifile,alpha,beta):
    print ("Compressing " + rtifile)
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
    c_images = []
    for i in range(c_num):
        img = Image.new("RGB",(w,h))
        cd = [tuple(c_data[i,y,x]) for y in range(h) for x in range(w)]
        img.putdata(cd)
        c_images.append(numpy.array(img.convert('YCbCr')))
    c_images = numpy.reshape(numpy.array(c_images),(9,h,w,3))
    c_y = c_images.T[0].T
    c_cb = numpy.average(c_images.T[1].T,0)
    c_cr = numpy.average(c_images.T[2].T,0)

    fo = open("out/vase-comp.crti", 'w')
    for scale in scales:
      fo.write(struct.pack('f', scale))
    for bias in biases:
      fo.write(struct.pack('f', bias))
    c_y = [c for c in c_y]
    c_y.append(c_cb)
    c_y.append(c_cr)
    i = 0
    for c_yi in c_y:
        i += 1
        mem = io.BytesIO()
        q = alpha if i < 10 else beta
        Image.fromarray(c_yi.astype(numpy.uint8)).save(mem, "JPEG", quality=q)
        jpegdata = mem.getvalue()
        mem.close()
        fo.write(struct.pack('i', len(jpegdata)))
        for b in jpegdata:
            fo.write(b)
    fo.close()
    return "vase-comp.crti"

def decompress(crtifile):
    print ("Decompressing " + crtifile)
    fi = open("out/" + crtifile, 'r')
    scales = struct.unpack('f'*9,fi.read(4*9))
    biases = struct.unpack('f'*9,fi.read(4*9))
    c_y = [0] * 9
    c_cb = []
    c_cr = []
    for i in range(11):
        size = struct.unpack('i', fi.read(4))[0]
        mem = io.BytesIO(fi.read(size))
        jpeg = Image.open(mem)
        c = numpy.reshape(numpy.array(jpeg),(470,320)).astype(numpy.uint8)
        mem.close()
        if i == 9:
          c_cb = c
        elif i == 10:
          c_cr = c
        else:
          c_y[i] = c
    fi.close()
    c_images = []
    for c in range(9):
        img = Image.new("YCbCr",(320,470))
        cd = [(c_y[c][y,x],c_cb[y,x],c_cr[y,x]) for y in range(470) for x in range(320)]
        img.putdata(cd)
        c_images.append(numpy.array(img.convert('RGB')))
    fo = open("data/vase-comp.rti", 'w')
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
    return "vase-comp.rti"

def recreate(alpha, beta):
    crti = compress("vase.rti",30,30)
    return decompress(crti)

def ploti(img, alpha, beta):
    imgOutMat = img_matrix(img)
    plt.imshow(imgOutMat, interpolation='nearest', hold=True)
    plt.xticks([])
    plt.yticks([])
    plt.xlim(100, 200)
    plt.ylim(100, 200)
    # plt.show()
    fn = 'out/c_' + str(int(alpha)) + '_' + str(int(beta)) + '.png'
    plt.savefig(fn, dpi=80,bbox_inches='tight')

def measure(ucrti, lightx, lighty, alpha, beta):
    uncomp = render('vase.rti', [lightx, lighty])
    comp = render(ucrti, [lightx, lighty])
    ploti(comp, alpha, beta)
    res = {}
    cmd = "dssim/dssim " + uncomp + " " + comp
    res["sim"] = subprocess.check_output(cmd, shell=True)
    cmd = "compare -metric PSNR " + uncomp + " " + comp + " /dev/null 2>&1"
    res["psnr"] = subprocess.check_output(cmd, shell=True)
    cmd = "compare -metric RMSE " + uncomp + " " + comp + " /dev/null 2>&1"
    res["rmse"] = subprocess.check_output(cmd, shell=True)
    res["osize"] = os.path.getsize("data/vase.rti")
    res["csize"] = os.path.getsize("out/vase-comp.crti")
    res["comp"] = (res["osize"] + 0.0) / res["csize"]
    return res

def run(alpha, beta):
    ucrti =  recreate(alpha, beta)
    res = measure(ucrti, 50.0, 50.0, alpha, beta)
    print("Alpha =",alpha,"Beta =", beta)
    print("SSIM =",res["sim"]),
    print("PSNR =",res["psnr"]),
    print("RMSE =",res["rmse"]),
    print("Comp. Ratio =",res["comp"])

# for alpha in range(20,100,10):
#     for beta in range(20,100,10):
#         run(alpha, beta)
for alpha in [30,60,90]:
    for beta in [30,60,90]:
        run(alpha, beta)
