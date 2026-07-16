import{socketServer}from"@/server/socket-server";
export function emitRealtime(room:string,event:string,payload:unknown){try{socketServer().to(room).emit(event,payload)}catch{/* Socket.IO is hosted only by the custom server runtime. */}}
