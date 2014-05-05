#!/usr/bin/python
# -*- coding: utf-8 -*-
import numpy as np
import matplotlib.pyplot as plt

data = np.genfromtxt("data/results.csv",delimiter=";",names=True)

y, x = np.mgrid[slice(5, 100, 10),
                slice(5, 100, 10)]


# z = np.zeros((lim*res,lim*res))
# for xi in range(5, 100, 10):
#   for yi in slice(5, 100, 10):
#     z[xi,yi] = [d[''] | for d in data if d['Alpha'] == xi and d['Beta'] == yi]

for m in ["RMSE"]:
  plt.figure(figsize=(5,4), dpi=80)
  # plt.xscale('log')
  # plt.yscale('log')
  plt.xlabel('Alpha')
  plt.ylabel('Beta')
  plt.title(m)
  cmap = plt.get_cmap('Reds')
  # plt.pcolormesh(xs, ys, zs, cmap=cmap)
  plt.pcolormesh(x,y,data[m].reshape((10,10)), cmap=cmap,shading='gouraud')
  plt.colorbar()
  plt.axis([x.min(), x.max(), y.min(), y.max()])
  plt.savefig("data/heat_RMSE.pdf")
# plt.show()
