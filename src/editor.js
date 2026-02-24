import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';


function initEditor() {
    // --- Editor State ---
    const mapData = {
        name: "New Room",
        spawn: { x: 0, z: 0 },
        objects: []
    };

    const gridSize = 100;
    const wallSize = 2.0;
    const wallHeight = 3.0;
    let currentTool = 'wall';

    // --- DOM Elements ---
    const mapNameInput = document.getElementById('map-name');
    const saveBtn = document.getElementById('save-btn');
    const statusMsg = document.getElementById('status-msg');
    const mapSelect = document.getElementById('map-select');
    const loadBtn = document.getElementById('load-btn');
    const worldMapPanel = document.getElementById('world-map-panel');
    const openWorldMapBtn = document.getElementById('open-world-map-btn');
    const closeWorldMapBtn = document.getElementById('close-world-map-btn');
    const worldMapList = document.getElementById('world-map-list');

    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTool = e.target.dataset.tool;
        });
    });

    if (mapNameInput) mapNameInput.addEventListener('change', (e) => mapData.name = e.target.value);

    // --- Three.js Setup ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 20, 20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.mouseButtons = {
        LEFT: THREE.MOUSE.NONE, // Free up left click for tool painting
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE
    };

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(gridSize, gridSize / wallSize, 0x888888, 0x444444);
    gridHelper.position.set(wallSize / 2, 0, wallSize / 2); // Shift grid lines to border the blocks
    scene.add(gridHelper);

    // Raycaster & Mouse
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const planeGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
    planeGeometry.rotateX(-Math.PI / 2);
    const invisiblePlane = new THREE.Mesh(planeGeometry, new THREE.MeshBasicMaterial({ visible: false }));
    scene.add(invisiblePlane);

    // Textures & Materials
    const textureLoader = new THREE.TextureLoader();
    const wallTexture = textureLoader.load('/ground.png');
    wallTexture.wrapS = THREE.RepeatWrapping;
    wallTexture.wrapT = THREE.RepeatWrapping;
    const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd, map: wallTexture });
    const wallGeometry = new THREE.BoxGeometry(wallSize, wallHeight, wallSize);

    const npcMaterial = new THREE.MeshPhongMaterial({ color: 0x0088ff });
    const npcGeometry = new THREE.SphereGeometry(wallSize / 4, 16, 16);

    const exitMaterial = new THREE.MeshPhongMaterial({ color: 0xffff00 });
    const exitGeometry = new THREE.BoxGeometry(wallSize * 0.8, 0.2, wallSize * 0.8);

    let spawnIndicator;
    function updateSpawnIndicator() {
        if (spawnIndicator) scene.remove(spawnIndicator);
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        spawnIndicator = new THREE.Mesh(geometry, material);
        spawnIndicator.position.set(mapData.spawn.x * wallSize, 0.1, mapData.spawn.z * wallSize);
        scene.add(spawnIndicator);
    }
    updateSpawnIndicator();

    const placedObjects = new Map(); // key `${rx},${rz}` -> Mesh

    let isPainting = false;

    window.addEventListener('pointerdown', (e) => {
        if (e.target.tagName !== 'CANVAS' || e.button !== 0) return; // Only trigger paint on Primary Left Click
        isPainting = true;
        paintOrErase(e, false);
    });

    window.addEventListener('pointermove', (e) => {
        if (!isPainting) return;
        paintOrErase(e, true);
    });

    window.addEventListener('pointerup', (e) => {
        if (e.button === 0) {
            isPainting = false;
        }
    });

    function paintOrErase(e, isDrag) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        // If erasing, check existing objects first
        if (currentTool === 'erase') {
            const intersects = raycaster.intersectObjects(Array.from(placedObjects.values()));
            if (intersects.length > 0) {
                const hit = intersects[0].object;
                const key = hit.userData.gridKey;
                scene.remove(hit);
                placedObjects.delete(key);
                mapData.objects = mapData.objects.filter(o => o.gridKey !== key);
            }
            return;
        }

        // Otherwise place on grid
        const intersects = raycaster.intersectObject(invisiblePlane);
        if (intersects.length > 0) {
            const point = intersects[0].point;
            // Snap to grid coordinates (wallSize units)
            const rx = Math.round(point.x / wallSize);
            const rz = Math.round(point.z / wallSize);
            const gridKey = `${rx},${rz}`;

            if (currentTool === 'spawn') {
                mapData.spawn = { x: rx, z: rz };
                updateSpawnIndicator();
                return;
            }

            // Don't place multiple objects on same tile
            if (placedObjects.has(gridKey)) return;

            let mesh = null;
            let objData = { x: rx, z: rz, gridKey };

            if (currentTool === 'wall') {
                mesh = new THREE.Mesh(wallGeometry, wallMaterial);
                mesh.position.set(rx * wallSize, wallHeight / 2, rz * wallSize);
                objData.type = 'wall';
                objData.texture = 'ground.png';
            } else if (currentTool === 'npc') {
                if (isDrag) return; // Don't spam prompt while dragging
                mesh = new THREE.Mesh(npcGeometry, npcMaterial);
                mesh.position.set(rx * wallSize, 0.5, rz * wallSize);
                objData.type = 'npc';
                objData.dialog = prompt("Enter NPC dialog:", "Hello!");
                if (!objData.dialog) return; // Cancelled
            } else if (currentTool === 'exit') {
                if (isDrag) return; // Exit setup might need a prompt later too
                mesh = new THREE.Mesh(exitGeometry, exitMaterial);
                mesh.position.set(rx * wallSize, 0.1, rz * wallSize);
                objData.type = 'exit';
                objData.targetMapId = prompt("Enter Target Room ID (UUID) for this exit:", "");
                if (!objData.targetMapId) return; // Cancelled
            }

            if (mesh) {
                mesh.userData.gridKey = gridKey;
                scene.add(mesh);
                placedObjects.set(gridKey, mesh);
                mapData.objects.push(objData);
            }
        }
    }

    if (saveBtn) saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        statusMsg.textContent = "Saving...";

        // Clean up internal gridKeys before saving
        const cleanData = JSON.parse(JSON.stringify(mapData));
        cleanData.objects.forEach(o => delete o.gridKey);

        try {
            const response = await fetch('/api/maps/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cleanData)
            });

            if (response.ok) {
                statusMsg.textContent = "Saved successfully!";
                setTimeout(() => statusMsg.textContent = "", 3000);
            } else {
                statusMsg.textContent = "Error saving map.";
            }
        } catch (err) {
            statusMsg.textContent = "Network error.";
        }
        saveBtn.disabled = false;
    });

    async function fetchMapList() {
        try {
            const res = await fetch('/api/maps');
            const list = await res.json();
            if (!mapSelect) return;
            mapSelect.innerHTML = '<option value="">-- New Map --</option>';
            list.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name;
                mapSelect.appendChild(opt);
            });
        } catch (e) {
            console.error("Map list fetch error:", e);
        }
    }
    if (mapSelect) fetchMapList();

    if (openWorldMapBtn) openWorldMapBtn.addEventListener('click', async () => {
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
                    if (mapSelect) {
                        mapSelect.value = m.id;
                        if (loadBtn) loadBtn.click();
                    }
                };
                worldMapList.appendChild(btn);
            });
        } catch (e) {
            console.error(e);
            worldMapList.innerHTML = '<div style="text-align:center; color:#ff4444;">Connection failed.</div>';
        }
    });

    if (closeWorldMapBtn) closeWorldMapBtn.addEventListener('click', () => {
        worldMapPanel.style.display = 'none';
    });

    if (loadBtn) loadBtn.addEventListener('click', async () => {
        const id = mapSelect.value;
        if (!id) {
            mapData.id = undefined;
            mapData.name = "New Room";
            mapData.spawn = { x: 0, z: 0 };
            mapData.objects = [];
            if (mapNameInput) mapNameInput.value = "New Room";
            Array.from(placedObjects.values()).forEach(mesh => scene.remove(mesh));
            placedObjects.clear();
            updateSpawnIndicator();
            statusMsg.textContent = "New map ready.";
            return;
        }

        loadBtn.disabled = true;
        statusMsg.textContent = "Loading...";
        try {
            const res = await fetch(`/api/maps/${id}`);
            if (!res.ok) throw new Error("Load failed");
            const data = await res.json();

            mapData.id = data.id || id;
            mapData.name = data.name || "Untitled";
            mapData.spawn = data.data?.spawn || { x: 0, z: 0 };
            mapData.objects = data.data?.objects || [];
            if (mapNameInput) mapNameInput.value = mapData.name;

            Array.from(placedObjects.values()).forEach(mesh => scene.remove(mesh));
            placedObjects.clear();

            mapData.objects.forEach(obj => {
                let mesh = null;
                if (obj.type === 'wall') {
                    mesh = new THREE.Mesh(wallGeometry, wallMaterial);
                    mesh.position.set(obj.x * wallSize, wallHeight / 2, obj.z * wallSize);
                } else if (obj.type === 'npc') {
                    mesh = new THREE.Mesh(npcGeometry, npcMaterial);
                    mesh.position.set(obj.x * wallSize, 0.5, obj.z * wallSize);
                } else if (obj.type === 'exit') {
                    mesh = new THREE.Mesh(exitGeometry, exitMaterial);
                    mesh.position.set(obj.x * wallSize, 0.1, obj.z * wallSize);
                }

                if (mesh) {
                    const gridKey = `${obj.x},${obj.z}`;
                    mesh.userData.gridKey = gridKey;
                    scene.add(mesh);
                    placedObjects.set(gridKey, mesh);
                    obj.gridKey = gridKey;
                }
            });
            updateSpawnIndicator();
            statusMsg.textContent = "Loaded successfully!";
            setTimeout(() => statusMsg.textContent = "", 3000);
        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Error loading map";
        }
        loadBtn.disabled = false;
    });

    function animate() {
        requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
} else {
    initEditor();
}
