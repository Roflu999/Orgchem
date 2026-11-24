# Third-party notices

The application's original source is provided under the [MIT License](LICENSE). Bundled third-party assets retain the licenses and notices below; the application license does not relicense those assets.

## 3Dmol.js 2.4.2

- Upstream: <https://3dmol.org/> and <https://github.com/3dmol/3Dmol.js>
- Bundled file: `vendor/3dmol-2.4.2/3Dmol-min.js`
- License/embedded component notices: [`vendor/3dmol-2.4.2/LICENSE`](vendor/3dmol-2.4.2/LICENSE)
- Integrity record: `vendor/3dmol-2.4.2/SHA256SUMS`

3Dmol.js identifies its license as BSD-3-Clause and incorporates GLmol, Three.js and jQuery code. The bundled license file retains the associated copyright, license and disclaimer text. Their authors do not endorse this application.

## Noto language fonts

Locally served, unmodified WOFF2 subsets of **Noto Sans Arabic** and **Noto Sans SC** provide interface coverage without requiring a viewer's installed Arabic/CJK fonts or sending interface text to a font-subsetting service.

- Noto Sans Arabic: copyright 2022 The Noto Project Authors; [SIL Open Font License 1.1](vendor/fonts/arabic-OFL.txt).
- Noto Sans SC: copyright 2014–2021 Adobe; the upstream notice specifies the Reserved Font Name “Source”; [SIL Open Font License 1.1](vendor/fonts/han-OFL.txt).
- Font subsets are redistributed under their own OFL terms, not under the application's MIT source license.
- `vendor/fonts/manifest.json` records the exact public source URL, SHA-256 digest, family and byte length of every bundled file.
- `atlas-fonts.css` references only local `/fonts/…` assets. “Atlas Arabic” and “Atlas Han” are local CSS family aliases; font binaries are unmodified.

The selected subsets cover the current translated interface. Arbitrary user-supplied text can still require additional system-font coverage. The original font license notices are included in full alongside the assets.

## Local display fonts

Unmodified WOFF2 subsets are bundled locally alongside the language fonts; the running interface does not request a font CDN. Their exact source URLs and hashes are included in the same font manifest.

- Manrope: copyright 2018 The Manrope Project Authors; [SIL Open Font License 1.1](vendor/fonts/body-OFL.txt).
- Space Grotesk: copyright 2020 The Space Grotesk Project Authors; [SIL Open Font License 1.1](vendor/fonts/display-OFL.txt).
- IBM Plex Mono: copyright 2017 IBM Corp., Reserved Font Name “Plex”; [SIL Open Font License 1.1](vendor/fonts/mono-OFL.txt).

These font binaries remain under their OFL terms, not the application's MIT license.

## Python and test dependencies

`requirements.txt` and `requirements-dev.txt` identify pinned dependencies installed separately by the user/launcher or test environment. Each dependency retains its upstream license and notices. Python, RDKit, FastAPI, NumPy, Pillow and the other dependency projects do not endorse this app. Their wheels are not vendored in this source tree.
