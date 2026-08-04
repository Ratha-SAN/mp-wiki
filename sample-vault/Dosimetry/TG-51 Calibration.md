---
title: TG-51 Calibration
tags: [dosimetry, protocol, qa]
---

# TG-51 Calibration

AAPM's protocol for clinical reference dosimetry of high-energy photon and electron
beams, based on absorbed-dose-to-water calibration factors.

## Working equation

$$
D_w^Q = M \, k_Q \, N^{60\mathrm{Co}}_{D,w}
$$

- $M$ — fully corrected chamber reading
- $k_Q$ — beam quality conversion factor
- $N_{D,w}$ — calibration coefficient from the standards lab

$M$ itself is a product of corrections:

$$
M = P_{\mathrm{ion}} P_{\mathrm{TP}} P_{\mathrm{elec}} P_{\mathrm{pol}} M_{\mathrm{raw}}
$$

## Beam quality

For photons, $Q$ is specified by $\%dd(10)_x$. For electrons it is $R_{50}$. The
underlying quantity is defined in [[Absorbed Dose#Relationship to kerma]], and the
detector requirements come from [[Ionization Chambers]].

## Procedure outline

1. Establish [[Ionization Chambers|chamber]] setup at reference depth.
2. Measure $P_{\mathrm{ion}}$ from a two-voltage reading.
3. Apply $k_Q$ from the protocol tables.
4. Cross-check against [[Output Factor Measurement]].

The original protocol document: [[tg51-protocol.pdf]]

> Annual constancy is checked against the previous calibration; a deviation beyond
> 2 % triggers investigation.

#qa #protocol/aapm
