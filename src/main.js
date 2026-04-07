import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BASE = import.meta.env.BASE_URL;

const HdrPath = `${BASE}/hdri/park_1k.hdr`;
const HallModelPath = `${BASE}/models/hall.glb`;
const RoomoModelPath = `${BASE}/models/room.glb`;

const States = {
    HALL_HOME: 0,
    HALL_ITEM: 1,
    ROOM_HOME: 2,
    ROOM_ITEM: 3,
};

let state = States.HALL_HOME;

let activeModel = null;
let hallModel = null;
let roomModel = null;
let cameraTarget = null;

let hallBaseCamera = null;
let hallToRoomCamera = null;
let roomBaseCamera = null;
let roomEnterCamera = null;
let hoveredObject = null;
const cameraMap = {};

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const timer = new THREE.Timer();
const movementTime = 1; // seconds

const catalogEl = document.getElementById("catalog-overlay");
const helpEl = document.getElementById("hover-help-box");
const helpElTitle = document.getElementById("hover-help-name");
const backButton = document.getElementById("view-back");
const loadingScreen = document.getElementById("loading-screen");
const fpsContainer = document.getElementById("fps");

const translationMap = { // german
    "Library":  "Partheland-Bibliotheken",
    "Library1": "Großpösna",
    "Library2": "Naunhof",
    "Library3": "Brandis ",
    "Library4": "Borsdorf",
    "Search":   "Suche",
    "Catalog":  "Digitale Ausleihe",
    "Profile":  "Mein Konto",
    "Help":     "Chat & Hilfe",
    "Community":   "Veranstaltungen",
};

const loadingManager = new THREE.LoadingManager();
const hdrLoader = new HDRLoader(loadingManager);
const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

const scene = new THREE.Scene();
const width = window.innerWidth;
const height = window.innerHeight;
const camera = new THREE.PerspectiveCamera(40, width/height, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPrefrence: "high-performance",
    canvas: document.getElementById("game"),
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(width, height);
renderer.setAnimationLoop(() => animate());

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

// post-processing
const composer = new EffectComposer(renderer);

const resolution = new THREE.Vector2(width, height);
const outlinePass = new OutlinePass(resolution, scene, camera);
outlinePass.edgeStrength = 5;
outlinePass.edgeThickness = 1;
outlinePass.visibleEdgeColor.set('#FFFFFF');
outlinePass.hiddenEdgeColor.set('#FFFFFF');

composer.addPass(new RenderPass(scene, camera));
composer.addPass(outlinePass);
composer.addPass(new OutputPass());

hdrLoader.load(HdrPath, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 1.0;
});

gltfLoader.load(HallModelPath, (gltf) => {
    hallModel = gltf.scene;
    scene.add(hallModel);
    activeModel = hallModel;

    addDirectionalLight(hallModel, { 
        color: "#c99c69",
        intensity: 10,
        position: { x: -4.6, y: 4.8, z: -12.4 },
        target: { x: 0, y: -3.1, z: 11.2 },
    });
    addDirectionalLight(hallModel, {
        color : 0xffffff,
        intensity : 4,
        position : { x: 0, y: 2, z: 0 },
        target : { x: 0, y: 0, z: 0 }
    });
    addAreaLight(hallModel, {
        color: 0xffffff,
        intensity: 3,
        width: 10,
        height: 4,
        position: { x: 0, y: 2.4, z: 4.5 },
        rotation: {x: 0, y: 0, z: 0}
    });
    addAreaLight(hallModel, {
        color: 0xffffff,
        intensity: 3,
        width: 10,
        height: 4,
        position: { x: 0, y: 2.4, z: -10.5 },
        rotation: {x: 0, y: 0, z: 0}
    });

    hallModel.traverse((child) => {

        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }

        if (child.isCamera) {
            if (child.name === 'Base_Camera') 
            {
                hallBaseCamera = child;
                camera.position.copy(hallBaseCamera.position);
                camera.quaternion.copy(hallBaseCamera.quaternion);
            } 
            else if (child.name.endsWith('_Camera')) {
                let meshName = child.name.replace('_Camera', '');
                const meshTranslation = translationMap[meshName];

                if (meshTranslation) {
                    const obj = hallModel.getObjectByName(meshName);
                    obj.name = meshTranslation;
                }

                cameraMap[meshTranslation] = child;
            }
        }
    });
});

