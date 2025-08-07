// Initialize the map
var map = new maplibregl.Map({
  container: 'map',
  style: 'style.json',
  center: [-73.97144, 40.70491],
  zoom: 6,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl());

// Parse CSV data and convert to GeoJSON
function parseCSVToGeoJSON(csvString) {
    const parsed = Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        delimitersToGuess: [',', '\t', '|', ';']
    });

const features = [];

const isValidCoord = val => val !== "NA" && val !== null && val.trim() !== "" && !isNaN(parseFloat(val));
    
    parsed.data.forEach((row, index) => {
        // Clean headers by trimming whitespace
        const cleanedRow = {};
        Object.keys(row).forEach(key => {
            const cleanKey = key.trim();
            cleanedRow[cleanKey] = row[key];
        });

        // Check for valid plant coordinates
        const plantLatRaw = cleanedRow['Plant_Lat']?.toString().trim();
        const plantLongRaw = cleanedRow['Plant_Long']?.toString().trim();
        const hasValidPlant = isValidCoord(plantLatRaw) && isValidCoord(plantLongRaw);

        const fungLatRaw = cleanedRow['Fung_Lat']?.toString().trim();
        const fungLongRaw = cleanedRow['Fung_Long']?.toString().trim();
        const hasValidFung = isValidCoord(fungLatRaw) && isValidCoord(fungLongRaw);

        coordinates: [parseFloat(plantLongRaw), parseFloat(plantLatRaw)]

        console.log(`Valid plant: ${plantLatRaw}, ${plantLongRaw}`);
        console.log(`Valid fungus: ${fungLatRaw}, ${fungLongRaw}`);

        



        // Create fungal feature if coordinates are valid
        if (hasValidFung) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [parseFloat(fungLongRaw), parseFloat(fungLatRaw)]
                },
                properties: {
                    type: 'Fungus',
                    PlantSpecies: cleanedRow['PlantSpecies'] || 'Unknown',
                    FungalGenus: cleanedRow['FungalGenus'] || 'Unknown',
                    ...cleanedRow
                }
            });
        }
    });

    console.log(`Created ${features.length} features from ${parsed.data.length} rows`);
    
    return {
        type: 'FeatureCollection',
        features: features
    };
}

function createPopupContent(properties) {
    const isPlant = properties.type === 'Plant';
    const title = isPlant ? properties.PlantSpecies : properties.FungalGenus;
    const subtitle = isPlant ? `Plant (${properties.PlantFamily})` : `Fungus (Partner: ${properties.PlantSpecies})`;
    
    return `
        <div class="popup-content" style="font-family: 'Courier New', monospace;">
            <div class="popup-title" style="font-family: 'Courier New', monospace;">${title}</div>
            <div class="popup-field" style="font-family: 'Courier New', monospace;">
                <span class="popup-label" style="font-family: 'Courier New', monospace;">Type:</span> ${subtitle}
            </div>
            <div class="popup-field" style="font-family: 'Courier New', monospace;">
                <span class="popup-label" style="font-family: 'Courier New', monospace;">Functional Group:</span> ${properties.FUNGROUP}
            </div>
            <div class="popup-field" style="font-family: 'Courier New', monospace;">
                <span class="popup-label" style="font-family: 'Courier New', monospace;">Location:</span> ${properties.LOCATION}
            </div>
            <div class="popup-field" style="font-family: 'Courier New', monospace;">
                <span class="popup-label" style="font-family: 'Courier New', monospace;">Status:</span> ${properties.DOMESTICATED}
            </div>
            ${isPlant ? `<div class="popup-field" style="font-family: 'Courier New', monospace;">
                <span class="popup-label" style="font-family: 'Courier New', monospace;">Life History:</span> ${properties.PLANTLIFEHISTORY}
            </div>` : ''}
        </div>
    `;
}

