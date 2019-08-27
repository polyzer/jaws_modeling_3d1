if (WEBGL.isWebGLAvailable() === false) {
  document.body.appendChild(WEBGL.getWebGLErrorMessage());
}
let teethPositions = {
  top: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  bottom: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
};
let container, stats;
let camera, cameraDirection, scene, renderer;
let sceneTopJaw, sceneBottomJaw;
let collisionPlane = null;
let collisionScene = new THREE.Scene({
  background: new THREE.Color(0xffffff)
});
let VerticalJawsAlignmentCoeff = 0.2;
let rayCamera,
  rayCameraTopDirection = [0, -1, 0],
  rayCameraBottomDirection = [0, 1, 0],
  rayCameraSize = 30;
let texSize = 2048;
let xTranslationTopJaw = 0,
  zTranslationTopJaw = -10,
  xTranslationBottomJaw = 0,
  zTranslationBottomJaw = -10;
let showTopJaw = true,
  showBottomJaw = true;
let needDepthRaycast = true,
  someErrors = false;

let JawsObj = {
  number: 1,
  topDental: null,
  bottomDental: null,
  topTeeth: null,
  bottomTeeth: null,
  topBrackets: null,
  bottomBrackets: null
};

let ComparisonJawsObj = {
  topState: 0,
  bottomState: 0,
  topDental: null,
  bottomDental: null,
  topTeeth: null,
  bottomTeeth: null,
  topBrackets: null,
  bottomBrackets: null
};
let SeparationLayerObj = {
  layer: 0,
  meshes: []
};
let JawsObjects = [];
let SeparObjectsLayers = [];
let separationPoints = {};
let CurrentJawsObject = null;
let LastJawsObject = null;
let CurrentSeparationArray = null;
let LastSeparationArray = null;

let GlobalBottomMesh = null;
let GlobalTopMesh = null;
let topInvJawDepthTexture = new THREE.DepthTexture();
let bottomJawDepthTexture = new THREE.DepthTexture();
let collisionTexture = new THREE.Texture();
collisionTexture.magFilter = THREE.LinearFilter;
collisionTexture.minFilter = THREE.LinearFilter;
let collision = new THREE.WebGLRenderTarget(texSize, texSize, {
  texture: collisionTexture
});

let topInvJawDepth = new THREE.WebGLRenderTarget(texSize, texSize, {
  depthTexture: topInvJawDepthTexture
});
let bottomJawDepth = new THREE.WebGLRenderTarget(texSize, texSize, {
  depthTexture: bottomJawDepthTexture
});

let topPressureMaterial = new THREE.MeshPhongMaterial({
  color: 0xf1f1f1,
  specular: 0x111111,
  shininess: 200,
  shading: THREE.SmoothShading
});
topPressureMaterial.onBeforeCompile = function(mat) {
  mat.uniforms.rayCameraSize = { value: rayCameraSize };
  mat.uniforms.rayCameraTopDirection = { value: rayCameraTopDirection };
  mat.uniforms.xTranslationBottomJaw = { value: xTranslationBottomJaw };
  mat.uniforms.zTranslationBottomJaw = { value: zTranslationBottomJaw };
  mat.uniforms.collision = { value: collision.texture };
  mat.vertexShader = `
    uniform float rayCameraSize;
    uniform float zTranslationBottomJaw;
    uniform float xTranslationBottomJaw;
    varying vec2 vUv;
    varying vec3 N;
    ${mat.vertexShader}
  `;
  mat.vertexShader = mat.vertexShader.replace(
    "void main() {",
    `void main() {
    N = normal;
    vUv = vec2(position.x + xTranslationBottomJaw, -position.z - zTranslationBottomJaw) / rayCameraSize / 2. + vec2(0.5);`
  );
  mat.fragmentShader = `
    varying vec2 vUv;
    varying vec3 N;
    uniform vec3 rayCameraTopDirection;
    uniform sampler2D collision;
    ${mat.fragmentShader}
  `;
  mat.fragmentShader = mat.fragmentShader.replace(
    "void main() {",
    `void main() { vec3 color = texture2D(collision, vUv).xyz;`
  );
  mat.fragmentShader = mat.fragmentShader.replace(
    "gl_FragColor =",
    "gl_FragColor = vec4(mix(color, vec3(1.), step(0., 0.2-dot(N, rayCameraTopDirection))), 1.0) *"
  );
};

