---
title: Ionization Chambers
tags: [dosimetry, detectors]
---

# Ionization Chambers

Gas-filled detectors operated in the saturation region, where collected charge is
proportional to the ionization produced in the cavity.

## Cavity theory

Bragg–Gray conditions require the cavity to be small compared with the range of the
charged particles crossing it, and that it does not perturb the fluence:

$$
\frac{D_{\mathrm{med}}}{D_{\mathrm{gas}}} = \left(\frac{\bar{S}}{\rho}\right)^{\mathrm{med}}_{\mathrm{gas}}
$$

Spencer–Attix theory refines this with a cut-off energy $\Delta$ to account for delta
rays leaving the cavity.

## Corrections

| Symbol | Corrects for |
| --- | --- |
| $P_{\mathrm{ion}}$ | Incomplete charge collection |
| $P_{\mathrm{pol}}$ | Polarity effect |
| $P_{\mathrm{TP}}$ | Air density |

$$
P_{\mathrm{TP}} = \frac{273.2 + T}{273.2 + 22.0} \cdot \frac{101.33}{P}
$$

Used throughout [[TG-51 Calibration]]; the quantity being measured is
[[Absorbed Dose|dose to water]]. Chamber response also matters for
[[IMRT]] small-field work — see [[Treatment Planning/IMRT#Small field dosimetry]].

Unresolved on purpose: [[Diode Detectors]].
