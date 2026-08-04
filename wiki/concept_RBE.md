---
type: concept
sources: [raw/Radiation Biology- A Handbook for Teachers and Students.pdf, "raw/Radiobiology Textbook.pdf"]
updated: 2026-08-03
---

## Synthesis

**Definition.** Relative biological effectiveness (RBE) compares the dose of a reference radiation (historically 250 kVp X-rays, now usually Co-60 γ-rays) to the dose of a test radiation required to produce an equal biological effect: RBE = D(reference)/D(test) (raw/Radiation Biology- A Handbook for Teachers and Students.pdf, §2.3.8, §3.8). It is not a fixed physical constant — it depends on cell/tissue type, biological endpoint, dose, dose rate, and fractionation (§2.3.8).

**Dependence on LET.** RBE rises with increasing [[concept_radiation-interactions|LET]] up to ~100 keV/μm, then declines due to "overkill" — energy deposited in excess of what is needed for the biological effect (§2.2.4, §2.3.8).

**Dependence on dose and dose rate.** RBE is higher at lower doses/survival levels because the reference (low-LET) radiation has a pronounced shoulder (greater relative sparing at low dose) that high-LET radiation lacks (§2.3.8). RBE is higher at low dose rates of the reference radiation because low-LET radiation shows a dose-rate effect (recovery via [[concept_cell-death-and-survival-curves|sublethal damage repair]]) that high-LET radiation does not (§2.3.8). RBE is generally lower for large single fractions and higher for multiple small fractions (§2.3.8).

**Tissue dependence.** RBE tends to be higher for late-responding normal tissues than early-responding tissues/tumours, consistent with late tissues having greater sublethal-damage repair capacity — see [[concept_normal-tissue-response]] and [[concept_fractionation]] (§2.3.8, §3.2.2). This has practical consequences for high-LET therapy: neutrons and heavy ions show reduced repair capacity broadly, which can produce disproportionately high RBE — and thus disproportionate damage — in late-responding tissues (§3.2.2).

**Clinical high-LET modalities.** Protons offer primarily a physical (Bragg-peak) dose-distribution advantage with RBE close to 1 (taken as ~1.1 relative to photons); fast neutrons and heavy ions (e.g. carbon) offer a biological advantage via reduced oxygen enhancement ratio and reduced repairability — see [[concept_oxygen-effect]] — but neutron therapy trials showed increased late complications (notably subcutaneous fibrosis) without consistent therapeutic gain (§3.2.2).

**LET, microdosimetry, and the "overkill" mechanism.** LET (keV/μm) is the energy transferred per unit track length (ICRU 1970 definition, dE/dl with an energy cutoff — commonly 100 eV — separating "local" deposition from longer-range δ-electrons); low-LET (X-rays, γ-rays) vs. high-LET (protons at some energies, neutrons, heavy ions) is conventionally divided around 10 keV/μm (raw/Radiobiology Textbook.pdf, Ch.2 §2.6.1). RBE rises with LET up to ~100 keV/μm because that spacing of ionization events matches the ~2 nm diameter of the DNA double helix, maximizing DSB probability from a single particle track; above ~100 keV/μm RBE declines ("overkill") because excess local ionization density is biologically wasted (Ch.2 §2.6.3.1, §2.6.4.1) — same mechanism already summarized in this page's LET-dependence paragraph, now with the microdosimetric rationale. Microdosimetry/nanodosimetry (lineal energy y, frequency/dose-mean lineal energy) are noted as more complete alternatives to a single averaged LET value, particularly because LET poorly describes electron track structure (Ch.2 §2.6.2–2.6.3.4).

**Dose rate and FLASH.** RBE (relative to a reference low-LET, high-dose-rate radiation) decreases as dose rate decreases, via the same sublethal-damage-repair mechanism noted above (dose reduction factor, DRF > 1 with increasing dose rate); late-responding low-α/β tissues are more sensitive to this dose-rate effect than tumours/early tissues (Ch.2 §2.6.4.4). At the opposite extreme, ultrahigh dose rate ("FLASH," >144,000 Gy/h) radiotherapy has been reported in the literature to invert the normal-tissue-sparing relationship (i.e. produce relatively less normal-tissue damage at equal tumour effect); noted here as an emerging, not yet fully explained, effect (Ch.2 §2.6.4.4) (UNVERIFIED clinical significance — source presents this as an active research question, not an established clinical practice). See [[technique_FLASH-radiotherapy]] for full mechanistic detail: the oxygen-depletion explanation mentioned here has since been directly challenged by oxygen-sensor data, so the mechanism should be treated as unresolved rather than settled.

## History

- 2026-08-03: Page created from ingest of IAEA Training Course Series 42, *Radiation Biology: A Handbook for Teachers and Students* (2010), §2.3.8, §3.2.2, §3.8.
- 2026-08-03: Added LET/microdosimetry mechanistic detail and a FLASH dose-rate note from Baatout (ed.), *Radiobiology Textbook* (2023), Ch.2 §2.6. No contradiction — same LET-RBE relationship and dose-rate effect already described here; FLASH is new content, flagged as an active research question rather than settled fact.
- 2026-08-03: Corrected the FLASH note per Ch.6 §6.4.2 of the same source — the oxygen-depletion mechanism has been directly challenged by oxygen-sensor data; full detail moved to new page [[technique_FLASH-radiotherapy]].
