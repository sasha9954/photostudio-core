import React from "react";
import { authMe } from "../services/authApi.js";

const AuthCtx = React.createContext(null);

export function AuthProvider({ children }){
  const [user, setUser] = React.useState(null);
  const [credits, setCredits] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(async ()=>{
    const res = await authMe();
    if(res?.ok){
      setUser(res.user);
      setCredits(res.user?.credits ?? 0);
    }else{
      setUser(null);
      setCredits(0);
    }
    setLoading(false);
    return res;
  },[]);

  React.useEffect(()=>{ refresh(); },[refresh]);

  const value = React.useMemo(()=>({ user, credits, loading, refresh, setUser, setCredits }),[user, credits, loading, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(){
  const v = React.useContext(AuthCtx);
  if(!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}
