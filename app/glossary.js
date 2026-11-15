// Copyright (c) 2026 Team SeedData (David Nguyen, Johanna Josodipuro, Shaf Tabeeb, Andre Baruah).
// Built for the NASA Space Apps Challenge 2026. See LICENSE for terms of use.

// Plain-language meanings for the farming and satellite words used on the page.
// Shown in the "Words we use" panel and as tap-to-read definitions on labels marked with data-term.

export const GLOSSARY = [
  { key: 'paddock', term: 'Paddock', def: 'A fenced field on a farm. Each paddock can grow a different crop.' },
  { key: 'rotation', term: 'Crop rotation', def: 'The order of crops grown in the same paddock over the years, for example wheat, then canola, then wheat.' },
  { key: 'break', term: 'Break crop', def: 'A crop that is not a cereal (such as canola or a pulse) grown between cereals to break the build-up of cereal diseases and weeds.' },
  { key: 'legume', term: 'Legume (pulse)', def: 'Plants such as field pea, chickpea, lupin, lucerne and clover. Bacteria in their roots take nitrogen from the air.' },
  { key: 'nfix', term: 'Nitrogen fixing', def: 'Turning nitrogen from the air into a form plants can use. It can leave nitrogen in the soil for the next crop and cut fertiliser needs.' },
  { key: 'pasture', term: 'Pasture phase', def: 'Years when a paddock grows pasture for sheep or cattle to graze instead of a grain crop. It rebuilds soil cover and organic matter.' },
  { key: 'gs', term: 'Growing season', def: 'For winter crops in southern Australia, April to October: sown in autumn, flowering in late winter and spring, harvested in early summer.' },
  { key: 'flowering', term: 'Flowering', def: 'When the crop opens its flowers. Frost at this stage can kill flowers and cut yield.' },
  { key: 'grainfill', term: 'Grain fill', def: 'The weeks after flowering when grain swells. Very hot days (32 °C or more) can shrivel the grain.' },
  { key: 'frost', term: 'Frost day', def: 'Here, a day when the lowest air temperature at 2 m is 2 °C or less. It is usually colder at crop height, so this is a cautious sign of frost.' },
  { key: 'heavy', term: 'Heavy-rain day', def: 'A day with 25 mm of rain or more. On bare ground it can wash soil away.' },
  { key: 'cv', term: 'Rain variation', def: 'How much growing-season rain changes from year to year (the standard deviation as a share of the average). The higher it is, the less you can count on an average year.' },
  { key: 'wetness', term: 'Soil wetness', def: 'NASA\'s model estimate of how full the topsoil is, from 0 (dry) to 1 (soaked). Sowing into moist soil helps crops establish.' },
  { key: 'ndvi', term: 'Greenness (NDVI)', def: 'A satellite measure of how green and leafy the ground is, from about 0 (bare soil) to 0.9 (dense crop). Below 0.25 we call the ground bare.' },
  { key: 'bare', term: 'Bare ground', def: 'Soil with little plant cover. It warms, dries and erodes faster, and loses organic matter.' },
  { key: 'erosion', term: 'Erosion', def: 'Topsoil blown away by wind or washed away by water. It is worst on bare, sloping ground after heavy rain.' },
  { key: 'crownrot', term: 'Crown rot', def: 'A fungal disease of wheat and barley that builds up when cereal follows cereal. Break crops starve it.' },
  { key: 'oc', term: 'Soil organic carbon', def: 'Carbon from plant and animal matter in the soil. More of it helps soil hold water and nutrients.' },
  { key: 'power', term: 'NASA POWER', def: 'NASA\'s free daily weather and climate data for any point on Earth, built from satellites and weather models.' },
  { key: 'modis', term: 'MODIS', def: 'Instruments on NASA\'s Terra and Aqua satellites. They photograph the whole Earth every one to two days; we use their 250 m greenness images.' },
  { key: 'smap', term: 'SMAP', def: 'NASA\'s Soil Moisture Active Passive satellite, which measures how wet the top few centimetres of soil are.' },
  { key: 'srtm', term: 'SRTM', def: 'The Shuttle Radar Topography Mission: a NASA map of land height, used here to work out slope.' },
];

const BY_KEY = Object.fromEntries(GLOSSARY.map((g) => [g.key, g]));
export const define = (key) => BY_KEY[key]?.def || '';
