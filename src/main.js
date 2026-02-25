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

const groundGeometry = new THREE.PlaneGeometry(100, 100);
const ground = new THREE.Mesh(groundGeometry, getTextureMaterial('ground.png'));
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
        loadLevel(currentLevel);
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
    nametag.position.y = 3.5;
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
chatInput.addEventListener('keypress', (e) => {
    // Only send if we are logged in
    if (e.key === 'Enter' && playerName) {
        const text = chatInput.value.trim();
        if (text) {
            socket.emit('chatMessage', text);
            chatInput.value = '';
        }
    }
});

socket.on('chatMessage', (data) => {
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerHTML = `<span class="author">${data.name}:</span> ${data.text}`;
    chatMessages.appendChild(msgEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('chatHistory', (messages) => {
    messages.forEach(data => {
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg';
        msgEl.innerHTML = `<span class="author">${data.name}:</span> ${data.text}`;
        chatMessages.appendChild(msgEl);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

async function loadLevel(levelIndex) {
    mazeWalls.forEach(wall => scene.remove(wall));
    mazeWalls = [];
    npcs.forEach(npc => scene.remove(npc));
    npcs = [];
    exitTiles.forEach(t => scene.remove(t));
    exitTiles = [];

    try {
        const response = await fetch(`/api/maps/${levelIndex}`);
        if (!response.ok) {
            infoElement.textContent = `You beat the game! No map found.`;
            return;
        }
        const dbRow = await response.json();

        const mapData = {};
        mapData.name = dbRow.name || "Untitled";
        mapData.id = dbRow.id || levelIndex;
        mapData.spawn = dbRow.data?.spawn || dbRow.spawn || { x: 0, z: 2 };
        mapData.objects = dbRow.data?.objects || dbRow.objects || [];

        infoElement.textContent = `Joined Room: ${mapData.name} - Connect a gamepad and press a button.`;

        const wallGeometry = new THREE.BoxGeometry(wallSize, wallHeight, wallSize);

        // Spawn player at map spawn point
        if (model && mapData.spawn) {
            if (!scene.children.includes(model)) scene.add(model);

            let spawnX = mapData.spawn.x * wallSize;
            let spawnZ = mapData.spawn.z * wallSize;

            if (mapData.name.toLowerCase() === 'lobby') {
                let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
                const occupied = new Set();
                mapData.objects.forEach(obj => {
                    if (obj.x < minX) minX = obj.x;
                    if (obj.x > maxX) maxX = obj.x;
                    if (obj.z < minZ) minZ = obj.z;
                    if (obj.z > maxZ) maxZ = obj.z;
                    occupied.add(`${obj.x},${obj.z}`);
                });

                const emptyTiles = [];
                for (let x = minX + 1; x < maxX; x++) {
                    for (let z = minZ + 1; z < maxZ; z++) {
                        if (!occupied.has(`${x},${z}`)) {
                            emptyTiles.push({ x, z });
                        }
                    }
                }

                if (emptyTiles.length > 0) {
                    const randomTile = emptyTiles[Math.floor(Math.random() * emptyTiles.length)];
                    spawnX = randomTile.x * wallSize;
                    spawnZ = randomTile.z * wallSize;
                }
            }

            model.position.set(spawnX, 0, spawnZ);

            // Default look north
            const startRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            model.quaternion.copy(startRotation);

            socket.emit('playerMove', {
                pos: [model.position.x, 0, model.position.z],
                rot: [model.quaternion.x, model.quaternion.y, model.quaternion.z, model.quaternion.w]
            });
        }

        mapData.objects.forEach(obj => {
            const xPos = obj.x * wallSize;
            const zPos = obj.z * wallSize;

            if (obj.type === 'wall') {
                const tex = obj.texture || 'ground.png';
                const wall = new THREE.Mesh(wallGeometry, getTextureMaterial(tex));
                wall.position.set(xPos, wallHeight / 2, zPos);
                scene.add(wall);
                wall.userData.box = new THREE.Box3().setFromObject(wall);
                mazeWalls.push(wall);
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

    } catch (error) {
        console.error("Error loading map:", error);
        infoElement.textContent = `Error loading room. Check console.`;
    }
}

// World Map List Logic
openWorldMapBtn.addEventListener('click', async () => {
    worldMapPanel.style.display = 'block';
    worldMapList.innerHTML = '<div style="text-align:center; color:#888;">Scanning network...</div>';

    try {
        const res = await fetch('/api/maps');
        const maps = await res.json();

        worldMapList.innerHTML = '';
        if (!maps || maps.length === 0) {
            worldMapList.innerHTML = '<div style="text-align:center; color:#888;">No rooms available.</div>';
            return;
        }

        maps.forEach(m => {
            const btn = document.createElement('button');
            btn.textContent = m.name || "Untitled Room";
            btn.style = "background: #2a2a3a; color: white; padding: 14px; border: 1px solid #445; border-radius: 6px; cursor: pointer; text-align: left; transition: all 0.2s; font-weight: bold; font-size: 16px;";
            btn.onmouseover = () => { btn.style.background = "#3a3a4a"; btn.style.borderColor = "#00aaff"; };
            btn.onmouseout = () => { btn.style.background = "#2a2a3a"; btn.style.borderColor = "#445"; };
            btn.onclick = () => {
                worldMapPanel.style.display = 'none';
                currentLevel = m.id;
                loadLevel(m.id);
            };
            worldMapList.appendChild(btn);
        });
    } catch (e) {
        console.error(e);
        worldMapList.innerHTML = '<div style="text-align:center; color:#ff4444;">Connection failed.</div>';
    }
});

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

const keys = { w: false, a: false, s: false, d: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, enter: false, escape: false };
const keyToButton = { 'w': 'ArrowUp', 'a': 'ArrowLeft', 's': 'ArrowDown', 'd': 'ArrowRight' };

window.addEventListener('keydown', (e) => {
    let key = e.key;
    if (keyToButton[key]) key = keyToButton[key];
    if (key === 'Enter') keys.enter = true;
    if (key === 'Escape') keys.escape = true;
    if (keys.hasOwnProperty(key)) keys[key] = true;
});

window.addEventListener('keyup', (e) => {
    let key = e.key;
    if (keyToButton[key]) key = keyToButton[key];
    if (key === 'Enter') keys.enter = false;
    if (key === 'Escape') keys.escape = false;
    if (keys.hasOwnProperty(key)) keys[key] = false;
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
                        if (et.userData.targetMapId) {
                            currentLevel = et.userData.targetMapId;
                            loadLevel(currentLevel);
                        } else {
                            // Fallback logic
                            currentLevel = 'lobby';
                            loadLevel(currentLevel);
                        }
                        break;
                    }
                }
            }
        }
    }

    // Camera Rotation
    let rotX = 0;
    if (keys['a']) rotX -= 1; // Or q/e if you wanted them for rotation
    if (keys['d']) rotX += 1;

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

    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
