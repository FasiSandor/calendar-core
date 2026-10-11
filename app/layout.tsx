export const metadata={title:"Calendar Core",description:"Központi naptárszolgáltatás HAVI, Figyelő, MOTA és további appok számára."};

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="hu"><body style={{margin:0,fontFamily:"system-ui, sans-serif",background:"#0B0F14",color:"#E5EEF8"}}>{children}</body></html>
}
