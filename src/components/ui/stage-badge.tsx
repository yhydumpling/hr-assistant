"use client";



export function StageBadge({ stage }: { stage: string }) { return <span className={`stage-badge ${stage === "已淘汰" ? "muted" : ["Offer", "待入职", "已入职"].includes(stage) ? "green" : "purple"}`}>{stage}</span>; }