let bottomPressureMaterial = new THREE.MeshPhongMaterial({
  color: 0xf1f1f1,
  specular: 0x111111,
  shininess: 200,
  shading: THREE.SmoothShading
});
bottomPressureMaterial.onBeforeCompile = function(mat) {
  mat.uniforms.rayCameraSize = { value: rayCameraSize };
  mat.uniforms.rayCameraBottomDirection = { value: rayCameraBottomDirection };
  mat.uniforms.xTranslationBottomJaw = { value: xTranslationBottomJaw };
  mat.uniforms.zTranslationBottomJaw = { value: zTranslationBottomJaw };
  mat.uniforms.collision = { value: collision.texture };
  mat.vertexShader = `
    uniform float rayCameraSize;
    uniform float zTranslationBottomJaw;
    uniform float xTranslationBottomJaw;
    varying vec2 vUv;
    varying vec3 N;
    ${mat.vertexShader}
  `;
  mat.vertexShader = mat.vertexShader.replace(
    "void main() {",
    `void main() {
    N = normal;
    vUv = vec2(position.x + xTranslationBottomJaw, -position.z - zTranslationBottomJaw) / rayCameraSize / 2. + vec2(0.5);`
  );
  mat.fragmentShader = `
    varying vec2 vUv;
    varying vec3 N;
    uniform vec3 rayCameraBottomDirection;
    uniform sampler2D collision;
    ${mat.fragmentShader}
  `;
  mat.fragmentShader = mat.fragmentShader.replace(
    "void main() {",
    `void main() { vec3 color = texture2D(collision, vUv).xyz;`
  );
  mat.fragmentShader = mat.fragmentShader.replace(
    "gl_FragColor =",
    "gl_FragColor = vec4(mix(color, vec3(1.), step(0., 0.2-dot(N, rayCameraBottomDirection))), 1.0) *"
  );
};

init();
animate();
///////////////////// GETTING INFORMATION FOR SEPARATION

function getAvgDistanceOnTeethLayer(teeth_coords_array){
  let ret = 0;
  let cur_array = teeth_coords_array.slice();
  let cur_el = cur_array[0];
  let return_array = [];
  for(let i=0; i< cur_array.length;){
    let min_dist_ind, min_dist_el, dist;
    [min_dist_ind, min_dist_el, dist] = getMinDistElementInfoFromArray(cur_el, cur_array);
    ret += dist;
    cur_el = min_dist_el;
    cur_array.splice(min_dist_ind, 1);
  }
  if(teeth_coords_array.length > 0){
    ret /= teeth_coords_array.length-1;
  }
  return ret;

}


