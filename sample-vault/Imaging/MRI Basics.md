---
title: MRI Basics
tags: [imaging, mri]
---

# MRI Basics

The Larmor frequency of a nucleus in field $B_0$:

$$
\omega_0 = \gamma B_0
$$

For protons $\gamma / 2\pi \approx 42.58\ \mathrm{MHz\,T^{-1}}$, so a 1.5 T scanner
resonates near 63.9 MHz.

## Relaxation

| Constant | Process | Tissue dependence |
| --- | --- | --- |
| $T_1$ | Spin–lattice | Long in fluid |
| $T_2$ | Spin–spin | Short in solid |

Signal decay in a gradient echo follows $T_2^*$, where

$$
\frac{1}{T_2^*} = \frac{1}{T_2} + \gamma \Delta B_0
$$

## In radiotherapy

Geometric distortion has to be characterised before MRI is used for planning; the
electron density still comes from [[CT Physics]] or a synthetic CT. Contours drawn on
MRI feed straight into [[IMRT]].

Not written yet: [[MR-Linac Workflow]].

#mri #imaging/planning
