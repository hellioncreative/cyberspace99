import './style.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { io } from 'socket.io-client';

const socket = io();

let playerName = "";
const loginScreen = document.getElementById('login-screen');
const gameUi = document.getElementById('game-ui');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

const worldMapPanel = document.getElementById('world-map-panel');
const openWorldMapBtn = document.getElementById('open-world-map-btn');
const closeWorldMapBtn = document.getElementById('close-world-map-btn');
const worldMapList = document.getElementById('world-map-list');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const textureLoader = new THREE.TextureLoader();
const cubeTextureLoader = new THREE.CubeTextureLoader();
const skyboxTexture = cubeTextureLoader.setPath('skybox/').load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
scene.background = skyboxTexture;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
// Network State
const players = {};
const playerMixers = {};

scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

const textureCache = {};
function getTextureMaterial(textureName) {
    if (!textureCache[textureName]) {
        const tex = textureLoader.load('/' + textureName);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        textureCache[textureName] = new THREE.MeshStandardMaterial({ map: tex });
    }
    return textureCache[textureName];
}

const groundGeometry = new THREE.PlaneGeometry(10000, 10000);
const groundTex = textureLoader.load('/ground.png');
groundTex.wrapS = THREE.RepeatWrapping;
groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(1000, 1000); // Tile the texture
const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ map: groundTex }));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

let model, mixer;
const moveSpeed = 6;
const playerRadius = 0.4;
const infoElement = document.getElementById('info');

let currentLevel = 'lobby';
let mazeWalls = [];
let npcs = [];
let exitTiles = [];

const wallSize = 2.0;
const wallHeight = 3.0;

const dialogBox = document.getElementById('dialog-box');
const dialogText = document.getElementById('dialog-text');

const startChars = ['^', '>', 'v', '<'];

// Only start game after login
joinBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
        playerName = name;
        loginScreen.style.display = 'none';
        gameUi.style.display = 'block';
        socket.emit('join', playerName);
        loadWorld();
    }
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

let gltfModelTemplate = null;

const loader = new GLTFLoader();
loader.load('/ghost.gltf', (gltf) => {
    gltfModelTemplate = gltf;
    model = gltf.scene;
    // Don't add to scene until we enter a level
    model.scale.set(0.8, 0.8, 0.8);
    mixer = new THREE.AnimationMixer(model);
    if (gltf.animations.length > 0) mixer.clipAction(gltf.animations[0]).play();
}, undefined, (error) => {
    console.error("Error loading model:", error);
    infoElement.textContent = "Error loading model. Check console and file path.";
});

function addOtherPlayer(playerInfo) {
    if (!gltfModelTemplate) return; // Not loaded yet, will be handled by currentPlayers event later if needed, but usually is fast enough

    // Clone the model for this player using SkeletonUtils to support SkinnedMeshes
    const clonedScene = SkeletonUtils.clone(gltfModelTemplate.scene);
    clonedScene.position.set(playerInfo.pos[0], playerInfo.pos[1], playerInfo.pos[2]);
    clonedScene.quaternion.set(playerInfo.rot[0], playerInfo.rot[1], playerInfo.rot[2], playerInfo.rot[3]);
    clonedScene.scale.set(0.8, 0.8, 0.8);

    // Add nametag
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = '32px monospace';
    ctx.fillStyle = '#4CAF50';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillText(playerInfo.name, 128, 32);

    const nametagTexture = new THREE.CanvasTexture(canvas);
    nametagTexture.minFilter = THREE.LinearFilter;
    const nametagMaterial = new THREE.SpriteMaterial({ map: nametagTexture, depthTest: false, depthWrite: true });
    const nametag = new THREE.Sprite(nametagMaterial);
    nametag.position.y = 2.8;
    nametag.scale.set(3, 0.75, 1);

    clonedScene.add(nametag);

    const otherMixer = new THREE.AnimationMixer(clonedScene);
    if (gltfModelTemplate.animations.length > 0) {
        otherMixer.clipAction(gltfModelTemplate.animations[0]).play();
    }

    scene.add(clonedScene);
    players[playerInfo.id] = clonedScene;
    playerMixers[playerInfo.id] = otherMixer;
}

socket.on('currentPlayers', (serverPlayers) => {
    Object.keys(serverPlayers).forEach((id) => {
        if (id === socket.id) return; // Skip ourselves
        addOtherPlayer(serverPlayers[id]);
    });
});

