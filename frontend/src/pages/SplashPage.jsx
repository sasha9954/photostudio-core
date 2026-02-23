import React from "react";
import { useNavigate } from "react-router-dom";
export default function SplashPage(){
  const nav = useNavigate();
  const [hasVideo,setHasVideo] = React.useState(true);
  React.useEffect(()=>{
    const t=setTimeout(()=>nav("/home",{replace:true}), hasVideo?5000:2000);
    return ()=>clearTimeout(t);
  },[nav,hasVideo]);
  return (
    <div className="splash">
      {hasVideo ? (
        <video className="splashVideo" autoPlay muted playsInline onError={()=>setHasVideo(false)}>
          <source src="/splash/splash.mp4" type="video/mp4" />
        </video>
      ) : (
        <div className="splashFallback"><div className="splashBrand">PhotoStudio</div><div className="muted">Загрузка…</div></div>
      )}
      <div className="splashOverlay"><div className="splashBrandSmall">PhotoStudio</div></div>
    </div>
  );
}
