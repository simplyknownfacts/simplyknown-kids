// A lit, continuously moving sea. All motion uses the scene's single clock so
// page visibility, pause, and reduced-motion preferences stop it together.
export function createOcean(THREE) {
  const group = new THREE.Group();
  const clock = { value: 0 };
  const geometry = new THREE.PlaneGeometry(160, 160, 100, 100);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshPhongMaterial({ color: '#27bace', shininess: 65, specular: '#75dbea' });
  material.onBeforeCompile = shader => {
    shader.uniforms.seaTime = clock;
    const declarations = 'uniform float seaTime; varying vec3 seaPosition;\n';
    shader.vertexShader = declarations + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
      #include <beginnormal_vertex>
      float dx = .035*cos(position.x*.8+seaTime*.62)*cos(position.z*.62-seaTime*.4);
      float dz = -.027*sin(position.x*.8+seaTime*.62)*sin(position.z*.62-seaTime*.4);
      objectNormal = normalize(vec3(-dx, 1.0, -dz));
    `).replace('#include <begin_vertex>', `
      #include <begin_vertex>
      transformed.y += .044*sin(position.x*.8+seaTime*.62)*cos(position.z*.62-seaTime*.4);
      seaPosition = position;
    `);
    shader.fragmentShader = declarations + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float swell = sin(seaPosition.x*.52 + sin(seaPosition.z*.67)*1.2 + seaTime*.32);
      float crest = sin(seaPosition.z*2.6 + sin(seaPosition.x*.83 + seaTime*.15)*1.8 - seaTime*.7);
      float patches = smoothstep(.15,.75,sin(seaPosition.x*1.8+sin(seaPosition.z*.5)));
      float glimmer = smoothstep(.986,1.0,crest)*patches;
      diffuseColor.rgb *= .92 + .1*swell;
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.64,.95,.94), glimmer*.36);
    `);
  };
  const surface = new THREE.Mesh(geometry, material);
  surface.position.y = -.7; surface.receiveShadow = true; group.add(surface);

  const paint = color => new THREE.MeshStandardMaterial({ color, roughness: .65 });
  const cream = paint('#fff3cc'), coral = paint('#f57865'), wood = paint('#bc7850');
  const boats = [];
  function boat(x, z, angle, blue) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), blue ? paint('#527ad5') : coral);
    hull.scale.set(.36,.21,.9); hull.position.y=.09; boat.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(.45,.06,1.04), cream);
    deck.position.y=.22; boat.add(deck);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.65,6),wood);
    mast.position.y=.99; boat.add(mast);
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position',new THREE.Float32BufferAttribute([0,1.75,0,0,.52,.73,0,.52,0],3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo,new THREE.MeshStandardMaterial({color:'#fff9e4',side:THREE.DoubleSide,roughness:.8}));
    boat.add(sail);
    boat.position.set(x,-.55,z); boat.rotation.y=angle;
    boat.traverse(o=>{if(o.isMesh)o.castShadow=true;});
    boats.push({group:boat,x,z,angle}); group.add(boat);
  }
  boat(-10.6,1.2,.7,false); boat(10.7,-7.5,-.6,true);
  const birds = [];
  for(let i=0;i<3;i++) {
    const bird = new THREE.Group(), wings=[];
    for(const side of [-1,1]) {
      const wing = new THREE.Mesh(new THREE.SphereGeometry(.3,8,6),cream);
      wing.scale.set(1,.07,.26); wing.position.x=side*.22; bird.add(wing); wings.push(wing);
    }
    bird.position.set(-7+i*.8,3+i*.12,-9-i*.4); group.add(bird); birds.push({group:bird,wings,x:bird.position.x,z:bird.position.z});
  }
  function update(time, reduced=false) {
    const t=reduced?0:time; clock.value=t;
    boats.forEach((b,i)=>{
      b.group.position.set(b.x+Math.sin(t*.18+i)*.35,-.55+Math.sin(t*1.1+i)*.06,b.z+Math.sin(t*.13+i)*.65);
      b.group.rotation.set(Math.sin(t*1.2+i)*.045,b.angle+Math.sin(t*.2+i)*.06,Math.sin(t+i)*.07);
    });
    birds.forEach((b,i)=>{
      b.group.position.x=b.x+Math.sin(t*.2)*1.8;
      b.group.position.z=b.z+Math.sin(t*.24)*.7;
      b.wings.forEach((w,j)=>w.rotation.z=(j?1:-1)*(.15+Math.sin(t*3.1+i)*.22));
    });
  }
  update(0,true);
  return {group,update,snapshot:()=>({time:clock.value,boats:boats.map(b=>b.group.position.toArray())})};
}