socket.on('playerJoined', (playerInfo) => {
    addOtherPlayer(playerInfo);
});

socket.on('playerLeft', (playerId) => {
    if (players[playerId]) {
        scene.remove(players[playerId]);
        delete players[playerId];
        delete playerMixers[playerId];
    }
});

socket.on('playerMoved', (playerInfo) => {
    if (players[playerInfo.id]) {
        // Interpolation should be used for production, for now snap to position
        players[playerInfo.id].position.set(playerInfo.pos[0], playerInfo.pos[1], playerInfo.pos[2]);
        players[playerInfo.id].quaternion.set(playerInfo.rot[0], playerInfo.rot[1], playerInfo.rot[2], playerInfo.rot[3]);
    }
});

// Chat Logic
const activeChatBubbles = []; // Tracks localized 3D bubbles

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && playerName) {
        const text = chatInput.value.trim();
        if (text) {
            // Send message but keep chat open
            socket.emit('chatMessage', text);
            chatInput.value = '';
            e.preventDefault();
            e.stopPropagation();
        } else {
            // Empty enter closes the chat
            chatInput.value = '';
            chatInput.blur();
            chatInput.classList.remove('active');
            e.preventDefault(); // Prevent accidental line breaks
            e.stopPropagation(); // Prevent bubbling up to window interact
        }
    }
});

// Global interact to open chat bar
window.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && playerName) {
        if (!chatInput.classList.contains('active')) {
            chatInput.classList.add('active');
            chatInput.focus();
            e.preventDefault();
        }
    }
});

socket.on('chatMessage', (data) => {
    let speakerModel = null;
    if (data.id === socket.id) {
        speakerModel = model; // Local player
    } else if (players[data.id]) {
        speakerModel = players[data.id]; // Remote player
    }

    if (!speakerModel) return;

    // Clear existing bubble for this player (so they only have 1 active bubble)
    const existingIndex = activeChatBubbles.findIndex(b => b.id === data.id);
    if (existingIndex !== -1) {
        const oldBubble = activeChatBubbles[existingIndex];
        if (oldBubble.element && oldBubble.element.parentNode) {
            oldBubble.element.parentNode.removeChild(oldBubble.element);
        }
        activeChatBubbles.splice(existingIndex, 1);
    }

    // Create new floating HTML bubble
    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'chat-bubble';
    bubbleEl.innerHTML = `<strong style="color: #ff3333; font-size: 1.1em;">${data.name}</strong><hr style="margin: 5px 0; border: none; border-top: 2px solid #ddd;" />${data.text}`;
    document.getElementById('game-ui').appendChild(bubbleEl);

    activeChatBubbles.push({
        id: data.id,
        element: bubbleEl,
        model: speakerModel,
        timestamp: Date.now()
    });
});

socket.on('chatHistory', (messages) => {
    // We intentionally ignore DB chat history for 3D proximity chat, 
    // as it only makes sense for real-time localized conversations!
});

// Map Global Coordinates for Teleports
const worldSpawns = {};
let worldRegions = [];

