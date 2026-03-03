import * as THREE from "three";
import { FirstPersonControls } from "three/examples/jsm/controls/FirstPersonControls.js";

export class VirtualLibraryRoom {

	private scene: THREE.Scene;
	private camera: THREE.PerspectiveCamera;
	private renderer: THREE.WebGLRenderer;
	private canvas: HTMLCanvasElement;
	private controls: FirstPersonControls;
	private timer: THREE.Timer;

	constructor() {

		this.canvas = document.getElementById("virtual-room")! as HTMLCanvasElement;
		this.scene = new THREE.Scene();
		this.setupLighting();

		const width = window.innerWidth;
		const height = window.innerHeight;
		this.camera = new THREE.PerspectiveCamera(75, width/height, 0.1, 40);
		this.camera.position.z = 10;

		this.timer = new THREE.Timer();

		this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
		this.renderer.setSize(width, height);
		this.renderer.setPixelRatio(window.devicePixelRatio);

		this.renderer.setAnimationLoop(this.animate.bind(this));

		this.controls = new FirstPersonControls(this.camera, this.renderer.domElement);
		this.setupTestScene();
	}

	private setupLighting() {
		const ambientLight = new THREE.AmbientLight(0xFFFFFF, 1.0);
		this.scene.add(ambientLight);

		const dirLight = new THREE.DirectionalLight(0xFFFFFF, 1.0);
		dirLight.position.set(2, 2, 2);
		this.scene.add(dirLight);
	}

	private setupTestScene() {

		const roomSize = 10;
		const halfRoomSize = roomSize/2;

		const floorGeo = new THREE.PlaneGeometry(roomSize, roomSize);
		const floorMat = new THREE.MeshStandardMaterial({ color: 'blue' });

		const wallGeo = new THREE.PlaneGeometry(roomSize, roomSize);
		const wallMat = new THREE.MeshStandardMaterial({ color: 'purple' });

		const roofGeo = new THREE.PlaneGeometry(20, 20);
		const roofMat = new THREE.MeshStandardMaterial({ color: 'red' });

		const floor = new THREE.Mesh(floorGeo, floorMat);
		floor.rotation.x = -Math.PI/2;
		floor.position.y = -halfRoomSize;

		const roof = new THREE.Mesh(roofGeo, roofMat);
		roof.rotation.x = Math.PI/2;
		roof.position.y = halfRoomSize;

		const wallRight = new THREE.Mesh(wallGeo, wallMat);
		wallRight.rotation.y = -Math.PI/2;
		wallRight.position.x = halfRoomSize;

		const wallLeft = new THREE.Mesh(wallGeo, wallMat);
		wallLeft.rotation.y = Math.PI/2;
		wallLeft.position.x = -halfRoomSize;

		const wallFront = new THREE.Mesh(wallGeo, roofMat);
		// wallFront.rotation.y = -Math.PI;
		wallFront.position.z = -halfRoomSize;

		this.scene.add(floor, roof, wallLeft, wallRight, wallFront);
	}

	private animate: XRFrameRequestCallback = (timestamp) => {
		this.timer.update(timestamp);
		const delta = this.timer.getDelta();
		this.controls.update(delta*4);
		this.renderer.render(this.scene, this.camera);
	}
}
