import type {NextRequest} from 'next/server';
import {reactionPut} from '@/modules/community/review-http';
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){return reactionPut(request,(await params).id);}
