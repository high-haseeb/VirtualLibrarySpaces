import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BrightnessContrastShader } from 'three/addons/shaders/BrightnessContrastShader.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

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

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(width, height);

const composer = new EffectComposer(renderer);

const ssaoPass = new SSAOPass(scene, camera, width/2, height/2);
ssaoPass.kernelRadius = 2;
ssaoPass.minDistance = 0.001;
ssaoPass.maxDistance = 0.1;

const contrastPass = new ShaderPass(BrightnessContrastShader);
contrastPass.uniforms['contrast'].value = 0.06;
contrastPass.uniforms['brightness'].value = 0.0;

const resolution = new THREE.Vector2(width, height);
const outlinePass = new OutlinePass(resolution, scene, camera);
outlinePass.edgeStrength = 5;
outlinePass.edgeThickness = 1;
outlinePass.visibleEdgeColor.set('#FFFFFF');
outlinePass.hiddenEdgeColor.set('#FFFFFF');

const renderPass = new RenderPass(scene, camera);
const outputPass = new OutputPass();

const fxaaPass = new ShaderPass(FXAAShader);

// postprocessing passes
composer.addPass(renderPass);
composer.addPass(contrastPass);
composer.addPass(ssaoPass);
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

function addDirectionalLight(scene, { color = 0xffffff, intensity = 1,
                             position = { x: 5, y: 10, z: 5 } } = {}) {

    const light = new THREE.DirectionalLight(color, intensity);

    light.position.set(position.x, position.y, position.z);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);

    const d = 10;
    light.shadow.camera.left = -d;
    light.shadow.camera.right = d;
    light.shadow.camera.top = d;
    light.shadow.camera.bottom = -d;

    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 50;

    light.shadow.bias = -0.001;
    scene.add(light);
    return light;
}

addDirectionalLight(scene, { color: "white", intensity: 4, position: { x: 2, y: 7, z: 8 } });
addDirectionalLight(scene, { color: "white", intensity: 5, position: { x: -5, y: 8, z: -2 } });

const HdrPath = '/hdri/park_1k.hdr';
const HallModelPath = '/models/hall.glb';
const RoomoModelPath = '/models/room.glb';

const loadingManager = new THREE.LoadingManager();
const loadingScreen = document.getElementById("loading-screen");

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

loadingManager.onLoad = () => {
    loadingScreen.style.opacity = '0';

    loader.load(RoomoModelPath, (glb) => {
        roomModel = glb.scene;

        roomModel.traverse((child) => {
            if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }

            if (child.isDirectionalLight) {
                child.intensity = 0.5;
                // child.castShadow = true;
                // child.shadow.mapSize.set(512, 512);
                // child.shadow.bias = -0.001;
            }

            if (child.isCamera) {
                if (child.name === 'Base_Camera') {
                    roomBaseCamera = child; 
                } 
                if (child.name === 'RoomEnterCamera') {
                    roomEnterCamera = child;
                }
                else if (child.name.endsWith('_Camera')) {
                    const meshName = child.name.replace('_Camera', '');
                    cameraMap[meshName] = child;
                }
            }
        });

        if (isInRoom) enterRoom();
    });
};

new HDRLoader(loadingManager).load(HdrPath, (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 0.8;
    // scene.backgroundRotation.set(0, Math.PI / 2, 0); 
});

const gltfLoader = new GLTFLoader(loadingManager);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

gltfLoader.load(HallModelPath, (gltf) => {
    hallModel = gltf.scene;
    scene.add(hallModel);
    activeModel = hallModel;

    hallModel.traverse((child) => {

        if (child.isMesh) 
        {
            child.castShadow = true;
            child.receiveShadow = true;
        }

        if (child.isSpotLight || child.isPointLight) 
        {
            child.intensity = 0;
            // child.intensity = child.intensity/50;
            // child.castShadow = true;
            // child.shadow.mapSize.set(1024, 1024);
            // child.shadow.bias = -0.001;
        }

        if (child.isDirectionalLight) 
        {
            child.intensity = 0;
            // child.castShadow = true;
            // child.shadow.mapSize.set(512, 512);
            // child.shadow.bias = -0.001;
        }

        if (child.isCamera) 
        {
            if (child.name === 'Base_Camera') 
            {
                hallBaseCamera = child;
                camera.position.copy(hallBaseCamera.position);
                camera.quaternion.copy(hallBaseCamera.quaternion);
            } 
            else if (child.name.endsWith('_Camera')) 
            {
                const meshName = child.name.replace('_Camera', '');
                cameraMap[meshName] = child;
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
                activeCameraTarget = null;
                // catalogEl.style.opacity = activeCameraTarget.opacity;
            }

            // if (activeCameraTarget.opacity != '0') {
                //     catalogEl.style.pointerEvents = 'auto';
                // } else {
                    //     catalogEl.style.pointerEvents = 'none';
                    // }
        }
    }

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


// window.addEventListener('beforeunload', cleanup);
function cleanup() {
    cancelAnimationFrame(animationId);

    disposeScene(scene);

    composer.dispose();
    ssaoPass.dispose();
    fxaaPass.dispose();
    outlinePass.dispose();
    contrastPass.dispose();

    renderer.dispose();
    renderer.forceContextLoss();

    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('click', onClick);
    window.removeEventListener('resize', onResize);
}
function disposeScene(scene) {
    scene.traverse((obj) => {
        if (obj.isMesh) {
            obj.geometry?.dispose();

            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => disposeMaterial(mat));
            } else {
                disposeMaterial(obj.material);
            }
        }
    });
}

function disposeMaterial(material) {
    for (const key in material) {
        const value = material[key];
        if (value && value.isTexture) {
            value.dispose();
        }
    }
    material.dispose();
}