function nameFrontTopTeeth(teeth_coords_array){
  let copyArray = [];
  
  for(let i = 0; i < teeth_coords_array.length; i++){
    copyArray.push(new THREE.Vector3(parseFloat(teeth_coords_array[i].x), parseFloat(teeth_coords_array[i].y), parseFloat(teeth_coords_array[i].z)));
  }

  //sorting to find 2 front teeth
  copyArray.sort(function(a, b) {
    if (a.z < b.z) {
      return 1;
    } else {
      return -1;
    }
  });
  // If position by x of teeth is smaller, then it's 11 teeth
  let leftFrontTeeth = null;
  let rightFrontTeeth = null;
  if (copyArray[0].x > copyArray[1].x){
    copyArray[0].name = "21";
    copyArray[1].name = "11";
    leftFrontTeeth = copyArray[1];
    rightFrontTeeth = copyArray[0];
  } else {
    copyArray[0].name = "11";
    copyArray[1].name = "21";
    leftFrontTeeth = copyArray[0];
    rightFrontTeeth = copyArray[1];
  }
  //Getting right teeth
  let right_teeth = copyArray.filter(function(el) {
    if (el.x > rightFrontTeeth.x) {
      return true;
    } else {
      return false;
    }
  });
  //Getting left teeth
  let left_teeth = copyArray.filter(function(el) {
    if (el.x < leftFrontTeeth.x) {
      return true;
    } else {
      return false;
    }
  });
  let avg_dist = getAvgDistanceOnTeethLayer(copyArray);
  // Calculating names for other teeth
  let currentRightNumber = parseInt(rightFrontTeeth.name);
  let cur_el = rightFrontTeeth;
  let return_array = [cur_el];
  for(let i=0; i< right_teeth.length;){
    let min_dist_ind, min_dist_el, dist;
    [min_dist_ind, min_dist_el, dist] = getMinDistElementInfoFromArray(cur_el, right_teeth);
    let countness = Math.ceil(dist/avg_dist);
    console.log("dist: %s, avg_dist: %s,min_dist_ind:%s",dist, avg_dist, min_dist_ind);
    currentRightNumber += countness;
    //Create links to Prev and Next Items
    cur_el.nextTeeth = min_dist_el;
    min_dist_el.prevTeeth = cur_el;
    cur_el = min_dist_el;
    cur_el.name = currentRightNumber.toString();
    return_array.push(cur_el);
    right_teeth.splice(min_dist_ind, 1);
  }

  let currentLeftNumber = parseInt(leftFrontTeeth.name);
  cur_el = leftFrontTeeth;
  return_array.push(cur_el);
  for(let i=0; i< left_teeth.length;){
    let min_dist_ind, min_dist_el, dist;
    [min_dist_ind, min_dist_el, dist] = getMinDistElementInfoFromArray(cur_el, left_teeth);
    let countness = Math.ceil(dist/avg_dist);
    currentLeftNumber += countness;
    //Create links to Prev and Next Items
    cur_el.prevTeeth = min_dist_el;
    min_dist_el.nextTeeth = cur_el;
    cur_el = min_dist_el;
    cur_el.name = currentLeftNumber.toString();
    return_array.push(cur_el);
    left_teeth.splice(min_dist_ind, 1);
  }
  rightFrontTeeth.prevTeeth = leftFrontTeeth;
  leftFrontTeeth.nextTeeth = rightFrontTeeth;
  console.log(return_array);
  // Return array with named front top teeth
  return return_array;
}
/**
 * This function calculates and returns 
 * all required parameters of nearest teeth.
 * @param {Object} el is Three.Vector3 vector
 * @param {Array} arr is array of THREE.Vector3 vectors
 * @return {Array} This returns [ind, arr[ind], min_dist]
 */
function getMinDistElementInfoFromArray(el, arr){
  let vec = el;
  let ind = 0;
  for(let i = 0; i < arr.length; i++){
    let cur_new_vec = arr[i];
    let dist = vec.distanceTo(cur_new_vec);
    if (i === 0){
      min_dist = dist;   
      ind = 0;   
    }
    if (dist < min_dist){
      min_dist = dist;
      ind = i;
    }
  }
  return [ind, arr[ind], min_dist];
}



