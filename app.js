import * as THREE from './three.module.js';

const worker = new Worker('./hmd_orientation.js', { type: 'module' });

const output = document.getElementById('output');
const xrCanvas = document.getElementById("xrdisp");
const ctx = xrCanvas.getContext('webgl2'); // Or 'webgl' if WebGL2 is not available

let display_euler_x = 0;
let display_euler_y = 0;
let display_euler_z = 0;

const eyeSeparation = 0; // Adjust this value to control the stereo effect
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
    context: ctx,
    powerPreference: 'high-performance'
});
renderer.autoClear = false; // Important for rendering multiple views
renderer.setClearColor(0x444440);

function setStereoCameraTransforms(camera, quaternion, eyeOffset) {
    camera.quaternion.fromArray(quaternion);
    const position = new THREE.Vector3(eyeOffset, 0, 0);
    position.applyQuaternion(camera.quaternion);
    camera.position.add(position);
}

// 1. Render Target Setup
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

// 2. Distortion Shader
const distortionShader = {
    uniforms: {
        tDiffuse: { value: null }, // The render target texture
        resolution: { value: new THREE.Vector2(window.innerWidth / 2, window.innerHeight) },
        distortionK1: { value: 0.1 }, // Adjust this value for distortion
        distortionK2: { value: 0.0 }, // Adjust this value for distortion
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
            vec2 uv = (vUv - 0.5) * 2.0; // Remap UV to [-1, 1]
            float r = length(uv);
            float distortion = 1.0 + distortionK1 * pow(r, 2.0) + distortionK2 * pow(r, 4.0);
            vec2 distortedUV = uv * distortion;
            distortedUV = (distortedUV / 2.0) + 0.5; // Remap to [0, 1]
            gl_FragColor = texture2D(tDiffuse, distortedUV);
        }
    `
};

const leftDistortionMaterial = new THREE.ShaderMaterial(distortionShader);
const rightDistortionMaterial = new THREE.ShaderMaterial(distortionShader);
const distortionQuad = new THREE.PlaneGeometry(2, 2); // Covers the viewport
const leftDistortionMesh = new THREE.Mesh(distortionQuad, leftDistortionMaterial);
const rightDistortionMesh = new THREE.Mesh(distortionQuad, rightDistortionMaterial);
const distortionScene = new THREE.Scene();
distortionScene.add(leftDistortionMesh);
distortionScene.add(rightDistortionMesh);


// Handle RelativeOrientationSensor
if (window.RelativeOrientationSensor) {
    Promise.all([
        navigator.permissions.query({ name: 'accelerometer' }),
        navigator.permissions.query({ name: 'gyroscope' })
    ]).then(results => {
        if (results.every(result => result.state === 'granted' || result.state === 'prompt')) {
            initializeSensor();
        } else {
            output.innerHTML = "Permissions for accelerometer and/or gyroscope not granted.";
            console.error("Permissions for accelerometer and/or gyroscope not granted.");
        }
    }).catch(error => {
        output.innerHTML = "Permission query failed: " + error;
        console.error("Permission query failed:", error);
        initializeSensor();
    });

} else {
    output.innerHTML = "RelativeOrientationSensor API not supported in this browser.";
    console.error("RelativeOrientationSensor API not supported.");
}

function initializeSensor() {
    try {
        const options = { frequency: 120, referenceFrame: 'device' };
        const sensor = new RelativeOrientationSensor(options);

        sensor.addEventListener('reading', () => {
            if (sensor.quaternion) {
                worker.postMessage({ quaternion: sensor.quaternion });
            }
        });

        sensor.addEventListener('error', (event) => {
            output.innerHTML = `Sensor Error: ${event.error.name} - ${event.error.message}`;
            console.error('Sensor Error:', event.error);
            if (event.error.name === 'NotReadableError') {
                output.innerHTML += "<br>Ensure sensor permissions are granted and hardware is available.";
            }
        });

        sensor.start();
        output.innerHTML = "RelativeOrientationSensor started. Move your device.";

    } catch (error) {
        output.innerHTML = `Error initializing sensor: ${error.name} - ${error.message}`;
        console.error('Error initializing sensor:', error);
        if (error.name === 'SecurityError') {
            output.innerHTML += "<br>Sensor access denied. Check permissions.";
        } else if (error.name === 'NotFoundError') {
             output.innerHTML += "<br>Compatible sensor not found on this device.";
        }
    }
}

worker.onmessage = (event) => {
    const { quaternion: receivedQuaternion } = event.data;

    if (receivedQuaternion && receivedQuaternion.length === 4) {
        // Swap X and Y coordinates for device orientation
        const originalX = receivedQuaternion[0];
        receivedQuaternion[0] = -receivedQuaternion[1];
        receivedQuaternion[1] = originalX;

        // Apply the modified quaternion to both cameras with slight horizontal offset
        setStereoCameraTransforms(leftCamera, receivedQuaternion, -eyeSeparation / 2);
        setStereoCameraTransforms(rightCamera, receivedQuaternion, eyeSeparation / 2);

        // For display purposes (using left camera's orientation)
        const euler = new THREE.Euler().setFromQuaternion(leftCamera.quaternion, leftCamera.rotation.order);
        display_euler_x = euler.x;
        display_euler_y = euler.y;
        display_euler_z = euler.z;

        output.innerHTML = `Original Quaternion: ${event.data.quaternion.map(n => n.toFixed(2)).join(', ')}<br>`;
        output.innerHTML += `Swapped Quaternion: ${receivedQuaternion.map(n => n.toFixed(2)).join(', ')}<br>`;
        output.innerHTML += `Display Euler X: ${r2de(display_euler_x).toFixed(2)}, Y: ${r2de(display_euler_y).toFixed(2)}, Z: ${r2de(display_euler_z).toFixed(2)}`;
    }
};

function animate() {
    requestAnimationFrame(animate);

    renderer.clear(); // Clear the canvas

    const width = window.innerWidth;
    const height = window.innerHeight;

    if (isLandscape) {
        // Render to Texture
        renderer.setViewport(0, 0, width / 2, height);
        renderer.render(scene, leftCamera, leftRenderTarget);

        renderer.setViewport(width / 2, 0, width / 2, height);
        renderer.render(scene, rightCamera, rightRenderTarget);

        // Apply Distortion and Render to Screen
        leftDistortionMaterial.uniforms.tDiffuse.value = leftRenderTarget.texture;
        leftDistortionMaterial.uniforms.resolution.value.set(width / 2, height);
        renderer.setViewport(0, 0, width / 2, height);
        renderer.render(distortionScene, leftCamera); // Use leftCamera (ortho is fine)

        rightDistortionMaterial.uniforms.tDiffuse.value = rightRenderTarget.texture;
        rightDistortionMaterial.uniforms.resolution.value.set(width / 2, height);
        renderer.setViewport(width / 2, 0, width / 2, height);
        renderer.render(distortionScene, leftCamera); // Use leftCamera (ortho is fine)
    } else {
        // Portrait mode: Stack views vertically
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
    leftRenderTarget.setSize(width / 2, height); // Also update render target sizes on resize
    rightRenderTarget.setSize(width / 2, height);
}
window.addEventListener('resize', onWindowResize, false);

// Function to handle fullscreen request
function requestFullscreen() {
    if (xrCanvas.requestFullscreen) {
        xrCanvas.requestFullscreen();
    } else if (xrCanvas.mozRequestFullScreen) { // Firefox
        xrCanvas.mozRequestFullScreen();
    } else if (xrCanvas.webkitRequestFullscreen) { // Chrome, Safari and Opera
        xrCanvas.webkitRequestFullscreen();
    } else if (xrCanvas.msRequestFullscreen) { // IE/Edge
        xrCanvas.msRequestFullscreen();
    }
}

// Event listener to trigger fullscreen on canvas tap
xrCanvas.addEventListener('click', requestFullscreen);

onWindowResize();
animate();
