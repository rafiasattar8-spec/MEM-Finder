# 🚀 MEM Finder

### Earth's Training Grounds for the Moon and Mars

**Space analog research keeps visiting the same few places. We went somewhere else.**

> *The Moon and Mars are far away, but their twins are right here on Earth.*

---

## 🌌 The Problem

Astronauts and engineers can't test a Moon base on the Moon. So they practice in deserts, craters, and volcanoes right here on Earth. But finding the *right* place means digging through dozens of scattered datasets, mostly by hand.

## 💡 Our Solution

MEM Finder is an interactive web app that **finds, scores, and visualizes Earth sites that mimic Moon and Mars landing sites.** Using real open data from NASA, ESA, JAXA and CSA, it answers one question:

**"How much does this place on Earth look like the Moon or Mars?"** 🌍🌕🔴

## 🧭 Why Non-Popular Sites?

Most analog sites you hear about are the famous ones. We looked elsewhere: the deserts of **Balochistan 🇵🇰**, the salt flats of **Iran 🇮🇷**, a meteor crater in **India 🇮🇳**, volcanic fields in **Mexico 🇲🇽**, and more.

- **Fresh options:** well-known analogs are crowded and heavily studied
- **Real diversity:** different geology, climate, and terrain give better comparisons
- **Global fairness:** space science shouldn't only look at a handful of countries
- **Untapped potential:** places like Hingol, Chagai, Lonar Crater, and Dasht-e Lut deserve attention

## ✨ Features

- 🌍 **Three synchronized 3D globes** of Earth, Moon, and Mars
- 📊 **Similarity score (0-100)** for every site
- 🏆 **Site leaderboard** with color-coded factor bars
- 🕸️ **Radar chart** showing all 5 factor groups
- 🎮 **MEM Simulator** with adjustable weights and training presets
- 📄 **Export report** with scores, weights, confidence rationale, and data sources
- 🎬 **30-second guided tour**

## 🧮 How Scoring Works

Each site gets a weighted score across five factor groups:

| Factor | What it covers |
|---|---|
| Terrain & Geology | Elevation, slope, rock and crater features |
| Climate & Atmosphere | Aridity, temperature, pressure |
| Resources | Water ice, minerals, materials |
| Operations | Accessibility, logistics, safety |
| Data Quality | Coverage and reliability of the data |

Weights are adjustable in the simulator, and scores update instantly.

## 📍 Analog Sites

**Mars analogs**
- Hingol & Kharan Desert (Pakistan)
- Dasht-e Lut (Iran)
- Dalangtan / Qaidam Basin (China)
- Samail Ophiolite (Oman)

**Moon analogs**
- Lonar Crater (India)
- Chagai / Koh-e-Taftan (Pakistan)
- Mount Suswa (Kenya)
- Pinacate (Mexico)
- Teide / Las Cañadas (Tenerife)

## 🛰️ Data Sources

- NASA Earthdata Search & Worldview
- PDS & LRO Diviner (Moon/Mars)
- CSA RCM & RADARSAT-1
- Copernicus Data Space (ESA)
- JAXA G-Portal
- SRTM, Copernicus DEM, USGS 3DEP (terrain)
- NASA POWER, WorldClim, CHIRPS (aridity)
- ERA5, MODIS LST (temperature)
- USGS / GVP (volcanic), NSIDC / ArcticDEM (polar)

## 🛠️ Tech Stack

- Vite + TypeScript
- Interactive 3D globes and SVG charts
- Open NASA / ESA / JAXA / CSA datasets

## 👩‍💻 Team

Built by **Team Lucidtoker** for **NASA Space Apps Challenge 2026**.