// Load CSV file and initialize map
async function loadCSVAndInitializeMap() {
    try {
        // Fetch the CSV file
        const response = await fetch('MycoDB_version4edit.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        console.log('CSV loaded successfully');
        
        // Initialize the map
        var map = new maplibregl.Map({
            container: 'map',
            style: 'style.json', // Use your local style file
            center: [15, 15], // Global center
            zoom: 2 // Zoomed out to see all points globally
        });

        // Add navigation controls
        map.addControl(new maplibregl.NavigationControl());

// Wait for the map to load
    map.on('load', () => {
        console.log('Map loaded, processing data...');
        try {
            // Parse CSV to GeoJSON
            const geoJsonData = parseCSVToGeoJSON(csvText);
            console.log('Parsed data:', geoJsonData);

            if (geoJsonData.features.length === 0) {
                console.error('No valid features created from CSV data');
                document.getElementById('map').innerHTML = '<div style="color: red; padding: 20px;">No valid coordinate data found in CSV file.</div>';
                return;
            }
    

            // Create connecting lines between plants and their fungal partners
            const lineFeatures = [];
            const plantFeatures = geoJsonData.features.filter(f => f.properties.type === 'Plant');
            const fungusFeatures = geoJsonData.features.filter(f => f.properties.type === 'Fungus');
            
            // Create connections between related plants and fungi
            plantFeatures.forEach(plant => {
                fungusFeatures.forEach(fungus => {
                    // Connect if they share the same plant species and fungal genus
                    if (plant.properties.PlantSpecies === fungus.properties.PlantSpecies &&
                        plant.properties.FungalGenus === fungus.properties.FungalGenus) {
                        lineFeatures.push({
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: [
                                    plant.geometry.coordinates,
                                    fungus.geometry.coordinates
                                ]
                            },
                            properties: {
                                'start-species': plant.properties.PlantSpecies,
                                'end-genus': fungus.properties.FungalGenus,
                                'fungroup': plant.properties.FUNGROUP
                            }
                        });
                    }
                });
            });

            const lineGeoJSON = {
                type: 'FeatureCollection',
                features: lineFeatures
            };

            console.log(`Created ${lineFeatures.length} connection lines between ${plantFeatures.length} plants and ${fungusFeatures.length} fungi`);

            // Add the point data as a source
            map.addSource('mycorrhizal-networks', {
                type: 'geojson',
                data: geoJsonData
            });

            // Add the line data as a source
            map.addSource('connection-lines', {
                type: 'geojson',
                data: lineGeoJSON
            });

            // Add line layer first (so it appears behind circles)
            map.addLayer({
                id: 'connection-lines-layer',
                type: 'line',
                source: 'connection-lines',
                paint: {
                    'line-color': [
                        'match',
                        ['get', 'fungroup'],
                        'Nfixforb', '#f36e37',
                        'nonNforb', '#ec2c3d',
                        'nonNwood', '#816182',
                        'Nfixwood', '#d98948',
                        '#666666' // default color
                    ],
                    'line-width': 2,
                    'line-opacity': 0.5
                }
            });

                // Add a circle layer to visualize the data
                map.addLayer({
                    id: 'projects-layer',
                    type: 'circle',
                    source: 'mycorrhizal-networks',
                    paint: {
                        'circle-radius': [
                            'case',
                            ['==', ['get', 'type'], 'Plant'], 8,  // Plants are larger
                            ['==', ['get', 'type'], 'Fungus'], 6, // Fungi are smaller
                            7 // default
                        ],
                        'circle-color': [
                            'match',
                            ['get', 'FUNGROUP'],
                            'Nfixforb', '#f36e37',
                            'nonNforb', '#ec2c3d', 
                            'nonNwood', '#816182',
                            'Nfixwood', '#d98948',
                            '#999999' // default color
                        ],
                        'circle-stroke-color': [
                            'case',
                            ['==', ['get', 'type'], 'Plant'], '#ffffff',  // Plants have white stroke
                            ['==', ['get', 'type'], 'Fungus'], '#000000', // Fungi have black stroke
                            '#ffffff' // default
                        ],
                        'circle-stroke-width': 2,
                        'circle-opacity': 0.8
                    }
                });

                // Add click event for popups
                map.on('click', 'projects-layer', (e) => {
                    const coordinates = e.features[0].geometry.coordinates.slice();
                    const properties = e.features[0].properties;
                    
                    // Ensure that if the map is zoomed out such that multiple
                    // copies of the feature are visible, the popup appears
                    // over the copy being pointed to.
                    while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
                        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
                    }

                    new maplibregl.Popup()
                        .setLngLat(coordinates)
                        .setHTML(createPopupContent(properties))
                        .addTo(map);
                });

                // Add hover effect for circles
                map.on('mouseenter', 'projects-layer', () => {
                    map.getCanvas().style.cursor = 'pointer';
                });

                map.on('mouseleave', 'projects-layer', () => {
                    map.getCanvas().style.cursor = '';
                });

                // Optional: Add hover popup
                let popup = new maplibregl.Popup({
                    closeButton: false,
                    closeOnClick: false
                });

                map.on('mouseenter', 'projects-layer', (e) => {
                    const coordinates = e.features[0].geometry.coordinates.slice();
                    const properties = e.features[0].properties;

                    popup.setLngLat(coordinates)
                        .setHTML(`<div style="font-weight: bold; font-size: 14px; font-family: 'Courier New', monospace;">${properties['project-name']}</div>
                                 <div style="font-size: 12px; color: #666; font-family: 'Courier New', monospace;">${properties['location-city']}</div>`)
                        .addTo(map);
                });

                map.on('mouseleave', 'projects-layer', () => {
                    popup.remove();
                });

            } catch (error) {
                console.error('Error processing CSV data:', error);
            }
        });

    } catch (error) {
        console.error('Error loading CSV file:', error);
        // You could show an error message to the user here
        document.getElementById('map').innerHTML = '<p>Error loading map data. Please check that the CSV file is available.</p>';
    }
}

// Initialize everything when the page loads
document.addEventListener('DOMContentLoaded', function() {
    loadCSVAndInitializeMap();
});