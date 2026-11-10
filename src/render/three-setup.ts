import * as THREE from 'three';

// Match the prototype's r128 look: colours used as-is with no sRGB↔linear conversion.
// Must run before any material or THREE.Color is created, so every render module imports this first.
THREE.ColorManagement.enabled = false;