function nameFrontBottomTeeth(teeth_coords_array){
  let copyArray = [];
  
  for(let i = 0; i < teeth_coords_array.length; i++){
    copyArray.push(new THREE.Vector3(parseFloat(teeth_coords_array[i].x), parseFloat(teeth_coords_array[i].y), parseFloat(teeth_coords_array[i].z)));
  }

  //sorting to find 2 front teeth
  copyArray.sort(function(a, b) {
    if (a.z < b.z) {
      return 1;
    } else {
      return -1;
    }
  });
  // If position by x of teeth is smaller, then it's 11 teeth
  let leftFrontTeeth = null;
  let rightFrontTeeth = null;
  if (copyArray[0].x > copyArray[1].x){
    copyArray[0].name = "31";
    copyArray[1].name = "41";
    leftFrontTeeth = copyArray[1];
    rightFrontTeeth = copyArray[0];
  } else {
    copyArray[0].name = "41";
    copyArray[1].name = "31";
    leftFrontTeeth = copyArray[0];
    rightFrontTeeth = copyArray[1];
  }
  //Getting right teeth
  let right_teeth = copyArray.filter(function(el) {
    if (el.x > rightFrontTeeth.x) {
      return true;
    } else {
      return false;
    }
  });
  //Getting left teeth
  let left_teeth = copyArray.filter(function(el) {
    if (el.x < leftFrontTeeth.x) {
      return true;
    } else {
      return false;
    }
  });
  let avg_dist = getAvgDistanceOnTeethLayer(copyArray);
  // Calculating names for other teeth
  let currentRightNumber = parseInt(rightFrontTeeth.name);
  let cur_el = rightFrontTeeth;
  let return_array = [cur_el];
  for(let i=0; i< right_teeth.length;){
    let min_dist_ind, min_dist_el, dist;
    [min_dist_ind, min_dist_el, dist] = getMinDistElementInfoFromArray(cur_el, right_teeth);
    let countness = Math.ceil(dist/avg_dist);
    console.log("dist: %s, avg_dist: %s,min_dist_ind:%s",dist, avg_dist, min_dist_ind);
    currentRightNumber += countness;
    //Create links to Prev and Next Items
    cur_el.nextTeeth = min_dist_el;
    min_dist_el.prevTeeth = cur_el;
    cur_el = min_dist_el;
    cur_el.name = currentRightNumber.toString();
    return_array.push(cur_el);
    right_teeth.splice(min_dist_ind, 1);
  }

  let currentLeftNumber = parseInt(leftFrontTeeth.name);
  cur_el = leftFrontTeeth;
  return_array.push(cur_el);
  for(let i=0; i< left_teeth.length;){
    let min_dist_ind, min_dist_el, dist;
    [min_dist_ind, min_dist_el, dist] = getMinDistElementInfoFromArray(cur_el, left_teeth);
    let countness = Math.ceil(dist/avg_dist);
    currentLeftNumber += countness;
    //Create links to Prev and Next Items
    cur_el.prevTeeth = min_dist_el;
    min_dist_el.nextTeeth = cur_el;
    // Continue
    cur_el = min_dist_el;
    cur_el.name = currentLeftNumber.toString();
    return_array.push(cur_el);
    left_teeth.splice(min_dist_ind, 1);
  }
  rightFrontTeeth.prevTeeth = leftFrontTeeth;
  leftFrontTeeth.nextTeeth = rightFrontTeeth;
  console.log(return_array);
  // Return array with named front top teeth
  return return_array;
}
/**
 * It creates array with middlepoints, that
 * presents points in middle of teeth.
 * @param {Array<THREE.Vector3>} teeth_with_names_a Array with named THREE.Vector3 of teeth
 * @return {Array<THREE.Vector3>} There are an points with names "name-name"
 */
function createSeparationPoints(teeth_with_names_a){
  let separationPoints = [];
  try{
    let entry = teeth_with_names_a[teeth_with_names_a.length-1];
    while(entry.nextTeeth){
      //Now calculates middlepoint
      let new_vec = new THREE.Vector3();
      new_vec.copy(entry.nextTeeth);
      new_vec.sub(entry);
      new_vec.multiplyScalar(0.5);
      new_vec.add(entry);
      new_vec.teethNames = [];
      new_vec.teethNames.push(entry.name);
      new_vec.teethNames.push(entry.nextTeeth.name);
      separationPoints.push(new_vec);
      entry = entry.nextTeeth;
    }
  }
  catch(e){
    console.log(e);
  }
  return separationPoints;
}


function sortTeethCoords(teeth_coords_json) {
  for(let obj_name in teeth_coords_json["teeth_coords"]){
    teeth_coords_json["teeth_coords"][obj_name].sort(function(a, b) {
      if (parseFloat(a.x) > parseFloat(b.x)) {
        return 1;
      } else {
        return -1;
      }
    });
  }
}
///////////////////// GETTING INFORMATION FOR SEPARATION

function changePositionOfBottomJawsByY(y) {
  for (let i = 1; i <= JawsObjects.length; i++) {
    JawsObjects[i].bottomBrackets.position.y += y;
    JawsObjects[i].bottomTeeth.position.y += y;
    JawsObjects[i].bottomDental.position.y += y;
  }
}

function changePositionOfTopJawsByY(y) {
  for (let i = 1; i <= JawsObjects.length; i++) {
    JawsObjects[i].topBrackets.position.y += y;
    JawsObjects[i].topTeeth.position.y += y;
    JawsObjects[i].topDental.position.y += y;
  }
}

function clearCollisionScene() {
  for (let i = 0; i < collisionScene.children.length; i++) {
    collisionScene.remove(collisionScene.children[i]);
  }
  for (let i = 0; i < sceneTopJaw.children.length; i++) {
    sceneTopJaw.remove(sceneTopJaw.children[i]);
  }
  for (let i = 0; i < sceneBottomJaw.children.length; i++) {
    sceneBottomJaw.remove(sceneBottomJaw.children[i]);
  }
}
//Важная для рендеринга функция.
function addCurrentJawsToCollisionScene() {
  let cloned_top = CurrentJawsObject.topTeeth.clone();
  cloned_top.material = new THREE.MeshPhongMaterial({
    side: THREE.BackSide,
    shading: THREE.SmoothShading
  });
  cloned_top.position.y = 0;
  sceneTopJaw.add(cloned_top);
  sceneBottomJaw.add(CurrentJawsObject.bottomTeeth.clone());
}

