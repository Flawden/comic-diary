import type {NextRequest} from 'next/server';
import {moderationPut} from '@/modules/community/review-http';
export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){return moderationPut(request,(await params).id);}
