// Three.jsはワールドの読み取り専用の投影です。船の正本やLua状態をここに持たせません。
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {BOAT_TYPES, WAYPOINTS, type BoatKind, type World} from './world';
import type {UiState} from './project';
export class WorldView {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene=new THREE.Scene();
  private readonly camera=new THREE.PerspectiveCamera(43,1,0.1,700);
  private readonly controls:OrbitControls;
  private readonly resizeObserver:ResizeObserver;
  private readonly boats=new Map<number,THREE.Group>();
  private readonly templates=new Map<BoatKind,THREE.Group>();
  private readonly ring:THREE.Mesh;
  private readonly geometries=new Set<THREE.BufferGeometry>();
  private readonly materials=new Set<THREE.Material>();
  private readonly click:(event:PointerEvent)=>void;
  private pointerStart=[0,0];
  private readonly pointerDown:(event:PointerEvent)=>void;
  private readonly contextLost:(event:Event)=>void;
  constructor(private readonly container:HTMLElement, select:(id:number)=>void, changed:()=>void, failure:(error:Error)=>void) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.setClearColor(0xc3d6dd);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.domElement.setAttribute('aria-label','TSホストの仮ワールド。ドラッグで回転、ホイールで拡大。');
    this.renderer.domElement.setAttribute('data-testid','world-canvas');
    container.append(this.renderer.domElement);
    this.scene.fog=new THREE.Fog(0xc3d6dd,200,450);
    this.scene.add(new THREE.HemisphereLight(0xf5fcff,0x48606b,2.8));
    const sun=new THREE.DirectionalLight(0xfff0dc,3.2);sun.position.set(-30,80,50);this.scene.add(sun);
    this.camera.position.set(78,86,-105);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.target.set(0,0,4);this.controls.maxPolarAngle=Math.PI*0.46;this.controls.minDistance=25;this.controls.maxDistance=240;
    this.controls.enableDamping=true;this.controls.dampingFactor=0.1;
    this.controls.addEventListener('end',changed);
    this.scene.add(this.box(1000,1,1000,0x356b80,0,-1,0));
    const grid=new THREE.GridHelper(220,22,0x9bd1dd,0x88bdcb);grid.position.y=0.025;
    const gridMaterials=Array.isArray(grid.material)?grid.material:[grid.material];
    gridMaterials.forEach(m=>{m.transparent=true;m.opacity=0.13;this.materials.add(m);});this.geometries.add(grid.geometry);this.scene.add(grid);
    this.harbor();
    const routeGeometry=new THREE.BufferGeometry().setFromPoints([...WAYPOINTS,WAYPOINTS[0]].map(([x,z])=>new THREE.Vector3(x,0.035,z)));
    const routeMaterial=new THREE.LineDashedMaterial({color:0xadd5d6,dashSize:1.2,gapSize:0.8,transparent:true,opacity:0.6});
    const route=new THREE.Line(routeGeometry,routeMaterial);route.computeLineDistances();this.scene.add(route);
    this.geometries.add(routeGeometry);this.materials.add(routeMaterial);
    WAYPOINTS.forEach(([x,z])=>{
      this.scene.add(this.cylinder(0.5,0.8,1.7,0xebc15f,x,0.9,z));
      this.scene.add(this.cylinder(1.2,1.2,0.12,0xe6eceb,x,0.07,z));
    });
    const ringGeo=new THREE.RingGeometry(6,6.16,48);const ringMat=new THREE.MeshBasicMaterial({color:0xc8ffff,side:THREE.DoubleSide,transparent:true,opacity:0.9});
    this.geometries.add(ringGeo);this.materials.add(ringMat);
    this.ring=new THREE.Mesh(ringGeo,ringMat);this.ring.rotation.x=-Math.PI/2;this.ring.visible=false;this.scene.add(this.ring);
    for(const kind of ['rescue_boat','cargo_boat'] as const)this.templates.set(kind,this.boat(kind));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.pointerDown=e=>{this.pointerStart=[e.clientX,e.clientY];};
    this.click=e=>{
      if(Math.hypot(e.clientX-this.pointerStart[0]!,e.clientY-this.pointerStart[1]!)>5)return;
      const rect=this.renderer.domElement.getBoundingClientRect();
      const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),this.camera);
      const hit=ray.intersectObjects([...this.boats.values()],true)[0];
      if(!hit)return;let item:THREE.Object3D|null=hit.object;
      while(item){if(typeof item.userData.boatId==='number'){select(item.userData.boatId);return;}item=item.parent;}
    };
    this.contextLost=e=>{e.preventDefault();failure(new Error('WebGLコンテキストが失われました。保存後にページを再読み込みしてください。'));};
    this.renderer.domElement.addEventListener('pointerdown',this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup',this.click);
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
  }
  private material(color:number):THREE.MeshStandardMaterial {const m=new THREE.MeshStandardMaterial({color,roughness:0.8,metalness:0.05});this.materials.add(m);return m;}
  private box(w:number,h:number,d:number,color:number,x=0,y=0,z=0):THREE.Mesh {
    const geometry=new THREE.BoxGeometry(w,h,d);this.geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,this.material(color));mesh.position.set(x,y,z);return mesh;
  }
  private cylinder(top:number,bottom:number,h:number,color:number,x:number,y:number,z:number):THREE.Mesh {
    const geo=new THREE.CylinderGeometry(top,bottom,h,10);this.geometries.add(geo);
    const mesh=new THREE.Mesh(geo,this.material(color));mesh.position.set(x,y,z);return mesh;
  }
  private harbor():void {
    // すべてコードで組み立てたモデルです。ゲームの地形・画像・モデルを使用しません。
    this.scene.add(this.box(100,1.5,19,0xcbbd9c,0,0.1,54));
    this.scene.add(this.box(96,0.3,16,0x829885,0,1,55));
    this.scene.add(this.box(105,0.25,2,0xe3d4b3,0,0.7,44));
    for(const x of [-32,-12,12,32]) {
      this.scene.add(this.box(3,0.45,14,0xbbac95,x,0.8,38));
      for(const z of [33,38,43]) {this.scene.add(this.cylinder(0.2,0.2,2.4,0x4c605c,x-1.8,0.2,z));this.scene.add(this.cylinder(0.2,0.2,2.4,0x4c605c,x+1.8,0.2,z));}
    }
    const warehouse=this.box(18,5,9,0xe0e4dc,23,3.7,56);this.scene.add(warehouse);
    this.scene.add(this.box(19,0.4,10,0x354b58,23,6.4,56));
    this.scene.add(this.box(8,4,7,0xc2d3d1,-3,3.1,57));
    this.scene.add(this.box(9,0.4,8,0x466576,-3,5.3,57));
    for(let i=0;i<6;i++) {
      const x=-43+i*5.3;
      this.scene.add(this.cylinder(0.22,0.3,3,0x776d57,x,2.5,58));
      this.scene.add(this.cylinder(0,2.1,5.5,0x476b60,x,6,58));
    }
    this.scene.add(this.cylinder(1.3,1.8,8,0xe8e4d9,-46,4.8,45));
    this.scene.add(this.cylinder(2.1,2.1,0.6,0xcd7756,-46,9,45));
    this.scene.add(this.cylinder(0,2.1,1.3,0x486677,-46,9.9,45));
  }
  private boat(kind:BoatKind):THREE.Group {
    const group=new THREE.Group();
    const shape=new THREE.Shape();shape.moveTo(-1.9,-4);shape.lineTo(1.9,-4);shape.lineTo(1.9,2.2);shape.lineTo(0,4.7);shape.lineTo(-1.9,2.2);shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:1.1,bevelEnabled:true,bevelSize:0.25,bevelThickness:0.15,bevelSegments:1,steps:1});geometry.rotateX(Math.PI/2);this.geometries.add(geometry);
    const hull=new THREE.Mesh(geometry,this.material(BOAT_TYPES[kind].color));hull.position.y=0.9;group.add(hull);
    group.add(this.box(3.2,0.2,5.5,0xe7dfca,0,1.1,-0.5));
    if(kind==='rescue_boat') {
      group.add(this.box(2.4,1.6,2.7,0xe5ebe5,0,2,-0.6));
      group.add(this.box(2.5,0.6,2.8,0x345b70,0,2.25,-0.6));
      group.add(this.box(2.7,0.22,3.1,0xf1efdf,0,2.9,-0.6));
      group.add(this.box(0.12,1.7,0.12,0x344f5c,0,3.8,-1.2));
      group.add(this.box(0.85,0.15,0.2,0x97cfd3,0,4.55,-1.2));
    } else {
      group.add(this.box(2.3,1.5,1.6,0xe4e9df,0,2,-2.9));
      group.add(this.box(2.4,0.5,1.7,0x345b70,0,2.3,-2.9));
      group.add(this.box(2.7,1.2,2.8,0xbbb798,0,1.9,0));
      group.add(this.box(2.7,0.12,0.1,0xf6ecda,0,2.5,0));
    }
    group.add(this.cylinder(0.2,0.2,0.15,0xffddd0,-1.2,1.35,2.2));
    group.add(this.cylinder(0.2,0.2,0.15,0xc2efdb,1.2,1.35,2.2));
    return group;
  }
  resize():void {
    const {width,height}=this.container.getBoundingClientRect();
    if(width<1||height<1)return;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false);
  }
  draw(world:World,selected:number|null):void {
    for(const [id,mesh] of this.boats)if(!world.boats.has(id)){this.scene.remove(mesh);this.boats.delete(id);}
    for(const boat of world.boats.values()) {
      let mesh=this.boats.get(boat.id);
      if(!mesh||mesh.userData.kind!==boat.kind){if(mesh)this.scene.remove(mesh);mesh=this.templates.get(boat.kind)!.clone(true);mesh.userData={boatId:boat.id,kind:boat.kind};this.boats.set(boat.id,mesh);this.scene.add(mesh);}
      mesh.position.set(boat.x,boat.y,boat.z);mesh.rotation.set(0,boat.heading,0);
    }
    const boat=selected===null?undefined:world.boats.get(selected);
    this.ring.visible=!!boat;if(boat)this.ring.position.set(boat.x,0.045,boat.z);
    this.controls.update();this.renderer.render(this.scene,this.camera);
  }
  focus(world:World,selected:number|null):void {
    const boat=selected===null?undefined:world.boats.get(selected);
    const target=boat?new THREE.Vector3(boat.x,0,boat.z):new THREE.Vector3(0,0,4);
    this.controls.target.copy(target);this.camera.position.copy(target).add(new THREE.Vector3(boat?25:78,boat?28:86,boat?-30:-105));this.controls.update();
  }
  cameraState():NonNullable<UiState['camera']> {return {position:this.camera.position.toArray(),target:this.controls.target.toArray()};}
  restoreCamera(state:UiState['camera']):void {if(state){this.camera.position.fromArray(state.position);this.controls.target.fromArray(state.target);this.controls.update();}}
  dispose():void {
    this.resizeObserver.disconnect();this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown',this.pointerDown);this.renderer.domElement.removeEventListener('pointerup',this.click);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
    this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.renderer.dispose();this.renderer.domElement.remove();
  }
}
