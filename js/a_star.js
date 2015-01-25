// A* 算法实现

"use strict";

var geometries = {};
var textures   = {};
var scene;
var renderer;
var camera;
var cameraControls;
var projector;
var chessBoard;
var clock = new THREE.Clock();
var board3D = [];
var validCellMaterial = null;
var selectedMaterial = null;
var selectedPiece = null;

// 加载资源
function loadResources ()
{
	var resources = [
		'3D/json/knight.json',
		'3D/json/king.json',
		'3D/json/queen.json',
		'3D/json/bishop.json',
		'3D/json/rook.json',
		'3D/json/pawn.json',
		'3D/json/board.json',
		'3D/json/innerBoard.json',
		'texture/wood-0.jpg',
		'texture/wood-1.jpg',
		'texture/wood_N.jpg',
		'texture/wood_S.jpg',
		'texture/knight-ao.jpg',
		'texture/rook-ao.jpg',
		'texture/king-ao.jpg',
		'texture/bishop-ao.jpg',
		'texture/queen-ao.jpg',
		'texture/pawn-ao.jpg',
		'texture/floor.jpg',
		'texture/floor_N.jpg',
		'texture/floor_S.jpg',
		'texture/fakeShadow.jpg'
	];

	var load_num = 0;
	
	function CheckLoadComplete()
	{
		if (load_num === resources.length)
		{
			onLoaded();
		}
	}
	// for loading mesh
	function loadJSON (url) {
		var loader = new THREE.JSONLoader();
		loader.load(url, function(geometry) 
		{
			geometries[url] = geometry;
			load_num++;
			CheckLoadComplete();
		});
	}

	// for loading texture
	function loadImage(url) {
		THREE.ImageUtils.loadTexture(
			url,
			THREE.UVMapping(),
			function(texture) {
				textures[url] = texture;
				load_num++;
				CheckLoadComplete();
			}
		);
	}

	// load all the resources from the list
	resources.forEach(function(url) 
	{
		switch ( url.split('.').pop() ) 
		{
		case 'json' :
			loadJSON(url);
			break;
		case 'jpg' :
			loadImage(url);
			break;
		default:
			throw 'invalid resource';
		}
	});
}

function initPieceFactory() {

	// common textures
	var tiling = 4;
	var colors = [];
	for (var c = 0; c < 2; c++) {
		colors[c] = textures['texture/wood-' + c + '.jpg'].clone();
		colors[c].tile(tiling);
	}
	var norm = textures['texture/wood_N.jpg'].clone();
	norm.tile(tiling);
	var spec = textures['texture/wood_S.jpg'].clone();
	spec.tile(tiling);

	function createPiece(name, color) {
		var size = BOARD_SIZE / COLS * PIECE_SIZE;
		// container for the piece and its reflexion
		var piece = new THREE.Object3D();
		// base material for all the piece (only lightmap changes)
		var material = new THREE.MeshPhongMaterial({
			color: 0xffffff,
			specular: 0xaaaaaa,
			shininess: 60.0,
			map: colors[color],
			normalMap: norm,
			specularMap: spec,
			wireframe: WIREFRAME
		});
		material.normalScale.set(0.3, 0.3);

		// urls of geometry and lightmap
		var urlJson = '3D/json/' + name + '.json';
		var urlAO = 'texture/' + name + '-ao.jpg';

		var geo = geometries[urlJson];
		// no need to clone this texture
		// since its pretty specific
		var light = textures[urlAO];
		light.format = THREE.LuminanceFormat;

		material.lightMap = light;

		var mesh = new THREE.Mesh(geo, material);
		if (SHADOW) {
			mesh.castShadow = true;
			mesh.receiveShadow = true;
		}
		mesh.scale.set(size, size, size);
		// we rotate pieces so they face each other (mostly relevant for knight)
		mesh.rotation.y += (color == WHITE) ? -Math.PI / 2 : Math.PI / 2;

		// we create the reflection
		// it's a cloned with a negative scale on the Y axis
		var reflexion = mesh.clone();
		reflexion.scale.y *= -1;
		reflexion.material = reflexion.material.clone();
		reflexion.material.side = THREE.BackSide;

		piece.add(mesh);
		piece.add(reflexion);

		piece.name = name;
		piece.color = color;

		return piece;
	}

	// make it global
	window.createPiece = createPiece;
}

