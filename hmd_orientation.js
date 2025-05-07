import createModule from './orientation.js';

createModule().then((Module) => {
  const calculator = new Module.OrientationCalculator();
  
  self.onmessage = (event) => {
    const { alpha, beta, gamma } = event.data;
    calculator.updateEuler(alpha, beta, gamma);
    const quaternion = calculator.getQuaternion();
    self.postMessage({ quaternion });
  };
});