const params = new URLSearchParams(window.location.search);
const name = params.get('name');
if(name){
  document.getElementById('student_name').textContent = name;
}
document.getElementById('logout').onclick = () => {
  window.location.href = '/';
};

const storyEl = document.getElementById('story');
const data = JSON.parse(localStorage.getItem('story_data') || '[]');

function makeWord(word, audio){
  const span = document.createElement('span');
  span.textContent = word + ' ';
  span.className = 'word';
  span.dataset.audio = audio;
  span.onclick = () => { new Audio('/api/audio/' + audio).play(); };
  return span;
}

data.forEach(item => {
  if(item.type === 'direction'){
    const p = document.createElement('p');
    const btn = document.createElement('button');
    btn.className = 'play-sent';
    btn.innerHTML = '<i class="lucide lucide-volume-2"></i>';
    btn.onclick = () => { new Audio('/api/audio/' + item.audio).play(); };
    p.textContent = item.text;
    p.appendChild(btn);
    storyEl.appendChild(p);
  } else if(item.text){
    const div = document.createElement('p');
    item.text.split(' ').forEach((w,i)=>{
      const audio = item.words[i];
      div.appendChild(makeWord(w, audio));
    });
    const btn = document.createElement('button');
    btn.className = 'play-sent';
    btn.innerHTML = '<i class="lucide lucide-volume-2"></i>';
    btn.onclick = () => { new Audio('/api/audio/' + item.audio).play(); };
    div.appendChild(btn);
    storyEl.appendChild(div);
  }
});

