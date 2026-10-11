export default function Home(){
  return <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
    <section style={{maxWidth:720,width:"100%",border:"1px solid #2A3445",borderRadius:22,padding:28,background:"#111827"}}>
      <div style={{fontSize:12,color:"#60A5FA",fontWeight:800,letterSpacing:1.5}}>MOTA INFRASTRUCTURE</div>
      <h1 style={{margin:"10px 0 8px",fontSize:36}}>Calendar Core</h1>
      <p style={{margin:0,color:"#9FB0C3",lineHeight:1.6}}>Központi eseménytár a HAVI NAPTÁR, a Figyelő, a MOTA és későbbi alkalmazások számára.</p>
      <div style={{marginTop:24,padding:16,borderRadius:14,background:"#0B1220",border:"1px solid #233249"}}>
        <b>API állapot</b>
        <div style={{marginTop:6,color:"#22C55E"}}>/api/health</div>
      </div>
    </section>
  </main>
}