async function loadWorld() {
    mazeWalls.forEach(wall => scene.remove(wall));
    mazeWalls = [];
    npcs.forEach(npc => scene.remove(npc));
    npcs = [];
    exitTiles.forEach(t => scene.remove(t));
    exitTiles = [];

    try {
        const response = await fetch(`/api/world`);
        if (!response.ok) {
            infoElement.textContent = `Error fetching world data.`;
            return;
        }

        const maps = await response.json();
        const wallGeometry = new THREE.BoxGeometry(wallSize, wallHeight, wallSize);

        infoElement.textContent = `Continuous World Loaded - ${maps.length} region(s) connected.`;

        let lobbySpawnX = 0;
        let lobbySpawnZ = 0;
        let lobbyFound = false;

        maps.forEach((mapObj, index) => {
            const mapData = mapObj.data || { spawn: null, objects: [] };
            mapData.objects = mapData.objects || [];
            mapData.spawn = mapData.spawn || { x: 0, z: 2 };

            // Absolute Chunk Positioning System
            let currentX = mapObj.graph_x;
            let currentY = mapObj.graph_y;

            if (currentX === null || currentX === undefined || currentY === null || currentY === undefined) {
                // Auto-layout fallback for rooms without graph coordinates
                const cols = Math.ceil(Math.sqrt(maps.length));
                currentX = (index % cols) * 200 - ((cols * 200) / 2);
                currentY = Math.floor(index / cols) * 200 - ((cols * 200) / 2);
            }

            // Scale factor to map Editor Pixels (120x60 grid) cleanly to 3D World Units (48x48)
            const WORLD_SCALE_X = 0.4;
            const WORLD_SCALE_Z = 0.8;

            const roomOffsetX = currentX * WORLD_SCALE_X;
            const roomOffsetZ = currentY * WORLD_SCALE_Z;

            // Calculate Region Bounding Box for Location Display
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            mapData.objects.forEach(obj => {
                if (obj.x < minX) minX = obj.x;
                if (obj.x > maxX) maxX = obj.x;
                if (obj.z < minZ) minZ = obj.z;
                if (obj.z > maxZ) maxZ = obj.z;
            });

            // Convert local grid bounds to global 3D coordinates
            const globalMinX = roomOffsetX + (minX * wallSize);
            const globalMaxX = roomOffsetX + (maxX * wallSize);
            const globalMinZ = roomOffsetZ + (minZ * wallSize);
            const globalMaxZ = roomOffsetZ + (maxZ * wallSize);

            worldRegions.push({
                name: mapObj.name || "Unknown Region",
                minX: globalMinX - (wallSize / 2),
                maxX: globalMaxX + (wallSize / 2),
                minZ: globalMinZ - (wallSize / 2),
                maxZ: globalMaxZ + (wallSize / 2)
            });

            // Save global spawn for teleports
            const globalSpawnX = roomOffsetX + (mapData.spawn.x * wallSize);
            const globalSpawnZ = roomOffsetZ + (mapData.spawn.z * wallSize);
            worldSpawns[mapObj.id] = { x: globalSpawnX, z: globalSpawnZ };

            if (mapObj.name && mapObj.name.toLowerCase() === 'lobby') {
                lobbyFound = true;
                lobbySpawnX = globalSpawnX;
                lobbySpawnZ = globalSpawnZ;
            }

            // Spawn Room Objects into absolute world space
            mapData.objects.forEach(obj => {
                const xPos = roomOffsetX + (obj.x * wallSize);
                const zPos = roomOffsetZ + (obj.z * wallSize);

                if (obj.type === 'wall') {
                    const tex = obj.texture || 'ground.png';
                    const wall = new THREE.Mesh(wallGeometry, getTextureMaterial(tex));
                    wall.position.set(xPos, wallHeight / 2, zPos);
                    scene.add(wall);
                    wall.userData.box = new THREE.Box3().setFromObject(wall);
                    mazeWalls.push(wall);
                } else if (obj.type === 'ceiling') {
                    // Elevated identical to editor rendering
                    const tex = obj.texture || 'ground.png';
                    const ceilingGeometry = new THREE.BoxGeometry(wallSize, 0.2, wallSize);
                    const ceiling = new THREE.Mesh(ceilingGeometry, getTextureMaterial(tex));
                    ceiling.position.set(xPos, wallHeight, zPos);
                    scene.add(ceiling);
                    // Ceilings are intangible, no Box3 collision data necessary
                } else if (obj.type === 'exit') {
                    const exitGeometry = new THREE.BoxGeometry(wallSize * 0.8, 0.2, wallSize * 0.8);
                    const exitMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00, emissive: 0xcccc00 });
                    const et = new THREE.Mesh(exitGeometry, exitMaterial);
                    et.position.set(xPos, 0.1, zPos);
                    et.userData.box = new THREE.Box3().setFromObject(et);
                    et.userData.targetMapId = obj.targetMapId;
                    scene.add(et);
                    exitTiles.push(et);
                } else if (obj.type === 'npc') {
                    const npcGeometry = new THREE.SphereGeometry(0.5, 32, 16);
                    const npcMaterial = new THREE.MeshPhongMaterial({ color: 0x0088ff, emissive: 0x0055aa });
                    const npc = new THREE.Mesh(npcGeometry, npcMaterial);
                    npc.position.set(xPos, 0.5, zPos);
                    npc.name = obj.name || "Friendly Spirit";
                    npc.interactionMessage = obj.dialog || "Welcome!";
                    npc.radius = 0.5;
                    scene.add(npc);
                    npcs.push(npc);
                }
            });
        }); // End map iteration

        // Move Player to Lobby (or 0,0)
        if (model) {
            if (!scene.children.includes(model)) scene.add(model);
            model.position.set(lobbySpawnX, 0, lobbySpawnZ);

            const startRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            model.quaternion.copy(startRotation);

            socket.emit('playerMove', {
                pos: [model.position.x, 0, model.position.z],
                rot: [model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w]
            });
        }

    } catch (error) {
        console.error("Error loading world:", error);
        infoElement.textContent = `Error assembling continuous world. Check console.`;
    }
}

