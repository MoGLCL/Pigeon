"use client";import{motion,useReducedMotion}from"motion/react";
export function PageMotion({children,className}:{children:React.ReactNode;className?:string}){const reduce=useReducedMotion();return <motion.div className={className} initial={reduce?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:reduce?0:.24,ease:[.22,1,.36,1]}}>{children}</motion.div>}
