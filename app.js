/* Korea airways: static Cesium viewer. No Ion access token or terrain service required. */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const C = window.Cesium;
const COLORS = { A: '#71caff', D: '#f3b65f' };
const state = { dataset: null, viewer: null, routes: new Map(), records: [], enabled: new Set(), selected: null, query: '', exaggeration: 5, opacity: .26, classA: true, classD: true, conventional: true, rnav: true, top: false };
Object.assign(state,{airportDataset:null,airports:new Map(),airportRecords:[],airportLabels:[],enabledAirports:new Set(),selectedAirport:null,selectedAirportFeature:null,airportQuery:'',airportMaster:true,airwayMaster:false,airportClassB:true,airportClassC:true,airportClassD:true,tab:'airports'});
Object.assign(state,{airportGroups:new Map(),airportMergedFeatures:new Map(),airportMergedRecords:[],selectedAirportGroup:null});
let toastTimer;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = (n) => Number(n).toLocaleString('en-US');
const alt = (feet, ref) => ref === 'FL' ? `FL ${Number(feet) / 100}` : `${fmt(feet)} ft ${ref === 'MSL' ? 'AMSL' : (ref || 'AMSL')}`;
const isRnav = (s) => s.family === 'rnav' || s.source?.document === 'ENR 3.2';
function sourcePdfHref(sourceOrDocument, page) {
 const source=typeof sourceOrDocument==='string'?{document:sourceOrDocument}:sourceOrDocument||{};
 const documentKey=String(source.document||'').toUpperCase().replace(/\s+/g,'');
 const filenames={'ENR2.1':'enr21.pdf','ENR2.2':'enr22.pdf','ENR3.1':'enr31.pdf','ENR3.2':'enr32.pdf','ENR5.1':'enr51.pdf','ENR5.2':'enr52.pdf','ENR5.3':'enr53.pdf','ENR5.5':'enr55.pdf','ENROUTECHART(MAIN)':'enroute-main-2026-07-23.pdf'};
 const filename=filenames[documentKey];if(!filename)return null;
 const pdfPage=Number(page??source.pdfPage);return `sources/${filename}${Number.isInteger(pdfPage)&&pdfPage>0?'#page='+pdfPage:''}`;
}
function hasScreenshotBoundary(feature) {return feature?.boundarySource?.type==='user-screenshot';}
function hasUnclippedCircle(feature) {return feature?.boundarySource?.type==='user-requested-unclipped-circle';}
function hasYangyangPriority(feature) {return feature?.boundarySource?.type==='user-requested-yangyang-priority';}

// User-defined visualization model; independent of AIP-published corridor widths.
function navigationHalfWidthNm(specification) {
 const normalized=String(specification ?? '').toUpperCase().replace(/[\s_-]+/g,'');
 return normalized==='RNAV2'?2:normalized==='RNAV5'?5:null;
}
function navigationModelMatches(segment) {
 if(segment.widthSource!=='user-specified-model')return true;
 const halfWidth=navigationHalfWidthNm(segment.navigationSpecification);
 return halfWidth!==null && Number(segment.widthNm)===halfWidth*2 && Number(segment.halfWidthNm)===halfWidth;
}

