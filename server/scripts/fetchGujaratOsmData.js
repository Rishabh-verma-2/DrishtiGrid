/**
 * Script to fetch live Gujarat Critical Infrastructure (Police Stations,
 * Hospitals, Fire Stations, Airports, Railway Stations) from OpenStreetMap
 * via the Overpass API.
 *
 * Usage:
 *   node scripts/fetchGujaratOsmData.js [--save-db] [--save-json] [--district=Ahmedabad]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Gujarat Bounding Box [south, west, north, east]
const GUJARAT_BBOX = '20.0,68.0,24.8,74.5';

const DISTRICT_BBOXES = {
  Ahmedabad: '22.8,72.4,23.3,72.8',
  Gandhinagar: '23.1,72.5,23.4,72.8',
  Surat: '21.0,72.7,21.3,73.0',
  Vadodara: '22.2,73.1,22.4,73.3',
  Rajkot: '22.2,70.7,22.4,70.9',
};

async function queryOverpass(qlQuery) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      console.log(`📡 Querying Overpass API via: ${endpoint}...`);
      const response = await axios.post(
        endpoint,
        `data=${encodeURIComponent(qlQuery)}`,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 45000,
        }
      );
      if (response.data && response.data.elements) {
        return response.data.elements;
      }
    } catch (err) {
      console.warn(`⚠️ Endpoint ${endpoint} failed: ${err.message}. Trying next...`);
    }
  }
  throw new Error('All Overpass API endpoints failed or timed out.');
}

function mapOsmTypeToAssetType(tags) {
  if (tags.amenity === 'police') return 'POLICE_STATION';
  if (tags.amenity === 'hospital' || tags.healthcare === 'hospital') return 'HOSPITAL';
  if (tags.amenity === 'fire_station') return 'FIRE_STATION';
  if (tags.aeroway === 'aerodrome') return 'AIRPORT';
  if (tags.railway === 'station') return 'RAILWAY_STATION';
  if (tags.amenity === 'bus_station') return 'BUS_TERMINAL';
  if (tags.bridge === 'yes' || tags.man_made === 'bridge') return 'BRIDGE';
  if (tags.office === 'government' || tags.amenity === 'courthouse') return 'GOVERNMENT_OFFICE';
  return 'OTHER';
}

function inferDistrict(lat, lon, tags) {
  if (tags['addr:district']) return tags['addr:district'];
  if (tags['addr:city']) {
    const city = tags['addr:city'].toLowerCase();
    if (city.includes('ahmedabad')) return 'Ahmedabad';
    if (city.includes('surat')) return 'Surat';
    if (city.includes('vadodara')) return 'Vadodara';
    if (city.includes('rajkot')) return 'Rajkot';
    if (city.includes('gandhinagar')) return 'Gandhinagar';
  }
  // Rough coordinate heuristics
  if (lat >= 22.8 && lat <= 23.3 && lon >= 72.3 && lon <= 72.8) return 'Ahmedabad';
  if (lat >= 21.0 && lat <= 21.4 && lon >= 72.6 && lon <= 73.1) return 'Surat';
  if (lat >= 22.1 && lat <= 22.5 && lon >= 73.0 && lon <= 73.4) return 'Vadodara';
  if (lat >= 22.1 && lat <= 22.5 && lon >= 70.6 && lon <= 71.0) return 'Rajkot';
  if (lat >= 23.1 && lat <= 23.4 && lon >= 72.5 && lon <= 72.8) return 'Gandhinagar';
  return 'Gujarat';
}

async function run() {
  const args = process.argv.slice(2);
  const saveDb = args.includes('--save-db');
  const saveJson = args.includes('--save-json') || !saveDb;
  const targetDistrict = args.find((a) => a.startsWith('--district='))?.split('=')[1];

  const bbox = targetDistrict && DISTRICT_BBOXES[targetDistrict]
    ? DISTRICT_BBOXES[targetDistrict]
    : GUJARAT_BBOX;

  console.log(`\n=============================================================`);
  console.log(`   FETCHING GUJARAT INFRASTRUCTURE FROM OPENSTREETMAP (OSM)   `);
  console.log(`   Scope: ${targetDistrict || 'All Gujarat State'} (BBOX: ${bbox})`);
  console.log(`=============================================================\n`);

  const overpassQL = `
    [out:json][timeout:60];
    (
      node["amenity"="police"](${bbox});
      node["amenity"="hospital"](${bbox});
      node["amenity"="fire_station"](${bbox});
      node["aeroway"="aerodrome"](${bbox});
      node["railway"="station"](${bbox});
    );
    out body;
  `;

  try {
    const elements = await queryOverpass(overpassQL);
    console.log(`✅ Successfully fetched ${elements.length} raw infrastructure nodes from OSM.\n`);

    const assets = elements
      .filter((el) => el.tags && (el.tags.name || el.tags['name:en']))
      .map((el, idx) => {
        const type = mapOsmTypeToAssetType(el.tags);
        const name = el.tags['name:en'] || el.tags.name;
        const district = inferDistrict(el.lat, el.lon, el.tags);
        const city = el.tags['addr:city'] || district;

        return {
          assetId: `OSM-${type.substring(0, 4)}-${el.id}`,
          name: name.trim(),
          type,
          location: {
            type: 'Point',
            coordinates: [el.lon, el.lat],
          },
          latitude: el.lat,
          longitude: el.lon,
          district,
          city,
          address: {
            full: el.tags['addr:full'] || `${name}, ${city}, Gujarat`,
            street: el.tags['addr:street'] || '',
            pincode: el.tags['addr:postcode'] || '',
          },
          emergencyContact: {
            phone: el.tags.phone || el.tags['contact:phone'] || (type === 'POLICE_STATION' ? '100 / 112' : type === 'FIRE_STATION' ? '101' : '108'),
            altPhone: type === 'POLICE_STATION' ? '112' : '108',
            email: el.tags.email || '',
          },
          metadata: {
            osmId: el.id,
            wheelchair: el.tags.wheelchair || 'unknown',
            openingHours: el.tags.opening_hours || '24/7',
            source: 'OpenStreetMap Overpass API',
          },
          status: 'OPERATIONAL',
          verifiedAt: new Date(),
        };
      });

    console.log(`📦 Processed ${assets.length} named facilities across Gujarat:`);
    const breakdown = assets.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    console.table(breakdown);

    if (saveJson) {
      const dataDir = path.join(__dirname, '../data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      const outputPath = path.join(dataDir, 'gujarat_osm_infrastructure.json');
      fs.writeFileSync(outputPath, JSON.stringify(assets, null, 2), 'utf-8');
      console.log(`\n💾 Saved ${assets.length} assets to ${outputPath}`);
    }

    if (saveDb) {
      console.log('\n🔄 Connecting to MongoDB to upsert infrastructure assets...');
      const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/drishtigrid';
      await mongoose.connect(mongoUri);
      const InfrastructureAsset = require('../src/models/InfrastructureAsset');

      console.log(`⚡ Executing bulkWrite for ${assets.length} assets...`);
      const BATCH_SIZE = 500;
      let totalUpserted = 0;
      let totalModified = 0;

      for (let i = 0; i < assets.length; i += BATCH_SIZE) {
        const chunk = assets.slice(i, i + BATCH_SIZE);
        const operations = chunk.map((asset) => ({
          updateOne: {
            filter: {
              $or: [
                { 'metadata.osmId': asset.metadata.osmId },
                { name: asset.name, district: asset.district },
              ],
            },
            update: { $set: asset },
            upsert: true,
          },
        }));

        const res = await InfrastructureAsset.bulkWrite(operations, { ordered: false });
        totalUpserted += res.upsertedCount || 0;
        totalModified += res.modifiedCount || 0;
        console.log(`   Processed batch ${Math.min(i + BATCH_SIZE, assets.length)}/${assets.length}...`);
      }

      console.log(`✅ MongoDB Update Complete: ${totalUpserted} inserted, ${totalModified} updated.`);
      await mongoose.disconnect();
    }

    console.log('\n🎉 Finished processing Gujarat infrastructure from OpenStreetMap.');
  } catch (err) {
    console.error('❌ Error fetching from Overpass API:', err.message);
  }
}

if (require.main === module) {
  run();
}

module.exports = { queryOverpass, mapOsmTypeToAssetType, inferDistrict };
