# Data sources

## Used in the prototype

| Dataset | What we use | Access | Link |
| --- | --- | --- | --- |
| NASA POWER (daily, Agroclimatology community) | `T2M_MAX`, `T2M_MIN`, `PRECTOTCORR`, `ALLSKY_SFC_SW_DWN`, `GWETTOP`, `GWETROOT`, 2016–2025 | API, no login | https://power.larc.nasa.gov/ |
| MODIS Terra Vegetation Indices MOD13Q1 v061 (250 m, 16-day) | `250m_16_days_NDVI` at each paddock centre, 2016–2025 | ORNL DAAC MODIS web service, no login | https://modis.ornl.gov/data/modis_webservice.html |

## Optional (pipelines included; need a free login or email)

| Dataset | What we use | Access | Link |
| --- | --- | --- | --- |
| SMAP L4 Global Surface and Root Zone Soil Moisture (`SPL4SMGP.008`) | `Geophysical_Data_sm_surface`, April–May each year | NASA AppEEARS (Earthdata login) | https://www.earthdata.nasa.gov/data/platforms/space-based-platforms/smap |
| SRTM Global 1 arc second (`SRTMGL1_NC.003`) | Elevation at 5 points per paddock for slope | NASA AppEEARS (Earthdata login) | https://www.earthdata.nasa.gov/data/instruments/srtm |
| SILO climate data (Queensland Government) | Daily rain, to check NASA POWER against Australian station-based data | API with email address | https://www.longpaddock.qld.gov.au/silo/ |
| Soil and Landscape Grid of Australia (CSIRO / TERN) | Organic carbon, clay, available water capacity, typed into `data/paddocks.geojson` | Web viewer | https://www.clw.csiro.au/aclep/soilandlandscapegrid/ |
| Crop guides: NSW DPI Winter Crop Variety Sowing Guide, GRDC GrowNotes | Checking the crop traits in `app/data/crops.json` | Public guides | https://www.dpi.nsw.gov.au/ · https://grdc.com.au/ |

## Challenge resources not used, and why

| Resource | Reason | Australian alternative or next step |
| --- | --- | --- |
| GPM IMERG | Not yet in the pipeline; NASA POWER rain (which draws on satellite and reanalysis inputs) is used instead | Add IMERG monthly totals via GES DISC |
| Landsat, Sentinel-2 (ESA) | Finer than MODIS but needs image processing beyond the prototype | Digital Earth Australia provides analysis-ready Landsat and Sentinel-2 for Australia |
| ECOSTRESS (`ECO_L3T_JET.002`) | Irregular revisit; next step for heat and water stress mapping | AppEEARS point request, as for SMAP |
| ERA5 (ECMWF) | Needs a Copernicus account; could fill gaps and cross-check POWER | Copernicus Climate Data Store |
| FAO GAEZ | Next step for crop suitability checks | https://gaez.fao.org/ |
| GEDI | Measures tall vegetation structure; little signal on cropland | — |
| NLDAS (US) / GLDAS | NLDAS is US-only; POWER soil wetness serves the prototype | GLDAS via Earthdata |
| Web Soil Survey, SSURGO/STATSGO2, CropScape, PRISM, NAIP, NLCD, OpenET, LANDFIRE, CoCoRaHS, NWIS, NASS QuickStats, AMS Market News, Ag Data Commons | United States coverage only | Soil and Landscape Grid of Australia, ABARES land use and crop reports, SILO, BOM |

## Code libraries

| Library | Use | Licence |
| --- | --- | --- |
| Leaflet 1.9.4 | Map | BSD-2-Clause |
| OpenStreetMap tiles | Base map | ODbL (data), tile usage policy |
| pandas, NumPy, requests, pytest | Pipelines and tests | BSD-3-Clause / Apache-2.0 / MIT |
