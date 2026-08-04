---
type: equipment
sources: ["raw/Radiobiology Textbook.pdf"]
updated: 2026-08-03
---

## Synthesis

**Ionization chambers.** The baseline dosimeter: measures absolute energy deposition via charge collected from ionization of a gas (typically air) between electrodes under an applied field that prevents ion-electron recombination (raw/Radiobiology Textbook.pdf, Ch.4 §4.1.3.1). Open-to-air chambers require temperature/pressure correction (k_T,P = T·Pn/(Tn·P)) since ambient conditions affect gas density and thus response (Ch.4 §4.1.2). Increasing the applied voltage moves the chamber into the proportional region (charge amplification, gives directional information) — proportional counters — and further into the Geiger region (avalanche multiplication). Multi-wire proportional chambers (MWPCs, ~2 mm anode wire spacing) track individual charged-particle paths, used in high-energy physics (e.g. LHC) and inferable for particle momentum via magnetic-field deflection (Ch.4 §4.1.3.2).

**Scintillators and photomultiplier tubes (PMTs).** Scintillating materials (organic: naphthalene, anthracene; inorganic: NaI, CsI) emit a photon flux when a charged particle excites and de-excites electrons; coupled to a PMT, which amplifies the weak photon signal via a photocathode → dynode chain (each dynode collision emits ~5–10 secondary electrons) into a measurable current proportional to the original photon flux. Used as the first detection element in nuclear-medicine gamma cameras (Ch.4 §4.1.3.3).

**Semiconductor detectors.** p-n junction diodes (silicon or germanium, doped with boron/antimony) operated in reverse bias; radiation promotes electrons from valence to conduction band across the depletion layer, producing a current proportional to energy loss. Require only ~3 eV per electron-hole pair (vs. ~30 eV for gas ionization), giving strong signal for small photon flux; can be built thin (200–300 μm) for particle detection or thicker for photon stopping. Band-gap engineering (Table 4.1 lists materials from diamond, 5.65 eV/UV-sensitive, to HgCdTe, ~0.1–0.4 eV/far-IR-sensitive) tunes wavelength sensitivity (Ch.4 §4.1.3.4).

**Cerenkov detectors.** Exploit Cerenkov radiation (Cerenkov 1934; Frank & Tamm 1937; Nobel Prize 1958): a charged particle travelling faster than the local phase velocity of light (v > c/n) polarizes the medium anisotropically, producing coherent reradiation in a cone at angle cos θ = 1/(nβ). Allows discrimination of particle identity/energy via emission angle or threshold refractive index; increasingly used for in vivo Cerenkov imaging dosimetry in radiotherapy (Ch.4 §4.1.3.5).

**Calorimeters.** Estimate total absorbed energy of a high-energy particle/photon via the temperature rise produced by a particle shower (successive ionization/bremsstrahlung cascade) in an absorbing medium — may combine ionization-chamber and semiconductor elements, since no single detector type stops and characterizes all secondary radiation produced (Ch.4 §4.1.3.6).

**No single "ideal" detector.** An ideal detector would provide spatial resolution, temporal resolution, particle energy, and particle identity simultaneously; no real detector achieves all four, which is why radiobiology/dosimetry facilities combine detector types (Ch.4 Box 4.3).

## History

- 2026-08-03: Page created from ingest of Baatout (ed.), *Radiobiology Textbook* (2023), Chapter 4 §4.1.2–4.1.3 ("Radiation Detectors"). Fills a previously-noted gap in this wiki (`wiki/index.md` had flagged that no dedicated equipment page existed, since the IAEA handbook only treated dosimetry devices in passing). No contradiction with existing pages.