closeWorldMapBtn.addEventListener('click', () => {
    worldMapPanel.style.display = 'none';
});

let cameraAzimuth = Math.PI;
const cameraElevation = 0.4;
const cameraDistance = 2.8;

let gamepad = null, gamepadIndex = null, aButtonPressed = false, bButtonPressed = false;
window.addEventListener("gamepadconnected", e => {
    gamepad = e.gamepad; gamepadIndex = e.gamepad.index;
    infoElement.textContent = `Gamepad connected: ${gamepad.id}`;
});
window.addEventListener("gamepaddisconnected", e => {
    if (gamepadIndex === e.gamepad.index) {
        gamepad = null; gamepadIndex = null;
        infoElement.textContent = "Connect a gamepad and press a button.";
    }
});

const clock = new THREE.Clock();
const cameraForward = new THREE.Vector3();
const cameraRight = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const cameraRaycaster = new THREE.Raycaster();

const keys = { w: false, a: false, s: false, d: false, q: false, e: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, enter: false, escape: false };
const keyToButton = { 'w': 'ArrowUp', 'a': 'ArrowLeft', 's': 'ArrowDown', 'd': 'ArrowRight' };

window.addEventListener('keydown', (e) => {
    if (document.activeElement === chatInput && e.key !== 'Enter' && e.key !== 'Escape') return;

    let key = e.key;
    if (keyToButton[key]) key = keyToButton[key];
    if (key === 'Enter') keys.enter = true;
    if (key === 'Escape') keys.escape = true;
    if (keys.hasOwnProperty(key)) keys[key] = true;
});

window.addEventListener('keyup', (e) => {
    if (document.activeElement === chatInput && e.key !== 'Enter' && e.key !== 'Escape') return;

    let key = e.key;
    if (keyToButton[key]) key = keyToButton[key];
    if (key === 'Enter') keys.enter = false;
    if (key === 'Escape') keys.escape = false;
    if (keys.hasOwnProperty(key)) keys[key] = false;
});

// Pointer Lock and Mouse Look
let mouseDeltaX = 0;
document.addEventListener('click', () => {
    // Only request pointer lock if we are actively in the game UI (not login)
    if (document.getElementById('game-ui').style.display === 'block') {
        if (document.pointerLockElement !== document.body) {
            document.body.requestPointerLock();
        }
    }
});

