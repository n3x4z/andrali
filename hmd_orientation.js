import createModule from './orientation.js'; // Path to your Emscripten-generated JS file

let calculator;
let moduleReady = false;

let previousTimestamp = 0;
let previousQuaternion = [0, 0, 0, 1]; // Initialize with identity quaternion

createModule().then((Module) => {
    console.log("Browser is WASM compatible :D");
    if (Module && Module.OrientationCalculator) {
        calculator = new Module.OrientationCalculator();
        if (calculator && typeof calculator.getQuaternion === 'function' && typeof calculator.updateQuaternion === 'function') {
            moduleReady = true;
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

// Convert accelerometer data to a normalized 3D vector
function getAccelerationVector(ax, ay, az) {
    const norm = Math.sqrt(ax * ax + ay * ay + az * az);
    if (norm === 0) return { x: 0, y: 0, z: 1 }; // Return a default vector if norm is zero
    return { x: ax / norm, y: ay / norm, z: az / norm };
}

// Convert gyroscope data to radians per second
function getAngularVelocity(gx, gy, gz) {
    return { x: gx * Math.PI / 180, y: gy * Math.PI / 180, z: gz * Math.PI / 180 };
}

// Quaternion multiplication
function multiplyQuaternions(q1, q2) {
    const x1 = q1[0], y1 = q1[1], z1 = q1[2], w1 = q1[3];
    const x2 = q2[0], y2 = q2[1], z2 = q2[2], w2 = q2[3];

    return [
        x1 * w2 + w1 * x2 + y1 * z2 - z1 * y2,
        y1 * w2 + w1 * y2 + z1 * x2 - x1 * z2,
        z1 * w2 + w1 * z2 + x1 * y2 - y1 * x2,
        w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2
    ];
}

// Quaternion to rotation matrix (3x3, column-major)
function quaternionToRotationMatrix(q) {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x * x, y2 = y * y, z2 = z * z;
    const xy = x * y, xz = x * z, xw = x * w;
    const yz = y * z, yw = y * w, zw = z * w;

    const m = [];
    m[0] = 1 - 2 * (y2 + z2);
    m[1] = 2 * (xy - zw);
    m[2] = 2 * (xz + yw);
    m[3] = 2 * (xy + zw);
    m[4] = 1 - 2 * (x2 + z2);
    m[5] = 2 * (yz - xw);
    m[6] = 2 * (xz - yw);
    m[7] = 2 * (yz + xw);
    m[8] = 1 - 2 * (x2 + y2);
    return m;
}

// Rotation matrix to quaternion (from three.js)
function rotationMatrixToQuaternion(m) {
  const te = m;
  const tr = 0;

  let s;
  const quaternion = [0,0,0,1];

  const m11 = te[0], m12 = te[4], m13 = te[8];
  const m21 = te[1], m22 = te[5], m23 = te[9];
  const m31 = te[2], m32 = te[6], m33 = te[10];

  if (m33 < 0) {
    if (m11 > m22) {
      s = 2 * Math.sqrt(1 + m11 - m22 - m33);
      if(s!=0){
        quaternion[0] = (m21 + m12) / s;
        quaternion[1] = (m13 + m31) / s;
        quaternion[2] = (m32 - m23) / s;
        quaternion[3] = 0.25 * s;
      }

    } else {
      s = 2 * Math.sqrt(1 - m11 + m22 - m33);
      if(s!=0){
        quaternion[0] = (m21 + m12) / s;
        quaternion[1] = (m32 + m23) / s;
        quaternion[2] = (m13 - m31) / s;
        quaternion[3] = 0.25 * s;
      }
    }
  } else if (m11 < -m22) {
    s = 2 * Math.sqrt(1 - m11 - m22 + m33);
    if(s!=0){
      quaternion[0] = (m13 - m31) / s;
      quaternion[1] = (m32 + m23) / s;
      quaternion[2] = (m21 + m12) / s;
      quaternion[3] = 0.25 * s;
    }

  } else {
    s = 2 * Math.sqrt(1 + m11 + m22 + m33);
    if(s!=0){
      quaternion[0] = (m32 - m23) / s;
      quaternion[1] = (m13 - m31) / s;
      quaternion[2] = (m21 - m12) / s;
      quaternion[3] = 0.25 * s;
    }
  }
  return quaternion;
}


self.onmessage = (event) => {
    if (!moduleReady) {
        console.warn("Worker received message before Wasm module was ready. Message ignored.", event.data);
        return;
    }

    const { accelerometer: accelData, gyroscope: gyroData, timestamp } = event.data;

    if (!accelData || !gyroData || timestamp === undefined) {
        console.warn("Worker received incomplete sensor data:", event.data);
        self.postMessage({ error: "Incomplete sensor data sent to worker." });
        return;
    }

    if (previousTimestamp === 0) {
        previousTimestamp = timestamp;
        return; // Wait for the second frame to have a valid dt
    }

    const dt = (timestamp - previousTimestamp) / 1000.0; // Convert to seconds
    previousTimestamp = timestamp;

    const acceleration = getAccelerationVector(accelData.x, accelData.y, accelData.z);
    const angularVelocity = getAngularVelocity(gyroData.x, gyroData.y, gyroData.z);

    // Use a complementary filter to fuse accelerometer and gyroscope data.
    const alpha = 0.98; // Adjust for the weight of gyro vs accel.  Higher = more gyro, less accel.
    let currentQuaternion;

    // 1. Gyroscope integration (using previous quaternion)
    const halfAngularVelocityX = angularVelocity.x * dt / 2;
    const halfAngularVelocityY = angularVelocity.y * dt / 2;
    const halfAngularVelocityZ = angularVelocity.z * dt / 2;

    const qPrev = previousQuaternion; // shortname
    const qGyro = [
        qPrev[0] + (-halfAngularVelocityX * qPrev[0] - halfAngularVelocityY * qPrev[2] + halfAngularVelocityZ * qPrev[1] + 0) , //w
        qPrev[1] + (halfAngularVelocityX * qPrev[1] + halfAngularVelocityY * qPrev[0] + halfAngularVelocityZ * qPrev[3] + 0) , //x
        qPrev[2] + (halfAngularVelocityX * qPrev[2] - halfAngularVelocityY * qPrev[3] + halfAngularVelocityZ * qPrev[0] + 0) , //y
        qPrev[3] + (halfAngularVelocityX * qPrev[3] + halfAngularVelocityY * qPrev[2] - halfAngularVelocityZ * qPrev[1] + 0),  //z
    ];
    //normalize
    const normGyro = Math.sqrt(qGyro[0] * qGyro[0] + qGyro[1] * qGyro[1] + qGyro[2] * qGyro[2] + qGyro[3] * qGyro[3]);
    const normalizedGyroQuaternion = [qGyro[0] / normGyro, qGyro[1] / normGyro, qGyro[2] / normGyro, qGyro[3] / normGyro];


    // 2. Accelerometer-based orientation (tilt)
    const accelX = acceleration.x;
    const accelY = acceleration.y;
    const accelZ = acceleration.z;

    const roll = Math.atan2(accelY, accelZ);
    const pitch = Math.atan2(-accelX, Math.sqrt(accelY * accelY + accelZ * accelZ));

    const halfRoll = roll / 2.0;
    const halfPitch = pitch / 2.0;

    const cosRoll = Math.cos(halfRoll);
    const sinRoll = Math.sin(halfRoll);
    const cosPitch = Math.cos(halfPitch);
    const sinPitch = Math.sin(halfPitch);

    const qAccel = [
        (sinRoll * cosPitch),
        (cosRoll * sinPitch),
        (sinRoll * sinPitch),
        (cosRoll * cosPitch)
    ];

    // 3. Complementary filter - combine gyro and accel
    currentQuaternion = [
        alpha * normalizedGyroQuaternion[0] + (1 - alpha) * qAccel[0],
        alpha * normalizedGyroQuaternion[1] + (1 - alpha) * qAccel[1],
        alpha * normalizedGyroQuaternion[2] + (1 - alpha) * qAccel[2],
        alpha * normalizedGyroQuaternion[3] + (1 - alpha) * qAccel[3],
    ];

    // Normalize the resulting quaternion
    const norm = Math.sqrt(currentQuaternion[0] * currentQuaternion[0] + currentQuaternion[1] * currentQuaternion[1] + currentQuaternion[2] * currentQuaternion[2] + currentQuaternion[3] * currentQuaternion[3]);
    const finalQuaternion = [
        currentQuaternion[0] / norm,
        currentQuaternion[1] / norm,
        currentQuaternion[2] / norm,
        currentQuaternion[3] / norm
    ];
    previousQuaternion = finalQuaternion;
    self.postMessage({ quaternion: finalQuaternion });
};