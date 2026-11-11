import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Home, Compass, Library, ListMusic, Heart, Download, SlidersHorizontal,
  Settings, Search, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
  Volume2, VolumeX, Plus, FolderOpen, Disc3, Music2, MoreHorizontal,
  Radio, Headphones, Sparkles, X, Clock3, ChevronDown, ExternalLink,
  AudioLines, Mic2, ListPlus, Check, LoaderCircle
} from "lucide-react";
import "./style.css";

const nav = [
  ["خانه", Home], ["کشف موسیقی", Compass], ["کتابخانه من", Library],
  ["پلی‌لیست‌ها", ListMusic], ["علاقه‌مندی‌ها", Heart], ["دانلودها", Download],
  ["استودیو صدا", SlidersHorizontal]
];
const fmt = n => {
  if (!Number.isFinite(n)) return "0:00";
  const m = Math.floor(n / 60), s = Math.floor(n % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
const cover = (seed, size=600) => `https://picsum.photos/seed/${encodeURIComponent(seed)}/${size}/${size}`;

function App() {
  const [page, setPage] = useState("خانه");
  const [local, setLocal] = useState([]);
  const [online, setOnline] = useState([]);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [muted, setMuted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [liked, setLiked] = useState([]);
  const [playlists, setPlaylists] = useState([{name:"Night Drive", tracks:[]},{name:"Favorites",tracks:[]}]);
  const [downloads, setDownloads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [folders, setFolders] = useState([]);
  const [showQueue, setShowQueue] = useState(false);
  const [eq, setEq] = useState([0,0,0,0,0,0,0,0,0,0]);
  const audio = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const id = setInterval(() => {
      if (audio.current && !audio.current.paused) setProgress(audio.current.currentTime || 0);
    }, 300);
    return () => clearInterval(id);
  }, []);

  const allTracks = useMemo(() => [...local, ...online], [local, online]);
  const notify = msg => { setNotice(msg); setTimeout(() => setNotice(""), 3000); };

  function play(track, list) {
    if (!track?.url) return;
    setPlaying(track);
    setIsPlaying(true);
    if (list) setQueue(list);
    setTimeout(() => {
      if (audio.current) {
        audio.current.src = track.url;
        audio.current.play().catch(() => { setIsPlaying(false); notify("این منبع اجازه پخش مستقیم نمی‌دهد؛ لینک منبع را باز کن."); });
      }
    }, 0);
  }
  function togglePlay() {
    if (!playing) {
      const first = queue[0] || local[0] || online[0];
      if (first) play(first);
      else notify("اول یک آهنگ به کتابخانه یا صف پخش اضافه کن.");
      return;
    }
    if (audio.current?.paused) audio.current.play().then(()=>setIsPlaying(true)).catch(()=>{});
    else { audio.current?.pause(); setIsPlaying(false); }
  }
  function next() {
    if (!queue.length) return;
    const i = queue.findIndex(t => t.id === playing?.id);
    play(queue[(i + 1 + queue.length) % queue.length], queue);
  }
  function prev() {
    if (!queue.length) return;
    const i = queue.findIndex(t => t.id === playing?.id);
    play(queue[(i - 1 + queue.length) % queue.length], queue);
  }
  async function addFolder() {
    if (!window.shaki) { fileRef.current?.click(); return; }
    const found = await window.shaki.pickMusicFolder();
    if (found?.length) {
      setLocal(old => [...old.filter(x => !found.some(f => f.id === x.id)), ...found]);
      notify(`${found.length} آهنگ به کتابخانه اضافه شد.`);
    }
  }
  function importFiles(e) {
    const list = [...(e.target.files || [])].map(f => ({
      id: `${f.name}-${f.size}`, title: f.name.replace(/\.[^.]+$/, ""), artist:"فایل محلی",
      album:"واردشده از کامپیوتر", url:URL.createObjectURL(f), file:f, size:f.size
    }));
    setLocal(old => [...old, ...list]); notify(`${list.length} فایل اضافه شد.`);
  }
  async function searchOnline(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true); setPage("کشف موسیقی");
    try {
      let usable;
      if (window.shaki?.searchArchive) {
        usable = await window.shaki.searchArchive(q);
      } else {
        const endpoint = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}%20AND%20mediatype:audio&fl[]=identifier,title,creator,year&rows=24&page=1&output=json`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error("پاسخی از منبع دریافت نشد.");
        const data = await res.json();
        usable = (data.response?.docs || []).map(d => ({
          id:`ia-${d.identifier}`, title:d.title || d.identifier,
          artist:Array.isArray(d.creator) ? d.creator[0] : (d.creator || "Internet Archive"),
          album:d.year ? String(d.year) : "Internet Archive",
          url:`https://archive.org/details/${encodeURIComponent(d.identifier)}`,
          source:"Internet Archive", pageUrl:`https://archive.org/details/${encodeURIComponent(d.identifier)}`,
          cover:cover(d.identifier), canDownload:false
        }));
      }
      setOnline(usable);
      if (!usable.length) notify("نتیجه قابل پخش پیدا نشد؛ عبارت دیگری امتحان کن.");
      else notify(`${usable.length} نتیجه از Internet Archive پیدا شد.`);
    } catch (err) {
      notify("جست‌وجوی آنلاین ناموفق بود. اتصال اینترنت یا دسترسی به منبع را بررسی کن.");
      setOnline([]);
    } finally { setLoading(false); }
  }
  async function download(track) {
    if (!track?.canDownload) { notify("دانلود برای این منبع فعال نیست."); return; }
    if (!window.shaki) { await window.open(track.url, "_blank"); return; }
    try {
      const r = await window.shaki.downloadAudio({url:track.url, filename:`${track.title}.mp3`});
      if (!r.canceled) { setDownloads(old=>[...old, {...track, savedPath:r.path}]); notify("دانلود با موفقیت انجام شد."); }
    } catch { notify("دانلود انجام نشد؛ ممکن است منبع دسترسی مستقیم ندهد."); }
  }
  function addQueue(t) { setQueue(old=>old.some(x=>x.id===t.id)?old:[...old,t]); notify("به صف پخش اضافه شد."); }
  function like(t) { setLiked(old=>old.some(x=>x.id===t.id)?old.filter(x=>x.id!==t.id):[...old,t]); }
  function addPlaylist() {
    const name = prompt("نام پلی‌لیست جدید:");
    if (name?.trim()) setPlaylists(old=>[...old,{name:name.trim(),tracks:[]}]);
  }
  function addToPlaylist(track, name) {
    setPlaylists(old=>old.map(p=>p.name===name?{...p,tracks:p.tracks.some(t=>t.id===track.id)?p.tracks:[...p.tracks,track]}:p));
    notify(`به ${name} اضافه شد.`);
  }

  const demo = [
    {id:"demo1",title:"Midnight City",artist:"M83",album:"Hurry Up, We're Dreaming",cover:cover("midnight-neon"),url:"",source:"نمونه نمایشی"},
    {id:"demo2",title:"After Dark",artist:"Mr.Kitty",album:"Time",cover:cover("after-dark"),url:"",source:"نمونه نمایشی"},
    {id:"demo3",title:"Nightcall",artist:"Kavinsky",album:"OutRun",cover:cover("nightcall"),url:"",source:"نمونه نمایشی"},
    {id:"demo4",title:"A Moment Apart",artist:"ODESZA",album:"A Moment Apart",cover:cover("moment-apart"),url:"",source:"نمونه نمایشی"}
  ];
  const current = playing || demo[0];
  const tracksForPage = page==="علاقه‌مندی‌ها" ? liked : page==="دانلودها" ? downloads : page==="کشف موسیقی" ? online : page==="پلی‌لیست‌ها" ? (playlists[0]?.tracks || []) : local;
  const displayTracks = tracksForPage.length ? tracksForPage : (page==="خانه" ? [...local.slice(0,5),...online.slice(0,5)] : []);
  const titleMap = {"خانه":"برای لحظه‌های تو","کشف موسیقی":"جهان موسیقی را کشف کن","کتابخانه من":"کتابخانه موسیقی تو","پلی‌لیست‌ها":"موسیقی‌هایت، با سلیقه تو","علاقه‌مندی‌ها":"آهنگ‌های دوست‌داشتنی","دانلودها":"دانلودهای من","استودیو صدا":"استودیوی صدا"};

  return <div className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><AudioLines size={23}/></div><div><b>SHAKI<span>.</span></b><small>MUSIC PLAYER</small></div></div>
      <div className="side-label">منو</div>
      <nav>{nav.map(([label,Icon])=><button key={label} className={`nav-item ${page===label?"active":""}`} onClick={()=>setPage(label)}><Icon size={18}/><span>{label}</span>{label==="دانلودها"&&downloads.length>0&&<i>{downloads.length}</i>}</button>)}</nav>
      <div className="side-divider"/>
      <div className="side-head"><span>پلی‌لیست‌های تو</span><button onClick={addPlaylist}><Plus size={16}/></button></div>
      {playlists.map((p,i)=><button className="playlist-link" key={p.name} onClick={()=>setPage("پلی‌لیست‌ها")}><span className={`playlist-dot dot-${i%4}`}/>{p.name}</button>)}
      <div className="sidebar-bottom"><div className="pro-card"><Sparkles size={17}/><b>Music without limits</b><span>فضای شخصی موسیقی تو</span></div><button className="nav-item" onClick={()=>setPage("تنظیمات")}><Settings size={18}/> تنظیمات</button></div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="crumb"><span>SHAKI MUSIC</span><b>/</b>{page}</div>
        <form className="searchbox" onSubmit={searchOnline}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="نام آهنگ، خواننده یا آلبوم را جست‌وجو کن..."/><kbd>ENTER</kbd></form>
        <div className="top-actions"><button className="icon-btn" onClick={()=>setShowQueue(v=>!v)} title="صف پخش"><ListMusic size={18}/></button><div className="avatar">S</div></div>
      </header>

      <div className="content-scroll">
        <section className="welcome-row"><div><div className="eyebrow"><span className="live-dot"/> YOUR SOUND. YOUR WORLD.</div><h1>{titleMap[page] || page}</h1><p>موسیقی خوب، حال خوب می‌سازد. بگذار صدا جریان پیدا کند.</p></div><div className="date-chip"><Disc3 size={16}/> PREMIUM EXPERIENCE</div></section>

        {page==="خانه" && <>
          <section className="hero">
            <div className="hero-copy"><div className="hero-tag"><Sparkles size={14}/> انتخاب ویژه شاکی</div><h2>صدا را<br/><em>زندگی کن.</em></h2><p>کتابخانه‌ات را بساز، موسیقی تازه کشف کن و در دنیای صدا غرق شو.</p><div className="hero-buttons"><button className="primary-btn" onClick={()=>setPage("کشف موسیقی")}><Compass size={17}/> کشف موسیقی</button><button className="ghost-btn" onClick={addFolder}><FolderOpen size={17}/> افزودن آهنگ</button></div></div>
            <div className="hero-art"><div className="art-orbit orbit-a"/><div className="art-orbit orbit-b"/><div className="hero-disc"><div className="disc-center"><AudioLines size={30}/></div></div><div className="floating-note note-a">♫</div><div className="floating-note note-b">♪</div><div className="sound-pill"><span/><span/><span/><span/><span/><span/><span/></div></div>
          </section>
          <div className="section-heading"><div><span className="eyebrow">START LISTENING</span><h2>شروع سریع</h2></div><button className="text-btn" onClick={addFolder}>افزودن پوشه موسیقی <Plus size={15}/></button></div>
          <div className="quick-grid">
            <button onClick={()=>setPage("کتابخانه من")}><div className="quick-icon purple"><Library/></div><b>کتابخانه من</b><small>{local.length} آهنگ محلی</small></button>
            <button onClick={()=>setPage("کشف موسیقی")}><div className="quick-icon blue"><Compass/></div><b>کشف آنلاین</b><small>جست‌وجو در آرشیو</small></button>
            <button onClick={()=>setPage("پلی‌لیست‌ها")}><div className="quick-icon pink"><ListMusic/></div><b>پلی‌لیست‌ها</b><small>{playlists.length} مجموعه</small></button>
            <button onClick={()=>setPage("استودیو صدا")}><div className="quick-icon orange"><AudioLines/></div><b>استودیو صدا</b><small>تنظیم تجربه شنیداری</small></button>
          </div>
          <div className="section-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h2>تازه‌های کتابخانه</h2></div><button className="text-btn" onClick={()=>setPage("کتابخانه من")}>مشاهده همه <ExternalLink size={14}/></button></div>
          {local.length ? <TrackTable tracks={local.slice(0,6)} play={t=>play(t,local)} playing={playing} like={like} liked={liked} addQueue={addQueue} download={download} playlists={playlists} addToPlaylist={addToPlaylist}/> : <EmptyState onAdd={addFolder}/>}
          <div className="section-heading"><div><span className="eyebrow">DISCOVER SOMETHING NEW</span><h2>پیشنهاد برای تو</h2></div></div>
          <div className="album-grid">{demo.map((t,i)=><div className="album-card" key={t.id} onClick={()=>notify("برای پخش این نمونه، آن را از منبع آنلاین جست‌وجو کن.")}><div className="album-cover"><img src={t.cover}/><span className="cover-play"><Play fill="currentColor"/></span></div><b>{t.title}</b><small>{t.artist}</small></div>)}</div>
        </>}

        {page==="کشف موسیقی" && <><div className="search-hero"><div><span className="eyebrow">INTERNET ARCHIVE SEARCH</span><h2>آهنگ بعدی‌ات را پیدا کن.</h2><p>جست‌وجو در آرشیو موسیقی اینترنت؛ نتایج دارای فایل صوتی قابل دسترسی نمایش داده می‌شوند.</p></div><form onSubmit={searchOnline} className="big-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="مثلاً jazz, electronic, artist name..."/><button disabled={loading}>{loading?<LoaderCircle className="spin"/>:<Search/>}</button></form></div>{loading?<div className="loading"><LoaderCircle className="spin"/> در حال جست‌وجو...</div>:online.length?<TrackTable tracks={online} play={t=>play(t,online)} playing={playing} like={like} liked={liked} addQueue={addQueue} download={download} playlists={playlists} addToPlaylist={addToPlaylist}/>:<EmptyState search onSearch={searchOnline}/>}</>}

        {page==="کتابخانه من" && <><div className="toolbar"><span>{local.length} آهنگ در کتابخانه</span><button className="primary-btn small" onClick={addFolder}><Plus size={16}/> افزودن پوشه</button><button className="ghost-btn small" onClick={()=>fileRef.current?.click()}><FolderOpen size={16}/> انتخاب فایل</button></div>{local.length?<TrackTable tracks={local} play={t=>play(t,local)} playing={playing} like={like} liked={liked} addQueue={addQueue} download={download} playlists={playlists} addToPlaylist={addToPlaylist}/>:<EmptyState onAdd={addFolder}/>}</>}
        {page==="علاقه‌مندی‌ها" && (liked.length?<TrackTable tracks={liked} play={t=>play(t,liked)} playing={playing} like={like} liked={liked} addQueue={addQueue} download={download} playlists={playlists} addToPlaylist={addToPlaylist}/>:<EmptyState message="هنوز آهنگی به علاقه‌مندی‌ها اضافه نکرده‌ای."/>)}
        {page==="دانلودها" && (downloads.length?<TrackTable tracks={downloads} play={t=>play(t,downloads)} playing={playing} like={like} liked={liked} addQueue={addQueue} download={download} playlists={playlists} addToPlaylist={addToPlaylist}/>:<EmptyState message="دانلودهای تو اینجا نمایش داده می‌شوند."/>)}
        {page==="پلی‌لیست‌ها" && <><div className="toolbar"><span>{playlists.length} پلی‌لیست</span><button className="primary-btn small" onClick={addPlaylist}><Plus size={16}/> ساخت پلی‌لیست</button></div><div className="playlist-grid">{playlists.map((p,i)=><div className="playlist-card" key={p.name} onClick={()=>notify(`${p.name}: ${p.tracks.length} آهنگ`)}><div className={`playlist-art pa-${i%4}`}><ListMusic size={34}/></div><b>{p.name}</b><small>{p.tracks.length} آهنگ</small></div>)}</div></>}
        {page==="استودیو صدا" && <div className="studio"><div className="studio-head"><div><span className="eyebrow">AUDIO LAB</span><h2>تنظیم صدای دلخواهت</h2><p>اکولایزر نمایشی؛ تنظیمات در نسخه فعلی روی خروجی صوتی اعمال نشده‌اند.</p></div><AudioLines size={38}/></div><div className="eq-bars">{eq.map((v,i)=><div className="eq-col" key={i}><input type="range" min="-12" max="12" value={v} onChange={e=>setEq(old=>old.map((x,j)=>j===i?Number(e.target.value):x))}/><b>{v>0?"+":""}{v}</b><small>{["32","64","125","250","500","1k","2k","4k","8k","16k"][i]} Hz</small></div>)}</div><button className="ghost-btn" onClick={()=>setEq([0,0,0,0,0,0,0,0,0,0])}>بازنشانی اکولایزر</button></div>}
        {page==="تنظیمات" && <div className="studio"><h2>تنظیمات SHAKI MUSIC</h2><p>کتابخانه موسیقی روی دستگاه خودت نگهداری می‌شود. برای اسکن پوشه، از دکمه افزودن پوشه استفاده کن.</p><button className="primary-btn" onClick={addFolder}><FolderOpen size={17}/> انتخاب پوشه موسیقی</button><p className="muted">منبع جست‌وجوی آنلاین فعلی: Internet Archive. دسترسی به منابع ممکن است بسته به شبکه و منطقه متفاوت باشد.</p></div>}
      </div>
    </main>

    {showQueue && <aside className="queue-panel"><div className="queue-head"><b>صف پخش</b><button onClick={()=>setShowQueue(false)}><X/></button></div><p>{queue.length} آهنگ</p>{queue.map((t,i)=><div className="queue-item" key={t.id} onClick={()=>play(t,queue)}><img src={t.cover||cover(t.id,80)}/><span><b>{t.title}</b><small>{t.artist}</small></span><small>{i+1}</small></div>)}</aside>}

    <footer className="playerbar">
      <div className="now-playing">{current.cover?<img src={current.cover}/>:<div className="mini-cover"><Disc3/></div>}<div className="now-meta"><b>{current.title || "هنوز چیزی پخش نشده"}</b><small>{current.artist || "یک آهنگ انتخاب کن"}</small></div><button className={`like-btn ${liked.some(x=>x.id===current.id)?"liked":""}`} onClick={()=>playing&&like(playing)}><Heart size={17} fill={liked.some(x=>x.id===current.id)?"currentColor":"none"}/></button></div>
      <div className="player-controls"><div className="control-buttons"><button><Shuffle size={16}/></button><button onClick={prev}><SkipBack size={19} fill="currentColor"/></button><button className="play-main" onClick={togglePlay}>{isPlaying?<Pause fill="currentColor" size={19}/>:<Play fill="currentColor" size={19}/>}</button><button onClick={next}><SkipForward size={19} fill="currentColor"/></button><button><Repeat size={16}/></button></div><div className="timeline"><span>{fmt(progress)}</span><input type="range" min="0" max={duration||100} value={Math.min(progress,duration||100)} onChange={e=>{if(audio.current)audio.current.currentTime=Number(e.target.value);setProgress(Number(e.target.value));}}/><span>{fmt(duration)}</span></div></div>
      <div className="player-extra"><button onClick={()=>setShowQueue(v=>!v)}><ListMusic size={18}/></button><button onClick={()=>setMuted(v=>!v)}>{muted?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><input aria-label="volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>setVolume(Number(e.target.value))}/><span className="quality">HI-FI</span></div>
    </footer>
    <audio ref={audio} onLoadedMetadata={e=>setDuration(e.currentTarget.duration||0)} onEnded={next} onPlay={()=>setIsPlaying(true)} onPause={()=>setIsPlaying(false)}/>
    <input ref={fileRef} type="file" accept="audio/*" multiple hidden onChange={importFiles}/>
    {notice&&<div className="toast"><Check size={16}/>{notice}</div>}
  </div>;
}

function EmptyState({onAdd,search,message}) {
  return <div className="empty-state"><div className="empty-icon"><Music2 size={28}/></div><h3>{message|| (search?"برای شروع، یک نام آهنگ یا هنرمند جست‌وجو کن.":"کتابخانه‌ات هنوز خالی است.")}</h3><p>{search?"نتایج آنلاین از آرشیو عمومی موسیقی دریافت می‌شوند.":"یک پوشه موسیقی از کامپیوتر انتخاب کن تا آهنگ‌ها اضافه شوند."}</p>{onAdd&&<button className="primary-btn" onClick={onAdd}><FolderOpen size={17}/> انتخاب پوشه موسیقی</button>}</div>;
}

function TrackTable({tracks,play,playing,like,liked,addQueue,download,playlists,addToPlaylist}) {
  return <div className="track-table"><div className="track-head"><span>#</span><span>عنوان آهنگ</span><span>آلبوم / منبع</span><span>مدت</span><span>عملیات</span></div>{tracks.map((t,i)=><div className={`track-row ${playing?.id===t.id?"selected":""}`} key={t.id}><span className="track-index">{playing?.id===t.id?<AudioLines size={16}/>:String(i+1).padStart(2,"0")}</span><div className="track-title"><button className="row-play" onClick={()=>play(t)}><img src={t.cover||cover(t.id,90)}/><span><b>{t.title}</b><small>{t.artist}</small></span></button></div><span className="track-album">{t.album||t.source||"—"}</span><span className="track-duration">—</span><div className="track-actions"><button title="علاقه‌مندی" onClick={()=>like(t)} className={liked.some(x=>x.id===t.id)?"liked":""}><Heart size={15}/></button><button title="افزودن به صف" onClick={()=>addQueue(t)}><ListPlus size={16}/></button><select title="افزودن به پلی‌لیست" defaultValue="" onChange={e=>e.target.value&&addToPlaylist(t,e.target.value)}><option value="">+</option>{playlists.map(p=><option key={p.name}>{p.name}</option>)}</select>{t.canDownload&&<button title="دانلود" onClick={()=>download(t)}><Download size={15}/></button>}</div></div>)}</div>;
}

createRoot(document.getElementById("root")).render(<App/>);
