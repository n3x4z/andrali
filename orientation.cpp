#include <emscripten/bind.h>
#include <cmath>
#include <vector> // For easier array handling if needed, though emscripten::val::array is fine

// M_PI might not be defined by default in C++, define if necessary
#ifndef M_PI
    #define M_PI 3.14159265358979323846
#endif

class OrientationCalculator {
private:
    // Quaternion stored as [x, y, z, w]
    double q[4] = {0.0, 0.0, 0.0, 1.0}; // Initial identity quaternion: x,y,z,w

public:
    OrientationCalculator() {}

    // Updates the internal quaternion directly
    void updateQuaternion(double qx, double qy, double qz, double qw) {
        q[0] = qx;
        q[1] = qy;
        q[2] = qz;
        q[3] = qw;
    }

    // Updates internal quaternion from Euler angles (alpha: Z, beta: X, gamma: Y)
    // Note: The interpretation of alpha, beta, gamma depends on the calling context.
    // This function assumes a specific Euler angle order (e.g., ZYX) for conversion.
    void updateEuler(double alpha, double beta, double gamma) {
        // Assuming alpha (yaw around Z), beta (pitch around Y'), gamma (roll around X'')
        // Or if input maps directly to device axes: alpha (Z), beta (X), gamma (Y)
        // The original formulas were:
        // w = c1*c2*c3 - s1*s2*s3; x = s1*s2*c3 + c1*c2*s3; y = s1*c2*c3 + c1*s2*s3; z = c1*s2*c3 - s1*c2*s3;
        // where 1=alpha, 2=beta, 3=gamma.
        // Let's adapt to standard ZYX (yaw, pitch, roll) convention for clarity
        // yaw (alpha around Z), pitch (beta around Y), roll (gamma around X)

        double cy = cos(alpha * 0.5); // Yaw
        double sy = sin(alpha * 0.5);
        double cp = cos(beta * 0.5);  // Pitch
        double sp = sin(beta * 0.5);
        double cr = cos(gamma * 0.5); // Roll
        double sr = sin(gamma * 0.5);

        // Quaternion components calculation for ZYX order
        q[3] = cr * cp * cy + sr * sp * sy; // qw
        q[0] = sr * cp * cy - cr * sp * sy; // qx
        q[1] = cr * sp * cy + sr * cp * sy; // qy
        q[2] = cr * cp * sy - sr * sp * cy; // qz
    }

    // Get quaternion as [x, y, z, w]
    emscripten::val getQuaternion() {
        emscripten::val result = emscripten::val::array();
        result.call<void>("push", q[0]); // x
        result.call<void>("push", q[1]); // y
        result.call<void>("push", q[2]); // z
        result.call<void>("push", q[3]); // w
        return result;
    }

    // Get rotation matrix (column-major) from the stored [x,y,z,w] quaternion
    emscripten::val getRotationMatrix() {
        emscripten::val result = emscripten::val::array();

        double _x = q[0];
        double _y = q[1];
        double _z = q[2];
        double _w = q[3];

        double _xx = _x * _x;
        double _xy = _x * _y;
        double _xz = _x * _z;
        double _xw = _x * _w;

        double _yy = _y * _y;
        double _yz = _y * _z;
        double _yw = _y * _w;

        double _zz = _z * _z;
        double _zw = _z * _w;

        // Column 1
        result.call<void>("push", 1.0 - 2.0 * (_yy + _zz));
        result.call<void>("push", 2.0 * (_xy + _zw));
        result.call<void>("push", 2.0 * (_xz - _yw));
        result.call<void>("push", 0.0);

        // Column 2
        result.call<void>("push", 2.0 * (_xy - _zw));
        result.call<void>("push", 1.0 - 2.0 * (_xx + _zz));
        result.call<void>("push", 2.0 * (_yz + _xw));
        result.call<void>("push", 0.0);

        // Column 3
        result.call<void>("push", 2.0 * (_xz + _yw));
        result.call<void>("push", 2.0 * (_yz - _xw));
        result.call<void>("push", 1.0 - 2.0 * (_xx + _yy));
        result.call<void>("push", 0.0);

        // Column 4
        result.call<void>("push", 0.0);
        result.call<void>("push", 0.0);
        result.call<void>("push", 0.0);
        result.call<void>("push", 1.0);

        return result;
    }
};

EMSCRIPTEN_BINDINGS(orientation_module) { // Changed module name for clarity if needed
    emscripten::class_<OrientationCalculator>("OrientationCalculator")
        .constructor<>()
        .function("updateQuaternion", &OrientationCalculator::updateQuaternion)
        .function("updateEuler", &OrientationCalculator::updateEuler)
        .function("getRotationMatrix", &OrientationCalculator::getRotationMatrix)
        .function("getQuaternion", &OrientationCalculator::getQuaternion);
}