
const express=require('express'),session=require('express-session'),multer=require('multer'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const app=express(),PORT=process.env.PORT||3000,ROOT=__dirname,STORE=process.env.STORAGE_ROOT||ROOT,DATA=path.join(STORE,'data'),UPLOAD=path.join(STORE,'public','uploads');
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(UPLOAD,{recursive:true});
const PF=path.join(DATA,'properties.json'),IF=path.join(DATA,'inquiries.json');
const read=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return []}},write=(f,v)=>fs.writeFileSync(f,JSON.stringify(v,null,2));
const types=['賃貸マンション','賃貸アパート','賃貸戸建','テラスハウス','貸店舗','貸事務所','貸倉庫','貸地'];
const statuses=['公開','非公開','募集終了'],money=v=>Number(v||0).toLocaleString('ja-JP'),origin=()=>String(process.env.SITE_URL||'http://localhost:'+PORT).replace(/\/$/,'');
const town=a=>String(a||'').normalize('NFKC').trim().replace(/(?:[0-9]+|[一二三四五六七八九十]+)丁目.*$/,'').replace(/[0-9]+.*$/,'').trim();
const url=(c,t)=>'/areas/'+encodeURIComponent(c)+'/'+encodeURIComponent(t);
const areas=()=>{const m=new Map();for(const p of read(PF)){if(p.status!=='公開'||!p.city)continue;const t=town(p.address);if(!t)continue;const k=JSON.stringify([p.city,t]);if(!m.has(k))m.set(k,{city:p.city,town:t,properties:[]});m.get(k).properties.push(p)}return [...m.values()]};
app.set('view engine','ejs');app.use(express.urlencoded({extended:true}));app.use(express.json());app.use(express.static(path.join(ROOT,'public')));app.use('/uploads',express.static(UPLOAD));
app.set('trust proxy', 1);
app.use(session({secret:process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex'),resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production'}}));
app.locals.money=money;app.locals.types=types;app.locals.statuses=statuses;app.locals.url=url;app.locals.origin=origin;
const auth=(req,res,next)=>req.session.admin?next():res.redirect('/admin/login');
const upload=multer({storage:multer.diskStorage({destination:(q,f,cb)=>cb(null,UPLOAD),filename:(q,f,cb)=>cb(null,crypto.randomUUID()+({ 'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[f.mimetype]||'.jpg'))}),limits:{fileSize:15*1024*1024},fileFilter:(q,f,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(f.mimetype))});
const remove=f=>{if(!f||path.basename(f)!==f)return;try{fs.unlinkSync(path.join(UPLOAD,f))}catch{}};
const fields=['propertyNo','title','category','type','price','managementFee','deposit','keyMoney','guarantee','renewalFee','contractTerm','availableDate','listingSource','prefecture','city','address','station','walkMinutes','layout','area','built','structure','floor','parking','transaction','description','highlights','status'];
const normalize=(b,old={})=>{const p={...old};for(const k of fields)p[k]=String(b[k]||'').trim();for(const k of ['price','managementFee','walkMinutes','area'])p[k]=b[k]===''?null:Number(b[k]||0);p.pets=!!b.pets;p.garden=!!b.garden;p.featured=!!b.featured;p.adPermission=!!b.adPermission;if(!statuses.includes(p.status))p.status='非公開';p.updatedAt=new Date().toISOString();return p};
const valid=p=>p.title&&p.city&&p.address&&types.includes(p.type)&&Number.isFinite(p.price)&&p.price>=0;
app.get('/robots.txt',(q,s)=>s.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: '+origin()+'/sitemap.xml\n'));
app.get('/sitemap.xml',(q,s)=>{const pages=['/','/properties','/areas','/owners',...areas().map(a=>url(a.city,a.town)),...read(PF).filter(p=>p.status==='公開').map(p=>'/property/'+encodeURIComponent(p.id))];s.type('application/xml').send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+pages.map(p=>'<url><loc>'+origin()+p.replace(/&/g,'&amp;')+'</loc></url>').join('')+'</urlset>')});
app.get('/',(q,s)=>s.render('home',{properties:read(PF).filter(p=>p.status==='公開').slice(0,6)}));
app.get('/properties',(q,s)=>{let ps=read(PF).filter(p=>p.status==='公開');for(const k of ['city','type','category'])if(q.query[k])ps=ps.filter(p=>p[k]===q.query[k]);if(q.query.q)ps=ps.filter(p=>[p.title,p.address,p.station].some(v=>String(v||'').includes(q.query.q)));if(q.query.maxPrice)ps=ps.filter(p=>p.price<=Number(q.query.maxPrice));s.render('properties',{properties:ps})});
app.get('/property/:id',(q,s)=>{const p=read(PF).find(p=>p.id===q.params.id&&p.status==='公開');return p?s.render('property',{p}):s.sendStatus(404)});
app.get('/areas',(q,s)=>s.render('areas',{areas:areas()}));
app.get('/areas/:city/:town',(q,s)=>{const area=areas().find(a=>a.city===q.params.city&&a.town===q.params.town);return area?s.render('town',{area}):s.sendStatus(404)});
app.get('/owners',(q,s)=>s.render('owners'));
app.post('/inquiry',(q,s)=>{const b=q.body;if(!b.name||(!b.email&&!b.phone))return s.status(400).send('名前と連絡先が必要です');const a=read(IF);a.unshift({id:crypto.randomUUID(),propertyId:b.propertyId||'',name:b.name,email:b.email||'',phone:b.phone||'',message:b.message||'',createdAt:new Date().toISOString()});write(IF,a);s.send('お問い合わせを受け付けました。')});
app.get('/admin/login',(q,s)=>s.render('login',{error:''}));
app.post('/admin/login',(q,s)=>{if(process.env.ADMIN_EMAIL&&process.env.ADMIN_PASSWORD&&q.body.email===process.env.ADMIN_EMAIL&&q.body.password===process.env.ADMIN_PASSWORD){q.session.admin=true;return s.redirect('/admin')}s.status(401).render('login',{error:'ログイン情報が違います'})});
app.post('/admin/logout',auth,(q,s)=>q.session.destroy(()=>s.redirect('/admin/login')));
app.get('/admin',auth,(q,s)=>{const all=read(PF);let ps=[...all];for(const k of ['status','type','city'])if(q.query[k])ps=ps.filter(p=>p[k]===q.query[k]);if(q.query.q)ps=ps.filter(p=>[p.title,p.propertyNo,p.address].some(v=>String(v||'').includes(q.query.q)));ps.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));const signatures=new Map();for(const p of all){const k=JSON.stringify([p.title,p.city,p.address,p.type,p.price]);signatures.set(k,(signatures.get(k)||0)+1)}const dup=new Set(all.filter(p=>signatures.get(JSON.stringify([p.title,p.city,p.address,p.type,p.price]))>1).map(p=>p.id));s.render('admin-list',{properties:ps,inquiries:read(IF).slice(0,10),dup})});
app.get('/admin/properties/new',auth,(q,s)=>s.render('admin-form',{p:null,action:'/admin/properties'}));
app.get('/admin/properties/:id/edit',auth,(q,s)=>{const p=read(PF).find(p=>p.id===q.params.id);return p?s.render('admin-form',{p,action:'/admin/properties/'+p.id}):s.sendStatus(404)});
const imageFields=upload.fields([{name:'photos',maxCount:30},{name:'floorplans',maxCount:10},{name:'panoramas',maxCount:10}]);
function save(q,s){const all=read(PF),idx=all.findIndex(p=>p.id===q.params.id),old=idx<0?{}:all[idx],p=normalize(q.body,old);if(!valid(p)){Object.values(q.files||{}).flat().forEach(f=>remove(f.filename));return s.status(400).send('物件名・種別・市区町村・町名番地・家賃を確認してください')}if(idx<0){p.id=crypto.randomUUID();p.createdAt=new Date().toISOString()}for(const k of ['photos','floorplans','panoramas'])p[k]=[...(old[k]||[]),...(q.files?.[k]||[]).map(f=>f.filename)];if(idx<0)all.unshift(p);else all[idx]=p;write(PF,all);s.redirect('/admin')}
app.post('/admin/properties',auth,imageFields,save);app.post('/admin/properties/:id',auth,imageFields,save);
app.post('/admin/properties/:id/status',auth,(q,s)=>{const a=read(PF),p=a.find(p=>p.id===q.params.id);if(p&&statuses.includes(q.body.status)){p.status=q.body.status;write(PF,a)}s.redirect('/admin')});
app.post('/admin/properties/:id/delete',auth,(q,s)=>{const a=read(PF),p=a.find(p=>p.id===q.params.id);if(p)for(const k of ['photos','floorplans','panoramas'])(p[k]||[]).forEach(remove);write(PF,a.filter(p=>p.id!==q.params.id));s.redirect('/admin')});
app.post('/admin/properties/:id/image-delete',auth,(q,s)=>{const a=read(PF),p=a.find(p=>p.id===q.params.id),k=q.body.type;if(p&&['photos','floorplans','panoramas'].includes(k)&&(p[k]||[]).includes(q.body.filename)){p[k]=p[k].filter(f=>f!==q.body.filename);remove(q.body.filename);write(PF,a)}s.redirect('/admin/properties/'+q.params.id+'/edit')});
app.post('/admin/properties/:id/photos-quick',auth,upload.array('photos',30),(q,s)=>{const a=read(PF),p=a.find(p=>p.id===q.params.id);if(!p){(q.files||[]).forEach(f=>remove(f.filename));return s.status(404).json({error:'物件なし'})}if((p.photos||[]).length+(q.files||[]).length>30){(q.files||[]).forEach(f=>remove(f.filename));return s.status(400).json({error:'30枚まで'})}p.photos=[...(p.photos||[]),...(q.files||[]).map(f=>f.filename)];write(PF,a);s.json({success:true,count:p.photos.length,firstPhoto:'/uploads/'+p.photos[0]})});
app.post('/admin/bulk-status',auth,(q,s)=>{let ids;try{ids=JSON.parse(q.body.selectedIds)}catch{return s.sendStatus(400)}if(!Array.isArray(ids)||!statuses.includes(q.body.status))return s.sendStatus(400);const a=read(PF);for(const p of a)if(ids.includes(p.id))p.status=q.body.status;write(PF,a);s.redirect('/admin')});
app.post('/admin/bulk-delete',auth,(q,s)=>{let ids;try{ids=JSON.parse(q.body.selectedIds)}catch{return s.sendStatus(400)}if(!Array.isArray(ids))return s.sendStatus(400);const a=read(PF);for(const p of a.filter(p=>ids.includes(p.id)))for(const k of ['photos','floorplans','panoramas'])(p[k]||[]).forEach(remove);write(PF,a.filter(p=>!ids.includes(p.id)));s.redirect('/admin')});

// 賃貸CSV一括登録（管理者限定・複数ファイル対応）
const rentalCsvUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:50},fileFilter:(req,file,cb)=>cb(null,/\.csv$/i.test(file.originalname||''))});
function parseRentalCsv(input){
  const text=input.replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c}
    else if(c==='"'){if(cell!=='')throw Error('引用符の位置が不正です');quoted=true}
    else if(c===','){row.push(cell);cell=''}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v.trim()))rows.push(row);row=[]}
    else cell+=c;
  }
  if(quoted)throw Error('CSVの引用符が閉じられていません');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  if(rows.length<2)throw Error('見出し行とデータ行が必要です');
  const headers=rows.shift().map(x=>x.trim());
  if(new Set(headers).size!==headers.length)throw Error('見出しが重複しています');
  return rows.map((cells,i)=>{if(cells.length!==headers.length)throw Error(`${i+2}行目: 列数が一致しません`);return Object.fromEntries(headers.map((h,j)=>[h,cells[j].trim()]))});
}
// REINS検索結果の列名を自動判定し、賃貸サイトの登録形式へ変換
function isReinsRentalRow(row){return Object.prototype.hasOwnProperty.call(row,'物件種目') && Object.prototype.hasOwnProperty.call(row,'賃料') && Object.prototype.hasOwnProperty.call(row,'所在地')}
function reinsRentalRow(row){
 const raw=String(row['所在地']||'').normalize('NFKC').replace(/\s/g,'');
 const m=raw.match(/^(東京都|千葉県|埼玉県|神奈川県)(.+?[市区町村])(.+)$/);
 if(!m)throw Error('所在地から都道府県・市区町村・町名を抽出できません');
 const t=String(row['物件種目']||'').normalize('NFKC');
 const type=/貸家|戸建|一戸建/.test(t)?'賃貸戸建':/マンション/.test(t)?'賃貸マンション':/アパート/.test(t)?'賃貸アパート':/店舗/.test(t)?'貸店舗':/事務所/.test(t)?'貸事務所':/倉庫/.test(t)?'貸倉庫':/貸地|土地/.test(t)?'貸地':/テラス/.test(t)?'テラスハウス':null;
 if(!type)throw Error('未対応の物件種目: '+t);
 const yen=v=>{const x=String(v||'').normalize('NFKC').replace(/,/g,'').trim();if(!x||x==='-'||x==='なし')return 0;const m=x.match(/^([0-9]+(?:\.[0-9]+)?)(万円|万|円)?$/);if(!m)throw Error('金額を解釈できません: '+x);return Math.round(Number(m[1])*(m[2]==='万円'||m[2]==='万'?10000:1))};
 const fee=yen(row['管理費'])+yen(row['共益費']);
 const price=yen(row['賃料']);if(price<=0)throw Error('賃料が不正です');
 const size=String(row['建物面積']||row['土地面積']||'').normalize('NFKC').match(/[0-9]+(?:\.[0-9]+)?/);
 const key=crypto.createHash('sha256').update(JSON.stringify([raw,t,String(row['建物面積']||''),String(row['間取']||''),String(row['築年月']||''),String(row['商号']||'')])).digest('hex').slice(0,20);
 const slash=v=>String(v||'').split(/[／/]/).map(x=>x.trim());
 const deposit=slash(row['敷金／保証金']),keymoney=slash(row['礼金／権利金']);
  // REINSの交通欄は徒歩分数だけの場合があるため、駅名と混同しない
  const traffic=String(row['交通']||'').normalize('NFKC').trim();
  const walkMatch=traffic.match(/徒歩\s*(\d+)\s*分/);
  const stationCandidate=traffic.replace(/徒歩\s*\d+\s*分/g,'').replace(/^(?:JR|私鉄)?[^\s]*?線[\s　]*/,'').replace(/^[\s　・、,:：／/()（）-]+|[\s　・、,:：／/()（）-]+$/g,'').trim();
  const stationName=stationCandidate && /[一-龥ぁ-んァ-ヶA-Za-z]/.test(stationCandidate) && !/^(?:バス|車|徒歩|約\d+)$/.test(stationCandidate) ? stationCandidate : '';
 const category=/貸店舗|貸事務所|貸倉庫|貸地/.test(type)?'事業用':'居住用';
 return {propertyNo:'REINS-'+key,title:m[2]+m[3]+' '+t,category,type,price:String(price),managementFee:String(fee),prefecture:m[1],city:m[2],address:m[3],layout:String(row['間取']||'').normalize('NFKC'),area:size?size[0]:'',built:String(row['築年月']||''),floor:String(row['所在階']||''),station:stationName,walkMinutes:walkMatch?walkMatch[1]:'',transaction:String(row['取引態様']||''),deposit:deposit[0]||'',guarantee:deposit[1]||'',keyMoney:keymoney[0]||'',listingSource:'REINS / '+String(row['商号']||''),description:'REINS取込物件。募集条件・広告掲載許可・物件情報は公開前に確認してください。',adPermission:'0'};
}
const rentalCsvColumns=[['propertyNo','物件番号'],['title','物件名'],['category','用途'],['type','物件種別'],['price','家賃'],['managementFee','管理費'],['deposit','敷金'],['keyMoney','礼金'],['guarantee','保証金'],['renewalFee','更新料'],['contractTerm','契約期間'],['availableDate','入居可能日'],['listingSource','募集区分'],['prefecture','都道府県'],['city','市区町村'],['address','町名番地'],['station','最寄駅'],['walkMinutes','徒歩分数'],['layout','間取り'],['area','面積'],['built','築年月'],['structure','構造'],['floor','所在階'],['parking','駐車場'],['transaction','取引態様'],['description','物件説明'],['highlights','おすすめポイント'],['pets','ペット可'],['garden','庭付き'],['featured','おすすめ'],['adPermission','広告掲載許諾確認済み']];
const csvBoolean=v=>['1','true','yes','はい','有','あり','○','〇'].includes(String(v||'').trim().toLowerCase());
app.get('/admin/csv-template',auth,(req,res)=>{
 const header=rentalCsvColumns.map(x=>x[1]);
 const example=['JBP-R-0001','市川市八幡 賃貸マンション','居住用','賃貸マンション','85000','5000','1ヶ月','1ヶ月','','','2年','相談','一般募集','千葉県','市川市','八幡2丁目','本八幡駅','8','2LDK','55.5','2020年','RC','3階','なし','仲介','サンプル物件（公開不可）','','0','0','0','0'];
 const escape=v=>'"'+String(v).replace(/"/g,'""')+'"';
 res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition','attachment; filename="jbp-rental-template.csv"');res.send('\uFEFF'+header.map(escape).join(',')+'\r\n'+example.map(escape).join(',')+'\r\n');
});
app.get('/admin/import-csv',auth,(req,res)=>res.render('admin-csv',{result:null,error:null}));
app.post('/admin/import-csv',auth,(req,res,next)=>rentalCsvUpload.array('csv',50)(req,res,e=>e?res.status(400).render('admin-csv',{result:null,error:e.message}):next()),(req,res)=>{
 if(!req.files?.length)return res.status(400).render('admin-csv',{result:null,error:'CSVファイルを選択してください'});
 const all=read(PF),results=[],errors=[];let changed=false;
 const aliases=Object.fromEntries(rentalCsvColumns.flatMap(([key,jp])=>[[jp,key],[key,key]]));
 for(const file of req.files){let created=0,updated=0,failed=0;
  try{
   let decoded=new TextDecoder('utf-8',{fatal:true}).decode(file.buffer);
   const rows=parseRentalCsv(decoded);
   for(let n=0;n<rows.length;n++){
    let b;const row=rows[n];try{b=isReinsRentalRow(row)?reinsRentalRow(row):{};if(!isReinsRentalRow(row))for(const [h,v] of Object.entries(row))if(aliases[h])b[aliases[h]]=v;}catch(e){errors.push(`${file.originalname} ${n+2}行目: ${e.message}`);failed++;continue;}
    const id=String(b.propertyNo||'').trim();
    if(!id){errors.push(`${file.originalname} ${n+2}行目: 物件番号が必要です`);failed++;continue}
    if(!b.title||!b.city||!b.address||!types.includes(b.type)||!['居住用','事業用'].includes(b.category)||!/^\d+(?:\.\d+)?$/.test(b.price||'')){
      errors.push(`${file.originalname} ${n+2}行目: 必須項目または家賃・用途・種別が不正です`);failed++;continue;
    }
    if(b.adPermission!==undefined&&b.adPermission&&!csvBoolean(b.adPermission))b.adPermission='';
    const idx=all.findIndex(p=>String(p.propertyNo||'')===id);
    const old=idx>=0?all[idx]:{};
     // 駅名がCSVにない場合、手入力済みの駅名は保持し、誤って駅名扱いした徒歩分数は除外
     if(isReinsRentalRow(row)){
       if(!b.station){
         const previous=String(old.station||'').trim();
         b.station=previous && !/^(?:徒歩\s*)?\d+\s*分$/.test(previous) ? previous : '';
       }
       if(!b.walkMinutes && old.walkMinutes!=null)b.walkMinutes=old.walkMinutes;
     }
    const merged={...old,...b,propertyNo:id,status:idx>=0?old.status:'非公開'};
    for(const k of ['pets','garden','featured','adPermission'])merged[k]=b[k]!==undefined?csvBoolean(b[k]):!!old[k];
    const p=normalize(merged,old);p.status=idx>=0?old.status:'非公開';p.id=old.id||crypto.randomUUID();p.createdAt=old.createdAt||new Date().toISOString();
    for(const k of ['photos','floorplans','panoramas'])p[k]=old[k]||[];
    if(!valid(p)){errors.push(`${file.originalname} ${n+2}行目: 物件情報が不正です`);failed++;continue}
    if(idx>=0){all[idx]=p;updated++}else{all.unshift(p);created++}changed=true;
   }
  }catch(e){errors.push(`${file.originalname}: ${e.message}`);failed++}
  results.push({filename:file.originalname,created,updated,failed});
 }
 if(changed)write(PF,all);
 res.render('admin-csv',{result:{files:results,errors},error:null});
});


// 周辺施設検索: 全国Q地図で住所を検証し、Geoapifyで半径1kmの施設を検索
function nearbyDistance(lat1,lon1,lat2,lon2){
 const r=Math.PI/180;
 const a=Math.sin((lat2-lat1)*r/2)**2+Math.cos(lat1*r)*Math.cos(lat2*r)*Math.sin((lon2-lon1)*r/2)**2;
 return Math.round(6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
// 住所表記の違いだけを吸収する。丁目・番・号の数字は削除しない。
function nearbyAddressNormalize(v){
 const kanji={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
 return String(v||'').normalize('NFKC')
  .replace(/[\s　]/g,'')
  .replace(/[‐‑‒–—―－ー−]/g,'-')
  .replace(/([一二三四五六七八九十]+)(?=丁目)/g,x=>{
    if(kanji[x])return String(kanji[x]);
    const m=x.match(/^十([一二三四五六七八九])$/);
    return m?String(10+kanji[m[1]]):x;
  })
  .replace(/([0-9]+)丁目/g,'$1-')
  .replace(/([0-9]+)番地?(?:の)?/g,'$1-')
  .replace(/([0-9]+)号/g,'$1')
  .replace(/-+/g,'-')
  .replace(/-$/,'');
}
async function nearbyFetch(url){
 const response=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'JBPRentalNearby/1.0'},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('外部API応答エラー: '+response.status);
 return response.json();
}
app.post('/admin/nearby-facilities',auth,async(req,res)=>{
 const pref=String(req.body.prefecture||'').trim(),city=String(req.body.city||'').trim(),addr=String(req.body.address||'').trim();
 if(!pref||!city||!addr||[pref,city,addr].join('').length>250)return res.status(400).json({error:'都道府県・市区町村・町名番地を入力してください。'});
 if(!process.env.GEOAPIFY_API_KEY)return res.status(503).json({error:'RenderのEnvironmentにGEOAPIFY_API_KEYを設定してください。'});
 try{
  const full=pref+city+addr;
  const geocode=await nearbyFetch('https://api.qchizu.jp/geocode.php?'+new URLSearchParams({address:full}));
  const norm=nearbyAddressNormalize;
  const expected=norm(full),expectedCity=norm(city),expectedPref=norm(pref);
  const candidates=Array.isArray(geocode.results)?geocode.results:[];
  const validCity=v=>norm(v.pref)===expectedPref && norm(String(v.city||'')+String(v.ward||''))===expectedCity;
  const sameAddress=v=>norm(v.output)===expected;
  const exact=candidates.filter(item=>validCity(item.result||{})&&sameAddress(item.result||{}));
  const result=exact.find(item=>{
   const v=item.result||{};
   return v.coordinate_level==='residential_detail' &&
    Number.isFinite(Number(v.lat)) && Number.isFinite(Number(v.lon));
  });
  if(!result){
   const error=exact.length
    ? '住所の表記は一致しましたが、全国Q地図で番地の正確な座標を確認できませんでした。施設検索は実行していません。'
    : candidates.some(item=>validCity(item.result||{}))
      ? '市区町村は一致しましたが、番地まで同じ住所を確認できませんでした。町名の代表地点では検索しません。'
      : '全国Q地図で該当する都道府県・市区町村の住所を確認できませんでした。';
   return res.status(422).json({error});
  }
  const lat=Number(result.result.lat),lon=Number(result.result.lon);
  const mapUrl=String(result.links?.qchizu_map||'');
  const attribution=String(geocode.attribution||'');
  if(!attribution||!/^https:\/\/(?:[a-z0-9-]+\.)?qchizu\.jp\//i.test(mapUrl))
   return res.status(502).json({error:'全国Q地図の出典情報を取得できませんでした。'});
  const places=await nearbyFetch('https://api.geoapify.com/v2/places?'+new URLSearchParams({
   categories:'commercial.supermarket,healthcare.hospital,healthcare.clinic_or_praxis,education.school,leisure.park',
   filter:`circle:${lon},${lat},1000`,bias:`proximity:${lon},${lat}`,limit:'500',apiKey:process.env.GEOAPIFY_API_KEY
  }));
  const found=[],seen=new Set();
  for(const item of places.features||[]){
   const p=item.properties||{},name=String(p.name||'').trim(),cats=p.categories||[],coordinates=item.geometry?.coordinates||[];
   if(!name||!Array.isArray(cats)||!Array.isArray(coordinates))continue;
   let category='';
   if(cats.includes('commercial.supermarket'))category='スーパー';
   else if(cats.some(c=>c==='healthcare.hospital'||c==='healthcare.clinic_or_praxis'))category='病院・クリニック';
   else if(cats.includes('education.school')){
    const detail=[name,p.datasource?.raw?.school,p.datasource?.raw?.['isced:level']].filter(Boolean).join(' ');
    category=/中学校|中等部/.test(detail)?'中学校':/小学校|初等部/.test(detail)?'小学校':'学校';
   }else if(cats.includes('leisure.park'))category='公園';
   if(!category)continue;
   const placeLat=Number(coordinates[1]),placeLon=Number(coordinates[0]);
   if(!Number.isFinite(placeLat)||!Number.isFinite(placeLon))continue;
   const meters=nearbyDistance(lat,lon,placeLat,placeLon);
   if(meters>1000)continue;
   const key=category+'|'+name+'|'+Math.round(meters/30);
   if(seen.has(key))continue;seen.add(key);
   found.push({name:name.replace(/[|\r\n]/g,' '),category,distance:'約'+meters+'m',meters});
  }
  found.sort((a,b)=>a.meters-b.meters||a.name.localeCompare(b.name,'ja'));
  res.json({facilities:found.map(({meters,...rest})=>rest),qchizuAttribution:attribution,qchizuMapUrl:mapUrl,note:'距離は物件所在地からの直線距離です。学校は通学区域を示しません。'});
 }catch(e){console.error('Nearby search:',e);res.status(502).json({error:'周辺施設検索に失敗しました。API設定や住所を確認してください。'});}
});
// 周辺施設は既存物件へ保存。既存の物件写真・CSV登録情報は変更しない。
app.post('/admin/properties/:id/facilities',auth,(req,res)=>{
 const all=read(PF),p=all.find(v=>v.id===req.params.id);
 if(!p)return res.sendStatus(404);
 const facilities=req.body.facilities;
 if(!Array.isArray(facilities)||facilities.length>500)return res.status(400).json({error:'施設データが不正です。'});
 const cleaned=facilities.map(f=>({
  name:String(f.name||'').trim().slice(0,160),
  category:String(f.category||'周辺施設').trim().slice(0,80),
  distance:String(f.distance||'').trim().slice(0,40)
 })).filter(f=>f.name);
 const mapUrl=String(req.body.qchizuMapUrl||'');
 if(!/^https:\/\/(?:[a-z0-9-]+\.)?qchizu\.jp\//i.test(mapUrl))return res.status(400).json({error:'地図出典URLが不正です。'});
 p.facilities=cleaned;p.qchizuMapUrl=mapUrl;p.qchizuAttribution=String(req.body.qchizuAttribution||'').slice(0,300);
 p.updatedAt=new Date().toISOString();write(PF,all);
 res.json({success:true,count:cleaned.length});
});

app.get('/admin/inquiries',auth,(q,s)=>s.render('inquiries',{inquiries:read(IF)}));
app.use((err,q,s,next)=>{console.error(err);s.status(400).send('処理に失敗しました: '+err.message)});
app.listen(PORT,()=>console.log('JBP RENTAL listening '+PORT));
