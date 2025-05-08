const worker = new Worker('./hmd_orientation.js', { type: 'module' });
import * as THREE from './three.module.js';

const output = document.getElementById('output');
let orientation_x,orientation_y,orientation_z

function r2de(radians) {
    return radians * (180 / Math.PI);
}

window.addEventListener('deviceorientation', (event) => {
    const alpha = event.alpha ? (event.alpha * Math.PI) / 180 : 0;
    const beta = event.beta ? (event.beta * Math.PI) / 180 : 0;
    const gamma = event.gamma ? (event.gamma * Math.PI) / 180 : 0;

    worker.postMessage({ alpha, beta, gamma });
});

worker.onmessage = (event) => {
    const { quaternion } = event.data;
    output.textContent = `HMD Orientation: X=${quaternion[1].toFixed(2)}, Y=${quaternion[2].toFixed(2)}, Z=${quaternion[3].toFixed(2)}`;

    orientation_x = r2de(quaternion[1])
    orientation_y = r2de(quaternion[2])
    orientation_z = r2de(quaternion[3])
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 5;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

function animate() {

    cube.rotation.x += orientation_x;
    cube.rotation.y += orientation_y;
    cube.rotation.z += orientation_z;

    renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);