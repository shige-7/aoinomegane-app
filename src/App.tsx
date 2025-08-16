
import React, { useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

type Frame = { id:string; brand:string; shape?:string; A:number; B:number; DBL:number; sku?:string; color?:string; stock?:number; reorder?:boolean };

const MATERIALS = [
  { key: '1.60', name: '1.60 (MR-8等)', index: 1.6 },
  { key: '1.67', name: '1.67 (高屈折)', index: 1.67 },
  { key: '1.74', name: '1.74 (超高屈折)', index: 1.74 },
  { key: '1.76', name: '1.76 (超高屈折・東海)', index: 1.76 },
] as const;
type Material = typeof MATERIALS[number];

const DESIGNS = ['外面非球面','両面非球面','遠近','中近','近々'] as const;

const CT_TABLE: Record<string, Record<string, Record<string, number>>> = {
  'HOYA': {
    '外面非球面': { '1.60': 1.5, '1.67': 1.5, '1.74': 1.0 },
    '両面非球面': { '1.60': 1.4, '1.67': 1.3, '1.74': 1.0 },
    '遠近':       { '1.60': 1.8, '1.67': 1.8, '1.74': 1.2 },
    '中近':       { '1.60': 1.8, '1.67': 1.8, '1.74': 1.2 },
    '近々':       { '1.60': 1.8, '1.67': 1.8, '1.74': 1.2 }
  },
  '東海光学': {
    '外面非球面': { '1.60': 1.5, '1.67': 1.4, '1.76': 1.0 },
    '両面非球面': { '1.60': 1.4, '1.67': 1.3, '1.76': 1.0 },
    '遠近':       { '1.60': 1.8, '1.67': 1.7, '1.76': 1.2 },
    '中近':       { '1.60': 1.8, '1.67': 1.7, '1.76': 1.2 },
    '近々':       { '1.60': 1.8, '1.67': 1.7, '1.76': 1.2 }
  },
  '伊藤光学': {
    '外面非球面': { '1.60': 1.5, '1.67': 1.5, '1.74': 1.0 },
    '両面非球面': { '1.60': 1.4, '1.67': 1.3, '1.74': 1.0 },
    '遠近':       { '1.60': 1.8, '1.67': 1.8, '1.74': 1.2 },
    '中近':       { '1.60': 1.8, '1.67': 1.8, '1.74': 1.2 },
    '近々':       { '1.60': 1.8, '1.67': 1.8, '1.74': 1.2 }
  },
};

const INITIAL_FRAMES: Frame[] = [
  { id:'d1', brand:'Round S', shape:'ラウンド', A:46, B:42, DBL:22, sku:'RS-46', color:'BK', stock:1, reorder:false },
  { id:'d2', brand:'Classic P', shape:'ボストン', A:48, B:43, DBL:20, sku:'CP-48', color:'BR', stock:0, reorder:true },
  { id:'d3', brand:'Slim R', shape:'スクエア', A:52, B:36, DBL:18, sku:'SR-52', color:'NV', stock:2, reorder:false },
];

function sphericalEquivalent(sph:number, cyl:number){ return sph + cyl/2; }
function estimateEdgeThickness({ sph, cyl, index, minCT, A, B, DBL, monoPD, allowance = 2 }:
  { sph:number;cyl:number;index:number;minCT:number;A:number;B:number;DBL:number;monoPD:number;allowance?:number;}){
  const SE = Math.abs(sphericalEquivalent(sph, cyl));
  const a = Number(A)||0, b = Number(B)||0, dbl = Number(DBL)||0;
  const framePD = a + dbl;
  const decentration = Math.abs(framePD/2 - monoPD);
  const blankDia = Math.max(a, b) + 2*decentration + 2*allowance;
  const r = blankDia/2;
  const deltaT = (r*r*SE)/(2000*(index-1));
  const edge = minCT + deltaT;
  const ED = Math.max(a, b) + 2*decentration;
  return { edge, deltaT, blankDia, decentration, ED };
}

function parseFramesCsv(text:string){
  const delimiter = (text.includes('\\t') && !text.includes(',')) ? '\\t' : ',';
  const lines = text.replace(/^\\uFEFF/, '').split(/\\r?\\n/).filter(Boolean);
  if(!lines.length) return { rows:[], summary: '空のファイルでした' };
  const header = lines[0].split(delimiter).map(h=>h.trim());
  const idx = (names:string[]) => header.findIndex(h=> names.includes(h));
  const iBrand=idx(['ブランド','ブランド/型','型番','品番','name','brand','モデル']);
  const iShape=idx(['形状','シェイプ','shape','形']);
  const iA=idx(['A','玉型横','玉型横幅','玉型幅','レンズ横幅']);
  const iB=idx(['B','玉型縦','玉型縦幅','レンズ縦幅']);
  const iDBL=idx(['DBL','ブリッジ','ブリッジ幅','鼻幅','Bridge']);
  const iSize=idx(['サイズ','A□DBL','表記','規格','size','Size']);
  const iSku=idx(['SKU','sku','型番','品番']);
  const iColor=idx(['カラー','color','Color','COL']);
  const iStock=idx(['在庫','在庫数','stock','Stock']);
  const iReord=idx(['発注','発注フラグ','reorder','order_flag']);

  const rows: any[] = []; let errors = 0;
  for(let li=1; li<lines.length; li++){
    const cols = lines[li].split(delimiter).map(c=>c.trim());
    if(!cols.length || cols.every(c=>c==='')) continue;
    let brand = iBrand>=0? cols[iBrand] : '';
    let shape = iShape>=0? cols[iShape] : '';
    let A = iA>=0? Number(cols[iA]) : NaN;
    let B = iB>=0? Number(cols[iB]) : NaN;
    let DBL = iDBL>=0? Number(cols[iDBL]) : NaN;
    if((isNaN(A)||isNaN(DBL)) && iSize>=0){
      const m = cols[iSize]?.match(/(\\d{2})(?:\\s*□|\\s*[-xX*\\s])?(\\d{2})/);
      if(m){ if(isNaN(A)) A = Number(m[1]); if(isNaN(DBL)) DBL = Number(m[2]); }
    }
    if(isNaN(A) || isNaN(DBL)){ errors++; continue; }
    const sku = iSku>=0? cols[iSku] : '';
    const color = iColor>=0? cols[iColor] : '';
    const stock = iStock>=0? Number(cols[iStock]||0) : 0;
    const reorder = iReord>=0? /^(1|true|TRUE|はい|要|y)$/u.test(cols[iReord]) : false;
    rows.push({ id: Math.random().toString(36).slice(2), brand: brand||'(無名)', shape: shape||'', A:Number(A), B:isNaN(B)?0:Number(B), DBL:Number(DBL), sku, color, stock, reorder });
  }
  return { rows, summary: `読み込み: ${rows.length}件 / スキップ: ${errors}件\\nヘッダ: ${header.join(', ')}` };
}

export default function App(){
  const [sphR, setSphR] = useState(-8.00);
  const [cylR, setCylR] = useState(-1.50);
  const [sphL, setSphL] = useState(-7.50);
  const [cylL, setCylL] = useState(-1.00);
  const [pdR, setPdR] = useState(31);
  const [pdL, setPdL] = useState(31);

  const [maker, setMaker] = useState<'HOYA'|'東海光学'|'伊藤光学'>('HOYA');
  const [design, setDesign] = useState<typeof DESIGNS[number]>('外面非球面');
  const [matR, setMatR] = useState<Material>(MATERIALS[1]);
  const [matL, setMatL] = useState<Material>(MATERIALS[1]);

  const [safetyMargin, setSafetyMargin] = useState(0.2);

  const getBaseCT = (makerKey: keyof typeof CT_TABLE, designKey: string, matKey: string) => {
    const v = CT_TABLE[makerKey]?.[designKey]?.[matKey];
    return typeof v === 'number' ? v : 1.5;
  };
  const minCTR = useMemo(()=> getBaseCT(maker, design, matR.key) + safetyMargin, [maker, design, matR, safetyMargin]);
  const minCTL = useMemo(()=> getBaseCT(maker, design, matL.key) + safetyMargin, [maker, design, matL, safetyMargin]);

  const [allowance, setAllowance] = useState(2);
  const [frames, setFrames] = useState<Frame[]>(INITIAL_FRAMES);
  const [importSummary, setImportSummary] = useState('');
  const [stockOnly, setStockOnly] = useState(false);

  const rows = useMemo(()=>{
    return frames
      .filter(f => stockOnly ? Number(f.stock||0) > 0 : true)
      .map(f=>{
        const r = estimateEdgeThickness({ sph: sphR, cyl: cylR, index: matR.index, minCT: Number(minCTR), A: f.A, B: f.B, DBL: f.DBL, monoPD: pdR, allowance });
        const l = estimateEdgeThickness({ sph: sphL, cyl: cylL, index: matL.index, minCT: Number(minCTL), A: f.A, B: f.B, DBL: f.DBL, monoPD: pdL, allowance });
        const worst = Math.max(r.edge, l.edge);
        return { ...f, right: r, left: l, worst };
      })
      .sort((a,b)=> a.worst - b.worst);
  }, [frames, stockOnly, sphR, cylR, sphL, cylL, pdR, pdL, matR, matL, minCTR, minCTL, allowance]);

  const [logo, setLogo] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string>('アオイノメガネ / AOINOMEGANE');
  const pdfRef = useRef<HTMLDivElement>(null);
  const exportPDF = async ()=>{
    const el = pdfRef.current; if(!el) return;
    const canvas = await html2canvas(el, { scale: 2 });
    const img = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = 210; const margin = 10; const imgW = pageW - margin*2; const imgH = (imgW * canvas.height) / canvas.width;

    if (logo) pdf.addImage(logo, 'PNG', margin, 8, 24, 24);
    pdf.setFontSize(16);
    pdf.text('レンズ厚み・フレーム最適化 見積', logo? (margin+28) : margin, 16);
    pdf.setFontSize(10);
    pdf.text(`${storeName}`, logo? (margin+28) : margin, 22);
    pdf.text(`メーカー: ${maker} / 設計: ${design} / 安全マージン: ${safetyMargin.toFixed(1)} mm`, logo? (margin+28) : margin, 27);

    pdf.addImage(img, 'PNG', margin, 35, imgW, imgH);
    pdf.save('estimate.pdf');
  };

  const [tab, setTab] = useState<'list'|'compare'|'import'|'add'|'settings'>('list');

  return (
    <div className="container" style={{padding:16,maxWidth:1200,margin:'0 auto'}}>
      <div style={{display:'grid',gap:12,gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))'}}>
        <div className="card">
          <div style={{fontWeight:600, marginBottom:8}}>右目</div>
          <div>SPH <input type="number" step={0.25} value={sphR} onChange={e=>setSphR(parseFloat(e.target.value))}/></div>
          <div>CYL <input type="number" step={0.25} value={cylR} onChange={e=>setCylR(parseFloat(e.target.value))}/></div>
          <div>片眼PD(mm) <input type="number" step={0.5} value={pdR} onChange={e=>setPdR(parseFloat(e.target.value))}/></div>
        </div>
        <div className="card">
          <div style={{fontWeight:600, marginBottom:8}}>左目</div>
          <div>SPH <input type="number" step={0.25} value={sphL} onChange={e=>setSphL(parseFloat(e.target.value))}/></div>
          <div>CYL <input type="number" step={0.25} value={cylL} onChange={e=>setCylL(parseFloat(e.target.value))}/></div>
          <div>片眼PD(mm) <input type="number" step={0.5} value={pdL} onChange={e=>setPdL(parseFloat(e.target.value))}/></div>
        </div>
        <div className="card">
          <div style={{fontWeight:600, marginBottom:8}}>メーカー/設計/素材</div>
          <div>メーカー
            <select value={maker} onChange={e=>setMaker(e.target.value as any)}>
              <option>HOYA</option>
              <option>東海光学</option>
              <option>伊藤光学</option>
            </select>
          </div>
          <div>設計
            <select value={design} onChange={e=>setDesign(e.target.value as any)}>
              {DESIGNS.map(d=> <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div>右 素材
              <select value={matR.key} onChange={e=>{ const next=MATERIALS.find(m=>m.key===e.target.value); if(next) setMatR(next); }}>
                {MATERIALS.map(m=> <option key={m.key} value={m.key}>{m.name}</option>)}
              </select>
              <div className="muted">CT(右) = {(CT_TABLE[maker]?.[design]?.[matR.key] ?? 1.5).toFixed(1)} + {safetyMargin.toFixed(1)} = {(minCTR).toFixed(1)} mm</div>
            </div>
            <div>左 素材
              <select value={matL.key} onChange={e=>{ const next=MATERIALS.find(m=>m.key===e.target.value); if(next) setMatL(next); }}>
                {MATERIALS.map(m=> <option key={m.key} value={m.key}>{m.name}</option>)}
              </select>
              <div className="muted">CT(左) = {(CT_TABLE[maker]?.[design]?.[matL.key] ?? 1.5).toFixed(1)} + {safetyMargin.toFixed(1)} = {(minCTL).toFixed(1)} mm</div>
            </div>
          </div>
          <div style={{marginTop:8}}>安全マージン {safetyMargin.toFixed(1)}mm
            <input type="range" min={0} max={0.6} step={0.1} value={safetyMargin} onChange={e=>setSafetyMargin(parseFloat(e.target.value))}/>
          </div>
          <div>仕上げ余裕 {allowance.toFixed(1)}mm
            <input type="range" min={1} max={4} step={0.5} value={allowance} onChange={e=>setAllowance(parseFloat(e.target.value))}/>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginTop:8}}>
            <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={stockOnly} onChange={e=>setStockOnly(e.target.checked)}/> 在庫ありのみ</label>
            <button className="btn" onClick={exportPDF} style={{marginLeft:'auto'}}>見積PDFを保存</button>
          </div>
        </div>
      </div>

      <div style={{display:'flex',gap:8,margin:'12px 0',flexWrap:'wrap'}}>
        {['list','compare','import','add','settings'].map(t => (
          <button key={t} className={'tab ' + (t===tab?'active':'')} onClick={()=>setTab(t as any)}>
            {t==='list'?'一覧':t==='compare'?'素材/設計比較':t==='import'?'CSVインポート':t==='add'?'手動追加':'設定/ロゴ'}
          </button>
        ))}
      </div>

      <div className={tab==='list'?'':'hidden'}>
        <div className="card">
          <div ref={pdfRef}>
            <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:12}}>
              {logo && <img src={logo} style={{height:60}} />}
              <div>
                <div style={{fontWeight:600}}>レンズ厚み・フレーム最適化 見積</div>
                <div className="muted">{storeName}</div>
                <div className="muted">メーカー:{maker} / 設計:{design} / 安全マージン:{safetyMargin.toFixed(1)}mm</div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>ブランド/型</th><th>形状</th><th>A</th><th>B</th><th>DBL</th>
                  <th>SKU</th><th>カラー</th><th>在庫</th><th>発注</th>
                  <th>偏心R</th><th>偏心L</th><th>ED R</th><th>ED L</th>
                  <th>厚R</th><th>厚L</th><th>最大側</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{r.brand}</td>
                    <td>{r.shape||''}</td>
                    <td>{r.A}</td>
                    <td>{r.B}</td>
                    <td>{r.DBL}</td>
                    <td>{r.sku||''}</td>
                    <td>{r.color||''}</td>
                    <td>{Number(r.stock||0)}</td>
                    <td style={{textAlign:'center'}}>{r.reorder?'要':'-'}</td>
                    <td>{r.right.decentration.toFixed(1)}mm</td>
                    <td>{r.left.decentration.toFixed(1)}mm</td>
                    <td>{r.right.ED.toFixed(1)}mm</td>
                    <td>{r.left.ED.toFixed(1)}mm</td>
                    <td><b>{r.right.edge.toFixed(1)}mm</b></td>
                    <td><b>{r.left.edge.toFixed(1)}mm</b></td>
                    <td><b>{r.worst.toFixed(1)}mm</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className={tab==='compare'?'':'hidden'}>
        <div className="card">
          <table>
            <thead>
              <tr><th>素材</th><th>右エッジ厚</th><th>左エッジ厚</th><th>最大側</th></tr>
            </thead>
            <tbody>
              {MATERIALS.map(m => {
                const base = (CT_TABLE as any)[maker]?.[design]?.[m.key] ?? 1.5;
                const ct = base + safetyMargin;
                const r = estimateEdgeThickness({ sph: sphR, cyl: cylR, index: m.index, minCT: ct, A: 50, B: 40, DBL: 20, monoPD: pdR, allowance });
                const l = estimateEdgeThickness({ sph: sphL, cyl: cylL, index: m.index, minCT: ct, A: 50, B: 40, DBL: 20, monoPD: pdL, allowance });
                const worst = Math.max(r.edge, l.edge);
                return (
                  <tr key={m.key}>
                    <td style={{textAlign:'left'}}>{m.name} <span className="chip">CT {ct.toFixed(1)}mm</span></td>
                    <td>{r.edge.toFixed(1)}mm</td>
                    <td>{l.edge.toFixed(1)}mm</td>
                    <td><b>{worst.toFixed(1)}mm</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="muted">※ 代表サイズ(A50/B40/DBL20)。実運用は一覧タブの各フレーム寸法で再計算されます。</div>
        </div>
      </div>

      <div className={tab==='import'?'':'hidden'}>
        <div className="card">
          <div>CSVを選択（例: ブランド/型, 形状, A, B, DBL, SKU, カラー, 在庫, 発注）</div>
          <input type="file" accept=".csv,text/csv" onChange={async (e)=>{
            const file = e.target.files?.[0]; if(!file) return;
            const text = await file.text();
            const { rows: parsed, summary } = parseFramesCsv(text);
            if(parsed.length) setFrames(prev=>[...prev, ...parsed]);
            setImportSummary(summary);
          }}/>
          {importSummary && <pre className="muted">{importSummary}</pre>}
        </div>
      </div>

      <div className={tab==='add'?'':'hidden'}>
        <div className="card" style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))', gap:12}}>
          <QuickAdd onAdd={(f)=> setFrames(prev=>[...prev, f]) }/>
        </div>
      </div>

      <div className={tab==='settings'?'':'hidden'}>
        <div className="card">
          <div>店舗名 <input type="text" value={storeName} onChange={e=>setStoreName(e.target.value)} /></div>
          <div style={{marginTop:8}}>店舗ロゴ（画像） <input type="file" accept="image/*" onChange={(e)=>{
            const f = e.target.files?.[0]; if(!f) return;
            const fr = new FileReader(); fr.onload=()=>setLogo(String(fr.result)); fr.readAsDataURL(f);
          }}/></div>
          {logo && <div style={{marginTop:8}}><img src={logo} style={{height:64}}/></div>}
          <div className="muted" style={{marginTop:8}}>PDFのヘッダに店舗名/ロゴを反映します。</div>
        </div>
      </div>
    </div>
  );
}

function QuickAdd({onAdd}:{onAdd:(f:Frame)=>void}){
  const [brand,setBrand]=useState('');
  const [A,setA]=useState(48);
  const [B,setB]=useState(40);
  const [DBL,setDBL]=useState(20);
  const [sku,setSku]=useState('');
  const [color,setColor]=useState('');
  const [stock,setStock]=useState(1);
  return (
    <div style={{gridColumn:'1 / -1'}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(140px,1fr))',gap:12}}>
        <div><div className="muted">ブランド/型</div><input value={brand} onChange={e=>setBrand(e.target.value)}/></div>
        <div><div className="muted">A</div><input type="number" value={A} onChange={e=>setA(parseFloat(e.target.value))}/></div>
        <div><div className="muted">B</div><input type="number" value={B} onChange={e=>setB(parseFloat(e.target.value))}/></div>
        <div><div className="muted">DBL</div><input type="number" value={DBL} onChange={e=>setDBL(parseFloat(e.target.value))}/></div>
        <div><div className="muted">SKU</div><input value={sku} onChange={e=>setSku(e.target.value)}/></div>
        <div><div className="muted">カラー</div><input value={color} onChange={e=>setColor(e.target.value)}/></div>
        <div><div className="muted">在庫</div><input type="number" value={stock} onChange={e=>setStock(parseFloat(e.target.value))}/></div>
      </div>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button className="btn" onClick={()=> onAdd({ id: Math.random().toString(36).slice(2), brand, A, B, DBL, sku, color, stock })}>追加</button>
      </div>
    </div>
  );
}
