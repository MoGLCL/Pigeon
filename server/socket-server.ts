import type{Server as HttpServer}from"node:http";import{Server}from"socket.io";
let io:Server|undefined;
export function createSocketServer(server:HttpServer){io=new Server(server,{path:"/socket.io",cors:{origin:process.env.AUTH_URL??"http://localhost:3000",credentials:true}});io.on("connection",socket=>{socket.on("join",(room:string)=>{if(/^(fb:page|wa:conv|broadcast):[a-zA-Z0-9-]+$/.test(room))socket.join(room)});socket.on("leave",(room:string)=>socket.leave(room));});return io;}
export function socketServer(){if(!io)throw new Error("Socket.IO is not initialized");return io;}
