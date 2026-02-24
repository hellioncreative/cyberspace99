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
    const textureSelect = document.getElementById('texture-select');
    const worldMapPanel = document.getElementById('world-map-panel');
    const openWorldMapBtn = document.getElementById('open-world-map-btn');
    const closeWorldMapBtn = document.getElementById('close-world-map-btn');
    const worldMapList = document.getElementById('world-map-list');
    const viewToggle = document.getElementById('view-toggle');
    const graphCanvas = document.getElementById('graph-canvas');
    const toolbar = document.getElementById('toolbar');
    const instructions = document.getElementById('instructions');

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
    const renderDom = renderer.domElement;

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
    const textureCache = {};

    function getTextureMaterial(textureName) {
        if (!textureCache[textureName]) {
            const tex = textureLoader.load('/' + textureName);
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            textureCache[textureName] = new THREE.MeshLambertMaterial({ color: 0xdddddd, map: tex });
        }
        return textureCache[textureName];
    }

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
                const selectedTex = textureSelect ? textureSelect.value : 'ground.png';
                mesh = new THREE.Mesh(wallGeometry, getTextureMaterial(selectedTex));
                mesh.position.set(rx * wallSize, wallHeight / 2, rz * wallSize);
                objData.type = 'wall';
                objData.texture = selectedTex;
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
                    const tex = obj.texture || 'ground.png';
                    mesh = new THREE.Mesh(wallGeometry, getTextureMaterial(tex));
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
        if (viewToggle && viewToggle.value === 'world') {
            // Pause 3D rendering to save resources
            return;
        }
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (graphCanvas && viewToggle && viewToggle.value === 'world') {
            graphCanvas.width = window.innerWidth;
            graphCanvas.height = window.innerHeight;
            drawNodeGraph(); // Redraw on resize
        }
    });

    // --- 2D Node Graph Logic ---
    let worldGraphData = [];
    let graphOffset = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let isDraggingGraph = false;
    let dragStart = { x: 0, y: 0 };

    if (viewToggle) {
        viewToggle.addEventListener('change', async (e) => {
            if (e.target.value === 'world') {
                renderDom.style.display = 'none';
                toolbar.style.display = 'none';
                instructions.style.display = 'none';
                graphCanvas.style.display = 'block';
                graphCanvas.width = window.innerWidth;
                graphCanvas.height = window.innerHeight;
                await fetchFullWorldGraph();
                drawNodeGraph();
            } else {
                renderDom.style.display = 'block';
                toolbar.style.display = 'flex';
                instructions.style.display = 'block';
                graphCanvas.style.display = 'none';
            }
        });
    }

    async function fetchFullWorldGraph() {
        try {
            statusMsg.textContent = "Loading World Data...";
            // We need the full DB to draw connections
            const res = await fetch('/api/maps');
            const list = await res.json();

            // Fetch detailed JSON for every map to find its Exit nodes
            const fetchPromises = list.map(m => fetch(`/api/maps/${m.id}`).then(r => r.json()));
            const detailedMaps = await Promise.all(fetchPromises);

            // Build the graph array layout
            worldGraphData = [];

            // Simple auto-layout algorithm for nodes
            let currentX = 0;
            let currentY = 0;
            const spacing = 200;

            detailedMaps.forEach((mapObj, index) => {
                const data = mapObj.data || {};
                const objects = data.objects || [];
                const exits = objects.filter(o => o.type === 'exit' && o.targetMapId).map(o => o.targetMapId);

                // Try to lay them out in a grid ONLY IF no graph coordinates are saved
                if (mapObj.graph_x !== null && mapObj.graph_x !== undefined && mapObj.graph_y !== null && mapObj.graph_y !== undefined) {
                    currentX = mapObj.graph_x;
                    currentY = mapObj.graph_y;
                } else {
                    const cols = Math.ceil(Math.sqrt(detailedMaps.length));
                    currentX = (index % cols) * spacing - ((cols * spacing) / 2);
                    currentY = Math.floor(index / cols) * spacing - ((cols * spacing) / 2);
                }

                worldGraphData.push({
                    id: mapObj.id,
                    name: mapObj.name,
                    exits: exits,
                    x: currentX,
                    y: currentY
                });
            });
            statusMsg.textContent = "";

        } catch (err) {
            console.error(err);
            statusMsg.textContent = "Failed to load World Graph.";
        }
    }

    function drawNodeGraph() {
        if (!graphCanvas) return;
        const ctx = graphCanvas.getContext('2d');
        ctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);

        ctx.save();
        ctx.translate(graphOffset.x, graphOffset.y);

        // 1. Draw connecting lines between rooms
        ctx.lineWidth = 2;
        worldGraphData.forEach(node => {
            node.exits.forEach(targetId => {
                const targetNode = worldGraphData.find(n => n.id === targetId);
                if (targetNode) {
                    ctx.beginPath();
                    ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)';
                    // Draw line from center to center
                    ctx.moveTo(node.x, node.y);
                    ctx.lineTo(targetNode.x, targetNode.y);
                    ctx.stroke();

                    // Draw simple arrow head
                    const angle = Math.atan2(targetNode.y - node.y, targetNode.x - node.x);
                    ctx.beginPath();
                    ctx.fillStyle = 'rgba(0, 255, 136, 0.9)';
                    const arrowDist = 45; // Stop arrow at edge of box
                    const arrowX = targetNode.x - Math.cos(angle) * arrowDist;
                    const arrowY = targetNode.y - Math.sin(angle) * arrowDist;
                    ctx.moveTo(arrowX, arrowY);
                    ctx.lineTo(arrowX - 10 * Math.cos(angle - Math.PI / 6), arrowY - 10 * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(arrowX - 10 * Math.cos(angle + Math.PI / 6), arrowY - 10 * Math.sin(angle + Math.PI / 6));
                    ctx.fill();
                }
            });
        });

        // 2. Draw the Map Nodes (Boxes)
        worldGraphData.forEach(node => {
            const isCurrentMap = mapData.id && mapData.id === node.id;

            ctx.fillStyle = isCurrentMap ? '#0066aa' : '#222233';
            ctx.strokeStyle = isCurrentMap ? '#00aaff' : '#555566';
            ctx.lineWidth = 3;

            // Draw Box
            ctx.beginPath();
            ctx.roundRect(node.x - 60, node.y - 30, 120, 60, 8);
            ctx.fill();
            ctx.stroke();

            // Draw Text
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Truncate long names
            let displayName = node.name || "Untitled";
            if (displayName.length > 15) displayName = displayName.substring(0, 13) + "...";
            ctx.fillText(displayName, node.x, node.y - 5);

            ctx.fillStyle = '#888';
            ctx.font = '10px sans-serif';
            ctx.fillText(`ID: ${node.id ? node.id.substring(0, 6) : 'N/A'}`, node.x, node.y + 12);
        });

        ctx.restore();
    }

    // Graph Canvas Interactions (Pan & Drag Nodes)
    let draggedNode = null;
    let dragMode = 'none'; // 'pan', 'node', or 'link'
    let linkMousePos = null;

    function getScreenToWorldXY(e) {
        return {
            x: e.clientX - graphOffset.x,
            y: e.clientY - graphOffset.y
        };
    }

    if (graphCanvas) {
        graphCanvas.addEventListener('mousedown', (e) => {
            if (!viewToggle || viewToggle.value !== 'world') return;
            dragStart = { x: e.clientX, y: e.clientY };

            const worldPos = getScreenToWorldXY(e);

            // Check if clicked inside any node
            draggedNode = worldGraphData.find(n => {
                return worldPos.x >= n.x - 60 && worldPos.x <= n.x + 60 &&
                    worldPos.y >= n.y - 30 && worldPos.y <= n.y + 30;
            });

            if (draggedNode && currentTool === 'link') {
                dragMode = 'link';
                linkMousePos = worldPos;
                graphCanvas.style.cursor = 'crosshair';
            } else if (draggedNode) {
                dragMode = 'node';
                graphCanvas.style.cursor = 'move';
            } else {
                dragMode = 'pan';
                graphCanvas.style.cursor = 'grabbing';
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!viewToggle || viewToggle.value !== 'world' || dragMode === 'none') return;

            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            if (dragMode === 'pan') {
                graphOffset.x += dx;
                graphOffset.y += dy;
            } else if (dragMode === 'node' && draggedNode) {
                draggedNode.x += dx;
                draggedNode.y += dy;
            } else if (dragMode === 'link') {
                linkMousePos = getScreenToWorldXY(e);
            }

            dragStart = { x: e.clientX, y: e.clientY };
            drawNodeGraph();

            // Intercept Draw call to add the temporary drag line
            if (dragMode === 'link' && draggedNode && linkMousePos) {
                const ctx = graphCanvas.getContext('2d');
                ctx.save();
                ctx.translate(graphOffset.x, graphOffset.y);
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
                ctx.setLineDash([5, 5]);
                ctx.lineWidth = 3;
                ctx.moveTo(draggedNode.x, draggedNode.y);
                ctx.lineTo(linkMousePos.x, linkMousePos.y);
                ctx.stroke();
                ctx.restore();
            }
        });

        window.addEventListener('mouseup', async (e) => {
            if (dragMode === 'node' && draggedNode) {
                // Save node layout
                fetch('/api/maps/saveLayout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: draggedNode.id,
                        x: Math.round(draggedNode.x),
                        y: Math.round(draggedNode.y)
                    })
                }).catch(err => console.error("Error saving layout:", err));
            } else if (dragMode === 'link' && draggedNode) {
                const worldPos = getScreenToWorldXY(e);
                const targetNode = worldGraphData.find(n => {
                    return n.id !== draggedNode.id &&
                        worldPos.x >= n.x - 60 && worldPos.x <= n.x + 60 &&
                        worldPos.y >= n.y - 30 && worldPos.y <= n.y + 30;
                });

                if (targetNode) {
                    // We dropped the link on a valid target. Add an entry to the start-node's Map Data!
                    try {
                        statusMsg.textContent = "Connecting Rooms...";
                        // Fetch the source map to inject a new connection exit block
                        const sourceRes = await fetch(`/api/maps/${draggedNode.id}`);
                        const sourceMap = await sourceRes.json();

                        // Give it an arbitrary exit placement near spawn for now. The user can move it in 3D later.
                        const newObjects = sourceMap.data.objects || [];
                        newObjects.push({
                            type: 'exit',
                            x: (sourceMap.data.spawn?.x || 0) + 1,
                            z: (sourceMap.data.spawn?.z || 0),
                            targetMapId: targetNode.id
                        });

                        await fetch('/api/maps/save', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: sourceMap.id,
                                name: sourceMap.name,
                                spawn: sourceMap.data.spawn,
                                objects: newObjects
                            })
                        });

                        // We connected them! Redraw graph!
                        await fetchFullWorldGraph();
                        drawNodeGraph();
                        statusMsg.textContent = "Link Created!";
                    } catch (err) {
                        console.error(err);
                        statusMsg.textContent = "Error Linking Rooms";
                    }
                }
            }

            dragMode = 'none';
            draggedNode = null;
            linkMousePos = null;
            if (graphCanvas && viewToggle && viewToggle.value === 'world') {
                graphCanvas.style.cursor = 'grab';
            }
        });
    }

}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEditor);
} else {
    initEditor();
}