loadingManager.onLoad = () => {
    loadingScreen.style.opacity = '0';

    loader.load(RoomoModelPath, (glb) => {
        roomModel = glb.scene;
        addDirectionalLight(roomModel, { 
            color: "white",
            intensity: 5,
            position: { x: -15, y: 6.7, z: 8 },
            target: { x: -15, y: 0, z: 8 },
        });
        addDirectionalLight(roomModel, { 
            color: "orange",
            intensity: 8,
            position: { x: -15, y: 6.7, z: 20 },
            target: { x: -15, y: 0, z: 4.5 },
        });
        addAreaLight(roomModel, {
            color: 0xffffff,
            intensity: 50,
            width: 20,
            height: 20,
            position: { x: -20, y: 3, z: 30 },
            rotation: {x: 0, y: Math.PI, z: 0}
        });



        roomModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }

            if (child.isCamera) {
                if (child.name === 'Base_Camera') {
                    roomBaseCamera = child; 
                } 
                if (child.name === 'RoomEnterCamera') {
                    roomEnterCamera = child;
                }
                else if (child.name.endsWith('_Camera')) {
                    let meshName = child.name.replace('_Camera', '');
                    const meshTranslation = translationMap[meshName];

                    if (meshTranslation) {
                        const obj = roomModel.getObjectByName(meshName);
                        obj.name = meshTranslation;
                    }
                    cameraMap[meshTranslation] = child;
                }
            }
        });

        if (state == States.ROOM_HOME) enterRoom();
    });
};

const showHelp = (message) => {
    helpEl.style.left = ((mouse.x+1)/2)*window.innerWidth  + 'px';
    helpEl.style.top = (1.0 - (mouse.y+1)/2)*window.innerHeight + 'px';

    helpElTitle.innerText = message;
    helpEl.style.opacity = '1';
}

const hideHelp = () => {
    helpEl.style.opacity = '0';
}

function addDirectionalLight(scene, { 
    color = 0xffffff,
    intensity = 1,
    position = { x: 0, y: 2, z: 0 },
    target = { x: 0, y: 0, z: 0 }
} = {}) {

    const light = new THREE.DirectionalLight(color, intensity);

    light.position.set(position.x, position.y, position.z);
    light.target.position.set(target.x, target.y, target.z);

    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);

    const d = 10;
    light.shadow.camera.left = -d;
    light.shadow.camera.right = d;
    light.shadow.camera.top = d;
    light.shadow.camera.bottom = -d;

    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 50;

    light.shadow.bias = -0.001;
    scene.add(light);
    scene.add(light.target);

    return light;
}

RectAreaLightUniformsLib.init();
function addAreaLight(scene, {
    color = 0xffffff,
    intensity = 5,
    width = 2,
    height = 2,
    position = { x: 0, y: 3, z: 0 },
    rotation = { x: 0, y: 0, z: 0 }
} = {}) {

    const light = new THREE.RectAreaLight(color, intensity, width, height);

    light.position.set(position.x, position.y, position.z);
    light.rotation.set(rotation.x, rotation.y, rotation.z);

    scene.add(light);

    const helper = new RectAreaLightHelper(light);
    light.add(helper);

    return { light, helper };
}


const enterRoom = () => {

    if (!roomModel) {
        loadingScreen.style.opacity = '1';
        return;
    }  

    backButton.style.opacity = '1';
    loadingScreen.style.opacity = '0';
    activeModel = roomModel;

    scene.add(roomModel);
    scene.remove(hallModel);

    camera.position.copy(roomEnterCamera.position);
    camera.quaternion.copy(roomEnterCamera.quaternion);

    cameraTarget = {
        position: roomBaseCamera.position.clone(),
        quaternion: roomBaseCamera.quaternion.clone(),
        progress: 0,
        onComplete: () => {
            cameraTarget = null;
        }
    }
}

const exitRoom = () => {

    backButton.style.opacity = '0';

    activeModel = hallModel;
    scene.remove(roomModel);
    scene.add(hallModel);

    camera.position.copy(hallToRoomCamera.position);
    camera.quaternion.copy(hallToRoomCamera.quaternion);
    hallToRoomCamera = null;

    cameraTarget = {
        position: hallBaseCamera.position.clone(),
        quaternion: hallBaseCamera.quaternion.clone(),
        progress: 0,
        onComplete: () => {
            cameraTarget = null;
        }
    };
}

