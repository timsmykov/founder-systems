# Founder Systems

A source-backed map of how founders build and operate companies. The first collection compares **Nik Storonsky / QuantumLight** with **Elon Musk as represented in Eric Jorgenson's The Book of Elon**.

Explore **783 meanings, 3,692 detailed facets and 249 reviewed comparison groups**, including 23 same-mechanism groups. All **5,098 original quotation records** remain included; 4,459 are attached to meaning cards and the remainder preserves audit/context evidence. The project name accommodates future founders; the current interface/data model still targets this first pair.

[Open the interactive library](https://founder-systems.timsmykov.chatgpt.site/)

## Run locally

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. No application server, database or API key is required. Light/dark/system themes, topic navigation, original-language search, quotations and a zoomable graph work in the browser. Phone layouts include bottom navigation, filter/topic sheets and a dedicated reader.

## Verify

```sh
python3 scripts/verify.py
```

Optional browser checks:

```sh
npm install
npx playwright install chromium
ATLAS_BASE_URL=http://localhost:8080/ npm run test:browser
```

The repository contains the selected quoted library and its interface with a new Git history. Full book/transcript source files, native worker packets and research execution history remain in a separate private research archive. `export-verification.json` and `release-manifest.json` bind the exported records to their source snapshot and file hashes.

## Read the evidence carefully

English statements and comparison labels are research interpretations; quotations retain their source language, speaker, locations and hashes. QuantumLight is institutional evidence. The book contains editorial and other attributed voices as well as Musk. ASR errors and source uncertainty remain relevant. A partial overlap is not an identical mechanism, and an unmatched meaning is not proof of uniqueness.

See [methodology](docs/methodology.md), [source-use notice](NOTICE.md) and [photograph credits](assets/portraits/LICENSES.md). Existing source licences apply to their respective material; public visibility is not a blanket licence over third-party sources. No endorsement by a founder or source organisation is implied.