const AIRPORT_COLORS={B:'#b49aff',C:'#69ddb0',D:'#f19ac7'};
function normalizeAirportFeature(feature) {
 const cl=String(feature.class||'').toUpperCase().replace(/^CLASS\s*/,''), lowerRef=String(feature.lowerRef||'').toUpperCase(),upperRef=String(feature.upperRef||'').toUpperCase();
 const numeric=feature.lowerFt!==null&&feature.lowerFt!==undefined&&feature.upperFt!==null&&feature.upperFt!==undefined&&Number.isFinite(Number(feature.lowerFt))&&Number.isFinite(Number(feature.upperFt));
 const canRender=Boolean(AIRPORT_COLORS[cl]&&numeric&&Number(feature.upperFt)>Number(feature.lowerFt)&&['Polygon','MultiPolygon'].includes(feature.geometry?.type)&&feature.status!=='unavailable');
 return {...feature,id:String(feature.id),airportId:String(feature.airportId||feature.airport||''),class:cl,lowerFt:numeric?Number(feature.lowerFt):feature.lowerFt,upperFt:numeric?Number(feature.upperFt):feature.upperFt,lowerRef,upperRef,canRender};
}
function normalizedRing(ring) {
 if(!Array.isArray(ring))throw new Error('공항 공역 경계 좌표가 없습니다.');const result=[];
 for(const p of ring){if(!Array.isArray(p)||!Number.isFinite(Number(p[0]))||!Number.isFinite(Number(p[1]))||Math.abs(Number(p[0]))>180||Math.abs(Number(p[1]))>90)throw new Error('공항 공역 경위도 좌표가 올바르지 않습니다.');const xy=[Number(p[0]),Number(p[1])];const previous=result.at(-1);if(!previous||previous[0]!==xy[0]||previous[1]!==xy[1])result.push(xy);}
 if(result.length>1&&result[0][0]===result.at(-1)[0]&&result[0][1]===result.at(-1)[1])result.pop();if(result.length<3)throw new Error('공항 공역 경계는 서로 다른 좌표 3개 이상이 필요합니다.');return result;
}
function airportPolygonHierarchies(geometry) {
 const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:null;if(!polygons?.length)throw new Error('지원하지 않는 공항 공역 경계입니다.');
 return polygons.map(rings=>{if(!rings?.length)throw new Error('공항 공역 외곽 경계가 없습니다.');const ringHierarchy=ring=>new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(normalizedRing(ring).flat()));return new C.PolygonHierarchy(ringHierarchy(rings[0]).positions,rings.slice(1).map(ringHierarchy));});
}
function airportCoordinates(feature) {const polygons=feature.geometry?.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry?.type==='MultiPolygon'?feature.geometry.coordinates:[];return polygons.flatMap(p=>p[0]||[]);}
function airportMatches(airport) {const q=state.airportQuery;return !q||`${airport.name} ${airport.nameKo||''} ${airport.id} ${airport.classes.join(' ')}`.toLowerCase().includes(q);}
function airportClassEnabled(cl) {return Boolean(state[`airportClass${cl}`]);}
function visibleAirportFeature(feature) {const airport=state.airports.get(feature.airportId);return state.airportMaster&&state.enabledAirports.has(feature.airportId)&&airportClassEnabled(feature.class)&&airport&&airportMatches(airport);}
function airportGroupActive(group) {
 return Boolean(group&&group.memberAirportIds.length>1&&state.airportMaster&&airportClassEnabled(group.class)&&group.memberAirportIds.every(id=>{const airport=state.airports.get(id);return airport&&state.enabledAirports.has(id)&&airportMatches(airport)&&airport.features.some(f=>f.canRender&&f.class===group.class);}));
}
function activeAirportGroupForFeature(feature) {return [...state.airportGroups.values()].find(group=>group.class===feature.class&&group.memberAirportIds.includes(feature.airportId)&&airportGroupActive(group))||null;}
function visibleAirportSourceFeature(feature) {return visibleAirportFeature(feature)&&!activeAirportGroupForFeature(feature);}
function mergedInspectionAirport(group) {return {id:group.id,name:group.name||group.nameKo,nameKo:group.nameKo||group.name,classes:[group.class],features:group.features,source:group.features[0]?.source||{},status:'merged-group',notes:group.notes||'인천·김포의 연결된 Class B 공역을 고도층별로 합쳐 표시합니다.'};}
function selectAirportMergedFeature(id,fly=false) {const item=state.airportMergedFeatures.get(id);if(item)selectAirport(item.group.id,item.feature.id,fly);}
function prepareAirports(dataset) {
 state.airportDataset=dataset;dataset.features=(dataset.features||[]).map(normalizeAirportFeature);
 for(const item of dataset.airports||[]){const id=String(item.id||item.airportId);const features=dataset.features.filter(f=>f.airportId===id);const classes=[...new Set([...(Array.isArray(item.classes)?item.classes:[]),item.class,...features.map(f=>f.class)].filter(cl=>AIRPORT_COLORS[cl]))];const airport={...item,id,features,classes,name:item.name||features[0]?.airportName||id,nameKo:item.nameKo||features[0]?.airportNameKo||'',source:item.source||features[0]?.source||item.issues?.find(issue=>issue.source)?.source||dataset.issues?.find(issue=>issue.airportId===id&&issue.source)?.source||{},status:item.status||(features.some(f=>f.canRender)?'available':'unavailable')};state.airports.set(id,airport);if(features.some(f=>f.canRender))state.enabledAirports.add(id);}
 for(const feature of dataset.features){if(!state.airports.has(feature.airportId)){const airport={id:feature.airportId,name:feature.airportName||feature.airportId,nameKo:feature.airportNameKo||'',classes:[feature.class],features:dataset.features.filter(f=>f.airportId===feature.airportId),source:feature.source||{},status:feature.canRender?'available':'unavailable'};state.airports.set(airport.id,airport);if(feature.canRender)state.enabledAirports.add(airport.id);}}
 state.airportGroups.clear();state.airportMergedFeatures.clear();
 for(const original of dataset.renderGroups||[]){const group={...original,id:String(original.id),class:String(original.class||'').toUpperCase(),memberAirportIds:[...new Set(original.memberAirportIds||[])].map(String),features:(original.features||[]).map(normalizeAirportFeature).filter(f=>f.canRender)};if(!group.features.length||!group.memberAirportIds.every(id=>state.airports.has(id)))continue;state.airportGroups.set(group.id,group);for(const feature of group.features)state.airportMergedFeatures.set(feature.id,{group,feature});}
}
function buildAirportGeometry() {
 const viewer=state.viewer;viewer.entities.suspendEvents();
 for(const f of state.airportDataset.features){if(!f.canRender)continue;const color=C.Color.fromCssColorString(AIRPORT_COLORS[f.class]);for(const hierarchy of airportPolygonHierarchies(f.geometry)){const entity=viewer.entities.add({name:`${f.airportNameKo||f.airportName} · Class ${f.class} · ${f.name||f.id}`,polygon:{hierarchy,height:f.upperFt*.3048*state.exaggeration,extrudedHeight:f.lowerFt*.3048*state.exaggeration,material:color.withAlpha(state.opacity),outline:true,outlineColor:color.withAlpha(.75),outlineWidth:1,closeTop:true,closeBottom:true,arcType:C.ArcType.GEODESIC}});entity._airportFeatureId=f.id;state.airportRecords.push({feature:f,entity,color});}}
 for(const group of state.airportGroups.values())for(const f of group.features){const color=C.Color.fromCssColorString(AIRPORT_COLORS[f.class]);for(const hierarchy of airportPolygonHierarchies(f.geometry)){const entity=viewer.entities.add({name:`${group.nameKo||group.name} · Class ${f.class} · ${f.name||f.id}`,polygon:{hierarchy,height:f.upperFt*.3048*state.exaggeration,extrudedHeight:f.lowerFt*.3048*state.exaggeration,material:color.withAlpha(state.opacity),outline:true,outlineColor:color.withAlpha(.75),outlineWidth:1,closeTop:true,closeBottom:true,arcType:C.ArcType.GEODESIC}});entity._airportMergedFeatureId=f.id;state.airportMergedRecords.push({group,feature:f,entity,color});}}
 for(const airport of state.airports.values()){const features=airport.features.filter(f=>f.canRender);if(!features.length)continue;const coords=features.flatMap(airportCoordinates);if(!coords.length)continue;const knownCenter=Number.isFinite(airport.center?.lon)&&Number.isFinite(airport.center?.lat);const lon=knownCenter?airport.center.lon:coords.reduce((s,p)=>s+p[0],0)/coords.length,lat=knownCenter?airport.center.lat:coords.reduce((s,p)=>s+p[1],0)/coords.length;const upper=Math.max(...features.map(f=>f.upperFt));const entity=viewer.entities.add({position:C.Cartesian3.fromDegrees(lon,lat,upper*.3048*state.exaggeration+250),label:{text:airport.nameKo||airport.name,font:'12px sans-serif',fillColor:C.Color.fromCssColorString('#ecf4fa'),outlineColor:C.Color.fromCssColorString('#101928'),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-10),distanceDisplayCondition:new C.DistanceDisplayCondition(0,900000),disableDepthTestDistance:Number.POSITIVE_INFINITY}});entity._airportFeatureId=features[0].id;state.airportLabels.push({airport,entity,lon,lat,upper});}
 viewer.entities.resumeEvents();applyAirportVisibility();
}
function applyAirportVisibility() {
 for(const r of state.airportRecords)r.entity.show=visibleAirportSourceFeature(r.feature);for(const r of state.airportMergedRecords)r.entity.show=airportGroupActive(r.group);if(state.selectedAirportGroup&&!airportGroupActive(state.selectedAirportGroup)){state.selectedAirport=null;state.selectedAirportFeature=null;state.selectedAirportGroup=null;$('airportDetailPanel').hidden=true;updateAirportSelection();}for(const label of state.airportLabels)label.entity.show=label.airport.features.some(f=>f.canRender&&visibleAirportFeature(f));
 const count=[...state.airports.values()].filter(a=>a.features.some(f=>f.canRender&&visibleAirportFeature(f))).length;$('visibleAirportCount').textContent=`${count} / ${state.airports.size} 공항 표시`;renderAirports();state.viewer?.scene.requestRender();
}
function updateAirportHeights() {for(const r of [...state.airportRecords,...state.airportMergedRecords]){r.entity.polygon.height=r.feature.upperFt*.3048*state.exaggeration;r.entity.polygon.extrudedHeight=r.feature.lowerFt*.3048*state.exaggeration;}for(const label of state.airportLabels)label.entity.position=C.Cartesian3.fromDegrees(label.lon,label.lat,label.upper*.3048*state.exaggeration+250);}
function updateAirportSelection() {for(const r of [...state.airportRecords,...state.airportMergedRecords]){const selected=state.selectedAirportFeature?.id===r.feature.id||Boolean(r.group&&!state.selectedAirportGroup&&state.selectedAirport&&r.group.memberAirportIds.includes(state.selectedAirport.id)&&state.selectedAirportFeature&&r.feature.lowerFt===state.selectedAirportFeature.lowerFt&&r.feature.lowerRef===state.selectedAirportFeature.lowerRef&&r.feature.upperFt===state.selectedAirportFeature.upperFt);r.entity.polygon.material=r.color.withAlpha(selected?Math.max(state.opacity,.48):state.opacity);r.entity.polygon.outlineColor=r.color.withAlpha(selected?1:.75);}}
function airportPositions(airport) {return airport.features.filter(f=>f.canRender).flatMap(f=>{const coords=airportCoordinates(f);const every=Math.max(1,Math.ceil(coords.length/60));return coords.filter((p,i)=>i%every===0).map(p=>C.Cartesian3.fromDegrees(p[0],p[1],(f.lowerFt+f.upperFt)*.1524*state.exaggeration));});}
function flyAirport(airport) {const positions=airportPositions(airport);if(!positions.length){toast('이 공항은 추가 자료가 필요합니다. 원문 출처를 확인해 주세요.');return;}const sphere=C.BoundingSphere.fromPoints(positions);state.viewer.camera.flyToBoundingSphere(sphere,{duration:1.1,offset:new C.HeadingPitchRange(C.Math.toRadians(-18),C.Math.toRadians(state.top?-90:-38),Math.max(sphere.radius*3.5,40000))});}
function renderAirports() {
 const list=$('airportList');list.replaceChildren();let count=0;const sorted=[...state.airports.values()].sort((a,b)=>(a.nameKo||a.name).localeCompare(b.nameKo||b.name,'ko'));
 for(const airport of sorted){if(!airportMatches(airport))continue;count++;const available=airport.features.some(f=>f.canRender);const row=document.createElement('div');row.className='route-row airport-row'+(state.selectedAirport?.id===airport.id||state.selectedAirportGroup?.memberAirportIds.includes(airport.id)?' selected':'');const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.enabledAirports.has(airport.id);checkbox.disabled=!available;checkbox.setAttribute('aria-label',`${airport.nameKo||airport.name} 공역 표시`);checkbox.addEventListener('change',()=>{checkbox.checked?state.enabledAirports.add(airport.id):state.enabledAirports.delete(airport.id);applyAirportVisibility();});
 const names=document.createElement('span');names.className='airport-name-group';const ko=document.createElement('strong');ko.textContent=airport.nameKo||airport.name;const english=document.createElement('small');english.textContent=airport.name;names.append(ko,english);const cl=document.createElement('span');cl.className=`airport-class-badge ${airport.classes[0]?.toLowerCase()||''}`;cl.textContent=airport.classes.join('/')||'—';label.append(checkbox,names,cl);row.append(label);
 const joined=[...state.airportGroups.values()].some(group=>group.memberAirportIds.includes(airport.id)&&airportGroupActive(group));
 if(joined){const status=document.createElement('span');status.className='airport-status';status.textContent='합침';row.append(status);}
 if(!joined&&(!available||airport.status==='partial'||airport.status==='display-model'||airport.features.some(hasUnclippedCircle)||airport.features.some(hasYangyangPriority))){const status=document.createElement('span');status.className='airport-status'+(available?' partial':'');status.textContent=available?(airport.features.some(hasYangyangPriority)?'양양 우선':airport.features.some(hasUnclippedCircle)?'원형':airport.features.some(hasScreenshotBoundary)?'근사':'일부'):'자료 필요';row.append(status);}const fly=document.createElement('button');fly.className='route-fly';fly.textContent=available?'↗':'ⓘ';fly.title=`${airport.nameKo||airport.name} 공역 정보`;fly.setAttribute('aria-label',fly.title);fly.addEventListener('click',()=>{if(available){state.enabledAirports.add(airport.id);state.airportMaster=true;$('airportMaster').checked=true;updateMapLegend();}selectAirport(airport.id,null,available);renderAirports();applyAirportVisibility();$('sidebar').classList.remove('open');});row.append(fly);list.append(row);}
 if(!count)list.innerHTML='<div class="empty-state">일치하는 공항이 없습니다.</div>';$('airportCount').textContent=String(count).padStart(2,'0');
}
function textNote(value) {
 if(typeof value==='string')return value.trim();
 if(Array.isArray(value))return value.map(textNote).filter(Boolean).join('\n');
 if(!value||typeof value!=='object')return '';
 for(const key of ['messageKo','message','reason','description','note','notes']){const note=textNote(value[key]);if(note)return note;}
 return '';
}
function selectAirport(id,featureId,fly) {
 const group=state.airportGroups.get(id);const airport=group?mergedInspectionAirport(group):state.airports.get(id);if(!airport)return;clearSpecialSelection();state.selectedAirportGroup=group||null;state.selected=null;state.selectedAirport=airport;const f=airport.features.find(f=>f.id===featureId&&f.canRender)||airport.features.find(f=>f.canRender)||null;state.selectedAirportFeature=f;$('detailPanel').hidden=true;$('profilePanel').hidden=true;$('airportDetailPanel').hidden=false;updateSelection();updateAirportSelection();
 $('airportDetailName').textContent=airport.nameKo||airport.name;$('airportDetailEnglish').textContent=airport.name;$('airportDetailType').textContent=`AIRPORT · CLASS ${f?.class||airport.classes.join('/')} · ${group?'연결 공역 합침':hasYangyangPriority(f)?'중첩부 양양 배정':hasUnclippedCircle(f)?'전체 원형 표시':hasScreenshotBoundary(f)?'스크린샷 근사':airport.status==='partial'?'부분 자료':f?'공항 공역':'추가 자료 필요'}`;
 const select=$('airportFeatureSelect');select.replaceChildren();for(const feature of airport.features.filter(f=>f.canRender)){const option=document.createElement('option');option.value=feature.id;option.textContent=feature.name||`${alt(feature.lowerFt,feature.lowerRef)} ~ ${alt(feature.upperFt,feature.upperRef)}`;select.append(option);}select.disabled=!f;if(f)select.value=f.id;else{const option=document.createElement('option');option.textContent='확인된 공역 도형 없음';select.append(option);}
 $('airportBandDetails').innerHTML=f?`<div class="band-row airport-band ${esc(f.class.toLowerCase())}"><b>CLASS ${esc(f.class)}</b><span>${esc(alt(f.lowerFt,f.lowerRef))}<br>~ ${esc(alt(f.upperFt,f.upperRef))}</span></div>`:'';
 $('airportDatumNote').textContent=f&&['GND','SFC','AGL'].some(ref=>[f.lowerRef,f.upperRef].includes(ref))?'AGL·GND·SFC는 지형 미반영 명목높이입니다. 실제 MSL 변환값이 아닙니다.':f?'원문 고도 기준을 유지하며 높이 배율은 표시 크기만 변경합니다.':'';
 const notes=[group&&'인천·김포의 연결된 Class B를 하한 고도별로 합쳐 표시합니다. 개별 공항을 선택 해제하면 남은 공항의 범위만 표시합니다.',hasYangyangPriority(f)&&'양양 전체 원은 유지하고, 속초에서 양양과 겹치는 부분만 제외합니다. 중심·반경·고도는 ENR 2.1 기준의 표시 모델입니다.',hasUnclippedCircle(f)&&'사용자 요청에 따라 반경 5 NM 전체 원형 표시. 반경·고도: ENR 2.1. 공시 제외구역을 적용한 경계와 구분되는 표시 모델입니다.',hasScreenshotBoundary(f)&&'수평 경계: 스크린샷 근사 · 반경/고도: ENR 2.1',textNote(airport.notes),f&&textNote(f.notes),f?.rawLimits&&`원문 범위: ${textNote(f.rawLimits)}`].filter(Boolean);$('airportDetailNotes').textContent=[...new Set(notes)].join('\n');const source=f?.source||airport.source||{};$('airportDetailDate').textContent=[source.publicationDate||source.pageDate,source.effectiveDate||source.effective].filter(Boolean).join(' · 발효: ');$('airportDetailPage').textContent=source.printedPage||source.document||'출처 확인 필요';const sourceHref=sourcePdfHref(source);$('airportDetailSource').hidden=!sourceHref;if(sourceHref)$('airportDetailSource').href=sourceHref;
 renderAirports();renderRoutes();if(fly)flyAirport(airport);
}
function selectAirportFeature(id) {if(state.airportMergedFeatures.has(id)){selectAirportMergedFeature(id);return;}const feature=state.airportDataset.features.find(f=>f.id===id);if(feature)selectAirport(feature.airportId,id,false);}
function switchDirectory(tab) {state.tab=tab;for(const [key,panel,button] of [['special','specialControls','specialTab'],['airports','airportControls','airportTab'],['airways','airwayControls','airwayTab']]){const active=tab===key;$(panel).hidden=!active;$(button).classList.toggle('active',active);$(button).setAttribute('aria-selected',String(active));}}
function bindAirportControls() {
 $('airportTab').addEventListener('click',()=>switchDirectory('airports'));$('airwayTab').addEventListener('click',()=>switchDirectory('airways'));
 $('airportMaster').addEventListener('change',()=>{state.airportMaster=$('airportMaster').checked;applyAirportVisibility();updateMapLegend();});$('airwayMaster').addEventListener('change',()=>{state.airwayMaster=$('airwayMaster').checked;applyVisibility();updateMapLegend();});
 for(const id of ['airportClassB','airportClassC','airportClassD'])$(id).addEventListener('change',()=>{state[id]=$(id).checked;applyAirportVisibility();});
 $('airportSearch').addEventListener('input',e=>{state.airportQuery=e.target.value.trim().toLowerCase();renderAirports();applyAirportVisibility();});$('airportsAllOn').addEventListener('click',()=>{for(const airport of state.airports.values())if(airportMatches(airport)&&airport.features.some(f=>f.canRender))state.enabledAirports.add(airport.id);renderAirports();applyAirportVisibility();});$('airportsAllOff').addEventListener('click',()=>{for(const airport of state.airports.values())if(airportMatches(airport))state.enabledAirports.delete(airport.id);renderAirports();applyAirportVisibility();});
 $('airportFeatureSelect').addEventListener('change',e=>selectAirportFeature(e.target.value));$('closeAirportDetail').addEventListener('click',()=>{$('airportDetailPanel').hidden=true;state.selectedAirport=null;state.selectedAirportFeature=null;state.selectedAirportGroup=null;updateAirportSelection();renderAirports();});
 const list=$('airportIssues');list.replaceChildren();const issues=[...(state.airportDataset.issues||[])];for(const airport of state.airports.values())if((airport.status==='partial'||airport.status==='unavailable'||airport.status==='display-model')&&!issues.some(issue=>issue&&typeof issue==='object'&&issue.airportId===airport.id&&textNote(issue)))issues.push(`${airport.nameKo||airport.name}: ${textNote(airport.notes)||'추가 경계·고도 자료 필요'}`);const unique=[...new Set(issues.map(textNote).filter(Boolean))];for(const issue of unique){const item=document.createElement('li');item.textContent=issue;list.append(item);}if(!unique.length){const item=document.createElement('li');item.textContent='추가 확인이 필요한 항목은 각 공항의 원문 출처와 비고를 참고해 주세요.';list.append(item);}
}

