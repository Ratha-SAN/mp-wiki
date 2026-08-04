---
title: CT Physics
tags: [imaging, ct]
---

# CT Physics

## Hounsfield units

$$
\mathrm{HU} = 1000 \times \frac{\mu - \mu_{\mathrm{water}}}{\mu_{\mathrm{water}}}
$$

Water is 0 HU by construction; air is $-1000$ HU. The HU-to-density curve is what
[[Monte Carlo Dose Calculation]] and analytic algorithms consume when converting a
planning scan into a transport medium.

## Reconstruction

Filtered back projection inverts the Radon transform:

$$
f(x, y) = \int_0^{\pi} \! \int_{-\infty}^{\infty} P(\theta, t) \, |\omega| \, e^{i 2\pi \omega t} \, \mathrm{d}\omega \, \mathrm{d}\theta
$$

Iterative reconstruction trades computation for noise at fixed dose.

## Artefacts

- Beam hardening — cupping, dark bands between dense structures
- Metal — streaking, often mitigated by [[Metal Artefact Reduction]]
- Motion — 4DCT addresses respiratory motion for [[IMRT]] planning

Dose from the scan itself is quantified with CTDI, not with the
[[Absorbed Dose|absorbed dose]] formalism used for therapy.

See also [[MRI Basics]] for the complementary modality.
