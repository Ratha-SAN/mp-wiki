---
type: technique
sources: ["raw/Radiobiology Textbook.pdf"]
updated: 2026-08-03
---

## Synthesis

**Definition.** Stereotactic Body Radiation Therapy (SBRT, also Stereotactic Ablative Radiotherapy/SABR) delivers a tumoricidal dose in 2–5 large fractions (2–3×/week) using highly conformal, multi-non-coplanar-beam planning with tight PTV margins under image guidance (raw/Radiobiology Textbook.pdf, Ch.6 §6.4.1.1). Commonly used for lung, liver, pancreas, prostate, kidney, and spine tumours, and oligometastatic disease (Table 6.4).

**Why SBRT works beyond simple high-dose cell kill.** Three overlapping radiobiological arguments (Ch.6 §6.4.1.1):
- Because larger tumours have a larger hypoxic fraction (see [[concept_oxygen-effect]]), SBRT's typical use on small, relatively well-oxygenated tumours reduces the normal reliance on reoxygenation between fractions; the large dose per fraction also directly depopulates whatever hypoxic component remains and produces cell-cycle arrest/interphase death across all cycle phases, reducing the usual dependence on redistribution into radiosensitive phases (see [[concept_fractionation]] for the five/six Rs this bypasses).
- *Vascular damage hypothesis*: high dose per fraction causes endothelial cell apoptosis in structurally abnormal (dilated, tortuous, thin-basement-membrane) tumour vasculature, contributing an indirect tumour-kill mechanism distinct from direct clonogen sterilization.
- *Immunologic hypothesis*: high-dose-per-fraction RT triggers a stronger T-cell response than conventional fractionation; combined with PD-1/PD-L1 or CTLA-4 checkpoint blockade, this can produce an abscopal effect (see [[concept_tumor-immunogenicity-and-abscopal-effect]]).

**LQ model breakdown at SBRT dose-per-fraction levels.** The standard LQ model (see [[concept_cell-death-and-survival-curves]]) is thought to overestimate cell killing at the high fraction sizes used in SBRT — the same caveat already flagged in [[concept_fractionation]] regarding LQ validity above ~18–20 Gy/fraction. This source names the alternative explicitly: the universal survival curve (USC) model, which replaces BED with the standard effective dose (SED, the total dose at 2 Gy/fraction producing equivalent effect) (Ch.6 §6.4.1.1) — SED is functionally the same concept as NTD2 already used in [[concept_fractionation]], under a different name from a different modelling tradition. There is ongoing debate over the dose-per-fraction level at which the standard LQ model stops holding.

**Practical planning consequence.** Unlike conventional RT's goal of homogeneous target dose, SBRT deliberately prescribes to a low isodose line (e.g. 80%) with minimal penumbra margin, accepting internal dose heterogeneity/hotspots for a sharper falloff outside the target — normal-tissue tolerance data from conventional fractionation studies do not directly apply, so BED/NTD/equivalent uniform dose (EUD) bioeffect metrics are recalculated per plan, and SBRT-specific plan-quality metrics (conformity index, heterogeneity index, intermediate dose spillage) are reported alongside them (Ch.6 §6.4.1.3).

## History

- 2026-08-03: Page created from ingest of Baatout (ed.), *Radiobiology Textbook* (2023), Chapter 6 §6.4.1 ("Stereotactic Body Radiation Therapy"). Confirms and names the mechanism behind a caveat already present in [[concept_fractionation]] (LQ-model breakdown at high dose/fraction) — no contradiction, this fills in detail that page had left as an open question.
