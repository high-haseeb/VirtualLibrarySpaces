import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
// import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
// import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
// import { BrightnessContrastShader } from 'three/addons/shaders/BrightnessContrastShader.js';
// import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// import GUI from "three/examples/jsm/libs/lil-gui.module.min.js"
// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const BASE = import.meta.env.BASE_URL;
let activeModel = null;
let hallModel = null;
let roomModel = null;

let activeCameraTarget = null;
let hallToRoomCamera = null;
let hallBaseCamera = null;
let roomBaseCamera = null;
let roomEnterCamera = null;
let hoveredObject = null;
const cameraMap = {};

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
}

const scene = new THREE.Scene();

const width = window.innerWidth;
const height = window.innerHeight;
const camera = new THREE.PerspectiveCamera(40, width/height, 0.1, 1000);

const catalogEl = document.getElementById("catalog-overlay");

const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPrefrence: "high-performance",
    canvas: document.getElementById("game"),
});

// new OrbitControls(camera, renderer.domElement);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(width, height);

const composer = new EffectComposer(renderer);

// const ssaoPass = new SSAOPass(scene, camera, width/2, height/2);
// ssaoPass.kernelRadius = 2;
// ssaoPass.minDistance = 0.001;
// ssaoPass.maxDistance = 0.1;
//
// const contrastPass = new ShaderPass(BrightnessContrastShader);
// contrastPass.uniforms['contrast'].value = 0.08;
// contrastPass.uniforms['brightness'].value = 0.0;

const resolution = new THREE.Vector2(width, height);
const outlinePass = new OutlinePass(resolution, scene, camera);
outlinePass.edgeStrength = 5;
outlinePass.edgeThickness = 1;
outlinePass.visibleEdgeColor.set('#FFFFFF');
outlinePass.hiddenEdgeColor.set('#FFFFFF');

const renderPass = new RenderPass(scene, camera);
const outputPass = new OutputPass();

// const fxaaPass = new ShaderPass(FXAAShader);

// postprocessing passes
composer.addPass(renderPass);
// composer.addPass(contrastPass);
// composer.addPass(ssaoPass);
composer.addPass(outlinePass);
// composer.addPass(fxaaPass);
composer.addPass(outputPass);

// HTML Overlay
const helpEl = document.getElementById("hover-help-box");
const helpElTitle = document.getElementById("hover-help-name");

function showHelp(message) {

    helpEl.style.left = ((mouse.x+1)/2)*window.innerWidth  + 'px';
    helpEl.style.top = (1.0 - (mouse.y+1)/2)*window.innerHeight + 'px';

    helpElTitle.innerText = message;
    helpEl.style.opacity = '1';
}

function hideHelp() {
    helpEl.style.opacity = '0';
}

const backButton = document.getElementById("view-back");
let cameraAtHome = true;

backButton.addEventListener('click', () => {
    if (!activeModel) return;

    if (isInRoom && cameraAtHome) {
        exitRoom();
    }

    catalogEl.style.opacity = '0';
    activeCameraTarget = {
        position: isInRoom ? roomBaseCamera.position.clone() : hallBaseCamera.position.clone(),
        quaternion: isInRoom ? roomBaseCamera.quaternion.clone() : hallBaseCamera.quaternion.clone(),
        progress: 0,
        opacity: '0',
    };
    cameraAtHome = true;
});

let lightHelper;
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

    // lightHelper = new THREE.DirectionalLightHelper(light, 1);
    // scene.add(lightHelper);
    // const shadowHelper = new THREE.CameraHelper(light.shadow.camera);
    // scene.add(shadowHelper);

    return light;
}

// create light

// GUI
// const gui = new GUI();
//

// const lightFolder = gui.addFolder('Directional Light');
//
// // position controls
// const pos = light.position;
// lightFolder.add(pos, 'x', -20, 20, 0.1).name('pos x');
// lightFolder.add(pos, 'y', -20, 20, 0.1).name('pos y');
// lightFolder.add(pos, 'z', -20, 20, 0.1).name('pos z');
//
// // target controls
// const target = light.target.position;
// lightFolder.add(target, 'x', -20, 20, 0.1).name('target x');
// lightFolder.add(target, 'y', -20, 20, 0.1).name('target y');
// lightFolder.add(target, 'z', -20, 20, 0.1).name('target z');
//
// // intensity
// lightFolder.add(light, 'intensity', 0, 20, 0.1);
//
// // color
// const params = { color: light.color.getHex() };
// lightFolder.addColor(params, 'color').onChange(v => {
//     light.color.set(v);
// });
//
// lightFolder.open();

import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

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

    // helper (visual rectangle)
    const helper = new RectAreaLightHelper(light);
    light.add(helper); // attach so it moves with light

    return { light, helper };
}

