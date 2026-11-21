import type {NextRequest} from 'next/server';
import {reviewDelete} from '@/modules/community/review-http';
export async function DELETE(request:NextRequest,{params}:{params:Promise<{id:string}>}){return reviewDelete(request,(await params).id);}
