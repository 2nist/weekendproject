/**
 * Test script to verify Essentia.js loading and basic functionality
 */

console.log('Testing Essentia.js integration...\n');

// Test 1: Check if package is installed
console.log('1. Checking if essentia.js package is installed...');
try {
  const packagePath = require.resolve('essentia.js');
  console.log(`   Package found at: ${packagePath}`);
} catch (error) {
  console.error(`   Package not found: ${error.message}`);
  console.error('   Please run: npm install essentia.js');
  process.exit(1);
}

// Test 2: Try to load the module
console.log('\n2. Attempting to load essentia.js module...');
let essentiaModule;
try {
  essentiaModule = require('essentia.js');
  console.log('   Module loaded');
  console.log('   Module keys:', Object.keys(essentiaModule).slice(0, 10).join(', '), '...');
} catch (error) {
  console.error(`   Failed to load module: ${error.message}`);
  console.error('   Stack:', error.stack);
  process.exit(1);
}

// Test 3: Check for Essentia constructor
console.log('\n3. Checking for Essentia constructor...');
let EssentiaFactory = null;
let EssentiaWASM = null;

if (essentiaModule.Essentia) {
  EssentiaFactory = essentiaModule.Essentia;
  console.log('   Found Essentia constructor');
} else if (essentiaModule.default && essentiaModule.default.Essentia) {
  EssentiaFactory = essentiaModule.default.Essentia;
  console.log('   Found Essentia constructor (nested in default)');
} else if (typeof essentiaModule === 'function') {
  EssentiaFactory = essentiaModule;
  console.log('   Module itself is the constructor');
} else {
  console.error('   Essentia constructor not found');
  console.error('   Available keys:', Object.keys(essentiaModule).join(', '));
  process.exit(1);
}

// Test 4: Check for EssentiaWASM
console.log('\n4. Checking for EssentiaWASM...');
if (essentiaModule.EssentiaWASM) {
  EssentiaWASM = essentiaModule.EssentiaWASM;
  console.log('   Found EssentiaWASM');
} else if (essentiaModule.default && essentiaModule.default.EssentiaWASM) {
  EssentiaWASM = essentiaModule.default.EssentiaWASM;
  console.log('   Found EssentiaWASM (nested in default)');
} else {
  console.warn('   EssentiaWASM not found directly, will try to load from dist');
  
  // Try alternative paths
  try {
    EssentiaWASM = require('essentia.js/dist/essentia-wasm.node.js');
    console.log('   Found EssentiaWASM at dist/essentia-wasm.node.js');
  } catch (e1) {
    try {
      EssentiaWASM = require('essentia.js/dist/essentia-wasm.umd.js');
      console.log('   Found EssentiaWASM at dist/essentia-wasm.umd.js');
    } catch (e2) {
      try {
        EssentiaWASM = require('essentia.js/dist/essentia-wasm.web.js');
        console.log('   Found EssentiaWASM at dist/essentia-wasm.web.js');
      } catch (e3) {
        console.error('   Could not find EssentiaWASM in any location');
        console.error('   Tried:', e3.message);
      }
    }
  }
}

// Test 5: Try to instantiate Essentia
console.log('\n5. Attempting to instantiate Essentia...');
if (!EssentiaWASM) {
  console.error('   Cannot instantiate without EssentiaWASM');
  process.exit(1);
}

if (typeof EssentiaFactory !== 'function') {
  console.error(`   EssentiaFactory is not a function (got: ${typeof EssentiaFactory})`);
  process.exit(1);
}

// Test 5: Try to instantiate Essentia (async)
(async function() {
  try {
    // EssentiaWASM might be a function that returns a Promise
    let wasmModule = EssentiaWASM;
    if (typeof EssentiaWASM === 'function') {
      console.log('   EssentiaWASM is a function, calling it...');
      wasmModule = await EssentiaWASM();
      console.log('   EssentiaWASM function resolved');
    }
    
    const essentia = new EssentiaFactory(wasmModule);
    console.log('   Essentia instance created successfully');
    
    // Test 6: Try a simple operation
    console.log('\n6. Testing basic Essentia operation...');
    try {
      // Create a simple test signal
      const testSignal = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
      
      // Check if arrayToVector exists
      if (typeof essentia.arrayToVector === 'function') {
        console.log('   arrayToVector method exists');
        const vector = essentia.arrayToVector(testSignal);
        console.log('   Created vector from array');
        
        // Try a simple algorithm
        if (typeof essentia.RMS === 'function') {
          const rms = essentia.RMS(vector);
          console.log(`   RMS calculation successful: ${rms}`);
        }
        
        // Cleanup
        if (vector && vector.delete && typeof vector.delete === 'function') {
          vector.delete();
        }
      } else {
        console.warn('   arrayToVector method not found');
      }
      
      console.log('\nAll tests passed! Essentia.js is working correctly.');
    } catch (testError) {
      console.error(`   Test operation failed: ${testError.message}`);
      console.error('   Stack:', testError.stack);
      process.exit(1);
    }
  } catch (error) {
    console.error(`   Failed to instantiate Essentia: ${error.message}`);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
})();

