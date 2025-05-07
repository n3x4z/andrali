#include <emscripten/bind.h>
#include <cmath>

class OrientationCalculator {
private:
    double alpha = 0, beta = 0, gamma = 0;
    double q[4] = {1, 0, 0, 0}; // Quaternion representation
    
public:
    void updateEuler(double a, double b, double g) {
        alpha = a;
        beta = b;
        gamma = g;
        
        // Convert Euler angles to quaternion
        double c1 = cos(alpha / 2);
        double c2 = cos(beta / 2);
        double c3 = cos(gamma / 2);
        
        double s1 = sin(alpha / 2);
        double s2 = sin(beta / 2);
        double s3 = sin(gamma / 2);
        
        q[0] = c1 * c2 * c3 - s1 * s2 * s3; // w
        q[1] = s1 * s2 * c3 + c1 * c2 * s3; // x
        q[2] = s1 * c2 * c3 + c1 * s2 * s3; // y
        q[3] = c1 * s2 * c3 - s1 * c2 * s3; // z
    }
    
    // Get rotation matrix (column-major)
    emscripten::val getRotationMatrix() {
        emscripten::val result = emscripten::val::array();
        
        // Convert quaternion to rotation matrix
        double xx = q[1] * q[1];
        double xy = q[1] * q[2];
        double xz = q[1] * q[3];
        double xw = q[1] * q[0];
        
        double yy = q[2] * q[2];
        double yz = q[2] * q[3];
        double yw = q[2] * q[0];
        
        double zz = q[3] * q[3];
        double zw = q[3] * q[0];
        
        result.call<void>("push", 1 - 2 * (yy + zz));
        result.call<void>("push", 2 * (xy - zw));
        result.call<void>("push", 2 * (xz + yw));
        result.call<void>("push", 0);
        
        result.call<void>("push", 2 * (xy + zw));
        result.call<void>("push", 1 - 2 * (xx + zz));
        result.call<void>("push", 2 * (yz - xw));
        result.call<void>("push", 0);
        
        result.call<void>("push", 2 * (xz - yw));
        result.call<void>("push", 2 * (yz + xw));
        result.call<void>("push", 1 - 2 * (xx + yy));
        result.call<void>("push", 0);
        
        result.call<void>("push", 0);
        result.call<void>("push", 0);
        result.call<void>("push", 0);
        result.call<void>("push", 1);
        
        return result;
    }
    
    // Get quaternion
    emscripten::val getQuaternion() {
        emscripten::val result = emscripten::val::array();
        result.call<void>("push", q[0]);
        result.call<void>("push", q[1]);
        result.call<void>("push", q[2]);
        result.call<void>("push", q[3]);
        return result;
    }
};

EMSCRIPTEN_BINDINGS(orientation) {
    emscripten::class_<OrientationCalculator>("OrientationCalculator")
        .constructor<>()
        .function("updateEuler", &OrientationCalculator::updateEuler)
        .function("getRotationMatrix", &OrientationCalculator::getRotationMatrix)
        .function("getQuaternion", &OrientationCalculator::getQuaternion);
}
