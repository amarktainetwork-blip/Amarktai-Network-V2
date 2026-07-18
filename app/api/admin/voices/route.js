import { NextResponse } from 'next/server'
const API_BASE = process.env.API_URL ?? 'http://api:3001'
export async function GET(request){try{const response=await fetch(`${API_BASE}/api/admin/voices`,{headers:{Authorization:request.headers.get('authorization')??''},cache:'no-store'});return NextResponse.json(await response.json(),{status:response.status})}catch{return NextResponse.json({error:true,message:'Voice catalogue unavailable'},{status:502})}}
