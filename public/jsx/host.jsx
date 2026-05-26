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

// ---------------------------------------------------------------------------
// XMP persistence
// ---------------------------------------------------------------------------
// Workbench state is serialized as a JSON string and stored in the .aep's
// XMP packet under a custom namespace. AE writes the packet to disk on
// project save; until then the data lives in memory only.
//
// Namespace URI: http://custom.ag.agex/   Prefix: agex   Property: workbench
// ---------------------------------------------------------------------------

var AGEX_NS = "http://custom.ag.agex/";
var AGEX_PREFIX = "agex";
var AGEX_PROP = "workbench";
var __agexXMPReady = false;

// AppData log path: %AppData%/Roaming/AG-Extensions/agex/log/current-state.json
function getAgexLogFile() {
    var base = Folder.userData.fsName + "/AG-Extensions/agex/log";
    var folder = new Folder(base);
    if (!folder.exists) folder.create();
    return new File(base + "/current-state.json");
}

function writeAgexLog(jsonString) {
    try {
        var f = getAgexLogFile();
        f.encoding = "UTF-8";
        f.open("w");
        f.write(jsonString);
        f.close();
        return true;
    } catch (e) { return false; }
}

function clearStateLog() {
    try {
        var f = getAgexLogFile();
        if (f.exists) f.remove();
        return '{"success": true}';
    } catch (e) {
        var safe = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safe + '"}';
    }
}

function getProjectFingerprint() {
    try {
        var proj = app.project;
        if (!proj) {
            return '{"success": true, "open": false}';
        }
        var fsName = "";
        var modifiedTime = 0;
        if (proj.file) {
            fsName = proj.file.fsName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            try {
                modifiedTime = proj.file.modified ? proj.file.modified.getTime() : 0;
            } catch (e) { modifiedTime = 0; }
        }
        var dirty = (proj.dirty === true) ? 'true' : 'false';
        return '{"success": true, "open": true, "fsName": "' + fsName + '", "dirty": ' + dirty + ', "modifiedTime": ' + modifiedTime + '}';
    } catch (e) {
        var safe = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safe + '"}';
    }
}

function ensureXMP() {
    if (__agexXMPReady) return true;
    try {
        if (typeof ExternalObject.AdobeXMPScript === "undefined"
            || ExternalObject.AdobeXMPScript === null) {
            ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
        }
        XMPMeta.registerNamespace(AGEX_NS, AGEX_PREFIX);
        __agexXMPReady = true;
        return true;
    } catch (e) {
        return false;
    }
}

function escapeForJSON(s) {
    return s
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
}

function saveWorkbenchState(payloadString) {
    try {
        if (!ensureXMP()) {
            return '{"success": false, "message": "Could not load AdobeXMPScript."}';
        }
        var proj = app.project;
        if (!proj) {
            return '{"success": false, "message": "No project open."}';
        }

        var payload = eval("(" + payloadString + ")");
        var jsonString = (typeof payload === "string") ? payload : payload.json;
        if (typeof jsonString !== "string") {
            return '{"success": false, "message": "Expected { json: string } payload."}';
        }

        var xmp = new XMPMeta(proj.xmpPacket || "");
        xmp.setProperty(AGEX_NS, AGEX_PROP, jsonString);
        proj.xmpPacket = xmp.serialize();

        // Best-effort mirror to AppData log for crash recovery. Don't fail
        // the XMP write if disk logging hiccups.
        writeAgexLog(jsonString);

        return '{"success": true, "message": "Workbench state saved to XMP."}';

    } catch (e) {
        var safe = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safe + '"}';
    }
}

function loadWorkbenchState() {
    try {
        if (!ensureXMP()) {
            return '{"success": false, "message": "Could not load AdobeXMPScript."}';
        }
        var proj = app.project;
        if (!proj) {
            return '{"success": false, "message": "No project open."}';
        }

        var xmp = new XMPMeta(proj.xmpPacket || "");
        if (!xmp.doesPropertyExist(AGEX_NS, AGEX_PROP)) {
            return '{"success": true, "found": false, "data": ""}';
        }

        var propObj = xmp.getProperty(AGEX_NS, AGEX_PROP);
        // XMPProperty wraps the string in .value; defend against both shapes.
        var value = "";
        if (propObj) {
            value = (typeof propObj.value === "string") ? propObj.value : String(propObj);
        }

        return '{"success": true, "found": true, "data": "' + escapeForJSON(value) + '"}';

    } catch (e) {
        var safe = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safe + '"}';
    }
}

// ---------------------------------------------------------------------------
// Composition scan: walk the active comp and report every property that has
// a non-empty expression. React groups the results by (matchName, expression)
// for import into the Workbench.
// ---------------------------------------------------------------------------

function _agexWalkProps(propertyGroup, layer, out) {
    if (!propertyGroup.numProperties) return;
    for (var i = 1; i <= propertyGroup.numProperties; i++) {
        var prop = propertyGroup.property(i);
        if (prop.propertyType === PropertyType.NAMED_GROUP
            || prop.propertyType === PropertyType.INDEXED_GROUP) {
            _agexWalkProps(prop, layer, out);
        } else if (prop.canSetExpression && prop.expression && prop.expression.length > 0) {
            out.push({
                layerId: layer.id,
                layerName: layer.name,
                matchName: prop.matchName,
                displayName: prop.name,
                expression: prop.expression
            });
        }
    }
}

// ---------------------------------------------------------------------------
// Clear an expression on specific (layerId, matchName) pairs. Used when a
// user removes a layer from a Workbench binding.
// ---------------------------------------------------------------------------
function clearExpression(payloadString) {
    try {
        var payload = eval("(" + payloadString + ")");
        var layerIds = payload.layerIds || [];
        var matchName = payload.matchName;
        if (!matchName) {
            return '{"success": false, "message": "matchName required."}';
        }

        var cleared = 0;
        app.beginUndoGroup("agex: Clear Expression");
        for (var i = 0; i < layerIds.length; i++) {
            var layer = app.project.layerByID(layerIds[i]);
            if (!layer) continue;
            var prop = findPropertyByMatchName(layer, matchName);
            if (prop && prop.canSetExpression) {
                prop.expression = "";
                cleared++;
            }
        }
        app.endUndoGroup();

        return '{"success": true, "cleared": ' + cleared + '}';
    } catch (e) {
        var safe = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safe + '"}';
    }
}

function scanCompositionExpressions() {
    try {
        var proj = app.project;
        if (!proj || !proj.activeItem || !(proj.activeItem instanceof CompItem)) {
            return '{"success": false, "message": "No active composition."}';
        }
        var comp = proj.activeItem;
        var results = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            _agexWalkProps(comp.layer(i), comp.layer(i), results);
        }
        var parts = [];
        for (var j = 0; j < results.length; j++) {
            var r = results[j];
            parts.push(
                '{"layerId":' + r.layerId +
                ',"layerName":"' + escapeForJSON(r.layerName) +
                '","matchName":"' + r.matchName +
                '","displayName":"' + escapeForJSON(r.displayName) +
                '","expression":"' + escapeForJSON(r.expression) + '"}'
            );
        }
        return '{"success":true,"compId":' + comp.id + ',"results":[' + parts.join(',') + ']}';
    } catch (e) {
        var safe = e.toString().replace(/"/g, "'");
        return '{"success": false, "message": "' + safe + '"}';
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