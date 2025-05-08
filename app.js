const worker = new Worker('./hmd_orientation.js', { type: 'module' });
import * as THREE from './three.module.js';

const output = document.getElementById('output');
let orientation_x = 0;
let orientation_y = 0;
let orientation_z = 0;

function r2de(radians) {
    return radians * (180 / Math.PI);
}

window.addEventListener('deviceorientation', (event) => {
    // Convert degrees to radians
    const alpha = event.alpha ? (event.alpha * Math.PI) / 180 : 0; // Z-axis rotation (yaw)
    const beta = event.beta ? (event.beta * Math.PI) / 180 : 0;   // X-axis rotation (pitch)
    const gamma = event.gamma ? (event.gamma * Math.PI) / 180 : 0; // Y-axis rotation (roll)

    // Adjust to Three.js coordinate system
    const threejsOrientation_x = beta;   // Pitch corresponds to X in Three.js
    const threejsOrientation_y = -gamma;  // Roll corresponds to Y in Three.js (inverted)
    const threejsOrientation_z = alpha;   // Yaw corresponds to Z in Three.js

    // Send the adjusted orientation to the worker
    worker.postMessage({ alpha: threejsOrientation_z, beta: threejsOrientation_x, gamma: threejsOrientation_y });
});

worker.onmessage = (event) => {
    const { quaternion } = event.data;

    // Assuming quaternion is in the format [x, y, z, w]
    // Adjust the orientation values to match Three.js
    orientation_x = quaternion[1]; // Y-axis in Three.js
    orientation_y = quaternion[2]; // Z-axis in Three.js
    orientation_z = quaternion[3]; // X-axis in Three.js

    // Optionally, you can log or display the orientation values
    output.innerHTML = `Orientation X: ${r2de(orientation_x)}, Y: ${r2de(orientation_y)}, Z: ${r2de(orientation_z)}`;
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);

const axesHelper = new THREE.AxesHelper( 2 );
scene.add( axesHelper );

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({
    antialias: false,
    canvas: document.getElementById("xrdisp")
});

renderer.setSize(window.innerWidth, window.innerHeight);

function animate() {
    requestAnimationFrame( animate );

    camera.rotation.x = orientation_x;
    camera.rotation.y = orientation_y;
    camera.rotation.z = orientation_z;

    renderer.render(scene, camera);
}

function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
} onWindowResize()

window.addEventListener('resize', onWindowResize, false);

animate();