function initCellFactory() {

	var materials = [];
	var tiling = 2;


	// common textures
	var diff;
	var norm = textures['texture/wood_N.jpg'].clone();
	norm.tile(tiling);
	var spec = textures['texture/wood_S.jpg'].clone();
	spec.tile(tiling);

	for (var c = 0; c < 2; c++) {

		diff = textures['texture/wood-' + c + '.jpg'].clone();
		diff.tile(tiling);

		//common material
		materials[c] = new THREE.MeshPhongMaterial({
			color: 0xffffff,
			specular: [0xAAAAAA, 0x444444][c],
			shininess: 30.0,
			wireframe: WIREFRAME,
			transparent: true,
			map: diff,
			specularMap: spec,
			normalMap: norm,
			//blending: THREE.AdditiveBlending,
			opacity: 0.5
		});
		//materials[c].normalScale.set(0.5,0.5);
	}

	function createCell(size, color) {
		// container for the cell and its reflexion
		var geo = new THREE.PlaneGeometry(size, size);

		// randomize uv offset to ad a bit of variety
		var randU = Math.random();
		var randV = Math.random();

		var uvs = geo.faceVertexUvs[0][0];
		for (var j = 0; j < uvs.length; j++) {
			uvs[j].x += randU;
			uvs[j].y += randV;
		}

		var cell = new THREE.Mesh(geo, materials[color]);

		if (SHADOW) {
			cell.receiveShadow = true;
		}

		// by default PlaneGeometry is vertical
		cell.rotation.x = -Math.PI / 2;
		cell.color = color;
		return cell;
	}

	// make it global
	window.createCell = createCell;
}

function createChessBoard(size) {
	// contains everything that makes the board
	var lChessBoard = new THREE.Object3D();

	var cellSize = size / COLS;
	var square, cell;

	for (var i = 0; i < ROWS * COLS; i++) {

		var col = i % COLS;
		var row = Math.floor(i / COLS);

		cell = new Cell(i);
		square = createCell(cellSize, 1 - (i + row) % 2);
		square.position = cell.getWorldPosition();
		square.name = cell.position;

		lChessBoard.add(square);
	}

	// some fake inner environment color for reflexion
	var innerBoard = new THREE.Mesh(
		geometries['3D/json/innerBoard.json'],
		new THREE.MeshBasicMaterial({
			color: 0x783e12
		})
	);
	innerBoard.scale.set(size, size, size);
	//innerBoard.scale.set(150, 150, 150);

	/// board borders
	var tiling = 6;
	var wood = textures['texture/wood-0.jpg'].clone();
	var spec = textures['texture/wood_S.jpg'].clone();
	var norm = textures['texture/wood_N.jpg'].clone();
	wood.tile(tiling);
	spec.tile(tiling);
	norm.tile(tiling);

	var geo = geometries['3D/json/board.json'];
	geo.computeBoundingBox();

	var board = new THREE.Mesh(
		geo,
		new THREE.MeshPhongMaterial({
			color: 0xffffff,
			map: wood,
			specular: 0xffffff,
			specularMap: spec,
			normalMap: norm,
			shininess: 60,
			normalScale: new THREE.Vector2(0.2, 0.2)
		})
	);
	var hCorrection = 0.62; // yeah I should just create a better geometry
	board.scale.set(size, size * hCorrection, size);
	lChessBoard.height = geo.boundingBox.min.y * board.scale.y;

	if (SHADOW) {
		board.receiveShadow = true;
		board.castShadow = true;
	}

	lChessBoard.add(innerBoard);
	lChessBoard.add(board);

	lChessBoard.name = "chessboard";
	return lChessBoard;
}

