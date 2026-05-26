function smartInject(payloadString) {
    try {
        var payload = eval("(" + payloadString + ")");
        var expr = payload.expression;
        var fallbackMatchName = payload.targetProperty;
        var fallbackLayerIds = payload.layerIds;

        var proj = app.project;
        if (!proj || !proj.activeItem || !(proj.activeItem instanceof CompItem)) {
            return '{"success": false, "message": "Please select an active composition."}';
        }

        var comp = proj.activeItem;
        var selectedProps = comp.selectedProperties;
        var successCount = 0;

        // NEW: Storing both ID and Name
        var resultLayers = []; 
        var resultProperties = [];

        app.beginUndoGroup("agex: Smart Inject");

        if (selectedProps.length > 0) {
            var uniqueProps = {};
            var uniqueLayers = {};

            for (var i = 0; i < selectedProps.length; i++) {
                var prop = selectedProps[i];
                
                if (prop.canSetExpression) {
                    prop.expression = expr;
                    successCount++;

                    if (!uniqueProps[prop.matchName]) {
                        uniqueProps[prop.matchName] = true;
                        var safePropName = prop.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        resultProperties.push('{"matchName": "' + prop.matchName + '", "displayName": "' + safePropName + '"}');
                    }

                    var layer = prop.propertyGroup(prop.propertyDepth);
                    if (layer && !uniqueLayers[layer.id]) {
                        uniqueLayers[layer.id] = true;
                        var safeLayerName = layer.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                        resultLayers.push('{"id": ' + layer.id + ', "name": "' + safeLayerName + '"}');
                    }
                }
            }
        } 
        else if (fallbackLayerIds && fallbackLayerIds.length > 0) {
            var uniqueFallbackLayers = {};

            for (var j = 0; j < fallbackLayerIds.length; j++) {
                var layerId = fallbackLayerIds[j];
                var fallbackLayer = app.project.layerByID(layerId);
                
                if (fallbackLayer !== null) {
                    var targetProp = findPropertyByMatchName(fallbackLayer, fallbackMatchName);
                    
                    if (targetProp !== null && targetProp.canSetExpression) {
                        targetProp.expression = expr;
                        successCount++;
                        
                        if (!uniqueFallbackLayers[layerId]) {
                            uniqueFallbackLayers[layerId] = true;
                            var safeFallbackLayerName = fallbackLayer.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                            resultLayers.push('{"id": ' + layerId + ', "name": "' + safeFallbackLayerName + '"}');
                        }
                        if (resultProperties.length === 0) {
                            var safeFallbackName = targetProp.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                            resultProperties.push('{"matchName": "' + targetProp.matchName + '", "displayName": "' + safeFallbackName + '"}');
                        }
                    }
                }
            }
        } else {
             return '{"success": false, "message": "Select properties in the timeline to inject."}';
        }

        app.endUndoGroup();

        var jsonString = '{"success": true, ';
        jsonString += '"message": "Injected into ' + successCount + ' properties.", ';
        jsonString += '"layers": [' + resultLayers.join(',') + '], ';
        jsonString += '"properties": [' + resultProperties.join(',') + ']';
        jsonString += '}';

        return jsonString;

    } catch (e) {
        var safeError = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safeError + '"}';
    }
}


/**
 * Helper Function: Recursively search a layer or property group 
 * to find a specific property by its matchName.
 */
function findPropertyByMatchName(propertyGroup, matchName) {
    // If this object doesn't have properties (like a raw value), bail out
    if (!propertyGroup.numProperties) return null;
    
    for (var i = 1; i <= propertyGroup.numProperties; i++) {
        var prop = propertyGroup.property(i);
        
        // We found a match
        if (prop.matchName === matchName) {
            return prop;
        }
        
        // If this property is a group (like "Transform" or an "Effect"), search inside it
        if (prop.propertyType === PropertyType.NAMED_GROUP || prop.propertyType === PropertyType.INDEXED_GROUP) {
            var found = findPropertyByMatchName(prop, matchName);
            if (found !== null) {
                return found; // Pass it back up the chain
            }
        }
    }
    
    // Nothing found in this branch
    return null;
}