const HdrPath = `${BASE}/hdri/park_1k.hdr`;
const HallModelPath = `${BASE}/models/hall.glb`;
const RoomoModelPath = `${BASE}/models/room.glb`;

const loadingManager = new THREE.LoadingManager();
const loadingScreen = document.getElementById("loading-screen");

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

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

        if (isInRoom) enterRoom();
    });
};

new HDRLoader(loadingManager).load(HdrPath, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 1.0;
    // scene.backgroundRotation.set(0, Math.PI / 2, 0); 
});

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

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

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousemove', (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener('click', () => {
    if (!hoveredObject) return;

    const targetCam = cameraMap[hoveredObject.name];
    if (!targetCam) return;

    activeCameraTarget = {
        position: targetCam.position.clone(),
        quaternion: targetCam.quaternion.clone(),
        progress: 0,
        opacity: '1',
        name: hoveredObject.name,
    };

    if (isInRoom) cameraAtHome = false;
});

let isInRoom = false;
let justExitedRoom = false;
let roomModelLoaded = false;

function enterRoom() {
    isInRoom = true;
    justExitedRoom = false;
    backButton.style.opacity = '1';

    if (!roomModel) {
        loadingScreen.style.opacity = '1';
        return;
    }  

    loadingScreen.style.opacity = '0';
    activeModel = roomModel;

    scene.add(roomModel);
    scene.remove(hallModel);

    camera.position.copy(roomEnterCamera.position);
    camera.quaternion.copy(roomEnterCamera.quaternion);

    activeCameraTarget = {
        position: roomBaseCamera.position.clone(),
        quaternion: roomBaseCamera.quaternion.clone(),
        progress: 0,
    }
}

function exitRoom() {
    backButton.style.opacity = '0';
    isInRoom = false;
    justExitedRoom = true;

    activeModel = hallModel;

    scene.remove(roomModel);
    scene.add(hallModel);

    camera.position.copy(hallToRoomCamera.position);
    camera.quaternion.copy(hallToRoomCamera.quaternion);
    hallToRoomCamera = null;

    activeCameraTarget = {
        position: hallBaseCamera.position.clone(),
        quaternion: hallBaseCamera.quaternion.clone(),
        progress: 0,
        opacity: '1',
    };

    setTimeout(() => {
        justExitedRoom = false;
    }, movementTime*1000*2);
}

let fpsContainer = document.getElementById("fps");
const timer = new THREE.Timer();

let frameCount = 0;
let elapsedTime = 0;
let lastRaycast = 0;
let intersects;

const movementTime = 1; // seconds

function animate() {
    requestAnimationFrame(animate);

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

    if (!activeModel) return;

    const now = performance.now();
    if (now - lastRaycast > 100) { // every 100ms
        raycaster.setFromCamera(mouse, camera);
        intersects = raycaster.intersectObjects(activeModel.children, true);
        lastRaycast = now;
    }

    if (intersects.length > 0) {
        let obj = intersects[0].object;

        while (obj && !cameraMap[obj.name]) {
            obj = obj.parent;
        }

        if (obj && cameraMap[obj.name]) {
            hoveredObject = obj;

            outlinePass.selectedObjects = [obj];
            showHelp(obj.name);
            document.body.style.cursor = 'pointer';
        } else {
            document.body.style.cursor = 'auto';
            clearHover();
        }
    } else {
        clearHover();
    }

    if (activeCameraTarget) {
        activeCameraTarget.progress += timer.getDelta() * 1/movementTime;

        camera.position.lerp(
            activeCameraTarget.position,
            activeCameraTarget.progress
        );

        camera.quaternion.slerp(
            activeCameraTarget.quaternion,
            activeCameraTarget.progress
        );

        if (activeCameraTarget.progress >= 1) {

            if (!isInRoom && !justExitedRoom) {
                hallToRoomCamera = { 
                    position: activeCameraTarget.position.clone(),
                    quaternion:  activeCameraTarget.quaternion.clone(), 
                };
                activeCameraTarget = null;
                enterRoom();
            } else {
                if (activeCameraTarget.name == translationMap['Catalog']) {
                    catalogEl.style.opacity = activeCameraTarget.opacity;
                    if (activeCameraTarget.opacity != '0') {
                        catalogEl.style.pointerEvents = 'auto';
                    } else {
                        catalogEl.style.pointerEvents = 'none';
                    }
                }
                activeCameraTarget = null;
            }

        }
    }

    if (lightHelper) lightHelper.update();

    composer.render();
}

function clearHover() {
    hoveredObject = null;
    outlinePass.selectedObjects = [];
    hideHelp();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});