function createFloor(size, chessboardSize) {
	// The floor is a fake plane with a hole in it to allow
	// for the fake reflexion trick to work
	// so we build it vertices by vertices

	// material
	var tiling = 30 * size / 1000;
	var material = new THREE.MeshPhongMaterial({
		color: 0xffffff,
		wireframe: WIREFRAME,
		specular: 0xaaaaaa,
		shininess: 30

	});
	var diff = textures['texture/floor.jpg'];
	var spec = textures['texture/floor_S.jpg'];
	var norm = textures['texture/floor_N.jpg'];
	var light = textures['texture/fakeShadow.jpg'];

	diff.tile(tiling);
	spec.tile(tiling);
	norm.tile(tiling);
	light.format = THREE.RGBFormat;

	material.map = diff;
	material.normalMap = norm;
	material.normalScale.set(0.6, 0.6);
	material.specularMap = spec;
	material.lightMap = light;

	// geometry
	var halfBoard = chessboardSize / 2;
	var halfSize = size / 2;

	var floorGeo = new THREE.Geometry();
	// outter vertices
	floorGeo.vertices.push(new THREE.Vector3(-halfSize, 0, -halfSize));
	floorGeo.vertices.push(new THREE.Vector3(halfSize, 0, -halfSize));
	floorGeo.vertices.push(new THREE.Vector3(halfSize, 0, halfSize));
	floorGeo.vertices.push(new THREE.Vector3(-halfSize, 0, halfSize));
	// hole vertices
	floorGeo.vertices.push(new THREE.Vector3(-halfBoard, 0, -halfBoard));
	floorGeo.vertices.push(new THREE.Vector3(halfBoard, 0, -halfBoard));
	floorGeo.vertices.push(new THREE.Vector3(halfBoard, 0, halfBoard));
	floorGeo.vertices.push(new THREE.Vector3(-halfBoard, 0, halfBoard));

	floorGeo.faceVertexUvs[0] = [];
	floorGeo.faceVertexUvs[1] = [];

	/*
	 *        vertices         uvs-lightmap
	 *      0-----------1     80-----------80
	 *      |\         /|      |\         /|
	 *      | \       / |      | \       / |
	 *      |  \     /  |      |  \     /  |
	 *      |   4---5   |      |   0---0   |
	 *      |   |   |   |      |   |   |   |
	 *      |   7---6   |      |   0---0   |
	 *      |  /     \  |      |  /     \  |
	 *      | /       \ |      | /       \ |
	 *      |/         \|      |/         \|
	 *      3-----------2     80-----------80
	 */

	// all normals just points upward
	var normal = new THREE.Vector3(0, 1, 0);

	// list of vertex index for each face
	var faces = [
		[0, 4, 5, 1],
		[1, 5, 6, 2],
		[2, 6, 7, 3],
		[3, 7, 4, 0]
	];

	faces.forEach(function(f) {
		var uvs1 = [];
		var uvs2 = [];
		var lightU, lightV;
		f.forEach(function(v, i) {
			// we linearily transform positions
			// from a -halfSize-halfSize space
			// to a 0-1 space
			uvs1.push(new THREE.Vector2(
				(floorGeo.vertices[v].x + halfSize) / size, (floorGeo.vertices[v].z + halfSize) / size
			));
			lightU = (v < 4) ? 80 : 0;
			lightV = (i < 2) ? 0 : 1;
			uvs2.push(new THREE.Vector2(lightU, lightV));
		});

		// we create a new face folowing the faces list
		var face = new THREE.Face4(
			f[0], f[1], f[2], f[3]
		);

		// and apply normals (without this, no proper lighting)
		face.normal.copy(normal);
		face.vertexNormals.push(
			normal.clone(),
			normal.clone(),
			normal.clone(),
			normal.clone()
		);

		// add the face to the geometry's faces list
		floorGeo.faces.push(face);

		// add uv coordinates to uv channels.
		floorGeo.faceVertexUvs[0].push(uvs1); // for diffuse/normal
		floorGeo.faceVertexUvs[1].push(uvs2); // for lightmap

	});

	// not sure it's needed but since it's in THREE.PlaneGeometry...
	floorGeo.computeCentroids();

	var floor = new THREE.Mesh(floorGeo, material);

	if (SHADOW) {
		floor.receiveShadow = true;
	}

	floor.name = "floor";
	return floor;
}

