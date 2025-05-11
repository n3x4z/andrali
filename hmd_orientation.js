import createModule from './orientation.js'; // Path to your Emscripten-generated JS file

let calculator;
let moduleReady = false;
let lastTimestamp = 0;
let complementaryFilterCoeff = 0.98; // Adjustable filter coefficient (0.98 works well for most devices)
let lastProcessedQuaternion = null; // Declare in the global scope

// Advanced complementary filter for non-Chromium browsers
// This provides smooth, stable quaternion values with proper interpolation
class ComplementaryFilter {
  constructor() { // Corrected constructor name
    // Initialize with identity quaternion
    this.filteredQuaternion = [0, 0, 0, 1];
    this.lastUpdateTime = 0;
    this.prevRawQuaternion = [0, 0, 0, 1];
    this.isFirstUpdate = true;

    // Different filter coefficients for different motion speeds
    this.fastFilterCoeff = 0.85; // More responsive for fast movements
    this.slowFilterCoeff = 0.98; // More stable for slow or no movement

    // Threshold to detect rapid movement
    this.movementThreshold = 0.05;
  }

  // Calculate dot product between two quaternions to determine similarity
  quaternionDot(q1, q2) {
    return q1[0] * q2[0] + q1[1] * q2[1] + q1[2] * q2[2] + q1[3] * q2[3];
  }

  // Properly interpolate between quaternions
  slerp(q1, q2, t) {
    // Ensure we're interpolating along shortest path
    let dot = this.quaternionDot(q1, q2);

    // If quaternions are nearly opposite, we need to flip one
    if (dot < 0) {
      for (let i = 0; i < 4; i++) {
        q2[i] = -q2[i];
      }
      dot = -dot;
    }

    // Handle nearly identical quaternions to avoid division by zero
    if (dot > 0.9995) {
      let result = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) {
        result[i] = q1[i] + t * (q2[i] - q1[i]);
      }
      return this.normalize(result);
    }

    // Standard SLERP formula
    let theta0 = Math.acos(dot);
    let theta = theta0 * t;

    let sinTheta = Math.sin(theta);
    let sinTheta0 = Math.sin(theta0);

    let s0 = Math.cos(theta) - dot * sinTheta / sinTheta0;
    let s1 = sinTheta / sinTheta0;

    let result = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      result[i] = q1[i] * s0 + q2[i] * s1;
    }

    return this.normalize(result);
  }

  // Normalize a quaternion
  normalize(q) {
    let magnitude = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);

    if (magnitude > 0.00001) {
      return [q[0] / magnitude, q[1] / magnitude, q[2] / magnitude, q[3] / magnitude];
    }

    // Default to identity if we somehow got a zero quaternion
    return [0, 0, 0, 1];
  }

  update(newQuaternion, timestamp) {
    // Handle first update
    if (this.isFirstUpdate) {
      this.filteredQuaternion = [...newQuaternion];
      this.prevRawQuaternion = [...newQuaternion];
      this.lastUpdateTime = timestamp;
      this.isFirstUpdate = false;
      return this.filteredQuaternion;
    }

    let deltaTime = (timestamp - this.lastUpdateTime) / 1000; // Convert to seconds
    this.lastUpdateTime = timestamp;

    // Limit max deltaTime to prevent huge jumps after pausing/resuming
    let effectiveDeltaTime = Math.min(deltaTime, 0.1);

    // Check how much the orientation has changed since last reading
    let movementAmount = 1.0 - Math.abs(this.quaternionDot(this.prevRawQuaternion, newQuaternion));

    // Choose filter coefficient based on movement speed
    let currentCoeff;
    if (movementAmount > this.movementThreshold) {
      // Fast movement detected - be more responsive
      currentCoeff = this.fastFilterCoeff;
    } else {
      // Slow/steady movement - more filtering
      currentCoeff = this.slowFilterCoeff;
    }

    // Adjust coefficient based on time delta
    let timeAdjustedCoeff = Math.pow(currentCoeff, effectiveDeltaTime * 60);

    // Use slerp for proper quaternion interpolation
    this.filteredQuaternion = this.slerp(
      this.filteredQuaternion,
      newQuaternion,
      1.0 - timeAdjustedCoeff
    );

    // Save current raw quaternion for next comparison
    this.prevRawQuaternion = [...newQuaternion];

    return this.filteredQuaternion;
  }

  reset() {
    this.filteredQuaternion = [0, 0, 0, 1];
    this.prevRawQuaternion = [0, 0, 0, 1];
    this.lastUpdateTime = 0;
    this.isFirstUpdate = true;
  }
}

