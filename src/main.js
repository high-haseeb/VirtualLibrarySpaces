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


let base_camera = null;
let model = null;
let activeCameraTarget = null;
let hoveredObject = null;
const cameraMap = {};

const scene = new THREE.Scene();

const width = window.innerWidth;
const height = window.innerHeight;
const camera = new THREE.PerspectiveCamera(40, width/height, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({
    powerPrefrence: "high-performance",
});

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(width, height);
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);

const ssaoPass = new SSAOPass(scene, camera, width/2, height/2);
ssaoPass.kernelRadius = 2;
ssaoPass.minDistance = 0.001;
ssaoPass.maxDistance = 0.1;

const contrastPass = new ShaderPass(BrightnessContrastShader);
contrastPass.uniforms['contrast'].value = 0.08;
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
composer.addPass(ssaoPass);
composer.addPass(contrastPass);
composer.addPass(outlinePass);
composer.addPass(fxaaPass);
composer.addPass(outputPass);

// HTML Overlay
let currentTitle = '';
const title = document.createElement('div');
title.classList.add('title');
document.body.appendChild(title);

function showTitle(text) {
    if (currentTitle === text) return;

    currentTitle = text;

    title.style.opacity = '0';
    title.style.transform = 'translateY(20px)';

    setTimeout(() => {
        title.textContent = text;
        title.style.opacity = '1';
        title.style.transform = 'translateY(0)';
    }, 150);
}

function hideTitle() {
    currentTitle = '';
    title.style.opacity = '0';
    title.style.transform = 'translateY(20px)';
}

const backButton = document.getElementById("view-back");
backButton.addEventListener('click', () => {
    if (!model) return;

    activeCameraTarget = {
        position: base_camera.position.clone(),
        quaternion: base_camera.quaternion.clone(),
        progress: 0
    };
});

// HDR
new HDRLoader().load('/hdri/studio.hdr', (texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = texture;
    scene.environmentIntensity = 1.0;
    // scene.background = texture;
    scene.backgroundRotation.set(0, Math.PI / 2, 0); 
});


const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);

gltfLoader.load('/models/room.glb', (gltf) => {
    model = gltf.scene;
    scene.add(model);

    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }

        if (child.isSpotLight || child.isPointLight) {
            // child.intensity = child.intensity/50;
            // child.castShadow = true;
            // child.shadow.mapSize.set(1024, 1024);
            // child.shadow.bias = -0.001;
        }

        if (child.isDirectionalLight) {
            child.intensity = 1;
            child.castShadow = true;
            child.shadow.mapSize.set(512, 512);
            child.shadow.bias = -0.001;
        }

        if (child.isCamera) {
            if (child.name === 'Base_Camera') {
                base_camera = child;
                camera.position.copy(base_camera.position);
                camera.quaternion.copy(base_camera.quaternion);
            } else if (child.name.endsWith('_Camera')) {
                const meshName = child.name.replace('_Camera', '');
                cameraMap[meshName] = child;
            }
        }
    });
});

// Raycasting
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
        progress: 0
    };
});

let fpsContainer = document.getElementById("fps");
const timer = new THREE.Timer();

let frameCount = 0;
let elapsedTime = 0;
let lastRaycast = 0;
let intersects;

function animate() {
    requestAnimationFrame(animate);

    {
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

    if (!model) return;

    const now = performance.now();
    if (now - lastRaycast > 100) { // every 100ms
        raycaster.setFromCamera(mouse, camera);
        intersects = raycaster.intersectObjects(model.children, true);
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
            showTitle(obj.name);
        } else {
            clearHover();
        }
    } else {
        clearHover();
    }

    // Camera transition
    if (activeCameraTarget) {
        activeCameraTarget.progress += 0.02;

        camera.position.lerp(
            activeCameraTarget.position,
            activeCameraTarget.progress
        );

        camera.quaternion.slerp(
            activeCameraTarget.quaternion,
            activeCameraTarget.progress
        );

        if (activeCameraTarget.progress >= 1) {
            activeCameraTarget = null;
        }
    }

    // if (!activeCameraTarget) {
        // currentRotX += (targetRotX - currentRotX) * 0.08;
        // currentRotY += (targetRotY - currentRotY) * 0.08;
        // camera.rotation.x = baseRotation.x + currentRotX;
        // camera.rotation.y = baseRotation.y - currentRotY;
    // }

    composer.render();
}

function clearHover() {
    hoveredObject = null;
    outlinePass.selectedObjects = [];
    hideTitle();
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
});


window.addEventListener('beforeunload', cleanup);
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