function createValidCellMaterial() {
	validCellMaterial = [];
	var tiling = 2;


	// common textures
	var diff;
	var norm = textures['texture/wood_N.jpg'].clone();
	norm.tile(tiling);
	var spec = textures['texture/wood_S.jpg'].clone();
	spec.tile(tiling);

	for (var c = 0; c < 2; c++) {

		diff = textures['texture/wood-1.jpg'].clone();
		diff.tile(tiling);

		//common material
		validCellMaterial[c] = new THREE.MeshPhongMaterial({
			color: 0x00ff00,
			specular: 0x999999,
			shininess: 60.0,
			wireframe: WIREFRAME,
			map: diff,
			specularMap: spec,
			normalMap: norm
		});
		//materials[c].normalScale.set(0.5,0.5);
	}
}

function createSelectedMaterial() {
	selectedMaterial = [];
	var tiling = 4;
	// common textures
	var diff;
	var norm = textures['texture/wood_N.jpg'].clone();
	norm.tile(tiling);
	var spec = textures['texture/wood_S.jpg'].clone();
	spec.tile(tiling);

	for (var c = 0; c < 2; c++) {

		diff = textures['texture/wood-1.jpg'].clone();
		diff.tile(tiling);

		//common material
		selectedMaterial[c] = new THREE.MeshPhongMaterial({
			color: 0x00ff00,
			emissive: 0x009900,
			specular: 0x999999,
			shininess: 60.0,
			wireframe: WIREFRAME,
			transparent: false,
			map: diff,
			specularMap: spec,
			normalMap: norm
				//opacity:0.4
		});
		selectedMaterial[c].normalScale.set(0.3, 0.3);
	}
}

function init()
{
	console.log("init begin");
	var canvasWidth = window.innerWidth;
	var canvasHeight = window.innerHeight;
	var canvasRatio = canvasWidth / canvasHeight;

	// RENDERER
	renderer = new THREE.WebGLRenderer({
		antialias: true
	});
	renderer.gammaInput = true;
	renderer.gammaOutput = true;
	renderer.setSize(canvasWidth, canvasHeight);

	if (SHADOW) 
	{
		renderer.shadowMapEnabled = true;
		renderer.shadowMapType = THREE.PCFSoftShadowMap;
		renderer.shadowMapCascade = true;
	}

	// black background
	renderer.setClearColor(0x000000, 1.0);
	document.body.appendChild(renderer.domElement);

	// CAMERA
	camera = new THREE.PerspectiveCamera(45, canvasRatio, 1, 40000);
	// CONTROLS
	cameraControls = new THREE.OrbitAndPanControls(camera, renderer.domElement);
	// limitations
	cameraControls.minPolarAngle = 0;
	cameraControls.maxPolarAngle = 80 * Math.PI / 180;
	cameraControls.minDistance = 10;
	cameraControls.maxDistance = 200;
	cameraControls.userZoomSpeed = 1.0;
	camera.position.set(0, 100, 100);


	// LIGHTING
	var spotlight = new THREE.SpotLight(0xFFFFFF, 1.0);
	spotlight.position.set(0, 300, 0);
	spotlight.angle = Math.PI / 2;
	spotlight.exponent = 50.0;
	spotlight.target.position.set(0, 0, 0);

	if (SHADOW) 
	{
		spotlight.castShadow = true;
		spotlight.shadowDarkness = 0.5;
		spotlight.shadowBias = -0.001;
	}


	var whiteLight = new THREE.PointLight(0xFFEEDD, 0.2);
	whiteLight.position.set(0, 0, 100);
	var blackLight = new THREE.PointLight(0xFFEEDD, 0.2);
	blackLight.position.set(0, 0, -100);

	// generate createPiece and createCell functions
	initPieceFactory();
	initCellFactory();

	// we let chessBoard in global scope to use it for picking
	chessBoard = createChessBoard(BOARD_SIZE);
	var floor = createFloor(FLOOR_SIZE, BOARD_SIZE);

	//floor.position.y = -5*BOARD_SIZE/100;
	floor.position.y = chessBoard.height;

	// create and fill the scene with default stuff
	scene = new THREE.Scene();
	scene.add(floor);
	scene.add(spotlight);
	scene.add(whiteLight);
	scene.add(blackLight);
	scene.add(chessBoard);

	// to make everything black in the background
	scene.fog = new THREE.FogExp2(0x000000, 0.001);
	// little reddish to fake a bit of bounce lighting
	scene.add(new THREE.AmbientLight(0x330000));

	// for picking
	projector = new THREE.Projector();

	createValidCellMaterial();
	createSelectedMaterial();

	// picking event
	document.addEventListener('mousedown', onMouseDown, false);
	document.addEventListener('mousemove', onMouseMove, false);

	// avoid stretching
	//window.addEventListener('resize', onResize, false);
	console.log("init end");
}