const SPECIAL_TYPES={
 PROHIBITED:{label:'비행금지',code:'P',color:'#ef7b85'},
 RESTRICTED:{label:'비행제한',code:'R',color:'#e9aa65'},
 DANGER:{label:'위험',code:'D',color:'#e8d07c'},
 MOA:{label:'군훈련·작전',code:'MOA',color:'#ba9bf6'},
 ALERT:{label:'경계',code:'ALERT',color:'#e7a0c7'},
 CATA:{label:'민간훈련',code:'CATA',color:'#71dbe3'},
 LASER:{label:'레이저 위험',code:'LASER',color:'#a4de7b'},
 ADIZ:{label:'방공식별',code:'ADIZ',color:'#9caadf'},
 UA:{label:'초경량',code:'UA',color:'#a6b3bf'}
};
Object.assign(state,{specialDataset:null,specialAreas:new Map(),specialRecords:[],specialPlanRecords:[],specialLabels:[],enabledSpecial:new Set(),specialMaster:true,specialQuery:'',specialCategories:Object.fromEntries(Object.keys(SPECIAL_TYPES).map(k=>[k,k!=='ADIZ'])),specialPlan:false,unlimitedCapFt:60000,selectedSpecial:null,selectedSpecialFeature:null,tab:'special'});
state.airportMaster=false;
function specialCategory(value) {const key=String(value||'').toUpperCase().replace(/\s+AREA$/,'');return ({'PROHIBITED AREA':'PROHIBITED','RESTRICTED AREA':'RESTRICTED','DANGER AREA':'DANGER','ACMI':'MOA','AIR_REFUELING':'MOA','HTA':'MOA'})[key]||key;}
function normalizeSpecialFeature(feature) {
 const category=specialCategory(feature.category),lowerRef=String(feature.lowerRef||'').toUpperCase(),upperRef=String(feature.upperRef||'').toUpperCase();
 const lowerKnown=feature.lowerFt!==null&&feature.lowerFt!==undefined&&Number.isFinite(Number(feature.lowerFt));
 const unlimited=upperRef==='UNL';const upperKnown=feature.upperFt!==null&&feature.upperFt!==undefined&&Number.isFinite(Number(feature.upperFt));
 const canRender=Boolean(SPECIAL_TYPES[category]&&lowerKnown&&(unlimited||(upperKnown&&Number(feature.upperFt)>Number(feature.lowerFt)))&&['Polygon','MultiPolygon'].includes(feature.geometry?.type)&&feature.status!=='unavailable');
 return {...feature,id:String(feature.id),areaId:String(feature.areaId||''),category,lowerRef,upperRef,lowerFt:lowerKnown?Number(feature.lowerFt):feature.lowerFt,upperFt:upperKnown?Number(feature.upperFt):null,isUnlimited:unlimited,canRender};
}
function specialDisplayUpperFt(feature,cap=state.unlimitedCapFt) {return feature.isUnlimited||feature.upperRef==='UNL'?Number(cap):Number(feature.upperFt);}
function specialAltitude(feet,ref) {if(ref==='UNL')return 'UNL · 상한 없음';if((ref==='GND'||ref==='SFC')&&Number(feet)===0)return ref;return alt(feet,ref);}
function specialMatches(area) {const q=state.specialQuery;return !q||`${area.code||''} ${area.name||''} ${area.nameKo||''} ${area.subcategory||''} ${SPECIAL_TYPES[area.category]?.label||''}`.toLowerCase().includes(q);}
function specialAreaEnabled(area) {return Boolean(area&&state.specialMaster&&state.enabledSpecial.has(area.id)&&state.specialCategories[area.category]&&specialMatches(area));}
function visibleSpecialFeature(feature) {const area=state.specialAreas.get(feature.areaId);return specialAreaEnabled(area)&&feature.canRender&&specialDisplayUpperFt(feature)>feature.lowerFt;}
function specialCoordinates(feature) {return airportCoordinates(feature);}
function areaPoint(area) {
 const raw=area.center||area.point||area.location;if(Array.isArray(raw)&&raw.length>=2&&raw.every(Number.isFinite))return raw.slice(0,2);
 if(raw?.type==='Point'&&Array.isArray(raw.coordinates))return raw.coordinates.slice(0,2);
 if(Number.isFinite(raw?.lon)&&Number.isFinite(raw?.lat))return [raw.lon,raw.lat];
 if(Number.isFinite(raw?.lng)&&Number.isFinite(raw?.lat))return [raw.lng,raw.lat];
 if(area.planGeometry?.type==='Point')return area.planGeometry.coordinates.slice(0,2);
 return null;
}
function hasSpecialPlan(area) {return Boolean(areaPoint(area)||['Polygon','MultiPolygon'].includes(area.planGeometry?.type));}
function specialPositions(area) {
 const positions=[];for(const f of area.features.filter(f=>f.canRender)){const coords=specialCoordinates(f),every=Math.max(1,Math.ceil(coords.length/80));for(let i=0;i<coords.length;i+=every)positions.push(C.Cartesian3.fromDegrees(coords[i][0],coords[i][1],(f.lowerFt+specialDisplayUpperFt(f))*.1524*state.exaggeration));}
 if(!positions.length){const point=areaPoint(area);if(point)positions.push(C.Cartesian3.fromDegrees(point[0],point[1],0));else if(['Polygon','MultiPolygon'].includes(area.planGeometry?.type)){const coords=specialCoordinates({geometry:area.planGeometry});for(let i=0;i<coords.length;i+=Math.max(1,Math.ceil(coords.length/60)))positions.push(C.Cartesian3.fromDegrees(coords[i][0],coords[i][1],0));}}
 return positions;
}
function prepareSpecialAreas(dataset) {
 state.specialDataset=dataset;dataset.features=(dataset.features||[]).map(normalizeSpecialFeature);state.specialAreas.clear();state.enabledSpecial.clear();
 for(const item of dataset.areas||[]){const id=String(item.id||item.areaId);const features=dataset.features.filter(f=>f.areaId===id);const category=specialCategory(item.category||features[0]?.category);if(!SPECIAL_TYPES[category])continue;const area={...item,id,category,features,code:item.code||features[0]?.code||item.name||id,name:item.name||features[0]?.name||id,source:item.source||features[0]?.source||{},status:item.status||(features.some(f=>f.canRender)?'available':'unavailable')};state.specialAreas.set(id,area);if(features.some(f=>f.canRender)||hasSpecialPlan(area))state.enabledSpecial.add(id);}
 for(const f of dataset.features){if(!SPECIAL_TYPES[f.category]||state.specialAreas.has(f.areaId))continue;const features=dataset.features.filter(x=>x.areaId===f.areaId);const area={id:f.areaId,code:f.code||f.name,name:f.name||f.code||f.areaId,category:f.category,features,source:f.source||{},status:features.some(x=>x.canRender)?'available':'unavailable'};state.specialAreas.set(area.id,area);if(features.some(x=>x.canRender))state.enabledSpecial.add(area.id);}
}
function buildSpecialGeometry() {
 const viewer=state.viewer;viewer.entities.suspendEvents();
 for(const f of state.specialDataset.features){if(!f.canRender)continue;const color=C.Color.fromCssColorString(SPECIAL_TYPES[f.category].color);for(const hierarchy of airportPolygonHierarchies(f.geometry)){const entity=viewer.entities.add({name:`${f.code||f.name} · ${SPECIAL_TYPES[f.category].label}`,polygon:{hierarchy,height:specialDisplayUpperFt(f)*.3048*state.exaggeration,extrudedHeight:f.lowerFt*.3048*state.exaggeration,material:color.withAlpha(state.opacity),outline:true,outlineColor:color.withAlpha(.8),outlineWidth:1,closeTop:true,closeBottom:true,arcType:C.ArcType.GEODESIC}});entity._specialFeatureId=f.id;state.specialRecords.push({feature:f,entity,color});}}
 for(const area of state.specialAreas.values()){
  const features=area.features.filter(f=>f.canRender);const color=C.Color.fromCssColorString(SPECIAL_TYPES[area.category].color);
  if(features.length){const coords=features.flatMap(specialCoordinates);if(!coords.length)continue;const point=areaPoint(area)||[coords.reduce((sum,p)=>sum+p[0],0)/coords.length,coords.reduce((sum,p)=>sum+p[1],0)/coords.length];const entity=viewer.entities.add({position:C.Cartesian3.fromDegrees(point[0],point[1],Math.max(...features.map(f=>specialDisplayUpperFt(f)))*.3048*state.exaggeration+300),label:{text:area.code,font:'11px sans-serif',fillColor:color,outlineColor:C.Color.fromCssColorString('#07111e'),outlineWidth:3,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-10),distanceDisplayCondition:new C.DistanceDisplayCondition(0,300000),disableDepthTestDistance:Number.POSITIVE_INFINITY}});entity._specialAreaId=area.id;state.specialLabels.push({area,entity,point});}
  else{const point=areaPoint(area);if(['Polygon','MultiPolygon'].includes(area.planGeometry?.type)){for(const hierarchy of airportPolygonHierarchies(area.planGeometry)){const entity=viewer.entities.add({name:`${area.code} · 평면 범위`,polygon:{hierarchy,height:0,material:color.withAlpha(.07),outline:true,outlineColor:color.withAlpha(.75)}});entity._specialAreaId=area.id;state.specialPlanRecords.push({area,entity});}}if(point){const entity=viewer.entities.add({position:C.Cartesian3.fromDegrees(point[0],point[1],0),point:{pixelSize:7,color,outlineColor:C.Color.fromCssColorString('#102031'),outlineWidth:2},label:{text:`${area.code} · 위치`,font:'10px sans-serif',fillColor:color,outlineColor:C.Color.fromCssColorString('#07111e'),outlineWidth:2,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,-13),distanceDisplayCondition:new C.DistanceDisplayCondition(0,400000)}});entity._specialAreaId=area.id;state.specialPlanRecords.push({area,entity});}}
 }
 viewer.entities.resumeEvents();applySpecialVisibility();
}
function applySpecialVisibility() {
 for(const record of state.specialRecords)record.entity.show=visibleSpecialFeature(record.feature);
 for(const record of state.specialLabels)record.entity.show=record.area.features.some(f=>visibleSpecialFeature(f));
 for(const record of state.specialPlanRecords)record.entity.show=Boolean(state.specialPlan&&specialAreaEnabled(record.area));
 const visible=[...state.specialAreas.values()].filter(a=>a.features.some(visibleSpecialFeature)).length;$('visibleSpecialCount').textContent=`${visible} / ${state.specialAreas.size} 구역 입체`;
 state.viewer?.scene.requestRender();
}
function updateSpecialHeights() {
 for(const r of state.specialRecords){r.entity.polygon.height=specialDisplayUpperFt(r.feature)*.3048*state.exaggeration;r.entity.polygon.extrudedHeight=r.feature.lowerFt*.3048*state.exaggeration;}
 for(const r of state.specialLabels)r.entity.position=C.Cartesian3.fromDegrees(r.point[0],r.point[1],Math.max(...r.area.features.filter(f=>f.canRender).map(f=>specialDisplayUpperFt(f)))*.3048*state.exaggeration+300);
 applySpecialVisibility();if(state.selectedSpecial)selectSpecialArea(state.selectedSpecial.id,state.selectedSpecialFeature?.id,false);
}
function updateSpecialSelection() {for(const r of state.specialRecords){const selected=state.selectedSpecialFeature?.id===r.feature.id;r.entity.polygon.material=r.color.withAlpha(selected?Math.max(state.opacity,.48):state.opacity);r.entity.polygon.outlineColor=r.color.withAlpha(selected?1:.8);}}
function flySpecialArea(area) {const positions=specialPositions(area);if(!positions.length){toast('이 구역은 확인된 위치·경계 자료가 없습니다. 원문을 확인해 주세요.');return;}const sphere=C.BoundingSphere.fromPoints(positions);state.viewer.camera.flyToBoundingSphere(sphere,{duration:1.1,offset:new C.HeadingPitchRange(C.Math.toRadians(-12),C.Math.toRadians(state.top?-90:-42),Math.max(sphere.radius*3.1,area.category==='UA'?6000:35000))});}
function renderSpecialAreas() {
 const list=$('specialList');list.replaceChildren();let count=0;const sorted=[...state.specialAreas.values()].sort((a,b)=>(a.code||a.name).localeCompare(b.code||b.name,undefined,{numeric:true}));
 for(const area of sorted){if(!specialMatches(area))continue;count++;const hasVolume=area.features.some(f=>f.canRender);const row=document.createElement('div');row.className='route-row airport-row special-row'+(state.selectedSpecial?.id===area.id?' selected':'');const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.enabledSpecial.has(area.id);checkbox.disabled=!hasVolume&&!hasSpecialPlan(area);checkbox.setAttribute('aria-label',`${area.code} 표시`);checkbox.addEventListener('change',()=>{checkbox.checked?state.enabledSpecial.add(area.id):state.enabledSpecial.delete(area.id);applySpecialVisibility();});const names=document.createElement('span');names.className='airport-name-group';const code=document.createElement('strong');code.textContent=area.code||area.name;const name=document.createElement('small');name.textContent=area.nameKo||area.name||SPECIAL_TYPES[area.category].label;names.append(code,name);const category=document.createElement('span');category.className='special-type-badge';category.textContent=SPECIAL_TYPES[area.category].code;category.style.color=SPECIAL_TYPES[area.category].color;label.append(checkbox,names,category);row.append(label);if(!hasVolume||area.status==='partial'){const status=document.createElement('span');status.className='airport-status partial';status.textContent=hasVolume?'일부':'평면·위치';row.append(status);}const fly=document.createElement('button');fly.className='route-fly';fly.textContent=hasVolume?'↗':'ⓘ';fly.title=`${area.code} 공역 정보`;fly.setAttribute('aria-label',fly.title);fly.addEventListener('click',()=>{if(hasVolume||hasSpecialPlan(area)){state.enabledSpecial.add(area.id);if(!hasVolume){state.specialPlan=true;$('specialPlan').checked=true;}state.specialMaster=true;$('specialMaster').checked=true;state.specialCategories[area.category]=true;$(`specialCategory${area.category}`).checked=true;}selectSpecialArea(area.id,null,true);renderSpecialAreas();applySpecialVisibility();updateMapLegend();$('sidebar').classList.remove('open');});row.append(fly);list.append(row);}
 if(!count)list.innerHTML='<div class="empty-state">일치하는 특수 공역이 없습니다.</div>';$('specialCount').textContent=String(count);
}
function selectSpecialArea(id,featureId,fly=false) {
 const area=state.specialAreas.get(id);if(!area)return;const f=area.features.find(f=>f.id===featureId&&f.canRender)||area.features.find(f=>f.canRender)||null;state.selectedSpecial=area;state.selectedSpecialFeature=f;state.selected=null;state.selectedAirport=null;state.selectedAirportFeature=null;state.selectedAirportGroup=null;$('detailPanel').hidden=true;$('airportDetailPanel').hidden=true;$('profilePanel').hidden=true;$('specialDetailPanel').hidden=false;updateSelection();
 $('specialDetailType').textContent=`${SPECIAL_TYPES[area.category].label} · ${SPECIAL_TYPES[area.category].code}${area.subcategory?' · '+area.subcategory:''}`;$('specialDetailCode').textContent=area.code||area.name;$('specialDetailName').textContent=area.nameKo||area.name||'';
 const select=$('specialFeatureSelect');select.replaceChildren();for(const feature of area.features.filter(f=>f.canRender)){const option=document.createElement('option');option.value=feature.id;option.textContent=`${specialAltitude(feature.lowerFt,feature.lowerRef)} ~ ${specialAltitude(feature.upperFt,feature.upperRef)}`;select.append(option);}select.disabled=!f;if(f)select.value=f.id;else{const option=document.createElement('option');option.textContent='입체 고도·경계 미확정';select.append(option);}
 const color=SPECIAL_TYPES[area.category].color;$('specialBandDetails').innerHTML=f?`<div class="band-row special-band" style="border-color:${color}"><b style="color:${color}">${esc(SPECIAL_TYPES[area.category].code)}</b><span>${esc(specialAltitude(f.lowerFt,f.lowerRef))}<br>~ ${esc(specialAltitude(f.upperFt,f.upperRef))}</span></div>`:'<p class="special-empty-volume">확인된 평면·위치 정보만 제공합니다.<br>미기재된 고도나 폭으로 입체를 만들지 않았습니다.</p>';
 $('specialCapNote').textContent=f?.isUnlimited?`상한 UNL · 화면은 ${fmt(specialDisplayUpperFt(f))} ft까지 표시합니다. 이 높이는 공시 상한이 아닙니다.`:'';
 $('specialDatumNote').textContent=f&&['GND','SFC','AGL'].some(ref=>[f.lowerRef,f.upperRef].includes(ref))?'GND·SFC·AGL은 지형 미반영 명목높이입니다.':f?'원문 고도 기준을 보존합니다. FL은 명목 높이로 환산합니다.':'';
 const notes=[textNote(area.notes),textNote(f?.notes),f?.rawLimits&&`공시 범위: ${textNote(f.rawLimits)}`,area.schedule&&`운영: ${textNote(area.schedule)}`,f?.schedule&&`운영: ${textNote(f.schedule)}`].filter(Boolean);$('specialDetailNotes').textContent=[...new Set(notes)].join('\n');
 const geometryLabel=f?.geometrySourceLabel||area.geometrySourceLabel;const geometrySource=typeof f?.geometrySource==='string'?f.geometrySource:typeof area.geometrySource==='string'?area.geometrySource:'';$('specialGeometrySource').textContent=typeof geometryLabel==='string'?`수평 경계: ${geometryLabel}`:geometrySource?/js|javascript/i.test(geometrySource)?'수평 경계: 제공된 JS 경계 자료':'수평 경계: AIP 공시 좌표·범위':'';
 const source=f?.source||area.source||{};$('specialDetailDate').textContent=[source.pageDate||source.publicationDate,source.effective||source.effectiveDate].filter(Boolean).join(' · 발효: ');$('specialDetailPage').textContent=source.printedPage||source.document||'출처 확인 필요';const isJs=/airspace_final\.js/i.test(source.document||'');const href=isJs?'sources/airspace_final.js':sourcePdfHref(source);$('specialDetailSource').hidden=!href;$('specialDetailSource').textContent=isJs?'경계 JS 원본 ↗':'AIP 원문 ↗';if(href)$('specialDetailSource').href=href;
 renderSpecialAreas();renderAirports();renderRoutes();if(fly)flySpecialArea(area);
}
function selectSpecialFeature(id) {const f=state.specialDataset.features.find(f=>f.id===id);if(f)selectSpecialArea(f.areaId,id,false);}
function clearSpecialSelection() {state.selectedSpecial=null;state.selectedSpecialFeature=null;$('specialDetailPanel').hidden=true;updateSpecialSelection();renderSpecialAreas();}
function updateMapLegend() {$('specialLegend').hidden=!state.specialMaster;$('airportLegend').hidden=!state.airportMaster;$('airwayLegend').hidden=!state.airwayMaster;}
function bindSpecialControls() {
 $('specialTab').addEventListener('click',()=>switchDirectory('special'));$('specialMaster').addEventListener('change',()=>{state.specialMaster=$('specialMaster').checked;applySpecialVisibility();updateMapLegend();});
 for(const key of Object.keys(SPECIAL_TYPES))$(`specialCategory${key}`).addEventListener('change',()=>{state.specialCategories[key]=$(`specialCategory${key}`).checked;applySpecialVisibility();});
 $('specialSearch').addEventListener('input',event=>{state.specialQuery=event.target.value.trim().toLowerCase();renderSpecialAreas();applySpecialVisibility();});
 $('specialAllOn').addEventListener('click',()=>{for(const area of state.specialAreas.values())if(specialMatches(area)&&(area.features.some(f=>f.canRender)||hasSpecialPlan(area)))state.enabledSpecial.add(area.id);renderSpecialAreas();applySpecialVisibility();});$('specialAllOff').addEventListener('click',()=>{for(const area of state.specialAreas.values())if(specialMatches(area))state.enabledSpecial.delete(area.id);renderSpecialAreas();applySpecialVisibility();});
 $('specialPlan').addEventListener('change',()=>{state.specialPlan=$('specialPlan').checked;applySpecialVisibility();});$('unlimitedCap').addEventListener('change',event=>{state.unlimitedCapFt=Number(event.target.value);updateSpecialHeights();});
 $('specialFeatureSelect').addEventListener('change',event=>selectSpecialFeature(event.target.value));$('closeSpecialDetail').addEventListener('click',clearSpecialSelection);
 const issues=$('specialIssues');issues.replaceChildren();const messages=[...new Set((state.specialDataset.issues||[]).map(textNote).filter(Boolean))];for(const message of messages){const li=document.createElement('li');li.textContent=message;issues.append(li);}if(!messages.length){const li=document.createElement('li');li.textContent='자료가 부족하거나 해석이 필요한 범위는 각 구역의 상태와 원문 비고에 표시합니다.';issues.append(li);}
}

