/** Idempotent synthetic demo, refused outside this task's local disposable DB. */
import {Pool} from 'pg';import {hashPassword} from '../src/modules/auth/password';
const target=process.env.REVIEWS_TEST_DATABASE_URL;if(!target)throw Error('Set explicit REVIEWS_TEST_DATABASE_URL');const url=new URL(target);
if(url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||url.port!=='55545'||url.username!=='review01_qa'||url.pathname!=='/review01_review'||url.search||url.hash)throw Error('REFUSED non-demo database');
async function main(){
const pool=new Pool({connectionString:target});const password='ReviewDemo2026!';const hash=await hashPassword(password);
try{
 const people=[['reader@reviews.example.invalid','Гость чайной','USER'],['forest@reviews.example.invalid','Лесной читатель','USER'],['moderator@reviews.example.invalid','Хранитель библиотеки','ADMIN']] as const;
 const ids:number[]=[];for(const [email,name,role]of people){await pool.query('INSERT INTO users(email,display_name,password_hash,role,email_verified_at) VALUES($1,$2,$3,$4,now()) ON CONFLICT(email) DO NOTHING',[email,name,hash,role]);ids.push((await pool.query('SELECT id FROM users WHERE email=$1',[email])).rows[0].id);}
 await pool.query("INSERT INTO categories(slug,name) VALUES('reviews-demo','Чайная территория') ON CONFLICT(slug) DO NOTHING");const category=(await pool.query("SELECT id FROM categories WHERE slug='reviews-demo'")).rows[0].id;
 await pool.query("INSERT INTO comics(slug,title,category_id,description,cover_url,banner_url,work_type,series_status) VALUES('nightshift-reviews-demo','Летопись Белого Дракона',$1,'История о маленькой чайной у края леса, неожиданных встречах и книгах, которые находят своего читателя. Синтетические данные для локальной проверки отзывов.','/demo/covers/tea.svg','/images/fantasy-editorial/catalog/catalog-library-background.webp','COMIC','ONGOING') ON CONFLICT(slug) DO NOTHING",[category]);
 const book=(await pool.query("SELECT id FROM comics WHERE slug='nightshift-reviews-demo'")).rows[0].id;
 for(const [code,title,status,volume]of [['1','У порога чайной','RELEASED',1],['2','Старая библиотека','RELEASED',1],['3','Тропа через лес','RELEASED',1],['4','Следующая встреча','SCHEDULED',2]] as const){if(!(await pool.query('SELECT id FROM chapters WHERE comic_id=$1 AND display_code=$2',[book,code])).rowCount)await pool.query('INSERT INTO chapters(comic_id,display_code,title,sort_order,status,volume_number) VALUES($1,$2,$3,$4,$5,$6)',[book,code,title,Number(code),status,volume]);}
 await pool.query("INSERT INTO user_comics(user_id,comic_id,in_library,personal_note) VALUES($1,$2,true,'Личная заметка. Она не публикуется вместе с отзывами.') ON CONFLICT(user_id,comic_id) DO NOTHING",[ids[0],book]);
 for(const [i,scores,body]of [[1,[5,5,4,5,4],'Уютная, атмосферная история. Особенно понравились персонажи и детали рисунка.'],[2,[4,4,5,4,5],'К этой истории приятно возвращаться. Жду продолжения!']] as const)await pool.query('INSERT INTO community_reviews(comic_id,user_id,rating_plot,rating_characters,rating_art,rating_depth,rating_world,body) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[book,ids[i],...scores,body]);
 const chapter=(await pool.query("SELECT id FROM chapters WHERE comic_id=$1 AND display_code='1'",[book])).rows[0].id;
 await pool.query("INSERT INTO community_reviews(comic_id,chapter_id,user_id,rating,body,spoiler) VALUES($1,$2,$3,5,'Сильное начало. Любопытно, куда ведёт эта тропа.',true) ON CONFLICT DO NOTHING",[book,chapter,ids[1]]);
 console.log(JSON.stringify({url:'http://127.0.0.1:3111/comics/nightshift-reviews-demo',reader:people[0][0],moderator:people[2][0],syntheticPassword:password,note:'LOCAL SYNTHETIC DATA ONLY; rerun never resets existing reviews/passwords'},null,2));
}finally{await pool.end();}

}
void main().catch(()=>{console.error("LOCAL_DEMO_FAILED; CHECK_SYNTHETIC_DATABASE");process.exitCode=1;});