function renderCurrentSeparationArray(){
  for(let ind in LastSeparationArray){
    scene.remove(LastSeparationArray[ind]);
  }
  for(let ind in CurrentSeparationArray){
    scene.add(CurrentSeparationArray[ind]);
  }
}

function renderCurrentJawsObject() {
  scene.remove(LastJawsObject.topBrackets);
  scene.remove(LastJawsObject.bottomBrackets);
  scene.remove(LastJawsObject.topTeeth);
  scene.remove(LastJawsObject.bottomTeeth);
  scene.remove(LastJawsObject.topDental);
  scene.remove(LastJawsObject.bottomDental);

  scene.add(CurrentJawsObject.topBrackets);
  scene.add(CurrentJawsObject.bottomBrackets);
  scene.add(CurrentJawsObject.topTeeth);
  scene.add(CurrentJawsObject.bottomTeeth);
  scene.add(CurrentJawsObject.topDental);
  scene.add(CurrentJawsObject.bottomDental);
}
function init() {
  container = document.querySelector("#threeContainer");

  scene = new THREE.Scene();
  sceneTopJaw = new THREE.Scene();
  sceneBottomJaw = new THREE.Scene();
  scene.background = new THREE.Color(0x72645b);

  /// Perspective Camera
  camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    1,
    1000000
  );
  camera.position.set(-5, 0, 10);
  camera.position.multiplyScalar(10);
  cameraDirection = new THREE.Vector3(0, -0.25, 0);

  /// Orthographic Camera
  rayCamera = new THREE.OrthographicCamera(
    -rayCameraSize,
    rayCameraSize,
    rayCameraSize,
    -rayCameraSize,
    0,
    2 * rayCameraSize
  );
  rayCamera.rotation.x = -Math.PI / 2;
  rayCamera.position.set(0, rayCameraSize, 0);

  let manager = new THREE.LoadingManager();
  manager.onStart = function(url, itemsLoaded, itemsTotal) {
    console.log(
      "Started loading file: " +
        url +
        ".\nLoaded " +
        itemsLoaded +
        " of " +
        itemsTotal +
        " files."
    );
  };
  /**
   * 
   * @param {THREE.Vector3} coords_obj 
   * @param {String} space 
   * @return {THREE.Mesh}
   */
  function createSeparationMesh(coords_obj, space){
    let geom = new THREE.SphereBufferGeometry(2);
    let material = new THREE.MeshBasicMaterial({ color: 0x11ff22 });
    let mesh = new THREE.Mesh(geom, material);
    mesh.position.set(
      coords_obj.x,
      coords_obj.y,
      coords_obj.z
    );
    //mesh.position.z = mesh.position.z + zTranslationBottomJaw;
    /// Создание Лейблов
    mesh.position.z = mesh.position.z - 10;
    //scene.add(mesh);
    let meshDiv = document.createElement("div");
    meshDiv.className = "label";
    meshDiv.textContent = space;
    meshDiv.style.marginTop = "-1em";
    var meshLabel = new THREE.CSS2DObject(meshDiv);
    meshLabel.position.copy(mesh.position);
    mesh.add(meshLabel);
    return mesh;
  }

  $.getJSON("./models/separ.json", separ_json_obj => {
    console.log("SEPOHIFOIUSDGFIOGVYFUOSDGYFUF");
    console.log(separ_json_obj);

    $.getJSON("./models/teeth_coord.json", json_obj => {
      console.log(json_obj);
      // At first we create new object with teeth
      let new_teeth_coords = {};
      for(let obj_name in json_obj.teeth_coords){
        let cur_obj = null;
        // '0-*' - top, '1-*' - bottom;
        if(obj_name[0] === "0"){
          cur_obj = nameFrontTopTeeth(json_obj.teeth_coords[obj_name]);
        } else {
          cur_obj = nameFrontBottomTeeth(json_obj.teeth_coords[obj_name]);
        }
        // Now we need to name all other teeth
        new_teeth_coords[obj_name] = cur_obj;
        separationPoints[obj_name] = createSeparationPoints(new_teeth_coords[obj_name]);
      }
  
      //Parse

      for(let i = 0 ; i < 36; i++){
        let new_obj = {layer: 0, meshes:[]};
        new_obj.layer = i;
        SeparObjectsLayers.push(new_obj);
      }   
      for(let layer_obj_num in separ_json_obj){
        let layer_obj = separ_json_obj[layer_obj_num];
        for(let i = 0; i < layer_obj.layers.length; i++){
          let cur_item = SeparObjectsLayers[parseInt(layer_obj.layers[i])];
          for (let j = 0; j < layer_obj["IPR"].length; j++){
            let first_num = "0";
            if (layer_obj.position == "top"){
              first_num = "0";
            } else {
              first_num = "1";
            }
            let points_arr = separationPoints[first_num + "-" + layer_obj["layers"][i]];
            // Find middlepoint from separationPoints layer that have 'layer_obj["IPR"][j].teeth'
            let elem = points_arr.find(function(el){
              if (el.teethNames.includes(layer_obj["IPR"][j].teeth[0]) &&
                  el.teethNames.includes(layer_obj["IPR"][j].teeth[1])
              ){
                return true;
              } else {
                return false;
              }    
            });
            let new_mesh = createSeparationMesh(elem, layer_obj["IPR"][j].space);
            cur_item["meshes"].push(new_mesh);
          }
        }
      }
    });
  });
  manager.onLoad = function() {
    makeDepthRaycast();
    CurrentJawsObject = JawsObjects[1];
    scene.add(CurrentJawsObject.topBrackets);
    scene.add(CurrentJawsObject.bottomBrackets);
    scene.add(CurrentJawsObject.topTeeth);
    scene.add(CurrentJawsObject.bottomTeeth);
    scene.add(CurrentJawsObject.topDental);
    scene.add(CurrentJawsObject.bottomDental);
    console.log("Loading complete!");
  };

  manager.onProgress = function(url, itemsLoaded, itemsTotal) {
    console.log(
      "Loading file: " +
        url +
        ".\nLoaded " +
        itemsLoaded +
        " of " +
        itemsTotal +
        " files."
    );
  };

  manager.onError = function(url) {
    console.log("There was an error loading " + url);
  };

  let loader = new THREE.STLLoader(manager);
  let top_num = 23;
  let bottom_num = 8;
  for (let i = 0; i <= 23; i++) {
    let new_obj = Object.assign({}, JawsObj);
    let top_n = i;
    let bottom_n = i;
    if (i > top_num) {
      top_n = top_num;
    }
    if (i > bottom_num) {
      bottom_n = bottom_num;
    }
    top_n = top_n.toString();
    bottom_n = bottom_n.toString();
    loadTopDentalByNumber(top_n, new_obj);
    loadBottomDentalByNumber(bottom_n, new_obj);
    loadTopTeethByNumber(top_n, new_obj);
    loadBottomTeethByNumber(bottom_n, new_obj);
    loadTopBracketsByNumber(top_n, new_obj);
    loadBottomBracketsByNumber(bottom_n, new_obj);
    JawsObjects[i] = new_obj;
  }
  loader.load(
    "./models/model1/teeth/0-0.stl",
    loadComparisonTopTeeth.bind(ComparisonJawsObj)
  );
  loader.load(
    "./models/model1/teeth/1-0.stl",
    loadComparisonBottomTeeth.bind(ComparisonJawsObj)
  );

  async function loadTopDentalByNumber(num, obj) {
    loader.load(
      "./models/model1/gum/0-" + num + ".stl",
      loadTopDental.bind(obj)
    );
  }

  async function loadBottomDentalByNumber(num, obj) {
    loader.load(
      "./models/model1/gum/1-" + num + ".stl",
      loadBottomDental.bind(obj)
    );
  }

  async function loadTopTeethByNumber(num, obj) {
    loader.load(
      "./models/model1/teeth/0-" + num + ".stl",
      loadTopTeeth.bind(obj)
    );
  }
  async function loadBottomTeethByNumber(num, obj) {
    loader.load(
      "./models/model1/teeth/1-" + num + ".stl",
      loadBottomTeeth.bind(obj)
    );
  }

  async function loadTopBracketsByNumber(num, obj) {
    loader.load(
      "./models/model1/attach/0-" + num + ".stl",
      loadTopBrackets.bind(obj)
    );
  }

  async function loadBottomBracketsByNumber(num, obj) {
    loader.load(
      "./models/model1/attach/1-" + num + ".stl",
      loadBottomBrackets.bind(obj)
    );
  }

  function loadTopTeeth(geometry) {
    let mesh = new THREE.Mesh(geometry, topPressureMaterial);
    mesh.position.x = xTranslationTopJaw;
    mesh.position.z = zTranslationTopJaw;
    if (showTopJaw) {
      this.topTeeth = mesh;
      //scene.add(mesh);
    }
    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);

    let invertedMaterial = new THREE.MeshPhongMaterial({
      side: THREE.BackSide,
      shading: THREE.SmoothShading
    });
    let invertedMesh = new THREE.Mesh(geometry, invertedMaterial);
    invertedMesh.position.x = xTranslationTopJaw;
    invertedMesh.position.z = zTranslationTopJaw;
    //GlobalTopMesh = invertedMesh;
    sceneTopJaw.add(invertedMesh);
  }

  function loadComparisonTopTeeth(geometry) {
    let mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhongMaterial({
        side: THREE.DoubleSide,
        shading: THREE.SmoothShading,
        color: 0xfa7439
      })
    );
    mesh.position.x = xTranslationTopJaw;
    mesh.position.z = zTranslationTopJaw;

    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);
    mesh.renderOrder = 1;
    this.topTeeth = mesh;
  }
  function loadComparisonBottomTeeth(geometry) {
    let mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhongMaterial({
        side: THREE.DoubleSide,
        shading: THREE.SmoothShading,
        color: 0xfa7439
      })
    );
    mesh.position.x = xTranslationBottomJaw;
    mesh.position.y = 0.0;
    mesh.position.z = zTranslationBottomJaw;
    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);
    mesh.renderOrder = 1;
    this.bottomTeeth = mesh;
  }

  function loadBottomTeeth(geometry) {
    let mesh = new THREE.Mesh(geometry, bottomPressureMaterial);
    mesh.position.x = xTranslationBottomJaw;
    mesh.position.y = 0.0;
    mesh.position.z = zTranslationBottomJaw;
    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);
    if (showBottomJaw) {
      this.bottomTeeth = mesh.clone();
      //scene.add(this.bottomTeeth);
    }
    sceneBottomJaw.add(mesh);
  }
  function loadTopDental(geometry) {
    let material = new THREE.MeshPhongMaterial({
      color: 0x338933,
      specular: 0xf2b8bf,
      shininess: 1,
      shading: THREE.SmoothShading
    });
    let mesh = new THREE.Mesh(geometry, material);
    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);

    mesh.position.x = xTranslationTopJaw;
    mesh.position.z = zTranslationTopJaw;
    if (showTopJaw) {
      this.topDental = mesh;
      //scene.add(mesh);
    }
  }

  function loadBottomDental(geometry) {
    let material = new THREE.MeshPhongMaterial({
      color: 0x338933,
      specular: 0xf2b8bf,
      shininess: 1,
      shading: THREE.SmoothShading
    });
    let mesh = new THREE.Mesh(geometry, material);
    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);

    mesh.position.x = xTranslationBottomJaw;
    mesh.position.z = zTranslationBottomJaw;
    if (showBottomJaw) {
      this.bottomDental = mesh;
      //scene.add(mesh);
    }
  }

  function loadTopBrackets(geometry) {
    let material = new THREE.MeshPhongMaterial({
      color: 0x338933,
      specular: 0xf2b8bf,
      shininess: 1,
      shading: THREE.SmoothShading
    });
    let mesh = new THREE.Mesh(geometry, material);
    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);

    mesh.position.x = xTranslationTopJaw;
    mesh.position.z = zTranslationTopJaw;
    if (showTopJaw) {
      this.topBrackets = mesh;
      //scene.add(mesh);
    }
  }
  function loadBottomBrackets(geometry) {
    let material = new THREE.MeshPhongMaterial({
      color: 0x338933,
      specular: 0xf2b8bf,
      shininess: 1,
      shading: THREE.SmoothShading
    });
    let mesh = new THREE.Mesh(geometry, material);
    mesh.geometry = new THREE.Geometry().fromBufferGeometry(mesh.geometry);
    mesh.geometry.mergeVertices();
    mesh.geometry.computeVertexNormals();
    mesh.geometry = new THREE.BufferGeometry().fromGeometry(mesh.geometry);

    mesh.position.x = xTranslationBottomJaw;
    mesh.position.z = zTranslationBottomJaw;
    if (showBottomJaw) {
      this.bottomBrackets = mesh;
      //scene.add(mesh);
    }
  }

  // loader.load("./models/z-07-top.stl", );

  // loader.load("./models/d-07-top.stl", );

  // loader.load("./models/z-07-bottom.stl", );

  // loader.load("./models/d-07-bottom.stl", );

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  addShadowedLight(1, 1, 0.6, 0x99ccff, 0.9);
  addShadowedLight(1, -0.2, -1, 0xffaadd, 0.7);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  //renderer.shadowMap.enabled = true;

  container.appendChild(renderer.domElement);
  /// СОЗДАТЬ CSS2DRenderer
  labelRenderer = new THREE.CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = 0;
  container.appendChild(labelRenderer.domElement);
  /// Внимание, теперь Контролам нужно передавать dom-элемент
  /// от 2Д Рендерера
  new THREE.OrbitControls(camera, labelRenderer.domElement);
  /// Конец
  stats = new Stats();
  container.appendChild(stats.dom);
  window.addEventListener("resize", onWindowResize, false);
}

