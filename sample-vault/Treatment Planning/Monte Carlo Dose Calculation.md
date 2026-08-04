---
title: Monte Carlo Dose Calculation
tags: [planning, computation]
---

# Monte Carlo Dose Calculation

Simulates individual particle histories through the patient geometry rather than
approximating transport with a kernel.

## Statistical uncertainty

The relative uncertainty in a scoring voxel falls as

$$
\sigma_{\mathrm{rel}} \propto \frac{1}{\sqrt{N}}
$$

so halving noise costs four times the histories. Variance reduction (range
rejection, particle splitting, Russian roulette) buys back most of that.

## Inputs

- Phase-space or virtual source model of the linac head
- Voxel geometry and material assignment from [[CT Physics#Hounsfield units]]
- Cross-section data, see [[Reference/Constants]]

## Dose-to-medium vs dose-to-water

Monte Carlo naturally reports $D_m$. Converting to $D_w$ uses stopping power ratios,
the same quantity that underpins [[Ionization Chambers#Cavity theory]]:

$$
D_w = D_m \left(\frac{\bar{S}}{\rho}\right)^{w}_{m}
$$

This matters most in bone. The prescription convention should be stated in the plan.

Used as the reference engine when commissioning [[IMRT]].

Unwritten: [[GPU Dose Engines]].