// Create complementary filter instance
let filter = new ComplementaryFilter();

createModule().then((Module) => {
  console.log("Wasm Module loaded. Checking for OrientationCalculator...");
  if (Module && Module.OrientationCalculator) {
    calculator = new Module.OrientationCalculator();
    console.log("OrientationCalculator instantiated:", calculator);
    if (calculator && typeof calculator.getQuaternion === 'function' && typeof calculator.updateQuaternion === 'function') {
      moduleReady = true;
      console.log("Worker is ready and calculator is functional.");
      self.postMessage({ status: "worker_ready" }); // Notify main thread the worker is ready
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
    return;
  }

  let { quaternion, reset } = event.data;
  let inputQuaternion = quaternion;

  // Handle reset command if sent
  if (reset) {
    filter.reset();
    lastProcessedQuaternion = null; // Reset this as well
    return;
  }

  if (inputQuaternion && Array.isArray(inputQuaternion) && inputQuaternion.length === 4) {
    try {
      // Check if browser is chromium or if we need to apply our filter
      // We'll infer this from whether timestamp data is provided
      let timestamp = event.data.timestamp || performance.now();

      // Process the quaternion based on source
      let processedQuaternion;

      if (event.data.needsFiltering) {
        // This is from our custom orientation tracking and needs filtering

        // First, ensure quaternion isn't flipping
        // This prevents the 180° flip issue when looking up
        if (!lastProcessedQuaternion) {
          lastProcessedQuaternion = [...inputQuaternion];
        } else {
          // Check if the quaternion suddenly flipped sign (indicates a 180° rotation issue)
          let dot =
            inputQuaternion[0] * lastProcessedQuaternion[0] +
            inputQuaternion[1] * lastProcessedQuaternion[1] +
            inputQuaternion[2] * lastProcessedQuaternion[2] +
            inputQuaternion[3] * lastProcessedQuaternion[3];

          // If the dot product is negative, the quaternions represent opposite rotations
          // In this case, negate the input quaternion to ensure smooth transitions
          if (dot < 0) {
            inputQuaternion = inputQuaternion.map(x => -x);
          }

          lastProcessedQuaternion = [...inputQuaternion];
        }

        // Apply advanced filtering for smooth motion
        processedQuaternion = filter.update(inputQuaternion, timestamp);
      } else {
        // This is from RelativeOrientationSensor which already provides good data
        processedQuaternion = inputQuaternion;
      }

      // Pass the quaternion components to the C++ function
      calculator.updateQuaternion(
        processedQuaternion[0],
        processedQuaternion[1],
        processedQuaternion[2],
        processedQuaternion[3]
      );

      // Get the quaternion back from C++
      let resultFromCpp = calculator.getQuaternion();
      let quaternionToPost;

      if (Array.isArray(resultFromCpp)) {
        quaternionToPost = resultFromCpp;
      } else if (resultFromCpp && typeof resultFromCpp.size === 'function' && typeof resultFromCpp.get === 'function') {
        let tempArray = [];
        let size = resultFromCpp.size();
        for (let i = 0; i < size; i++) {
          tempArray.push(resultFromCpp.get(i));
        }
        resultFromCpp.delete(); // Clean up the C++ side emscripten::val handle
        quaternionToPost = tempArray;
      } else {
        console.error("calculator.getQuaternion() returned an unexpected type or value. Result:", resultFromCpp);
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