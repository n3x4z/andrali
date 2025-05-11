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

let accelerometer = null;
let gyroscope = null;
let lastQuaternion = new THREE.Quaternion(); // Store the previous quaternion
let baseQuaternion = new THREE.Quaternion();
let isTracking = false;

function handleSensorData(accelData, gyroData, timestamp) {
    worker.postMessage({ accelerometer: accelData, gyroscope: gyroData, timestamp: timestamp });
}

function initializeDeviceMotion() {
    if (typeof window.Accelerometer === 'undefined' || typeof window.Gyroscope === 'undefined') {
        output.innerHTML = "Accelerometer or Gyroscope API not supported.";
        console.error("Accelerometer or Gyroscope API not supported.");
        return;
    }

    Promise.all([
        navigator.permissions.query({ name: 'accelerometer' }),
        navigator.permissions.query({ name: 'gyroscope' })
    ]).then(results => {
        if (results.every(result => result.state === 'granted' || result.state === 'prompt')) {
            try {
                accelerometer = new Accelerometer({ frequency: 60, referenceFrame: 'device' });
                gyroscope = new Gyroscope({ frequency: 60, referenceFrame: 'device' });

                accelerometer.addEventListener('reading', () => {
                    if (gyroscope) {
                        handleSensorData(
                            { x: accelerometer.x, y: accelerometer.y, z: accelerometer.z },
                            { x: gyroscope.x, y: gyroscope.y, z: gyroscope.z },
                            Date.now()
                        );
                    }
                });

                gyroscope.addEventListener('reading', () => {
                    if (accelerometer) {
                        handleSensorData(
                            { x: accelerometer.x, y: accelerometer.y, z: accelerometer.z },
                            { x: gyroscope.x, y: gyroscope.y, z: gyroscope.z },
                            Date.now()
                        );
                    }
                });

                accelerometer.addEventListener('error', (event) => {
                    output.innerHTML = "Accelerometer error: " + event.error.message;
                    console.error("Accelerometer error:", event.error);
                });

                gyroscope.addEventListener('error', (event) => {
                    output.innerHTML = "Gyroscope error: " + event.error.message;
                    console.error("Gyroscope error:", event.error);
                });
                accelerometer.start();
                gyroscope.start();
                isTracking = true;
                output.innerHTML = "Device motion tracking started. Move your device.";

            } catch (error) {
                output.innerHTML = "Error initializing sensors: " + error.message;
                console.error("Error initializing sensors:", error);
            }

        } else {
            output.innerHTML = "Permissions not granted for accelerometer or gyroscope.";
            console.error("Permissions not granted for accelerometer or gyroscope.");
        }
    });
}
function resetBaseOrientation() {
  baseQuaternion.copy(lastQuaternion);
  output.innerHTML = "Base orientation reset. Move your device.";
}

function handleResetClick() {
    resetBaseOrientation();
}

xrCanvas.addEventListener('click', () => {
    if (!isTracking) {
        initializeDeviceMotion();
    }
    requestFullscreen();
});

const resetButton = document.createElement('button');
resetButton.textContent = 'Reset Orientation';
resetButton.style.position = 'absolute';
resetButton.style.top = '10px';
resetButton.style.left = '50%';
resetButton.style.transform = 'translateX(-50%)';
document.body.appendChild(resetButton);
resetButton.addEventListener('click', handleResetClick);


worker.onmessage = (event) => {
    const { quaternion: receivedQuaternion, error } = event.data;

    if (error) {
        output.innerHTML = "Worker error: " + error;
        console.error("Worker error:", error);
        return;
    }

    if (receivedQuaternion && receivedQuaternion.length === 4) {
        const newQuaternion = new THREE.Quaternion(receivedQuaternion[0], receivedQuaternion[1], receivedQuaternion[2], receivedQuaternion[3]);

        // Calculate the relative rotation from the base orientation.
        const relativeQuaternion = new THREE.Quaternion();
        relativeQuaternion.multiplyQuaternions(baseQuaternion.clone().invert(), newQuaternion);
        lastQuaternion.copy(newQuaternion); // store

        setStereoCameraTransforms(leftCamera, relativeQuaternion.toArray(), -eyeSeparation / 2);
        setStereoCameraTransforms(rightCamera, relativeQuaternion.toArray(), eyeSeparation / 2);

        const euler = new THREE.Euler().setFromQuaternion(leftCamera.quaternion, leftCamera.rotation.order);
        display_euler_x = euler.x;
        display_euler_y = euler.y;
        display_euler_z = euler.z;

        output.innerHTML = `Euler X: ${r2de(display_euler_x).toFixed(2)}, Y: ${r2de(display_euler_y).toFixed(2)}, Z: ${r2de(display_euler_z).toFixed(2)}`;
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


onWindowResize();
animate();