---
title: Linear Quadratic Model
tags: [radiobiology, models]
---

# Linear Quadratic Model

Surviving fraction after a dose $D$:

$$
S = e^{-\alpha D - \beta D^2}
$$

The $\alpha/\beta$ ratio is the dose at which the linear and quadratic terms
contribute equally to cell kill.

## Biologically effective dose

For $n$ fractions of size $d$:

$$
\mathrm{BED} = nd \left(1 + \frac{d}{\alpha/\beta}\right)
$$

Typical values: $\alpha/\beta \approx 10\ \mathrm{Gy}$ for most tumours and early
responding tissue, $\approx 3\ \mathrm{Gy}$ for late responding tissue. This
asymmetry is the whole argument for [[Fractionation]].

```text
EQD2 = D * (d + a/b) / (2 + a/b)
```

## Limits

The model is fitted over roughly 1–8 Gy per fraction and understates cell kill at
the high doses used in SBRT, which motivates [[Universal Survival Curve]] variants.

Physical dose is still [[Absorbed Dose]]; the LQ model only reweights it.