function getSelectedContext() {
    try {
        var proj = app.project;
        
        if (!proj || !proj.activeItem || !(proj.activeItem instanceof CompItem)) {
            return '{"success": false, "message": "Please select an active composition."}';
        }

        var comp = proj.activeItem;
        var selectedLayers = comp.selectedLayers;
        var selectedProps = comp.selectedProperties;

        if (selectedLayers.length === 0) {
            return '{"success": false, "message": "No layers selected."}';
        }

        // 1. Extract Layer IDs
        var layerIds = [];
        for (var i = 0; i < selectedLayers.length; i++) {
            layerIds.push(selectedLayers[i].id);
        }

        // 2. Extract unique Properties (only those that can take expressions)
        var uniqueProps = {};
        var propsArray = [];
        
        for (var j = 0; j < selectedProps.length; j++) {
            var prop = selectedProps[j];
            
            // Filter out things like entire folders/groups, only grab expression-ready props
            if (prop.canSetExpression && !uniqueProps[prop.matchName]) {
                uniqueProps[prop.matchName] = true;
                
                var safeName = prop.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                propsArray.push('{"matchName": "' + prop.matchName + '", "displayName": "' + safeName + '"}');
            }
        }

        // 3. Manually construct the JSON payload
        var jsonString = '{"success": true, ';
        jsonString += '"layerIds": [' + layerIds.join(',') + '], ';
        jsonString += '"properties": [' + propsArray.join(',') + ']';
        jsonString += '}';

        return jsonString;

    } catch (e) {
        var safeError = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safeError + '"}';
    }
}

function getActiveCompContext() {
    try {
        var proj = app.project;
        
        if (!proj || !proj.activeItem || !(proj.activeItem instanceof CompItem)) {
            return '{"success": false, "message": "No active composition."}';
        }

        var comp = proj.activeItem;
        var safeName = comp.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        
        // We return the comp ID so React can use it as a database key later
        return '{"success": true, "compId": ' + comp.id + ', "compName": "' + safeName + '"}';

    } catch (e) {
        var safeError = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safeError + '"}';
    }
}

function peekSelection() {
    try {
        var proj = app.project;
        
        if (!proj || !proj.activeItem || !(proj.activeItem instanceof CompItem)) {
            return '{"success": false, "message": "No active composition."}';
        }

        var comp = proj.activeItem;
        var selectedProps = comp.selectedProperties;

        if (selectedProps.length === 0) {
            return '{"success": false, "message": "No properties selected in timeline."}';
        }

        var resultLayers = [];
        var resultProperties = [];
        var uniqueProps = {};
        var uniqueLayers = {};

        for (var i = 0; i < selectedProps.length; i++) {
            var prop = selectedProps[i];
            
            if (prop.canSetExpression) {
                if (!uniqueProps[prop.matchName]) {
                    uniqueProps[prop.matchName] = true;
                    var safePropName = prop.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    resultProperties.push('{"matchName": "' + prop.matchName + '", "displayName": "' + safePropName + '"}');
                }

                var layer = prop.propertyGroup(prop.propertyDepth);
                if (layer && !uniqueLayers[layer.id]) {
                    uniqueLayers[layer.id] = true;
                    var safeLayerName = layer.name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                    resultLayers.push('{"id": ' + layer.id + ', "name": "' + safeLayerName + '"}');
                }
            }
        }

        if (resultLayers.length === 0) {
            return '{"success": false, "message": "Selected properties cannot accept expressions."}';
        }

        var jsonString = '{"success": true, ';
        jsonString += '"layers": [' + resultLayers.join(',') + '], ';
        jsonString += '"properties": [' + resultProperties.join(',') + ']';
        jsonString += '}';

        return jsonString;

    } catch (e) {
        var safeError = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safeError + '"}';
    }
}