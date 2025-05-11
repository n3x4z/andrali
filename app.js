import * as THREE from './three.module.js';

const worker = new Worker('./hmd_orientation.js', { type: 'module' });

const output = document.getElementById('output');
const xrCanvas = document.getElementById("xrdisp");
const ctx = xrCanvas.getContext('webgl2');

let display_euler_x = 0;
let display_euler_y = 0;
let display_euler_z = 0;

const eyeSeparation = 0;
let isLandscape = window.innerWidth > window.innerHeight;

function r2de(radians) {
    return radians * (180 / Math.PI);
}

const scene = new THREE.Scene();
const leftCamera = new THREE.PerspectiveCamera(90, 0.5 * window.innerWidth / window.innerHeight, 0.1, 1000);
const rightCamera = new THREE.PerspectiveCamera(90, 0.5 * window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(leftCamera);
scene.add(rightCamera);

const axesHelper = new THREE.AxesHelper(2);
scene.add(axesHelper);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

leftCamera.position.y = -3;
rightCamera.position.y = -3;

const renderer = new THREE.WebGLRenderer({
    antialias: false,
    canvas: xrCanvas,
    powerPreference: 'high-performance'
});
renderer.autoClear = false;
renderer.setClearColor(0x444440);

function setStereoCameraTransforms(camera, quaternion, eyeOffset) {
    camera.quaternion.fromArray(quaternion);
    const position = new THREE.Vector3(eyeOffset, 0, 0);
    position.applyQuaternion(camera.quaternion);
    camera.position.add(position);
}

const leftRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false
});
const rightRenderTarget = new THREE.WebGLRenderTarget(window.innerWidth / 2, window.innerHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false
});