function clearHover() {
    document.body.style.cursor = 'auto';
    hoveredObject = null;
    outlinePass.selectedObjects = [];
    hideHelp();
}

const handleHover = (obj) => {

    let tempName = obj.name;
    if (!cameraMap[obj.name]) {
        if (!cameraMap[obj.parent.name]) {
            clearHover();
            return;
        } else {
            tempName = obj.parent.name;
        }
    }

    hoveredObject = obj;
    outlinePass.selectedObjects = [obj];
    showHelp(tempName);
    document.body.style.cursor = 'pointer';
}

let frameCount = 0;
let elapsedTime = 0;
let lastRaycast = 0;
let intersects;

const animate = () => {
    { // FPS
        timer.update();
        const delta = timer.getDelta();

        frameCount++;
        elapsedTime += delta;

        if (elapsedTime >= 1) {
            const fps = frameCount / elapsedTime;

            fpsContainer.innerText = `${fps.toFixed(0)} FPS`;
            fpsContainer.style.color = fps < 40 ? "red" : "green";

            frameCount = 0;
            elapsedTime = 0;
        }
    }

    { // raycasting
        if (!activeModel) return;

        const now = performance.now();
        if (now - lastRaycast > 100) { // every 100ms
            raycaster.setFromCamera(mouse, camera);
            intersects = raycaster.intersectObjects(activeModel.children, true);
            lastRaycast = now;
        }

        if (intersects.length > 0) {
            handleHover(intersects[0].object);
        } else {
            clearHover();
        }
    }

    { // camera movement
        if (cameraTarget) {

            cameraTarget.progress += timer.getDelta() * 1/movementTime;

            camera.position.lerp(
                cameraTarget.position,
                cameraTarget.progress
            );
            camera.quaternion.slerp(
                cameraTarget.quaternion,
                cameraTarget.progress
            );

            if (cameraTarget.progress >= 1) {
                cameraTarget.onComplete();
            }
        }
    }

    composer.render();
}

// event listeners
window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

const showPopup = (itemName) => {
    if (itemName == translationMap['Catalog']) {
        catalogEl.style.opacity = '1';
    }
}
const hidePopup = () => {
    catalogEl.style.opacity = '0';
}

const handleClick = () => {
    if (!hoveredObject) return;

    switch(state) {
        case States.HALL_HOME: {

            const targetCam = cameraMap[hoveredObject.name];
            hallToRoomCamera = targetCam;

            if (!targetCam) {
                console.error(`${hoveredObject.name} item does not have a camera`);
                return;
            }

            state = States.ROOM_HOME;

            cameraTarget = {
                position: targetCam.position.clone(),
                quaternion: targetCam.quaternion.clone(),
                progress: 0,
                onComplete: () => {
                    enterRoom();
                }
            };
        } break;

        case States.ROOM_HOME: {

            const targetCam = cameraMap[hoveredObject.name];
            if (!targetCam) {
                console.error(`${hoveredObject.name} item does not have a camera`);
                return;
            }

            const itemName = hoveredObject.name;

            cameraTarget = {
                position: targetCam.position.clone(),
                quaternion: targetCam.quaternion.clone(),
                progress: 0,
                onComplete: () => { 
                    showPopup(itemName);
                    state = States.ROOM_ITEM;
                    cameraTarget = null;
                }
            };
        } break;

        default: {
            console.log("Unhandled state", state);
        } break;
    }
}

window.addEventListener('click', handleClick);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});

const handleBack = () => {
    switch(state) {
        case States.ROOM_ITEM: {
            hidePopup();
            state = States.ROOM_HOME;

            cameraTarget = {
                position: roomBaseCamera.position.clone(),
                quaternion: roomBaseCamera.quaternion.clone(),
                progress: 0,
                onComplete: () => {
                    console.log("back at home");
                    cameraTarget = null;
                }
            }
        } break;

        case States.ROOM_HOME: {
            cameraTarget = {
                position: roomEnterCamera.position.clone(),
                quaternion: roomEnterCamera.quaternion.clone(),
                progress: 0,
                onComplete: () => {
                    state = States.HALL_HOME;
                    exitRoom();
                }
            }

        } break;

        default: {
            console.error("Unhandled state ", state);
        } break;
    }
} 

backButton.addEventListener('click', handleBack);
