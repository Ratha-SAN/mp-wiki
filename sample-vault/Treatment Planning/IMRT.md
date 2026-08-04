---
title: IMRT
tags: [planning, delivery]
---

# IMRT

Intensity-modulated radiotherapy shapes fluence with a multileaf collimator to
produce concave dose distributions.

## Optimisation

A quadratic objective over voxels $i$:

$$
F(\mathbf{x}) = \sum_i w_i \left( D_i(\mathbf{x}) - D_i^{\mathrm{presc}} \right)^2
$$

subject to $x_j \ge 0$ on beamlet weights. Dose is computed from the beamlet matrix
$D_i = \sum_j d_{ij} x_j$, where $d_{ij}$ comes from the dose engine —
see [[Monte Carlo Dose Calculation]].

## Small field dosimetry

Lateral electronic disequilibrium and detector volume averaging both bite below
about 3 cm. Chamber choice matters: [[Ionization Chambers]].

## QA

Patient-specific QA compares a measured plane against calculation with a gamma
criterion:

$$
\gamma(\mathbf{r}_m) = \min_{\mathbf{r}_c} \sqrt{\frac{|\mathbf{r}_c - \mathbf{r}_m|^2}{\Delta d^2} + \frac{(D_c - D_m)^2}{\Delta D^2}}
$$

Contours come from [[CT Physics|planning CT]] and [[MRI Basics]]. The fractionation
context is in [[Fractionation]].

Related, unwritten: [[VMAT]], [[Plan Robustness]].

#qa
