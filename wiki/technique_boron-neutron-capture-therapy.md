---
type: technique
sources: ["raw/Radiobiology Textbook.pdf"]
updated: 2026-08-03
---

## Synthesis

**Principle.** Boron neutron capture therapy (BNCT) delivers a boron-10-containing compound that selectively accumulates in tumour cells, then irradiates the patient with a beam of thermal or epithermal neutrons. ¹⁰B has a large capture cross-section for low-energy neutrons; capture produces an excited ¹¹B nucleus that undergoes fission: ¹⁰B + n → ¹¹B → ⁷Li + ⁴He (α particle) + γ + 2.4 MeV (raw/Radiobiology Textbook.pdf, Ch.6 §6.4.3.1, Eq. 6.2). The resulting high-LET alpha particle has a short tissue range (~7.6 μm average, 5–9 μm range) — comparable to a cell diameter — so nearly all the released energy deposits within the boron-loaded tumour cell, sparing adjacent normal tissue. The 0.48 MeV gamma photon released is useful for monitoring the reaction but contributes little to cell killing; the thermal neutrons themselves have little direct radiobiological effect (Ch.6 §6.4.3.1).

**Boron-delivery agents.** An ideal agent is non-toxic, has high tumour specificity, and achieves a tumour-to-normal-tissue boron ratio of ~3–4:1 (Ch.6 §6.4.3.2). Three agents are approved for human trials: sodium borocaptate (BSH) and sodium decaborane (GB-10) — both low-molecular-weight, membrane-permeable — and boronophenylalanine (BPA), which has comparatively higher tumour-specific uptake (concentrates in melanin-synthesizing cells) and can be ¹⁸F-labelled for PET-based boron-concentration imaging. High-molecular-weight agents (boron-conjugated monoclonal antibodies, liposomes, nanoparticles, EGF conjugates) are more tumour-specific but generally cannot cross an intact blood-brain barrier (Ch.6 §6.4.3.2).

**Neutron sources and dosimetry.** Thermal neutrons attenuate rapidly (half-value layer ~1.5 cm) and deposit a high surface dose before reaching deep tumours; epithermal neutrons (1–10,000 eV) peak at 2–3 cm depth with better penetration, at the cost of poor overall depth-dose distribution and gamma/fast-neutron contamination from reactor-generated beams that causes normal-tissue damage independent of boron uptake (Ch.6 §6.4.3.3). Dose is reported as RBE-weighted dose (Gy_w), accounting separately for alpha particles, gamma rays, fast neutrons, and capture-reaction contributions, weighted differently for tumour vs. normal tissue based on measured/estimated ¹⁰B concentration; Monte Carlo methods (rather than conventional planning algorithms) are used because of the mix of primary, scattered, and by-product radiation (Ch.6 §6.4.3.4).

**Clinical history and status.** Early trials (Brookhaven, Japan) using thermal neutrons and boric-acid-derivative/BSH agents were disappointing — poor tumour-to-blood boron ratios, blood-brain-barrier exclusion, poor neutron penetration requiring open craniotomy and 4–8 hours of general anaesthesia. Modern trials use epithermal neutron beams (avoiding open craniotomy) and BPA (alone or with BSH), mainly in CNS malignancies, malignant melanoma, and recurrent head and neck cancer — but no randomized controlled trial of BNCT has yet been reported (Ch.6 §6.4.3.5). Reactor-based neutron sources limit hospital deployment; particle-accelerator-based neutron generation is being investigated as a more clinically deployable alternative, though results from reactor-based trials may not directly generalize (Ch.6 §6.4.3.6).

## History

- 2026-08-03: Page created from ingest of Baatout (ed.), *Radiobiology Textbook* (2023), Chapter 6 §6.4.3 ("Boron Neutron Capture Therapy"). New technique not previously in this wiki; complements the high-LET/RBE framework in [[concept_RBE]] with a targeted-delivery mechanism distinct from external-beam particle therapy.
