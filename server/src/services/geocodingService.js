/**
 * Reverse geocoding service.
 * Converts latitude and longitude coordinates to a human-readable street address.
 * Safely handles missing/invalid API keys with graceful null return.
 */

const axios = require("axios");

/**
 * Reverse geocode latitude and longitude.
 * @param {number|string|null} lat
 * @param {number|string|null} lng
 * @returns {Promise<string|null>}
 */
async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) return null;

  const apiKey = process.env.GEOCODING_API_KEY;

  // 1. If Google Maps / Geocoding API key is provided
  if (apiKey && apiKey.trim()) {
    try {
      const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
        params: {
          latlng: `${latitude},${longitude}`,
          key: apiKey.trim(),
        },
        timeout: 5000,
      });

      if (response.data && response.data.results && response.data.results.length > 0) {
        return response.data.results[0].formatted_address;
      }
    } catch (err) {
      console.warn("Google Geocoding API request failed:", err.message);
    }
  }

  // 2. Free OpenStreetMap Nominatim fallback
  try {
    const response = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: {
        lat: latitude,
        lon: longitude,
        format: "json",
      },
      headers: {
        "User-Agent": "DrishtiGrid-ANPR-System/1.0",
      },
      timeout: 5000,
    });

    if (response.data && response.data.display_name) {
      return response.data.display_name;
    }
  } catch (err) {
    // Non-fatal fallback
  }

  return null;
}

module.exports = {
  reverseGeocode,
};
