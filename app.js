import * as THREE from './three.module.js';
import { RGBELoader } from './jsm/loaders/RGBELoader.js';
import { TextGeometry } from './jsm/geometries/TextGeometry.js';
import { FontLoader } from './jsm/loaders/FontLoader.js';

const worker = new Worker('./hmd_orientation.js', { type: 'module' });

const output = document.getElementById('output');
const xrCanvas = document.getElementById("xrdisp");
const ctx = xrCanvas.getContext('webgl2');

let display_euler_x = 0;
let display_euler_y = 0;
let display_euler_z = 0;

const loader = new RGBELoader();
const hdriPath = 'sky.hdr';

const eyeSeparation = 0;
let isLandscape = window.innerWidth > window.innerHeight;

function r2de(radians) {
    return radians * (180 / Math.PI);
}

let wakeLock = null;

async function requestWakeLock() {
    try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('Wake Lock is active!');

        wakeLock.addEventListener('release', () => {
            console.log('Wake Lock was released!');
            wakeLock = null;
        });
    } catch (err) {
        console.error(`${err.name}, ${err.message}`);
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        await wakeLock.release();
        wakeLock = null;
        console.log('Wake Lock released manually.');
    }
}

// Call requestWakeLock() when your Three.js app starts or becomes the focus
requestWakeLock();

// You might want to release the wake lock when the user navigates away
// or when your app is no longer the primary focus.
// For example, you could listen for the 'visibilitychange' event:
document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden' && wakeLock !== null) {
        await releaseWakeLock();
    } else if (document.visibilityState === 'visible' && wakeLock === null) {
        await requestWakeLock();
    }
});

function setRotationFromDegrees(mesh, degreesX, degreesY, degreesZ) {
    // Convert degrees to radians
    const radiansX = THREE.MathUtils.degToRad(degreesX);
    const radiansY = THREE.MathUtils.degToRad(degreesY);
    const radiansZ = THREE.MathUtils.degToRad(degreesZ);

    // Set the rotation using Euler angles
    mesh.rotation.set(radiansX, radiansY, radiansZ);
}

const scene = new THREE.Scene();
const leftCamera = new THREE.PerspectiveCamera(100, 0.5 * window.innerWidth / window.innerHeight, 0.1, 1000);
const rightCamera = new THREE.PerspectiveCamera(100, 0.5 * window.innerWidth / window.innerHeight, 0.1, 1000);
scene.add(leftCamera);
scene.add(rightCamera);

const plge = new THREE.PlaneGeometry(6, 4);
const plma = new THREE.MeshBasicMaterial({ color: 0x000000 });
const guip = new THREE.Mesh(plge, plma);
setRotationFromDegrees(guip, 90, 0, 0)
scene.add(guip);

const loader2f = new FontLoader();

loader2f.load('font.json', function (font) {
    const geometry = new TextGeometry('Welcome to Andrali! :)', {
        font: font,
        size: 0.3,
        depth: 0.01,
        curveSegments: 12,
        bevelEnabled: false,
    });

    const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const textMesh = new THREE.Mesh(geometry, material);

    setRotationFromDegrees(textMesh, 90, 0, 0)
    //textMesh.position.set(guip.position.x - 3.3, guip.position.y, guip.position.z + 2);
    textMesh.position.set(guip.position.x - 2, guip.position.y - 0.01, guip.position.z + 0.75);
    scene.add(textMesh);

    const okbge = new THREE.PlaneGeometry(1.5, 0.75);
    const okbma = new THREE.MeshBasicMaterial({ color: 0x00dd00 });
    const okbmesh = new THREE.Mesh(okbge, okbma);
    setRotationFromDegrees(okbmesh, 90, 0, 0)
    scene.add(okbmesh);
    okbmesh.position.set(guip.position.x - 2, guip.position.y - 0.01, guip.position.z - 1.5);

    const test = new TextGeometry('Continue', {
        font: font,
        size: 0.225,
        depth: 0.01,
        curveSegments: 12,
        bevelEnabled: false,
    });

    const textMeshTest = new THREE.Mesh(test, material);

    setRotationFromDegrees(textMeshTest, 90, 0, 0)
    //textMeshTest.position.set(guip.position.x - 3.3, guip.position.y, guip.position.z + 2);
    textMeshTest.position.set(okbmesh.position.x - 0.575, okbmesh.position.y - 0.01, okbmesh.position.z - 0.1);
    scene.add(textMeshTest);
});

leftCamera.position.y = -3;
rightCamera.position.y = -3;

const renderer = new THREE.WebGLRenderer({
    antialias: false,
    canvas: xrCanvas,
    powerPreference: 'high-performance',
});
renderer.autoClear = false;

loader.load(hdriPath, function (texture) {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;

    const sphereGeometry = new THREE.SphereGeometry(500, 60, 40);
    const sphereMaterial = new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide
    });
    const skySphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    skySphere.rotation.x = Math.PI / 2;
    scene.add(skySphere);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

}, undefined, function (error) {
    console.error('An error occurred while loading the HDRI:', error);
});

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

function handleDeviceOrientation(event) {
    if (event.alpha === null || event.beta === null || event.gamma === null) return;

    const alpha = THREE.MathUtils.degToRad(event.alpha);
    const beta = THREE.MathUtils.degToRad(event.beta);
    const gamma = THREE.MathUtils.degToRad(event.gamma);

    const euler = new THREE.Euler(beta, gamma, alpha, 'XYZ');
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
        output.innerHTML = `Error initializing sensor: ${error.name} - ${event.error.message}. Falling back to DeviceOrientation.`;
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