function addShadowedLight(x, y, z, color, intensity) {
  let directionalLight = new THREE.DirectionalLight(color, intensity);
  directionalLight.position.set(x, y, z);
  scene.add(directionalLight);

  let d = 1;
  directionalLight.castShadow = true;
  directionalLight.shadow.camera.left = -d;
  directionalLight.shadow.camera.right = d;
  directionalLight.shadow.camera.top = d;
  directionalLight.shadow.camera.bottom = -d;
  directionalLight.shadow.camera.near = 1;
  directionalLight.shadow.camera.far = 4;
  directionalLight.shadow.mapSize.width = 1024;
  directionalLight.shadow.mapSize.height = 1024;
  directionalLight.shadow.bias = -0.002;
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  if (!someErrors) {
    try {
      render();
    } catch (e) {
      someErrors = true;
      console.log(e);
    }
  }
  stats.update();
  requestAnimationFrame(animate);
}

function makeDepthRaycast() {
  // Jaws depth map textures

  renderer.render(sceneTopJaw, rayCamera, topInvJawDepth, {
    shadowMapCullFace: THREE.CullFaceBack
  });
  renderer.render(sceneBottomJaw, rayCamera, bottomJawDepth);

  // Collision detector
  // collisionScene = new THREE.Scene({
  //   background: new THREE.Color(0xffffff)
  // });
  let collisionMaterial = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform sampler2D topInvJawDepth;
      uniform sampler2D bottomJawDepth;
      const float colorspeed = 50.;

      vec3 hsv(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }

      void main() {
        float t = 1.0 - texture2D( topInvJawDepth, vUv ).x;
        float b = 1.0 - texture2D( bottomJawDepth, vUv ).x;
        float P = colorspeed * (b - t) * (1. - step(0., -t));
        gl_FragColor = vec4(hsv(vec3(.7 - clamp(P, 0., .7), smoothstep(0.,.1, P), 1.)), 1.0);
      }`,
    uniforms: {
      topInvJawDepth: { value: topInvJawDepthTexture },
      bottomJawDepth: { value: bottomJawDepthTexture }
    }
  });
  collisionScene.remove(collisionPlane);
  scene.remove(collisionPlane);
  collisionPlane = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(60, 60),
    collisionMaterial
  );
  collisionPlane.rotation.x = -Math.PI / 2;
  collisionPlane.position.y = zTranslationBottomJaw;
  collisionPlane.position.y -= 10;
  collisionPlane.position.z = xTranslationBottomJaw;
  collisionScene.add(collisionPlane);
  renderer.render(collisionScene, rayCamera, collision);
  scene.add(collisionPlane);

  needDepthRaycast = false;
}

function render() {
  if (needDepthRaycast) {
    makeDepthRaycast();
  }

  camera.lookAt(cameraDirection);
  renderer.render(scene, camera);
  // Обновление 2ДРендерера!
  labelRenderer.render(scene, camera);
}