const distortionShader = {
    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: new THREE.Vector2(window.innerWidth / 2, window.innerHeight) },
        distortionK1: { value: 0.1 },
        distortionK2: { value: 0.0 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float distortionK1;
        uniform float distortionK2;
        varying vec2 vUv;
        void main() {
            vec2 uv = (vUv - 0.5) * 2.0;
            float r = length(uv);
            float distortion = 1.0 + distortionK1 * pow(r, 2.0) + distortionK2 * pow(r, 4.0);
            vec2 distortedUV = uv * distortion;
            distortedUV = (distortedUV / 2.0) + 0.5;
            gl_FragColor = texture2D(tDiffuse, distortedUV);
        }
    `
};

const leftDistortionMaterial = new THREE.ShaderMaterial(distortionShader);
const rightDistortionMaterial = new THREE.ShaderMaterial(distortionShader);
const distortionQuad = new THREE.PlaneGeometry(2, 2);
const leftDistortionMesh = new THREE.Mesh(distortionQuad, leftDistortionMaterial);
const rightDistortionMesh = new THREE.Mesh(distortionQuad, rightDistortionMaterial);
const distortionScene = new THREE.Scene();
distortionScene.add(leftDistortionMesh);
distortionScene.add(rightDistortionMesh);

// Tracking initial orientation for relative motion calculation
let initialQuaternion = new THREE.Quaternion();
let hasInitialOrientation = false;
let relativeQuaternion = new THREE.Quaternion();

// Detect browser type
const isChromium = !!window.chrome;
output.innerHTML = isChromium ? "Chromium-based browser detected" : "Non-Chromium browser detected";

function initializeOrientationSystem() {
    if (window.RelativeOrientationSensor) {
        // For Chromium browsers with RelativeOrientationSensor
        Promise.all([
            navigator.permissions.query({ name: 'accelerometer' }),
            navigator.permissions.query({ name: 'gyroscope' })
        ]).then(results => {
            if (results.every(result => result.state === 'granted' || result.state === 'prompt')) {
                initializeRelativeSensor();
            } else {
                output.innerHTML = "Permissions not granted. Falling back to custom orientation tracking.";
                initializeCustomOrientation();
            }
        }).catch(error => {
            output.innerHTML = "Permission query failed. Falling back to custom orientation tracking.";
            initializeCustomOrientation();
        });
    } else {
        // For non-Chromium browsers without RelativeOrientationSensor
        initializeCustomOrientation();
    }
}

function initializeRelativeSensor() {
    try {
        const options = { frequency: 120, referenceFrame: 'device' };
        const sensor = new RelativeOrientationSensor(options);

        sensor.addEventListener('reading', () => {
            if (sensor.quaternion) {
                worker.postMessage({ quaternion: sensor.quaternion });
            }
        });

        sensor.addEventListener('error', (event) => {
            output.innerHTML = `Sensor Error: ${event.error.name} - ${event.error.message}. Falling back to custom orientation.`;
            console.error('Sensor Error:', event.error);
            initializeCustomOrientation();
        });

        sensor.start();
        output.innerHTML = "RelativeOrientationSensor started. Move your device.";

    } catch (error) {
        output.innerHTML = `Error initializing sensor: ${error.name} - ${error.message}. Falling back to custom orientation.`;
        console.error('Error initializing sensor:', error);
        initializeCustomOrientation();
    }
}

function initializeCustomOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined') {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            output.innerHTML = "Click the screen to enable CustomOrientation.";
            xrCanvas.addEventListener('click', requestCustomOrientationPermission);
        } else {
            startCustomOrientation();
        }
    } else {
        output.innerHTML = "Motion sensors not supported on this device.";
        console.error("Motion sensors not supported.");
    }
}

function requestCustomOrientationPermission() {
    DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            if (permissionState === 'granted') {
                startCustomOrientation();
                output.innerHTML = "Custom orientation tracking started. Move your device.";
            } else {
                output.innerHTML = "Permission for orientation access denied.";
            }
        })
        .catch(error => {
            output.innerHTML = "Error requesting orientation permission: " + error;
            console.error(error);
        });
    xrCanvas.removeEventListener('click', requestCustomOrientationPermission);
}

function startCustomOrientation() {
    // Reset initial values
    hasInitialOrientation = false;
    
    // Use a gyroscope-enhanced approach
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleCustomDeviceOrientation);
        output.innerHTML = "Custom orientation tracking active. Using enhanced relative motion. Move your device.";
    } else {
        output.innerHTML = "No orientation sensors available on this device.";
    }
}

function handleCustomDeviceOrientation(event) {
    if (event.alpha === null || event.beta === null || event.gamma === null) return;

    // First, convert device orientation to consistent space
    let alpha = THREE.MathUtils.degToRad(event.alpha || 0); // Z-axis rotation (yaw)
    let beta = THREE.MathUtils.degToRad(event.beta || 0);   // X-axis rotation (pitch)
    let gamma = THREE.MathUtils.degToRad(event.gamma || 0); // Y-axis rotation (roll)
    
    // Clamp beta to avoid gimbal lock issues near poles
    beta = Math.max(-Math.PI/2 + 0.001, Math.min(Math.PI/2 - 0.001, beta));
    
    // Create a quaternion using a specific rotation order 
    // YXZ works better for head tracking - first apply yaw, then pitch, then roll
    const rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    
    // Apply rotations in the right order:
    // Convert from device space to our app's expected space
    rotation.set(beta, alpha, -gamma, 'YXZ');
    
    const deviceQuaternion = new THREE.Quaternion();
    deviceQuaternion.setFromEuler(rotation);
    
    // Create a correction quaternion to align the coordinate systems
    const correctionQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.PI/2, 0, 0, 'XYZ')
    );
    
    // Apply the coordinate system correction
    deviceQuaternion.multiply(correctionQuat);
    
    // Normalize to prevent drift
    deviceQuaternion.normalize();
    
    // Capture initial orientation for relative calculations
    if (!hasInitialOrientation) {
        initialQuaternion.copy(deviceQuaternion);
        initialQuaternion.invert(); // To use as a "reset" reference point
        hasInitialOrientation = true;
        output.innerHTML = "Initial orientation captured. Move device to look around.";
    }
    
    // Calculate relative orientation correctly
    relativeQuaternion.copy(deviceQuaternion);
    relativeQuaternion.premultiply(initialQuaternion);
    
    // Apply screen orientation adjustment if needed
    adjustForScreenOrientation(relativeQuaternion);
    
    // Send the relative quaternion to the worker with a flag to indicate it needs filtering
    worker.postMessage({ 
        quaternion: [
            relativeQuaternion.x,
            relativeQuaternion.y,
            relativeQuaternion.z,
            relativeQuaternion.w
        ],
        needsFiltering: true,
        timestamp: performance.now()
    });
}

function adjustForScreenOrientation(quaternion) {
    // Get current screen orientation in degrees
    let screenOrientation = 0;
    
    if (window.screen && window.screen.orientation) {
        // Modern API - more reliable
        screenOrientation = window.screen.orientation.angle;
    } else {
        // Legacy API - fallback
        screenOrientation = window.orientation || 0;
    }
    
    // Create a rotation quaternion for screen orientation
    const screenRotation = new THREE.Quaternion();
    
    // Adjust based on screen orientation
    // We use a specific axis for rotation to maintain proper coordinate system
    screenRotation.setFromAxisAngle(
        new THREE.Vector3(0, 0, 1), 
        THREE.MathUtils.degToRad(-screenOrientation)
    );
    
    // Apply the screen rotation correction
    // Note: order matters for quaternion multiplication!
    quaternion.multiply(screenRotation);
    
    // Normalize the quaternion to prevent accumulation errors
    quaternion.normalize();
}

// Function to reset the reference frame on demand
function resetOrientation() {
    hasInitialOrientation = false; // This will cause the next event to set a new initial orientation
    
    // Tell the worker to reset its filters
    worker.postMessage({ reset: true });
    
    // Reset quaternions
    initialQuaternion = new THREE.Quaternion();
    relativeQuaternion = new THREE.Quaternion();
    
    output.innerHTML = "Orientation reference reset. Look forward and hold still.";
    
    // Freeze for a moment to allow stabilization
    setTimeout(() => {
        output.innerHTML = "Calibrating...";
    }, 100);
}

// Add a reset button to the UI (helpful for user experience)
function addResetButton() {
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset View';
    resetBtn.style.position = 'absolute';
    resetBtn.style.bottom = '20px';
    resetBtn.style.left = '50%';
    resetBtn.style.transform = 'translateX(-50%)';
    resetBtn.style.padding = '10px 20px';
    resetBtn.style.zIndex = '100';
    resetBtn.addEventListener('click', resetOrientation);
    document.body.appendChild(resetBtn);
}

worker.onmessage = (event) => {
    const { quaternion: receivedQuaternion } = event.data;

    if (receivedQuaternion && receivedQuaternion.length === 4) {
        const originalX = receivedQuaternion[0];
        receivedQuaternion[0] = -receivedQuaternion[1];
        receivedQuaternion[1] = originalX;

        setStereoCameraTransforms(leftCamera, receivedQuaternion, -eyeSeparation / 2);
        setStereoCameraTransforms(rightCamera, receivedQuaternion, eyeSeparation / 2);

        const euler = new THREE.Euler().setFromQuaternion(leftCamera.quaternion, leftCamera.rotation.order);
        display_euler_x = euler.x;
        display_euler_y = euler.y;
        display_euler_z = euler.z;

        output.innerHTML = `Quaternion: ${receivedQuaternion.map(n => n.toFixed(2)).join(', ')}<br>`;
        output.innerHTML += `Euler X: ${r2de(display_euler_x).toFixed(2)}, Y: ${r2de(display_euler_y).toFixed(2)}, Z: ${r2de(display_euler_z).toFixed(2)}`;
    }
};

function animate() {
    requestAnimationFrame(animate);
    renderer.clear();

    const width = window.innerWidth;
    const height = window.innerHeight;

    if (isLandscape) {
        renderer.setViewport(0, 0, width / 2, height);
        renderer.render(scene, leftCamera, leftRenderTarget);

        renderer.setViewport(width / 2, 0, width / 2, height);
        renderer.render(scene, rightCamera, rightRenderTarget);

        leftDistortionMaterial.uniforms.tDiffuse.value = leftRenderTarget.texture;
        leftDistortionMaterial.uniforms.resolution.value.set(width / 2, height);
        renderer.setViewport(0, 0, width / 2, height);
        renderer.render(distortionScene, leftCamera);

        rightDistortionMaterial.uniforms.tDiffuse.value = rightRenderTarget.texture;
        rightDistortionMaterial.uniforms.resolution.value.set(width / 2, height);
        renderer.setViewport(width / 2, 0, width / 2, height);
        renderer.render(distortionScene, leftCamera);
    } else {
        renderer.setViewport(0, 0, width, height / 2);
        renderer.render(scene, leftCamera, leftRenderTarget);

        renderer.setViewport(0, height / 2, width, height / 2);
        renderer.render(scene, rightCamera, rightRenderTarget);

        leftDistortionMaterial.uniforms.tDiffuse.value = leftRenderTarget.texture;
        leftDistortionMaterial.uniforms.resolution.value.set(width, height / 2);
        renderer.setViewport(0, 0, width, height / 2);
        renderer.render(distortionScene, leftCamera);

        rightDistortionMaterial.uniforms.tDiffuse.value = rightRenderTarget.texture;
        rightDistortionMaterial.uniforms.resolution.value.set(width, height / 2);
        renderer.setViewport(0, height / 2, width, height / 2);
        renderer.render(distortionScene, leftCamera);
    }
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    leftCamera.aspect = 0.5 * width / height;
    rightCamera.aspect = 0.5 * width / height;
    leftCamera.updateProjectionMatrix();
    rightCamera.updateProjectionMatrix();
    renderer.setPixelRatio(window.devicePixelRatio);
    isLandscape = width > height;
    leftRenderTarget.setSize(width / 2, height);
    rightRenderTarget.setSize(width / 2, height);
}
window.addEventListener('resize', onWindowResize, false);

// Double tap to reset orientation
let lastTap = 0;
xrCanvas.addEventListener('touchend', function(e) {
    const currentTime = new Date().getTime();
    const tapLength = currentTime - lastTap;
    if (tapLength < 500 && tapLength > 0) {
        resetOrientation();
        // Also tell the worker to reset its filters
        worker.postMessage({ reset: true });
        e.preventDefault();
    }
    lastTap = currentTime;
});

function requestFullscreen() {
    if (xrCanvas.requestFullscreen) {
        xrCanvas.requestFullscreen();
    } else if (xrCanvas.mozRequestFullScreen) {
        xrCanvas.mozRequestFullScreen();
    } else if (xrCanvas.webkitRequestFullscreen) {
        xrCanvas.webkitRequestFullscreen();
    } else if (xrCanvas.msRequestFullscreen) {
        xrCanvas.msRequestFullscreen();
    }
}

xrCanvas.addEventListener('click', requestFullscreen);

onWindowResize();
addResetButton();
initializeOrientationSystem();
animate();