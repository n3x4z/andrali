# andrali: an Open Source web-based XR runtime
Android variant of Frialli. Not as widely supported, but in development

Requirements:
- ARCore compatible phone with enough power to pull it off (ARCore returns orientation and position in a world, in this case, of the HMD (Phone))

- If using Android + Desktop, have both devices have modern Wi-Fi (ac/ax) for a better video transmission [This does not apply in an Android + Itself setup (Termux/Winlator) because its a direct communication. Think wired connection from two points inside your phone]

- Optionally, two controllers with 3DOF capability via Bluetooth (6DOF controllers/hands is on the works)

## What can Andrali do?
### Andrali can:
- Interact with a desktop client (to hand OpenXR data: useful for applications like SteamVR or Godot OpenXR)
- Interact with ANYTHING using the Andrali API: a WebSocket based solution for any device to interact with your XR data (Custom desktop clients (PCs, SBCs, laptops, microcontrollers... anything as long as it supports WebSockets and hands back an HMD view applying the data recieved)<br>

### Andralli does:
- Run sensor fusion calculations to output your HMD orientation equivalent (head rotation)
- Run various different algorithms, mixed togethed, to output your HMD position equivalent (head position in the world)
- (WIP): Run a hand tracking model to use your camera to get 1. Position of each hand & 2. What fingers are touching