function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3200); }
function routeMatches(route) { const q = state.query; return !q || route.name.toLowerCase().includes(q) || route.segments.some(s => `${s.from.name} ${s.to.name} ${s.from.label || ''} ${s.to.label || ''}`.toLowerCase().includes(q)); }
function visibleSegment(s) { return state.airwayMaster && state.enabled.has(s.route) && (isRnav(s) ? state.rnav : state.conventional) && routeMatches(state.routes.get(s.route)); }
function visibleBand(band) { return band.class === 'A' ? state.classA : state.classD; }
function geodesic(s) { return new C.EllipsoidGeodesic(C.Cartographic.fromDegrees(s.from.lon, s.from.lat), C.Cartographic.fromDegrees(s.to.lon, s.to.lat)); }
function bearing(a, b) { const dl = b.longitude - a.longitude; return Math.atan2(Math.sin(dl)*Math.cos(b.latitude), Math.cos(a.latitude)*Math.sin(b.latitude)-Math.sin(a.latitude)*Math.cos(b.latitude)*Math.cos(dl)); }
function offset(point, heading, meters) {
 // Vincenty direct solution on WGS84: preserve the applied lateral width.
 const a=6378137, f=1/298.257223563, b=(1-f)*a;
 const tanU1=(1-f)*Math.tan(point.latitude), cosU1=1/Math.sqrt(1+tanU1*tanU1), sinU1=tanU1*cosU1;
 const sinAlpha1=Math.sin(heading), cosAlpha1=Math.cos(heading), sigma1=Math.atan2(tanU1,cosAlpha1);
 const sinAlpha=cosU1*sinAlpha1, cosSqAlpha=1-sinAlpha*sinAlpha, uSq=cosSqAlpha*(a*a-b*b)/(b*b);
 const A=1+uSq/16384*(4096+uSq*(-768+uSq*(320-175*uSq)));
 const B=uSq/1024*(256+uSq*(-128+uSq*(74-47*uSq)));
 let sigma=meters/(b*A), previous=Infinity, iterations=0;
 while(Math.abs(sigma-previous)>1e-13 && iterations++<100) {
  const cos2SigmaM=Math.cos(2*sigma1+sigma), sinSigma=Math.sin(sigma), cosSigma=Math.cos(sigma);
  const delta=B*sinSigma*(cos2SigmaM+B/4*(cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)-B/6*cos2SigmaM*(-3+4*sinSigma*sinSigma)*(-3+4*cos2SigmaM*cos2SigmaM)));
  previous=sigma; sigma=meters/(b*A)+delta;
 }
 const sinSigma=Math.sin(sigma), cosSigma=Math.cos(sigma), cos2SigmaM=Math.cos(2*sigma1+sigma);
 const tmp=sinU1*sinSigma-cosU1*cosSigma*cosAlpha1;
 const lat=Math.atan2(sinU1*cosSigma+cosU1*sinSigma*cosAlpha1,(1-f)*Math.sqrt(sinAlpha*sinAlpha+tmp*tmp));
 const lambda=Math.atan2(sinSigma*sinAlpha1,cosU1*cosSigma-sinU1*sinSigma*cosAlpha1);
 const coeff=f/16*cosSqAlpha*(4+f*(4-3*cosSqAlpha));
 const L=lambda-(1-coeff)*f*sinAlpha*(sigma+coeff*sinSigma*(cos2SigmaM+coeff*cosSigma*(-1+2*cos2SigmaM*cos2SigmaM)));
 return [C.Math.toDegrees(point.longitude+L),C.Math.toDegrees(lat)];
}
function segmentGeometry(s) {
 const line = geodesic(s); const steps = Math.max(1, Math.ceil(line.surfaceDistance / 18000)); const center = [], left = [], right = [];
 for (let i=0; i<=steps; i++) { const f=i/steps; const p=line.interpolateUsingFraction(f); const before=line.interpolateUsingFraction(Math.max(0,f-.0001)); const after=line.interpolateUsingFraction(Math.min(1,f+.0001)); const heading=f<1?new C.EllipsoidGeodesic(p,after).startHeading:line.endHeading; center.push(C.Math.toDegrees(p.longitude),C.Math.toDegrees(p.latitude)); if (Number(s.widthNm)>0) { left.push(...offset(p, heading-Math.PI/2, Number(s.widthNm)*1852/2)); right.push(offset(p, heading+Math.PI/2, Number(s.widthNm)*1852/2)); } }
 const polygon = left.concat(right.reverse().flat()); return { center, polygon, distance:line.surfaceDistance };
}
function initGlobe() {
 C.Ion.defaultAccessToken = '';
 const viewer = new C.Viewer('globe', { baseLayer: false, terrainProvider: new C.EllipsoidTerrainProvider(), animation:false, timeline:false, baseLayerPicker:false, geocoder:false, homeButton:false, sceneModePicker:false, navigationHelpButton:false, fullscreenButton:false, selectionIndicator:false, infoBox:false, shouldAnimate:false, requestRenderMode:true, maximumRenderTimeChange:Infinity, contextOptions:{webgl:{alpha:false}} });
 state.viewer=viewer; viewer.scene.backgroundColor=C.Color.fromCssColorString('#081422'); viewer.scene.globe.baseColor=C.Color.fromCssColorString('#192c3e'); viewer.scene.globe.enableLighting=false; viewer.scene.globe.depthTestAgainstTerrain=false; viewer.scene.skyBox.show=false; viewer.scene.skyAtmosphere.show=false; viewer.scene.sun.show=false; viewer.scene.moon.show=false; viewer.scene.fog.enabled=false;
 const imagery = new C.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/',credit:new C.Credit('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'),maximumLevel:19}); viewer.imageryLayers.addImageryProvider(imagery);
 imagery.errorEvent.addEventListener(() => { if (!state.tileMessage) { state.tileMessage=true; toast('배경 지도 연결을 확인해 주세요. 항공로는 계속 표시됩니다.'); } });
 viewer.scene.screenSpaceCameraController.minimumZoomDistance=1500; viewer.scene.screenSpaceCameraController.maximumZoomDistance=12000000;
 const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
 handler.setInputAction((click) => { const pick=viewer.scene.pick(click.position); if(C.defined(pick?.id)){if(pick.id._specialFeatureId)selectSpecialFeature(pick.id._specialFeatureId);else if(pick.id._specialAreaId)selectSpecialArea(pick.id._specialAreaId,null,false);else if(pick.id._airportMergedFeatureId)selectAirportMergedFeature(pick.id._airportMergedFeatureId);else if(pick.id._airportFeatureId)selectAirportFeature(pick.id._airportFeatureId);else if(pick.id._segmentId)selectSegment(pick.id._segmentId,false);} },C.ScreenSpaceEventType.LEFT_CLICK);
 handler.setInputAction((movement) => { const ray=viewer.camera.getPickRay(movement.endPosition); if(!ray) return; const point=viewer.scene.globe.pick(ray,viewer.scene); if(point){const p=C.Cartographic.fromCartesian(point);$('mapCoordinates').textContent=`${C.Math.toDegrees(p.latitude).toFixed(2)}° N  ${C.Math.toDegrees(p.longitude).toFixed(2)}° E`;} },C.ScreenSpaceEventType.MOUSE_MOVE);
 viewer.camera.setView({destination:C.Cartesian3.fromDegrees(128,35,2000000)});
 return viewer;
}
function buildGeometry() {
 const viewer=state.viewer; viewer.entities.suspendEvents();
 for (const s of state.dataset.segments) {
  if (!s.from || !s.to || !s.bands?.length) continue;
  const geo=segmentGeometry(s); s._distance=geo.distance;
  for(const b of s.bands) {
   if(!COLORS[b.class] || !(b.upperFt>b.lowerFt))continue;
   const color=C.Color.fromCssColorString(COLORS[b.class]); let entity;
   if(s.widthNm>0) entity=viewer.entities.add({name:`${s.route} · Class ${b.class} · ${s.from.name} → ${s.to.name}`,polygon:{hierarchy:C.Cartesian3.fromDegreesArray(geo.polygon),height:b.upperFt*.3048*state.exaggeration,extrudedHeight:b.lowerFt*.3048*state.exaggeration,material:color.withAlpha(state.opacity),outline:true,outlineColor:color.withAlpha(.6),outlineWidth:1,closeTop:true,closeBottom:true,arcType:C.ArcType.GEODESIC}});
   else entity=viewer.entities.add({name:`${s.route} · Class ${b.class} · 폭 미기재 중심선 단면`,wall:{positions:C.Cartesian3.fromDegreesArray(geo.center),minimumHeights:Array(geo.center.length/2).fill(b.lowerFt*.3048*state.exaggeration),maximumHeights:Array(geo.center.length/2).fill(b.upperFt*.3048*state.exaggeration),material:color.withAlpha(state.opacity*.72),outline:true,outlineColor:color.withAlpha(.6),outlineWidth:1}});
   entity._segmentId=s.id;
   let line=null;
   if(!(s.widthNm>0)) { const positions=[]; for(let i=0;i<geo.center.length;i+=2)positions.push(geo.center[i],geo.center[i+1],b.lowerFt*.3048*state.exaggeration); line=viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArrayHeights(positions),width:1.4,material:new C.PolylineDashMaterialProperty({color:color.withAlpha(.78),dashLength:12}),arcType:C.ArcType.GEODESIC}}); line._segmentId=s.id; }
   state.records.push({segment:s,band:b,geo,entity,line,color});
  }
 }
 viewer.entities.resumeEvents(); applyVisibility();
}
function applyVisibility() {
 for(const r of state.records) { const show=visibleSegment(r.segment)&&visibleBand(r.band); r.entity.show=show; if(r.line)r.line.show=show; }
 const visible=[...state.routes.values()].filter(route=>state.airwayMaster && state.enabled.has(route.name) && routeMatches(route) && (route.rnav?state.rnav:state.conventional) && route.segments.some(s=>s.bands.some(visibleBand))); $('visibleCount').textContent=`${visible.length} / ${state.routes.size} 항공로 표시`;
 state.viewer?.scene.requestRender();
}
function updateHeights() {
 for(const r of state.records) { const low=r.band.lowerFt*.3048*state.exaggeration,high=r.band.upperFt*.3048*state.exaggeration;
  if(r.entity.polygon){r.entity.polygon.height=high;r.entity.polygon.extrudedHeight=low;}else{r.entity.wall.minimumHeights=Array(r.geo.center.length/2).fill(low);r.entity.wall.maximumHeights=Array(r.geo.center.length/2).fill(high); const positions=[];for(let i=0;i<r.geo.center.length;i+=2)positions.push(r.geo.center[i],r.geo.center[i+1],low);r.line.polyline.positions=C.Cartesian3.fromDegreesArrayHeights(positions);}
 }
 updateAirportHeights();updateSpecialHeights();updateSelection();state.viewer.scene.requestRender();
}
function updateOpacity() { for(const r of state.records){const alpha=state.opacity*(r.entity.wall ? 0.72 : 1);const material=r.color.withAlpha(alpha);if(r.entity.polygon)r.entity.polygon.material=material;else r.entity.wall.material=material;}updateSelection();state.viewer.scene.requestRender(); }
function homeView() {
 const positions=[];
 if(state.specialMaster)for(const area of state.specialAreas.values())if(area.features.some(visibleSpecialFeature))positions.push(...specialPositions(area));
 if(state.airportMaster)for(const airport of state.airports.values())if(airport.features.some(f=>f.canRender&&visibleAirportFeature(f)))positions.push(...airportPositions(airport));
 if(state.airwayMaster)for(const route of state.routes.values())for(const segment of route.segments)if(visibleSegment(segment)){positions.push(C.Cartesian3.fromDegrees(segment.from.lon,segment.from.lat,30000*.3048*state.exaggeration),C.Cartesian3.fromDegrees(segment.to.lon,segment.to.lat,30000*.3048*state.exaggeration));}
 if(!positions.length){positions.push(C.Cartesian3.fromDegrees(125,33,0),C.Cartesian3.fromDegrees(130,38,0));}
 const sphere=C.BoundingSphere.fromPoints(positions);state.viewer.camera.flyToBoundingSphere(sphere,{duration:1.1,offset:new C.HeadingPitchRange(C.Math.toRadians(-8),C.Math.toRadians(state.top?-90:-48),Math.max(sphere.radius*(state.top?2.7:2.5),60000))});
}
function renderRoutes() {
 const list=$('routeList');list.replaceChildren();
 const sorted=[...state.routes.values()].sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));let count=0;
 for(const route of sorted){if(!routeMatches(route))continue;count++;const row=document.createElement('div');row.className='route-row'+(state.selected?.route===route.name?' selected':'');row.dataset.route=route.name;
 const label=document.createElement('label');const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.enabled.has(route.name);checkbox.setAttribute('aria-label',`${route.name} 표시`);checkbox.addEventListener('change',()=>{checkbox.checked?state.enabled.add(route.name):state.enabled.delete(route.name);applyVisibility();});
 const title=document.createElement('span');title.className='route-name';title.textContent=route.name;const type=document.createElement('span');type.className='route-type';type.textContent=route.rnav?'RNAV':'ATS';const meta=document.createElement('span');meta.className='route-meta';meta.textContent=`${route.segments.length} 구간`;
 label.append(checkbox,title,type,meta);const fly=document.createElement('button');fly.className='route-fly';fly.title=`${route.name}로 이동`;fly.setAttribute('aria-label',`${route.name} 항공로 상세 보기`);fly.textContent='↗';fly.addEventListener('click',()=>{state.enabled.add(route.name);state.airwayMaster=true;$('airwayMaster').checked=true;updateMapLegend();selectSegment(route.segments[0].id,true);renderRoutes();applyVisibility();$('sidebar').classList.remove('open');}); row.append(label,fly);list.append(row);}
 if(!count)list.innerHTML='<div class="empty-state">일치하는 항공로가 없습니다.</div>';
 $('routeCount').textContent=String(count).padStart(2,'0');
}
function flyRoute(route) {const positions=[];for(const s of route.segments){positions.push(C.Cartesian3.fromDegrees(s.from.lon,s.from.lat,30000*.3048*state.exaggeration),C.Cartesian3.fromDegrees(s.to.lon,s.to.lat,30000*.3048*state.exaggeration));} const sphere=C.BoundingSphere.fromPoints(positions);state.viewer.camera.flyToBoundingSphere(sphere,{duration:1.1,offset:new C.HeadingPitchRange(C.Math.toRadians(-12),C.Math.toRadians(state.top?-90:-42),Math.max(sphere.radius*3.2,150000))});}
function updateSelection() {
 for(const r of state.records){const selected=state.selected?.id===r.segment.id; const alpha=state.opacity*(r.entity.wall ? 0.72 : 1);if(r.entity.polygon){r.entity.polygon.outlineColor=r.color.withAlpha(selected?1:.6);r.entity.polygon.material=r.color.withAlpha(selected?Math.max(alpha,.48):alpha);}else{r.entity.wall.outlineColor=r.color.withAlpha(selected?1:.6);r.entity.wall.material=r.color.withAlpha(selected?Math.max(alpha,.38):alpha);}}
 updateAirportSelection();updateSpecialSelection();state.viewer?.scene.requestRender();
}
function selectSegment(id,fly) {
 const s=state.dataset.segments.find(x=>x.id===id);if(!s)return;clearSpecialSelection();state.selectedAirport=null;state.selectedAirportFeature=null;state.selectedAirportGroup=null;$('airportDetailPanel').hidden=true;state.selected=s;updateSelection();renderAirports();
 $('detailPanel').hidden=false;$('detailType').textContent=isRnav(s)?`${String(s.navigationSpecification||'RNAV').replace(/\s+/g,'')} · ${s.widthNm>0?'항공로 입체':'중심선 수직 단면'}`:'CONVENTIONAL · 항공로 입체';$('detailRoute').textContent=s.route;$('detailFrom').textContent=s.from.name;$('detailTo').textContent=s.to.name;$('detailWidth').textContent=s.widthNm>0?`${fmt(s.widthNm)} NM · 좌우 각 ${fmt(s.widthNm/2)} NM`:'폭 미기재 · 두께 없음';
 $('detailWidthSource').textContent=s.widthSource==='user-specified-model'?'폭 출처: 사용자 지정 모델 · AIP 공시 폭 미기재':(s.widthNm>0?'폭 출처: AIP Lateral limits':'폭 미기재 · 중심선 단면');
 $('bandDetails').innerHTML=s.bands.map(b=>`<div class="band-row band-${esc(b.class.toLowerCase())}"><b>CLASS ${esc(b.class)}</b><span>${esc(alt(b.lowerFt,b.lowerRef))}${b.lowerExclusive?' 초과':''}<br>~ ${esc(alt(b.upperFt,b.upperRef))}</span></div>`).join('');
 const extra=[];if(s.mocaFt!=null)extra.push(`MOCA: ${fmt(s.mocaFt)} ft (공역 하한에 미적용)`);if(s.bands.some(b=>b.coordinationRequired))extra.push('조정이 필요한 층 포함 · 원문 조건 확인');if(s.notes)extra.push(typeof s.notes==='string'?s.notes:JSON.stringify(s.notes));$('detailNotes').textContent=extra.join('\n');
 $('detailDate').textContent=[s.source.publicationDate||s.source.pageDate,s.source.effectiveDate||s.source.effective].filter(Boolean).join(' · 발효: ');$('detailPage').textContent=s.source.printedPage||`${s.source.document} · p.${s.source.pdfPage}`;const sourceHref=sourcePdfHref(s.source);$('detailSource').hidden=!sourceHref;if(sourceHref)$('detailSource').href=sourceHref;
 renderRoutes();if(!$('profilePanel').hidden)drawProfile();if(fly)flyRoute(state.routes.get(s.route));
}
function drawProfile() {
 if(!state.selected)return;const route=state.routes.get(state.selected.route);$('profileTitle').textContent=`${route.name} · 항공로 수직 단면`;
 const width=900,height=185,pad={l:58,r:18,t:15,b:31},plotW=width-pad.l-pad.r,plotH=height-pad.t-pad.b;const total=route.segments.reduce((sum,s)=>sum+(s._distance||geodesic(s).surfaceDistance),0);const x=m=>pad.l+m/total*plotW,y=ft=>pad.t+plotH*(1-ft/60000);let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(route.name)} 항공로의 구간별 Class A와 D 수직한계">`;
 for(const tick of [0,20000,40000,60000])svg+=`<line x1="${pad.l}" y1="${y(tick)}" x2="${width-pad.r}" y2="${y(tick)}" stroke="#385066" stroke-width=".6" stroke-dasharray="3 4"/><text x="${pad.l-8}" y="${y(tick)+3}" text-anchor="end" fill="#85a3bb" font-size="9" font-family="monospace">${tick?'FL '+tick/100:'0 ft'}</text>`;
 let distance=0;const labelEvery=Math.max(1,Math.ceil(route.segments.length/10));route.segments.forEach((s,i)=>{const start=distance;distance+=s._distance||geodesic(s).surfaceDistance;const selected=s.id===state.selected.id;for(const b of s.bands){if(!visibleBand(b))continue;svg+=`<rect data-segment-id="${esc(s.id)}" x="${x(start)}" y="${y(b.upperFt)}" width="${Math.max(.5,x(distance)-x(start))}" height="${Math.max(.3,y(b.lowerFt)-y(b.upperFt))}" fill="${COLORS[b.class]}" fill-opacity="${selected ? 0.55 : 0.25}" stroke="${COLORS[b.class]}" stroke-opacity="${selected?1:.5}" stroke-width="${selected?1.4:.5}" style="cursor:pointer"><title>${esc(s.from.name)} → ${esc(s.to.name)} · Class ${b.class}: ${esc(alt(b.lowerFt,b.lowerRef))}–${esc(alt(b.upperFt,b.upperRef))}</title></rect>`;}if(i%labelEvery===0)svg+=`<text x="${x(start)}" y="${height-15}" fill="#8faac0" font-size="8" text-anchor="middle">${esc(s.from.name)}</text>`;});
 svg+=`<text x="${width-pad.r}" y="${height-15}" fill="#8faac0" font-size="8" text-anchor="end">${esc(route.segments.at(-1).to.name)}</text><text x="${width-pad.r}" y="${height-1}" fill="#5e809e" font-size="8" text-anchor="end">구간 누적 거리 ${Math.round(total/1852)} NM · FL 명목 높이 기준</text></svg>`;$('profileChart').innerHTML=svg;$('profileChart').querySelectorAll('[data-segment-id]').forEach(el=>el.addEventListener('click',()=>selectSegment(el.dataset.segmentId,false)));
}
function bindControls() {
 for(const id of ['classA','classD','conventional','rnav'])$(id).addEventListener('change',()=>{state[id]=$(id).checked;applyVisibility();if(!$('profilePanel').hidden)drawProfile();});
 $('routeSearch').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();renderRoutes();applyVisibility();});
 $('allOn').addEventListener('click',()=>{for(const route of state.routes.values())if(routeMatches(route))state.enabled.add(route.name);renderRoutes();applyVisibility();});$('allOff').addEventListener('click',()=>{for(const route of state.routes.values())if(routeMatches(route))state.enabled.delete(route.name);renderRoutes();applyVisibility();});
 $('exaggeration').addEventListener('input',e=>{state.exaggeration=Number(e.target.value);$('exaggerationValue').textContent=`${state.exaggeration}×`;updateHeights();});$('opacity').addEventListener('input',e=>{state.opacity=Number(e.target.value)/100;$('opacityValue').textContent=`${e.target.value}%`;updateOpacity();});
 $('view3d').addEventListener('click',()=>{state.top=false;$('view3d').classList.add('active');$('view2d').classList.remove('active');homeView();});$('view2d').addEventListener('click',()=>{state.top=true;$('view2d').classList.add('active');$('view3d').classList.remove('active');homeView();});$('homeView').addEventListener('click',homeView);
 $('closeDetail').addEventListener('click',()=>{$('detailPanel').hidden=true;state.selected=null;updateSelection();renderRoutes();});$('profileToggle').addEventListener('click',()=>{$('profilePanel').hidden=!$('profilePanel').hidden;if(!$('profilePanel').hidden)drawProfile();});$('closeProfile').addEventListener('click',()=>{$('profilePanel').hidden=true;});
 $('sourcesBtn').addEventListener('click',()=>$('sourcesDialog').showModal());$('closeSources').addEventListener('click',()=>$('sourcesDialog').close());$('sourcesDialog').addEventListener('click',e=>{if(e.target===$('sourcesDialog')){const r=$('sourcesDialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('sourcesDialog').close();}});$('menuToggle').addEventListener('click',()=>$('sidebar').classList.toggle('open'));
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('sidebar').classList.add('open');$(state.tab==='special'?'specialSearch':state.tab==='airports'?'airportSearch':'routeSearch').focus();}if(e.key==='Escape'){$('sidebar').classList.remove('open');$('profilePanel').hidden=true;}});
}
async function main() {
 try {
  if(!C)throw new Error('Cesium 엔진을 읽지 못했습니다.');const [response,airportResponse,specialResponse]=await Promise.all([fetch('airways.json'),fetch('airport-airspaces.json'),fetch('special-airspaces.json')]);if(!response.ok)throw new Error(`항공로 데이터 HTTP ${response.status}`);if(!airportResponse.ok)throw new Error(`공항 공역 데이터 HTTP ${airportResponse.status}`);if(!specialResponse.ok)throw new Error(`특수 공역 데이터 HTTP ${specialResponse.status}`);state.dataset=await response.json();prepareAirports(await airportResponse.json());prepareSpecialAreas(await specialResponse.json());
  for(const s of state.dataset.segments){if(!navigationModelMatches(s))throw new Error(`${s.route}의 RNAV 모델 폭과 규격이 일치하지 않습니다.`);let route=state.routes.get(s.route);if(!route){route={name:s.route,rnav:isRnav(s),segments:[]};state.routes.set(s.route,route);state.enabled.add(s.route);}route.segments.push(s);}
  initGlobe();buildGeometry();buildAirportGeometry();buildSpecialGeometry();renderRoutes();renderAirports();renderSpecialAreas();bindControls();bindAirportControls();bindSpecialControls();switchDirectory(state.tab);updateMapLegend();$('datasetSummary').textContent=`특수 공역 ${state.specialAreas.size}개 · ${state.specialDataset.features.filter(f=>f.canRender).length}개 고도층 | 공항 ${state.airports.size}곳 중 ${[...state.airports.values()].filter(a=>a.features.some(f=>f.canRender)).length}곳 모델 · ${state.airportDataset.features.filter(f=>f.canRender).length}개 원문 층 · 연결 공역 ${state.airportGroups.size}개 합침 | 항공로 ${state.routes.size}개 · ${state.dataset.segments.length}개 구간 · ${state.records.length}개 층 | 제공된 AIP 판본 기준`;
  $('loading').hidden=true;homeView();
 }catch(error){console.error(error);$('loading').innerHTML=`<strong>지도를 불러오지 못했습니다</strong><span>${esc(error.message)}</span><span>파일은 웹 서버에서 열어 주세요. 원문 PDF와 JSON은 내려받을 수 있습니다.</span>`;}
}
window.AirwaysGeometry={offset,bearing,segmentGeometry,navigationHalfWidthNm,navigationModelMatches,sourcePdfHref,normalizeAirportFeature,normalizedRing,airportPolygonHierarchies,hasUnclippedCircle,hasYangyangPriority,airportGroupActive,visibleAirportSourceFeature,selectAirportMergedFeature,normalizeSpecialFeature,specialDisplayUpperFt,specialAltitude,prepareSpecialAreas,visibleSpecialFeature,specialAreaEnabled,hasSpecialPlan};
main();
})();
