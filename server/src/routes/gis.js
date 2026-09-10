const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const gisController = require('../controllers/gisController');

// All GIS endpoints require authentication
router.use(authenticate);

// 1. Unified Search
router.get('/search', gisController.searchGis);

// 2. Spatial Nearby Intelligence
router.get('/nearby', gisController.getNearbyIntelligence);

// 3. Area Intelligence Drawer Data
router.get('/area-intelligence', gisController.getAreaIntelligence);

// 4. Route-Based Camera Discovery
router.post('/route-cameras', gisController.discoverRouteCameras);
router.get('/route-cameras', gisController.discoverRouteCameras);

// 5. CCTV Coverage Gap Analysis
router.get('/coverage', gisController.getCoverageAnalysis);

// 6. Critical Infrastructure Assets
router.get('/infrastructure', gisController.getInfrastructureAssets);
router.post('/infrastructure', authorize('ADMIN'), gisController.createInfrastructureAsset);

// 7. Operational Zones & Geofencing
router.get('/zones', gisController.getOperationalZones);
router.post('/zones', authorize('ADMIN', 'POLICE'), gisController.createOperationalZone);
router.patch('/zones/:id', authorize('ADMIN', 'POLICE'), gisController.updateOperationalZone);
router.delete('/zones/:id', authorize('ADMIN'), gisController.deleteOperationalZone);

// 8. Incident Context & Surrounding Evidence Workflow
router.get('/incident/:id/context', gisController.getIncidentContext);

// 9. Incidents
router.get('/incidents', gisController.getGisIncidents);
router.post('/incidents', authorize('ADMIN', 'POLICE', 'TRAFFIC_POLICE'), gisController.createGisIncident);
router.patch('/incidents/:id/status', authorize('ADMIN', 'POLICE', 'TRAFFIC_POLICE'), gisController.updateGisIncidentStatus);
router.delete('/incidents/:id', authorize('ADMIN'), gisController.deleteGisIncident);

module.exports = router;
