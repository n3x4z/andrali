import createModule from './orientation.js'; // Path to your Emscripten-generated JS file

let calculator;
let moduleReady = false;

createModule().then((Module) => {
  console.log("Browser is WASM compatible :D");
  if (Module && Module.OrientationCalculator) {
    calculator = new Module.OrientationCalculator();
    if (calculator && typeof calculator.getQuaternion === 'function' && typeof calculator.updateQuaternion === 'function') {
      moduleReady = true;
      // self.postMessage({ status: "worker_ready" }); // Optional: notify main thread
    } else {
      console.error("Calculator instance is invalid or methods are missing.");
      self.postMessage({ error: "Calculator methods (getQuaternion/updateQuaternion) not found." });
    }
  } else {
    console.error("Module.OrientationCalculator not found in Wasm module.");
    self.postMessage({ error: "Wasm module structure error: OrientationCalculator missing." });
  }
}).catch(error => {
  console.error("Error initializing Wasm module in worker:", error);
  self.postMessage({ error: "Wasm module initialization failed: " + error.message });
});

self.onmessage = (event) => {
  if (!moduleReady) {
    console.warn("Worker received message before Wasm module was ready. Message ignored.", event.data);
    // Optionally, you could queue messages or send a specific error back
    // self.postMessage({ error: "Worker not ready, message ignored."});
    return;
  }

  const { quaternion: inputQuaternion } = event.data; // Expects [x, y, z, w]

  if (inputQuaternion && Array.isArray(inputQuaternion) && inputQuaternion.length === 4) {
    try {
      // Pass the quaternion components to the C++ function
      calculator.updateQuaternion(inputQuaternion[0], inputQuaternion[1], inputQuaternion[2], inputQuaternion[3]);
      
      // Get the quaternion back from C++
      const resultFromCpp = calculator.getQuaternion();
      let quaternionToPost;

      // Log what we got from C++ for debugging
      // console.log("Raw result from calculator.getQuaternion():", resultFromCpp);
      // console.log("Type of resultFromCpp:", typeof resultFromCpp);

      if (Array.isArray(resultFromCpp)) {
        // It appears Emscripten returned a direct JavaScript array
        // This can happen if the array contains only primitive types.
        // console.log("Interpreting resultFromCpp as a direct JavaScript array.");
        quaternionToPost = resultFromCpp;
        // No .delete() is needed for a direct JS array that isn't an Embind handle.
      } else if (resultFromCpp && typeof resultFromCpp.size === 'function' && typeof resultFromCpp.get === 'function') {
        // It's an Embind handle, as originally expected
        // console.log("Interpreting resultFromCpp as an Embind handle.");
        const tempArray = [];
        const size = resultFromCpp.size();
        for (let i = 0; i < size; i++) {
            tempArray.push(resultFromCpp.get(i));
        }
        resultFromCpp.delete(); // Clean up the C++ side emscripten::val handle
        quaternionToPost = tempArray;
      } else {
        console.error("calculator.getQuaternion() returned an unexpected type or value. Result:", resultFromCpp);
        // If resultFromCpp is undefined, it might mean an error occurred inside getQuaternion
        // or the binding is incorrect.
        self.postMessage({ error: "Failed to retrieve or parse quaternion from Wasm. Unexpected data type received." });
        return; // Exit if we can't process the quaternion
      }

      if (quaternionToPost && quaternionToPost.length === 4) {
        self.postMessage({ quaternion: quaternionToPost });
      } else {
        console.error("Processed quaternion is invalid or has incorrect length:", quaternionToPost);
        self.postMessage({ error: "Processed quaternion from Wasm is invalid." });
      }

    } catch (e) {
      console.error("Error during Wasm call or processing in onmessage:", e);
      self.postMessage({ error: "Error in Wasm interaction: " + e.message });
    }
  } else {
    console.warn("Worker received invalid input quaternion data:", event.data);
    self.postMessage({ error: "Invalid quaternion data sent to worker." });
  }
};