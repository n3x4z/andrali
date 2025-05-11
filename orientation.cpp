#include <emscripten/bind.h>
#include <cmath>
#include <vector>

// M_PI might not be defined by default in C++, define if necessary
#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

class OrientationCalculator {
private:
    // Quaternion stored as [x, y, z, w]
    double q[4] = { 0.0, 0.0, 0.0, 1.0 }; // Initial identity quaternion: x,y,z,w

public:
    OrientationCalculator() {}

    // Updates the internal quaternion directly
    void updateQuaternion(double qx, double qy, double qz, double qw) {
        q[0] = qx;
        q[1] = qy;
        q[2] = qz;
        q[3] = qw;
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
};

EMSCRIPTEN_BINDINGS(orientation_module) { // Changed module name for clarity
    emscripten::class_<OrientationCalculator>("OrientationCalculator")
        .constructor<>()
        .function("updateQuaternion", &OrientationCalculator::updateQuaternion)
        .function("getQuaternion", &OrientationCalculator::getQuaternion);
}
