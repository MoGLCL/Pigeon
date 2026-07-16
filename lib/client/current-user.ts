"use client";
export type CurrentUser={id:string;name?:string;username:string;email:string;role:"owner"|"admin"|"moderator"|"user";status:string;forcePasswordReset:boolean};
let cached:CurrentUser|undefined;let pending:Promise<CurrentUser|null>|undefined;
export function currentUser(){if(cached)return Promise.resolve(cached);if(!pending)pending=fetch("/api/me").then(async r=>r.ok?await r.json() as CurrentUser:null).then(user=>{if(user)cached=user;return user}).finally(()=>{pending=undefined});return pending}
export function refreshCurrentUser(){cached=undefined;return currentUser()}
export function peekCurrentUser(){return cached}