// 拾取
function pickPiece(raycaster) {
	var intersect = null;
	var picked = null;
	var hitList = [];
	var hit, piece;
	for (var i in board3D) {
		if ({}.hasOwnProperty.call(board3D, i)) {
			piece = board3D[i];
			intersect = raycaster.intersectObject(piece.children[0], true);

			if (intersect.length > 0) {
				hit = intersect[0];
				if (hit.object.parent.color === BLACK) {
					hitList.push(hit);
					break;
				}
			}
		}
	}

	// find the closest
	hitList.forEach(function(hit) {
		if (picked === null || picked.distance > hit.distance) {
			picked = hit;
		}
	});

	if (picked) 
	{
		return picked.object.parent;
	} 
	else
	{
		return null;
	}

}

function pickCell(raycaster) {
	// here we don't need to test the distance since you can't really
	// intersect more than one cell at a time.
	var intersect = raycaster.intersectObject(chessBoard, true);
	if (intersect.length > 0) {
		var pickedCell = intersect[0].object;
		return pickedCell;
	}
	return null;
}

function getRay(event) {
	// get the raycaster object from the mouse position
	var zoomLevel = window.devicePixelRatio | 1.0;
	var canvas = renderer.domElement;
	var canvasPosition = canvas.getBoundingClientRect();
	var mouseX = event.clientX * zoomLevel - canvasPosition.left;
	var mouseY = event.clientY * zoomLevel - canvasPosition.top;

	var mouseVector = new THREE.Vector3(
		2 * (mouseX / canvas.width) - 1,
		1 - 2 * (mouseY / canvas.height));

	return projector.pickingRay(mouseVector.clone(), camera);
}


function onMouseDown(event)
{
	var canvas = renderer.domElement;
	var raycaster = getRay(event);
	var pickedPiece = pickPiece(raycaster);
	
	if (pickedPiece !== null)
	{
		if (selectedPiece !== null)
		{
			selectedPiece.children[0].material = selectedPiece.baseMaterial;
			selectedPiece = null;
		}
		else
		{
			selectedPiece = pickedPiece;
			selectedPiece.baseMaterial = selectedPiece.children[0].material;
			selectedPiece.children[0].material = selectedMaterial[selectedPiece.color];
		}
	}
	else if (selectedPiece !== null)
	{
		selectedPiece.children[0].material = selectedPiece.baseMaterial;
		selectedPiece = null;
		var pickedCell = pickCell(raycaster);
	
		if (pickedCell !== null)
		{
			console.log("x=%d, y=%d", event.x, event.y);
			var cell = new Cell(pickedCell.name);
			// x + y * COLS
			if (typeof(board3D[cell.x + cell.y  * COLS]) == "undefined")
			{
				var piece = createPiece("rook", 0);
				piece.position = cell.getWorldPosition();
				piece.cell = pickedCell.cell;
				scene.add(piece);
				board3D[cell.x + cell.y  * COLS] = piece;
			}
		}
	}
}

function onMouseMove(event)
{
	//alert("fuck move");
}

function updateBoard3D() {
	board3D = [];
	board3D[ROWS * COLS - 1] = createPiece("knight", 1);	// 马
	board3D[0] = createPiece("rook", 0);
}

function fillBoard() {
	// place all the pieces on the board
	var cell;
	board3D.forEach(function(piece, index) {
		cell = new Cell(index);
		piece.position = cell.getWorldPosition();
		piece.cell = index;
		scene.add(piece);
	});
}

function animate() {
	window.requestAnimationFrame(animate);
	render();
}

function render() {
	var delta = clock.getDelta();
	cameraControls.update(delta);
	renderer.render(scene, camera);
}

// 加载资源完成
function onLoaded() 
{
	init();
	updateBoard3D();
	fillBoard();
	animate();
}

// 加载游戏
window.onload = function () 
{
	loadResources();
};



