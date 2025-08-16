
import React, { useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type Frame = { id:string; brand:string; A:number; B:number; DBL:number; shape?:string; sku?:string; color?:string; stock?:number; reorder?:boolean };

const INITIAL_FRAMES: Frame[] = [
  { id:'f1', brand:'AO Round 46□22', A:46, B:42, DBL:22, shape:'Round', color:'BK', stock:1 },
  { id:'f2', brand:'Classic 48□20', A:48, B:43, DBL:20, shape:'Boston', color:'BR', stock:0, reorder:true },
  { id:'f3', brand:'Slim 52□18', A:52, B:36, DBL:18, shape:'Square', color:'NV', stock:3 },
];

const MATERIALS = [
  { key:'1.60', name:'1.60', index:1.6 },
  { key:'1.67', name:'1.67', index:1.67 },
  { key:'1.74', name:'1.74', index:1.74 },
  { key:'1.76', name:'1.76', index:1.76 },
] as const;
type Material = typeof MATERIALS[number];
const DESIGNS = ['外面非球面','両面非球面'] as const;
const MAKERS = ['HOYA','東海光学','伊藤光学'] as const;

const CT_TABLE: Record<string, Record<string, Record<string, number>>> = {
  'HOYA': { '外面非球面': { '1.60': 1.5, '1.67': 1.5, '1.74': 1.0 },
            '両面非球面': { '1.60': 1.4, '1.67': 1.3, '1.74': 1.0 } },
  '東海光学': { '外面非球面': { '1.60': 1.5, '1.67': 1.4, '1.76': 1.0 },
               '両面非球面': { '1.60': 1.4, '1.67': 1.3, '1.76': 1.0 } },
  '伊藤光学': { '外面非球面': { '1.60': 1.5, '1.67': 1.5, '1.74': 1.0 },
               '両面非球面': { '1.60': 1.4, '1.67': 1.3, '1.74': 1.0 } },
};

function sphericalEquivalent(sph:number, cyl:number){ return sph + cyl/2; }
function estimateEdgeThickness({ sph, cyl, index, minCT, A, B, DBL, monoPD, allowance=2 }:
  { sph:number;cyl:number;index:number;minCT:number;A:number;B:number;DBL:number;monoPD:number;allowance?:number }){
  const SE = Math.abs(sphericalEquivalent(sph,cyl));
  const framePD = A + DBL;
  const dec = Math.abs(framePD/2 - monoPD);
  const blankDia = Math.max(A,B) + 2*dec + 2*allowance;
  const r = blankDia/2;
  const deltaT = (r*r*SE)/(2000*(index-1));
  const edge = minCT + deltaT;
  const ED = Math.max(A,B) + 2*dec;
  return { edge, ED, dec, blankDia };
}

function parseCsv(text:string){
  const delim = (text.includes('\\t') && !text.includes(',')) ? '\\t' : ',';
  const lines = text.replace(/^\\uFEFF/,'').split(/\\r?\\n/).filter(Boolean);
  const head = lines[0].split(delim).map(s=>s.trim());
  const idx = (a:string[])=> head.findIndex(h=>a.includes(h));
  const iBrand=idx(['ブランド','ブランド/型','型','name','brand']);
  const iA=idx(['A','玉型横']); const iB=idx(['B','玉型縦']); const iDBL=idx(['DBL','ブリッジ']);
  const iSize=idx(['サイズ','A□DBL']);
  const iSku=idx(['SKU','sku']); const iColor=idx(['カラー','color']);
  const iStock=idx(['在庫','stock']); const iRe=idx(['発注','reorder']);
  const rows: Frame[] = [];
  for(let i=1;i<lines.length;i++){
    const c = lines[i].split(delim).map(s=>s.trim());
    if(!c.length || c.every(x=>x==='')) continue;
    let A = iA>=0? Number(c[iA]) : NaN;
    let DBL = iDBL>=0? Number(c[iDBL]) : NaN;
    if((isNaN(A)||isNaN(DBL)) && iSize>=0){
      const m = c[iSize]?.match(/(\\d{2})(?:\\s*□|\\s*[-xX*\\s])?(\\d{2})/);
      if(m){ if(isNaN(A)) A=Number(m[1]); if(isNaN(DBL)) DBL=Number(m[2]); }
    }
    if(isNaN(A) || isNaN(DBL)) continue;
    const B = iB>=0? Number(c[iB]||0) : 0;
    rows.push({
      id: Math.random().toString(36).slice(2),
      brand: iBrand>=0? c[iBrand]: '(無名)',
      A, B, DBL,
      sku: iSku>=0? c[iSku]: undefined,
      color: iColor>=0? c[iColor]: undefined,
      stock: iStock>=0? Number(c[iStock]||0): undefined,
      reorder: iRe>=0? /^(1|true|要|はい)$/u.test(c[iRe]): undefined
    });
  }
  return rows;
}

export default function App(){
  const [step, setStep] = useState<1|2|3>(1);

  // Step1
  const [sphR,setSphR]=useState(-8.00), [cylR,setCylR]=useState(-1.50), [pdR,setPdR]=useState(31);
  const [sphL,setSphL]=useState(-7.50), [cylL,setCylL]=useState(-1.00), [pdL,setPdL]=useState(31);

  // Step2
  const [maker,setMaker]=useState<typeof MAKERS[number]>('HOYA');
  const [design,setDesign]=useState<typeof DESIGNS[number]>('外面非球面');
  const [matR,setMatR]=useState<Material>(MATERIALS[1]);
  const [matL,setMatL]=useState<Material>(MATERIALS[1]);
  const [safety,setSafety]=useState(0.2);
  const [allowance,setAllowance]=useState(2);

  // Step3
  const [frames,setFrames]=useState<Frame[]>(INITIAL_FRAMES);
  const [stockOnly, setStockOnly] = useState(false);

  const minCTR = (CT_TABLE[maker]?.[design]?.[matR.key] ?? 1.5) + safety;
  const minCTL = (CT_TABLE[maker]?.[design]?.[matL.key] ?? 1.5) + safety;

  const rows = useMemo(()=>{
    return frames
      .filter(f => stockOnly ? Number(f.stock||0) > 0 : true)
      .map(f=>{
        const r = estimateEdgeThickness({sph:sphR,cyl:cylR,index:matR.index,minCT:minCTR,A:f.A,B:f.B,DBL:f.DBL,monoPD:pdR,allowance});
        const l = estimateEdgeThickness({sph:sphL,cyl:cylL,index:matL.index,minCT:minCTL,A:f.A,B:f.B,DBL:f.DBL,monoPD:pdL,allowance});
        return { ...f, r, l, worst: Math.max(r.edge,l.edge) };
      })
      .sort((a,b)=> a.worst-b.worst);
  }, [frames,stockOnly,sphR,cylR,sphL,cylL,pdR,pdL,matR,matL,minCTR,minCTL,allowance]);

  const pdfRef = useRef<HTMLDivElement>(null);
  const exportPDF = async ()=>{
    const el = pdfRef.current; if(!el) return;
    const canvas = await html2canvas(el, { scale:2 });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ unit:'mm', format:'a4' });
    const W=210, m=10, w=W-2*m, h=(w*canvas.height)/canvas.width;
    pdf.text('近視セレクター 見積', m, 12);
    pdf.text(`メーカー:${maker} 設計:${design} 安全:${safety.toFixed(1)}mm`, m, 18);
    pdf.addImage(img,'PNG',m,24,w,h);
    pdf.save('estimate.pdf');
  };

  return (
    <div className="wrap">
      <div className="stepper">
        <div className={'step '+(step===1?'active':'')} onClick={()=>setStep(1)}><span className="pill">1</span>処方</div>
        <div className={'step '+(step===2?'active':'')} onClick={()=>setStep(2)}><span className="pill">2</span>レンズ</div>
        <div className={'step '+(step===3?'active':'')} onClick={()=>setStep(3)}><span className="pill">3</span>候補</div>
      </div>

      {step===1 && (
        <div className="grid">
          <div className="card">
            <h3>右目</h3>
            <label>SPH</label><input type="number" step={0.25} value={sphR} onChange={e=>setSphR(parseFloat(e.target.value))}/>
            <label>CYL</label><input type="number" step={0.25} value={cylR} onChange={e=>setCylR(parseFloat(e.target.value))}/>
            <label>片眼PD</label><input type="number" step={0.5} value={pdR} onChange={e=>setPdR(parseFloat(e.target.value))}/>
          </div>
          <div className="card">
            <h3>左目</h3>
            <label>SPH</label><input type="number" step={0.25} value={sphL} onChange={e=>setSphL(parseFloat(e.target.value))}/>
            <label>CYL</label><input type="number" step={0.25} value={cylL} onChange={e=>setCylL(parseFloat(e.target.value))}/>
            <label>片眼PD</label><input type="number" step={0.5} value={pdL} onChange={e=>setPdL(parseFloat(e.target.value))}/>
          </div>
          <div className="card">
            <h3>ヒント</h3>
            <div className="muted">度数と片眼PDを入れたら「レンズ」へ。</div>
            <div className="bar"><button className="btn" onClick={()=>setStep(2)}>次へ</button></div>
          </div>
        </div>
      )}

      {step===2 && (
        <div className="grid">
          <div className="card">
            <h3>メーカー / 設計</h3>
            <label>メーカー</label>
            <select value={maker} onChange={e=>setMaker(e.target.value as any)}>
              {MAKERS.map(m=><option key={m}>{m}</option>)}
            </select>
            <label style={{marginTop:10}}>設計</label>
            <select value={design} onChange={e=>setDesign(e.target.value as any)}>
              {DESIGNS.map(d=><option key={d}>{d}</option>)}
            </select>
          </div>
          <div className="card">
            <h3>素材（左右別）</h3>
            <div className="grid" style={{gridTemplateColumns:'1fr 1fr'}}>
              <div>
                <label>右素材</label>
                <select value={matR.key} onChange={e=>{ const n=MATERIALS.find(x=>x.key===e.target.value)!; setMatR(n) }}>
                  {MATERIALS.map(m=><option key={m.key} value={m.key}>{m.name}</option>)}
                </select>
                <div className="muted">CT右 {(CT_TABLE as any)[maker]?.[design]?.[matR.key] + safety}mm</div>
              </div>
              <div>
                <label>左素材</label>
                <select value={matL.key} onChange={e=>{ const n=MATERIALS.find(x=>x.key===e.target.value)!; setMatL(n) }}>
                  {MATERIALS.map(m=><option key={m.key} value={m.key}>{m.name}</option>)}
                </select>
                <div className="muted">CT左 {(CT_TABLE as any)[maker]?.[design]?.[matL.key] + safety}mm</div>
              </div>
            </div>
            <label style={{marginTop:12}}>安全マージン {safety.toFixed(1)}mm</label>
            <input type="range" min={0} max={0.6} step={0.1} value={safety} onChange={e=>setSafety(parseFloat(e.target.value))}/>
            <label style={{marginTop:12}}>仕上げ余裕 {allowance.toFixed(1)}mm</label>
            <input type="range" min={1} max={4} step={0.5} value={allowance} onChange={e=>setAllowance(parseFloat(e.target.value))}/>
          </div>
          <div className="card">
            <h3>進む</h3>
            <div className="muted">「候補を見る」で最薄順に並びます。</div>
            <div className="bar"><button className="btn" onClick={()=>setStep(3)}>候補を見る</button></div>
          </div>
        </div>
      )}

      {step===3 && (
        <div>
          <div className="row" style={{justifyContent:'space-between', margin:'6px 0 12px'}}>
            <label className="row"><input type="checkbox" checked={stockOnly} onChange={e=>setStockOnly(e.target.checked)}/> 在庫のみ</label>
            <div className="row" style={{gap:8}}>
              <input type="file" accept=".csv,text/csv" onChange={async (e)=>{
                const f = e.target.files?.[0]; if(!f) return;
                const t = await f.text();
                setFrames(prev=>[...prev, ...parseCsv(t)]);
              }}/>
              <button className="btn secondary" onClick={()=>setStep(2)}>戻る</button>
              <button className="btn" onClick={()=>exportPDF()}>PDF</button>
            </div>
          </div>
          <div className="card" ref={pdfRef}>
            <div className="cardlist">
              {rows.map(r => (
                <div key={r.id} className="framecard">
                  <div>
                    <div style={{fontWeight:700}}>{r.brand}</div>
                    <div className="meta">
                      <span className="pill">A {r.A}</span>
                      <span className="pill">B {r.B}</span>
                      <span className="pill">DBL {r.DBL}</span>
                      <span className="pill">偏心R {r.r.dec.toFixed(1)}mm</span>
                      <span className="pill">偏心L {r.l.dec.toFixed(1)}mm</span>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="muted">厚み 右/左</div>
                    <div style={{fontSize:18, fontWeight:800}}>{r.r.edge.toFixed(1)} / {r.l.edge.toFixed(1)} mm</div>
                    <div className="muted">最大 {r.worst.toFixed(1)}mm</div>
                  </div>
                </div>
              ))}
              {rows.length===0 && <div className="muted">フレームがありません。CSVを読み込むか、在庫フィルタを解除してください。</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
