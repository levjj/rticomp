#!/usr/bin/python
# -*- coding: utf-8 -*-
import numpy as np
import matplotlib.pyplot as plt

data = np.genfromtxt("data/results.csv",delimiter=";",names=True)

p5 = data[data["Beta"] == 5]
p15 = data[data["Beta"] == 15]
p25 = data[data["Beta"] == 25]
p35 = data[data["Beta"] == 35]
p45 = data[data["Beta"] == 45]
p55 = data[data["Beta"] == 55]
p65 = data[data["Beta"] == 65]
p75 = data[data["Beta"] == 75]
p85 = data[data["Beta"] == 85]
p95 = data[data["Beta"] == 95]

# pp = [p5,p15,p25,p35,p45,p55,p65,p75,p85,p95]
pp = [p85,p95]

data2 = np.genfromtxt("data/results-j.csv",delimiter=";",names=True)

for m in ["RMSE","PSNR","SSIM"]:
  plt.figure(figsize=(5,4), dpi=80)
  plt.xlabel('Compression Ratio')
  plt.ylabel(m)
  plt.plot(p65["CompRatio"],p65[m],c="g",label="ab-JPEG")
  # plt.plot(p55["CompRatio"],p55[m],c="y",label="ab-JPEG (b=55)")
  # plt.plot(p45["CompRatio"],p45[m],c="b",label="ab-JPEG (b=45)")
  # plt.scatter(data["CompRatio"],data[m],c="b",label="ab-JPEG")
  plt.plot(data2["CompRatio"],data2[m],c="r",label="JPEG")
  plt.legend(loc=2)
  plt.savefig("data/plot_"+m+".pdf")
# plt.show()
# plt.savefig("results/heat4.pdf")
