---
title: Absorbed Dose
tags:
  - dosimetry
  - fundamentals
aliases: [Dose]
---

# Absorbed Dose

Absorbed dose $D$ is the mean energy $\mathrm{d}\bar{\varepsilon}$ imparted to matter
of mass $\mathrm{d}m$:

$$
D = \frac{\mathrm{d}\bar{\varepsilon}}{\mathrm{d}m}
$$

The SI unit is the gray, $1\ \mathrm{Gy} = 1\ \mathrm{J\,kg^{-1}}$. ^dose-definition

## Relationship to kerma

Under charged particle equilibrium, $D \approx K_{\mathrm{col}}$, so

$$
D = \Psi \left(\frac{\mu_{\mathrm{en}}}{\rho}\right)
$$

where $\Psi$ is the energy fluence. See [[Ionization Chambers#Cavity theory]] for how
this is exploited in practice.

## Measuring it

| Detector | Typical use | Energy dependence |
| --- | --- | --- |
| Farmer chamber | Reference dosimetry | Weak |
| TLD | In vivo | Moderate |
| Film | 2D QA | Strong below 100 keV |

Reference conditions are fixed by [[TG-51 Calibration]]. Depth-dose behaviour looks
like this:

![[pdd-curve.svg]]

A quick conversion in Python:

```python
def dose_from_mu(mu: float, output: float = 0.01) -> float:
    """Gy delivered for a given number of monitor units."""
    return mu * output
```

Note that `$` inside code is untouched, and a price like $20 stays literal.

## See also

- [Linear quadratic model](../Radiobiology/Linear%20Quadratic%20Model.md)
- [[Reference/Constants|Physical constants]]
- [[Radiation Weighting Factors]] (not written yet)

#radiotherapy
