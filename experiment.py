'''
File compress.py
Created on 11 Feb 2014
@author: Christopher Schuster, cschuste@ucsc.edu
@author: Antoine Vacavant, ISIT lab, antoine.vacavant_AT_iut.u-clermont1.fr, http://isit.u-clermont1.fr/~anvacava
'''

# General imports
from __future__ import print_function
import os,sys,subprocess,struct

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

def compress(rtifile):
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
        # img.putdata(cd, scales[i], biases[i])
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
    for c_yi in c_y:
        for y in range(h):
            for x in range(w):
                fo.write(struct.pack('B', c_yi[y,x]))
    for y in range(h):
        for x in range(w):
            fo.write(struct.pack('B', c_cb[y,x]))
    for y in range(h):
        for x in range(w):
            fo.write(struct.pack('B', c_cr[y,x]))
    fo.close()
    return "vase-comp.crti"

def decompress(crtifile):
    print ("Decompressing " + crtifile)
    subprocess.call("cp out/" + crtifile + " data/vase-comp.rti", shell=True)
    fi = open("out/" + crtifile, 'r')
    scales = struct.unpack('f'*9,fi.read(4*9))
    biases = struct.unpack('f'*9,fi.read(4*9))
    c_y = numpy.zeros((9,470,320),dtype=numpy.uint8)
    for c in range(9):
        for y in range(470):
            for x in range(320):
                c_y[c,y,x] = struct.unpack('B', fi.read(1))[0]
    c_cb = numpy.zeros((470,320),dtype=numpy.uint8)
    for y in range(470):
        for x in range(320):
            c_cb[y,x] = struct.unpack('B', fi.read(1))[0]
    c_cr = numpy.zeros((470,320),dtype=numpy.uint8)
    for y in range(470):
        for x in range(320):
            c_cr[y,x] = struct.unpack('B', fi.read(1))[0]
    fi.close()
    c_images = []
    for c in range(9):
        img = Image.new("YCbCr",(320,470))
        cd = [(c_y[c,y,x],c_cb[y,x],c_cr[y,x]) for y in range(470) for x in range(320)]
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

# Render uncompressed image
uncomp = render("vase.rti", [50.0, 50.0])
imgRefMat = img_matrix(uncomp)
(w,h) = (imgRefMat.shape[0],imgRefMat.shape[1])

# First subplot
figure()
subplot(121)
plt.imshow(imgRefMat, hold=True)

# Compress and decompress RTI
crti = compress("vase.rti")
ucrti = decompress(crti)

# Render decompressed image
comp = render(ucrti, [50.0, 50.0])
imgOutMat = img_matrix(comp)

# Second subplot
subplot(122)
plt.imshow(imgOutMat, hold=True)
plt.show()

# Compute SSIM
cmd = "dssim/dssim " + uncomp + " " + comp
print(cmd)
print("SSIM=", subprocess.check_output(cmd, shell=True))
