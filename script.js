// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDPicDOQj13hEWS6Ywmm3CwHHZmiJf1VNM",
  authDomain: "unplugged-spirit-818a6.firebaseapp.com",
  databaseURL: "https://unplugged-spirit-818a6-default-rtdb.firebaseio.com",
  projectId: "unplugged-spirit-818a6",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const GEMINI_API_KEY = "AIzaSyCbl1QSxX7AjxiII8OB8TRQ5J8teRqBCqo";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// CLOCK
setInterval(()=>{
  document.getElementById("clock").innerText =
    new Date().toLocaleTimeString("en-IN",{hour12:false});
},1000);

// CAMERA
const video = document.getElementById("video");
navigator.mediaDevices.getUserMedia({video:true})
.then(stream => video.srcObject = stream)
.catch(()=> alert("Camera access denied"));

// CAPTURE
document.getElementById("captureBtn").onclick = async ()=>{
  const canvas = document.getElementById("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video,0,0);

  const base64 = canvas.toDataURL("image/jpeg").split(",")[1];

  analyzeImage(base64);
};

// GEMINI
async function analyzeImage(img){
  const analysis = document.getElementById("analysis");
  analysis.innerHTML="Analyzing...";

  const prompt = `You are an AI wildlife detection system...`;

  const res = await fetch(GEMINI_URL,{
    method:"POST",
    headers:{ "Content-Type":"application/json"},
    body: JSON.stringify({
      contents:[{
        parts:[
          {text:prompt},
          {inline_data:{mime_type:"image/jpeg",data:img}}
        ]
      }]
    })
  });

  const data = await res.json();

  try{
    let text = data.candidates[0].content.parts[0].text;
    text = text.replace(/```json|```/g,"");
    const json = JSON.parse(text);

    showResult(json);
    pushToFirebase(json);

  }catch(e){
    analysis.innerHTML="Error parsing Gemini response";
  }
}

// SHOW RESULT
function showResult(d){
  document.getElementById("analysis").innerHTML = `
    <h3>${d.species}</h3>
    Confidence: ${(d.confidence*100).toFixed(1)}%<br>
    Behavior: ${d.behavior}<br>
    Count: ${d.count}<br>
    Threat: ${d.threat_level}<br>
    Route: ${d.predicted_route}<br>
    Action: ${d.ranger_action}
  `;
}

// FIREBASE PUSH
function pushToFirebase(d){
  const ts = Date.now();
  const zone = document.getElementById("zoneSelect").value;

  db.ref("animals/"+ts).set({
    species:d.species,
    confidence:d.confidence,
    zone,
    count:d.count,
    timestamp:ts
  });

  db.ref("alerts/"+ts).set({
    message:`${d.species} in Zone ${zone}`,
    timestamp:ts
  });
}

// ECO SCORE
function recalcEcoScore(){
  db.ref().once("value",snap=>{
    let score=100;
    const data = snap.val();

    if(data.zones){
      Object.values(data.zones).forEach(z=>{
        if(z.locked) score-=10;
      });
    }

    if(data.waterholes){
      Object.values(data.waterholes).forEach(w=>{
        if(w.level < w.threshold) score-=15;
      });
    }

    db.ref("eco_score").set({
      score:Math.max(0,score),
      computed_at:Date.now()
    });
  });
}

// CONNECTION
firebase.database().ref(".info/connected").on("value",snap=>{
  const el = document.getElementById("connection");
  if(snap.val()){
    el.style.color="lime";
    el.innerText="● CONNECTED";
  } else {
    el.style.color="red";
    el.innerText="● OFFLINE";
  }
});