document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body) {
        mouseDeltaX += e.movementX;
    }
});

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (navigator.getGamepads()[gamepadIndex]) gamepad = navigator.getGamepads()[gamepadIndex];

    if (model && !dialogBox.classList.contains('visible')) {
        let inputX = 0;
        let inputY = 0;

        if (keys['ArrowLeft']) inputX -= 1;
        if (keys['ArrowRight']) inputX += 1;
        if (keys['ArrowUp']) inputY -= 1;
        if (keys['ArrowDown']) inputY += 1;

        if (gamepad) {
            const leftStickX = gamepad.axes[0];
            const leftStickY = gamepad.axes[1];
            const deadzone = 0.15;
            if (Math.abs(leftStickX) > deadzone) inputX = leftStickX;
            if (Math.abs(leftStickY) > deadzone) inputY = leftStickY;
        }

        if (inputX !== 0 || inputY !== 0) {
            camera.getWorldDirection(cameraForward);
            cameraForward.y = 0;
            cameraForward.normalize();
            cameraRight.crossVectors(camera.up, cameraForward).negate();

            // Normalize keyboard input so diagonal isn't faster
            const inputLength = Math.sqrt(inputX * inputX + inputY * inputY);
            if (inputLength > 1) {
                inputX /= inputLength;
                inputY /= inputLength;
            }

            moveVector.copy(cameraForward).multiplyScalar(-inputY).add(cameraRight.multiplyScalar(inputX));
            moveVector.normalize().multiplyScalar(moveSpeed * delta);

            const allCollidables = [...mazeWalls, ...npcs];

            const moveX = new THREE.Vector3(moveVector.x, 0, 0);
            const playerColliderX = new THREE.Box3().setFromCenterAndSize(model.position.clone().add(moveX), new THREE.Vector3(playerRadius * 2, wallHeight, playerRadius * 2));
            let collisionX = false;
            for (const obj of allCollidables) {
                const objBox = obj.radius ? new THREE.Box3().setFromCenterAndSize(obj.position, new THREE.Vector3(obj.radius * 2, obj.radius * 2, obj.radius * 2)) : obj.userData.box;
                if (playerColliderX.intersectsBox(objBox)) {
                    collisionX = true;
                    break;
                }
            }
            if (!collisionX) model.position.add(moveX);

            const moveZ = new THREE.Vector3(0, 0, moveVector.z);
            const playerColliderZ = new THREE.Box3().setFromCenterAndSize(model.position.clone().add(moveZ), new THREE.Vector3(playerRadius * 2, wallHeight, playerRadius * 2));
            let collisionZ = false;
            for (const obj of allCollidables) {
                const objBox = obj.radius ? new THREE.Box3().setFromCenterAndSize(obj.position, new THREE.Vector3(obj.radius * 2, obj.radius * 2, obj.radius * 2)) : obj.userData.box;
                if (playerColliderZ.intersectsBox(objBox)) {
                    collisionZ = true;
                    break;
                }
            }
            if (!collisionZ) model.position.add(moveZ);

            model.position.y = 0;

            if (moveVector.lengthSq() > 0.0001) {
                const targetAngle = Math.atan2(moveVector.x, moveVector.z);
                const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                model.quaternion.slerp(targetQuaternion, 0.2);
            }

            // Only emit if moving or rotating
            if (moveVector.lengthSq() > 0.0001 || rotX !== 0) {
                socket.emit('playerMove', {
                    pos: [model.position.x, 0, model.position.z],
                    rot: [model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w]
                });
            }

            if (exitTiles.length > 0) {
                const playerBox = new THREE.Box3().setFromObject(model);
                for (let i = 0; i < exitTiles.length; i++) {
                    const et = exitTiles[i];
                    if (playerBox.intersectsBox(et.userData.box)) {
                        const targetId = et.userData.targetMapId || 'lobby';
                        const spawnCoord = worldSpawns[targetId] || worldSpawns['lobby'];
                        if (spawnCoord) {
                            model.position.set(spawnCoord.x, 0, spawnCoord.z);

                            // Broadcast instant exact teleportation position
                            socket.emit('playerMove', {
                                pos: [model.position.x, 0, model.position.z],
                                rot: [model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w]
                            });
                        }
                        break;
                    }
                }
            }
        }
    }

    // Camera Rotation
    let rotX = 0;

    // Apply Keyboard Rotation
    if (keys['q']) rotX -= 1.5;
    if (keys['e']) rotX += 1.5;

    // Apply Mouse Look
    if (mouseDeltaX !== 0) {
        cameraAzimuth -= mouseDeltaX * 0.003;
        mouseDeltaX = 0;
    }

    if (gamepad) {
        const rightStickX = gamepad.axes[2];
        const deadzone = 0.15;
        if (Math.abs(rightStickX) > deadzone) rotX = rightStickX;
    }

    if (rotX !== 0) {
        const rotationSpeed = 2.5;
        cameraAzimuth -= rotX * rotationSpeed * delta;
    }

    // Interactions
    const interactPressed = keys.enter || (gamepad && gamepad.buttons[0].pressed);
    const cancelPressed = keys.escape || (gamepad && gamepad.buttons[1].pressed);

    if (interactPressed && !aButtonPressed && !dialogBox.classList.contains('visible')) {
        aButtonPressed = true;
        if (model) {
            for (const currentNpc of npcs) {
                if (model.position.distanceTo(currentNpc.position) < 2.0) {
                    dialogText.textContent = currentNpc.interactionMessage;
                    dialogBox.classList.add('visible');
                    break;
                }
            }
        }
    } else if (!interactPressed) aButtonPressed = false;

    if (cancelPressed && !bButtonPressed && dialogBox.classList.contains('visible')) {
        bButtonPressed = true;
        dialogBox.classList.remove('visible');
    } else if (!cancelPressed) bButtonPressed = false;

    if (mixer) {
        mixer.update(delta);
    }

    // Update other players' animations
    Object.values(playerMixers).forEach(pm => {
        if (pm) pm.update(delta);
    });

    // Update Region Location UI
    if (model) {
        let foundRegion = "The Void";
        for (let i = 0; i < worldRegions.length; i++) {
            const r = worldRegions[i];
            if (model.position.x >= r.minX && model.position.x <= r.maxX &&
                model.position.z >= r.minZ && model.position.z <= r.maxZ) {
                foundRegion = r.name;
                break;
            }
        }

        const expectedText = `Location: ${foundRegion}`;
        if (infoElement.textContent !== expectedText) {
            infoElement.textContent = expectedText;
        }
    }

    if (model && scene.children.includes(model)) {
        const targetPosition = model.position.clone().add(new THREE.Vector3(0, 1.2, 0));

        const idealCamX = targetPosition.x + cameraDistance * Math.sin(cameraAzimuth) * Math.cos(cameraElevation);
        const idealCamZ = targetPosition.z + cameraDistance * Math.cos(cameraAzimuth) * Math.cos(cameraElevation);
        const idealCamY = targetPosition.y + cameraDistance * Math.sin(cameraElevation);
        const idealCameraPos = new THREE.Vector3(idealCamX, idealCamY, idealCamZ);

        const cameraDirection = idealCameraPos.clone().sub(targetPosition).normalize();
        cameraRaycaster.set(targetPosition, cameraDirection);
        const intersects = cameraRaycaster.intersectObjects(mazeWalls);

        let finalDistance = cameraDistance;
        if (intersects.length > 0) {
            finalDistance = Math.min(cameraDistance, intersects[0].distance - 0.2);
        }

        const finalCameraPos = targetPosition.clone().add(cameraDirection.multiplyScalar(finalDistance));

        camera.position.copy(finalCameraPos);
        camera.lookAt(targetPosition);
    }

    // Update Spatial Chat Bubbles
    const now = Date.now();
    for (let i = activeChatBubbles.length - 1; i >= 0; i--) {
        const bubble = activeChatBubbles[i];

        // Remove bubbles after 8 seconds
        if (now - bubble.timestamp > 8000) {
            if (bubble.element && bubble.element.parentNode) {
                bubble.element.parentNode.removeChild(bubble.element);
            }
            activeChatBubbles.splice(i, 1);
            continue;
        }

        if (model && bubble.model) {
            // Target the space slightly above the player's head
            const basePosition = bubble.model.position.clone();
            basePosition.y += 1.0;

            const distance = basePosition.distanceTo(model.position);

            if (distance > 30) {
                // Too far to see
                bubble.element.style.opacity = '0';
            } else {
                let opacity = 1.0;
                let blur = 0;
                let scale = 1.0;

                // Close proximity is perfectly readable
                // Outside the immediate circle, it rapidly blurs and fades
                if (distance > 4) {
                    opacity = Math.max(0, 1.0 - ((distance - 4) / 22));
                    blur = (distance - 4) * 0.8;
                    scale = Math.max(0.6, 1.0 - ((distance - 4) / 44));
                }

                // Project 3D coordinate to 2D HTML Screen space
                const vector = basePosition.project(camera);

                // Only render if within the camera's forward view frustum (z < 1)
                if (vector.z < 1) {
                    const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
                    const y = -(vector.y * 0.5 - 0.5) * window.innerHeight;

                    bubble.element.style.left = `${x}px`;
                    bubble.element.style.top = `${y}px`;
                    // Let CSS handle the offset translate
                    bubble.element.style.transform = `translate(15px, calc(-100% - 15px)) scale(${scale})`;
                    bubble.element.style.filter = `blur(${blur}px)`;
                    bubble.element.style.opacity = opacity.toString();
                } else {
                    bubble.element.style.opacity = '0'; // Behind the camera
                }
            }
        }
    }

    // Floating Chat Bar tracking beneath the local player
    const inputEl = document.getElementById('chat-input');
    const containerEl = document.getElementById('chat-container');
    if (model && inputEl && inputEl.classList.contains('active')) {
        const inputPos = model.position.clone();

        // Project local player base to screen space
        const v = inputPos.project(camera);
        if (v.z < 1) {
            const x = (v.x * 0.5 + 0.5) * window.innerWidth;
            const y = -(v.y * 0.5 - 0.5) * window.innerHeight;

            containerEl.style.left = `${x}px`;
            containerEl.style.top = `${y}px`;
        }
    }

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
