// Coordinates checked against each original 600 x 800 drawing, in percent.
// Clothing and hair silhouettes are not reliable anatomical measurements.
// Keep this map tied to these exact image files when replacing artwork.
(function () {
  const radii={hair:[10,7],eye:[4.7,3.1],ear:[3.4,4],nose:[3.5,2.8],mouth:[5.8,3],
    shoulder:[5.5,4],arm:[4.5,8],elbow:[4.7,4],hand:[5.2,5.5],belly:[9,7],leg:[5.8,10],knee:[5,4.2],foot:[7,4.8]};
  const maps=[
    {id:'01',points:{hair:[[53,10],[27,21],[74,19]],eye:[[46,22.5],[61,22]],ear:[[36,26],[68,25]],nose:[[55,25]],mouth:[[54,29]],shoulder:[[44,39],[63,39]],arm:[[36,52],[69,52]],elbow:[[34,56],[70,56]],hand:[[30.5,64],[74,64]],belly:[[53.5,54]],leg:[[46,74],[59,74]],knee:[[44,80],[59,80]],foot:[[41,93],[63,93]]}},
    {id:'02',points:{hair:[[51,6],[31,22],[70,22]],eye:[[44,22],[57,22]],ear:[[36,25],[65,25]],nose:[[51,25]],mouth:[[51,29]],shoulder:[[40,38],[61,38]],arm:[[36,49],[64,49]],elbow:[[35,54],[66,54]],hand:[[32,64],[69.5,64]],belly:[[50,53]],leg:[[44,77],[57,77]],knee:[[44,81],[57,81]],foot:[[41,94.5],[59.5,94.5]]}},
    // body-03 has a transparent hole where its shirt/torso should be. Retain
    // the asset, but do not quiz children on a damaged drawing until replaced.
    {id:'03',available:false,points:{}},
    {id:'04',points:{hair:[[50,8]],eye:[[42.5,21],[56.5,21]],ear:[[35,24],[65,24]],nose:[[49,24.5]],mouth:[[50,28]],shoulder:[[40,39],[60,39]],arm:[[34,51],[66,51]],elbow:[[32,55],[68,55]],hand:[[27.5,63],[73,63]],belly:[[50,54]],leg:[[43,71],[57,71]],knee:[[43,79],[57,79]],foot:[[39,93],[62,93.5]]}},
    {id:'05',points:{hair:[[50,8]],eye:[[42.5,21.5],[56.5,21.5]],ear:[[34.5,24],[65,24]],nose:[[49,25]],mouth:[[50,28]],shoulder:[[39.5,38],[60.5,38]],arm:[[35,49],[65,49]],elbow:[[33,52],[67,52]],hand:[[30.5,64],[70,64]],belly:[[50,54]],leg:[[42,73],[58,73]],knee:[[42,79],[58,79]],foot:[[39,93.5],[62,93.5]]}},
    // The cap covers the main hair area; do not ask the child to find it.
    {id:'06',points:{eye:[[43,20],[56,20]],ear:[[37,22.5],[65,23]],nose:[[48.5,23.5]],mouth:[[50,26]],shoulder:[[43,36],[62,36]],arm:[[37,46.5],[66,47]],elbow:[[35.5,50],[68,50]],hand:[[31.5,58],[69,59]],belly:[[51,47]],leg:[[45,62],[58.5,62]],knee:[[45,73],[58.5,73]],foot:[[41,85],[62,86]]}},

    {id:'07',points:{hair:[[48,13]],eye:[[43,30],[56,30]],ear:[[36,33],[64,33]],nose:[[50,33]],mouth:[[50,37]],shoulder:[[39,47],[61,47]],arm:[[38,53],[62,53]],elbow:[[37,58],[63,58]],hand:[[35,67],[65,67]],belly:[[50,55]],leg:[[47,73],[55,73]],knee:[[47,79],[55,79]],foot:[[45,94],[60,94]]}},
    {id:'08',points:{hair:[[49,11]],eye:[[43,23],[56,23]],ear:[[34,26],[66,26]],nose:[[50,27]],mouth:[[50,31]],shoulder:[[39,42],[61,42]],arm:[[36,50],[64,50]],elbow:[[34,57],[66,57]],hand:[[33,67],[67,67]],belly:[[50,52]],leg:[[44,84],[56,84]],knee:[[44,79],[56,79]],foot:[[42,93],[59,93]]}},
    {id:'09',points:{hair:[[49,12]],eye:[[43,24],[57,24]],ear:[[33,28],[65,28]],nose:[[50,28]],mouth:[[50,32]],shoulder:[[40,41],[61,41]],arm:[[38,48],[65,48]],elbow:[[37,51],[68,51]],hand:[[45,56],[75,54]],belly:[[50,49]],leg:[[53,64],[65,66]],knee:[[56,68],[68,69]],foot:[[64,82],[76,81]]}},
    {id:'10',points:{hair:[[50,7]],eye:[[42,20],[58,20]],ear:[[33,23],[67,23]],nose:[[50,24]],mouth:[[50,28]],shoulder:[[40,38],[60,38]],arm:[[36,48],[64,48]],elbow:[[34,55],[66,55]],hand:[[33,65],[67,65]],belly:[[50,52]],leg:[[45,84],[56,84]],knee:[[45,79],[56,79]],foot:[[42,94],[58,94]]}},
    {id:'11',points:{hair:[[50,10]],eye:[[43,22],[57,22]],ear:[[35,25],[65,25]],nose:[[50,26]],mouth:[[50,30]],shoulder:[[39,40],[61,40]],arm:[[36,49],[64,49]],elbow:[[33,56],[67,56]],hand:[[32,66],[68,66]],belly:[[50,52]],leg:[[44,84],[56,84]],knee:[[44,79],[56,79]],foot:[[42,94],[59,94]]}},
    // Covered hair and ears are not offered as questions on this drawing.
    {id:'12',points:{eye:[[42,20],[58,20]],nose:[[50,24]],mouth:[[50,28]],shoulder:[[40,40],[60,40]],arm:[[36,49],[64,49]],elbow:[[33,56],[67,56]],hand:[[32,66],[68,66]],belly:[[50,53]],leg:[[45,84],[56,84]],knee:[[45,80],[56,80]],foot:[[42,94],[58,94]]}},

  ];
  window.BodyPartsData={figures:maps.filter(m=>m.available!==false).map(m=>({
    id:m.id,img:'img/bodies/body-'+m.id+'.png',seated:m.id==='09',
    zones:Object.entries(m.points).flatMap(([n,points])=>points.map(([cx,cy])=>({n,cx,cy,rx:radii[n][0],ry:radii[n][1]})))
  }))};
})();
