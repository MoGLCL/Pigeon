import{decrypt,encrypt}from"@/lib/encryption";import{prisma}from"@/lib/prisma";

const KEY="facebook_oauth_candidates";const TTL=15*60*1000;
export type FacebookCandidate={pageId:string;name:string;avatarUrl?:string;accessToken:string;tokenExpiresAt?:string;grantedPermissions:string[]};
type Pending={expiresAt:number;pages:FacebookCandidate[]};

export async function saveFacebookCandidates(userId:string,pages:FacebookCandidate[]){const value=encrypt(JSON.stringify({expiresAt:Date.now()+TTL,pages} satisfies Pending));await prisma.userSetting.upsert({where:{userId_key:{userId,key:KEY}},update:{value},create:{userId,key:KEY,value}})}
export async function getFacebookCandidates(userId:string){const row=await prisma.userSetting.findUnique({where:{userId_key:{userId,key:KEY}}});if(!row)return[];try{const pending=JSON.parse(decrypt(row.value))as Pending;if(pending.expiresAt<Date.now()){await clearFacebookCandidates(userId);return[]}return pending.pages}catch{await clearFacebookCandidates(userId);return[]}}
export async function clearFacebookCandidates(userId:string){await prisma.userSetting.deleteMany({where:{userId,key:KEY}})}
