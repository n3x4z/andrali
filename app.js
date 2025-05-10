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

function handleDeviceOrientation(event) {
    if (event.alpha === null || event.beta === null || event.gamma === null) return;

    let alpha = THREE.MathUtils.degToRad(event.alpha);
    let gamma = THREE.MathUtils.degToRad(event.beta);
    let beta = THREE.MathUtils.degToRad(event.gamma);

    const euler = new THREE.Euler(beta, gamma, alpha, 'YXZ');
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(euler);

    worker.postMessage({ quaternion: quaternion.toArray() });
}

function initializeDeviceOrientation() {
    if (typeof DeviceOrientationEvent !== 'undefined') {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            output.innerHTML = "Click the screen to enable DeviceOrientation.";
            xrCanvas.addEventListener('click', requestDeviceOrientationPermission);
        } else {
            startDeviceOrientation();
        }
    } else {
        output.innerHTML = "DeviceOrientation API not supported.";
        console.error("DeviceOrientation API not supported.");
    }
}

function requestDeviceOrientationPermission() {
    DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
            if (permissionState === 'granted') {
                startDeviceOrientation();
                output.innerHTML = "DeviceOrientation started. Move your device.";
            } else {
                output.innerHTML = "Permission for DeviceOrientation denied.";
            }
        })
        .catch(error => {
            output.innerHTML = "Error requesting DeviceOrientation permission: " + error;
            console.error(error);
        });
    xrCanvas.removeEventListener('click', requestDeviceOrientationPermission);
}

function startDeviceOrientation() {
    window.addEventListener('deviceorientation', handleDeviceOrientation);
    output.innerHTML = "DeviceOrientation started. Move your device.";
}

if (window.RelativeOrientationSensor) {
    Promise.all([
        navigator.permissions.query({ name: 'accelerometer' }),
        navigator.permissions.query({ name: 'gyroscope' })
    ]).then(results => {
        if (results.every(result => result.state === 'granted' || result.state === 'prompt')) {
            initializeSensor();
        } else {
            output.innerHTML = "Permissions not granted. Falling back to DeviceOrientation.";
            initializeDeviceOrientation();
        }
    }).catch(error => {
        output.innerHTML = "Permission query failed. Falling back to DeviceOrientation.";
        initializeDeviceOrientation();
    });
} else {
    initializeDeviceOrientation();
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
            output.innerHTML = `Sensor Error: ${event.error.name} - ${event.error.message}. Falling back to DeviceOrientation.`;
            console.error('Sensor Error:', event.error);
            initializeDeviceOrientation();
        });

        sensor.start();
        output.innerHTML = "RelativeOrientationSensor started. Move your device.";

    } catch (error) {
        output.innerHTML = `Error initializing sensor: ${error.name} - ${error.message}. Falling back to DeviceOrientation.`;
        console.error('Error initializing sensor:', error);
        initializeDeviceOrientation();
    }
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
animate();