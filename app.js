const worker = new Worker('./hmd_orientation.js', { type: 'module' });
import * as THREE from './three.module.js';

const output = document.getElementById('output');
let orientation_x = 0
let orientation_y = 0
let orientation_z = 0

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
    orientation_x = quaternion[1]
    orientation_y = quaternion[2]
    orientation_z = quaternion[3]
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);

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

    cube.rotation.x = orientation_x;
    cube.rotation.y = orientation_y;
    cube.rotation.z = orientation_z;

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