import createModule from './orientation.js';

createModule().then((Module) => {
    const calculator = new Module.OrientationCalculator();

    function handleOrientation(event) {
        // Convert degrees to radians
        const alpha = event.alpha ? (event.alpha * Math.PI) / 180 : 0;
        const beta = event.beta ? (event.beta * Math.PI) / 180 : 0;
        const gamma = event.gamma ? (event.gamma * Math.PI) / 180 : 0;

        // Update the calculator with the new Euler angles
        calculator.updateEuler(alpha, beta, gamma);

        // Retrieve the quaternion
        const quaternion = calculator.getQuaternion();

        // Update the DOM with the quaternion values
        const output = document.getElementById('output');
        output.textContent = `HMD Orientation: X=${quaternion[1].toFixed(2)}, Y=${quaternion[2].toFixed(2)}, Z=${quaternion[3].toFixed(2)}`;
    }

    // Add event listener for device orientation
    window.addEventListener('deviceorientation', handleOrientation);
});