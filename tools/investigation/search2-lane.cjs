// Electron Utility / Worker 双入口，只使用调查私有消息。
const {parentPort:workerPort}=require('node:worker_threads');
const port=workerPort||process.parentPort, send=m=>port.postMessage(m);
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const {AsyncLocalStorage}=require('node:async_hooks');
const path=require('node:path'), fs=require('node:fs');
let service,wid,avatar,avatarInfo,scalar,scalarInfo,equipment,work,context=new AsyncLocalStorage(),queue=[];
const eventLoop=monitorEventLoopDelay({resolution:10});eventLoop.enable();
const role=process.argv.at(-1), root=path.join(__dirname,'artifacts/search-round2');
async function initialize(){
 work=(await import('./search2-lane-work.mjs')).work;
 if(role==='browser'){
  const {RawDataService}=require('./artifacts/search/production.cjs');service=new RawDataService();
  for(const name of ['parserQueue','metadataQueue']){const q=service[name],original=q.run.bind(q);q.run=(signal,action)=>{const submitted=performance.now(),label=context.getStore();return original(signal,async()=>{const entered=performance.now();try{return await action();}finally{if(label)queue.push({...label,lane:name,queueMs:entered-submitted,executionMs:performance.now()-entered});}});};}
  const {dataRoot}=await import('./common.mjs'),signal=new AbortController().signal;
  wid=(await service.execute({kind:'open',root:dataRoot},signal)).workspaceId;
  avatar={workspaceId:wid,relativePath:'ExcelOutput/AvatarConfig.json'};scalar={workspaceId:wid,relativePath:'TextMap/TextMapCHS.json'};equipment={workspaceId:wid,relativePath:'ExcelOutput/EquipmentConfig.json'};
  avatarInfo=await service.execute({kind:'info',source:avatar},signal);scalarInfo=await service.execute({kind:'info',source:scalar},signal);
  for(const [source,info]of[[avatar,avatarInfo],[scalar,scalarInfo]])await service.execute({kind:'read',address:{source,pointer:''},expectedRevision:info.revision},signal);
 }
 send({type:'ready',role,pid:process.pid,runtime:process.versions});
}
async function handle(m){
 try{
  if(m.type==='search'){send({type:'started',id:m.id});const result=await work(m.kind);send({type:'result',id:m.id,result});}
  else if(m.type==='worker-probe'){
   const {Worker}=require('node:worker_threads');const w=new Worker(__filename,{argv:['search']});
   w.on('message',r=>{if(r.type==='ready')w.postMessage({type:'search',id:m.id,kind:'probe'});else if(r.type==='started')send(r);else if(r.type==='result'){w.postMessage({type:'close',id:'worker-close'});send(r);}});await new Promise((resolve,reject)=>{w.on('error',reject);w.on('exit',code=>code===0?resolve():reject(Error('WORKER_EXIT_'+code)));});send({type:'worker-closed',id:m.id});
  }else if(m.type==='browser'){
   const observations=[],signal=new AbortController().signal,start=performance.now();
   const segment=JSON.parse(fs.readFileSync(path.join(__dirname,'artifacts/search/runtime.json'))).segmentFixture.pointer;
   const actions=[['listDirectory',()=>service.execute({kind:'directory',workspaceId:wid,directory:'ExcelOutput',cursor:null,limit:100},signal)],['getSourceInfo',()=>service.execute({kind:'info',source:avatar},signal)],['readNode',()=>service.execute({kind:'read',address:{source:avatar,pointer:'/0/AvatarID'},expectedRevision:avatarInfo.revision},signal)],['listNodeChildren',()=>service.execute({kind:'children',address:{source:avatar,pointer:'/0'},expectedRevision:avatarInfo.revision,cursor:null,limit:100},signal)],['readScalarSegment',()=>service.execute({kind:'segment',address:{source:scalar,pointer:segment},expectedRevision:scalarInfo.revision,cursor:null,limit:4096},signal)],['sourceActivation',async()=>{const info=await service.execute({kind:'info',source:equipment},signal);return service.execute({kind:'read',address:{source:equipment,pointer:''},expectedRevision:info.revision},signal);}]];
   await Promise.all(actions.map(async([operation,action])=>{const begin=performance.now();try{const r=await context.run({id:m.id,operation},action);observations.push({operation,wallMs:performance.now()-begin,ok:true,bytes:Buffer.byteLength(JSON.stringify(r))});}catch(e){observations.push({operation,wallMs:performance.now()-begin,ok:false,error:e.code||e.message});}}));
   send({type:'result',id:m.id,result:{observations,queue:queue.filter(q=>q.id===m.id),utilityWallMs:performance.now()-start,eventLoop:{maxMs:eventLoop.max/1e6,p99Ms:eventLoop.percentile(99)/1e6}}});eventLoop.reset();
  }else if(m.type==='cancel-probe'){send({type:'result',id:m.id,result:{acknowledged:true,taskCancelled:false,reason:'fixed sync JS/native call is non-interruptible; acknowledgement is not cancellation completion'}});}
  else if(m.type==='close'){service?.dispose();eventLoop.disable();send({type:'closed',id:m.id});process.exit(0);}
 }catch(e){send({type:'failed',id:m.id,error:e.stack});process.exitCode=1;}
}
port.on('message',m=>handle(workerPort?m:m.data));initialize().catch(e=>{send({type:'failed',error:e.stack});process.exit(1);});
