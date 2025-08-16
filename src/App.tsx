import React, { useState } from "react";
import { Pencil } from "lucide-react";
import logo from "./assets/logo.png";

interface StockInfo {
  id: string;
  brand: string;
  model: string;
  color: string;
  stock: number;
  reorder: boolean;
}

export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbed = urlParams.get("embed") === "1";

  const [stockData, setStockData] = useState<StockInfo[]>([
    { id: "F001", brand: "AO ラウンド", model: "A100", color: "ブラック", stock: 5, reorder: false },
    { id: "F002", brand: "クラシック", model: "T200", color: "ブラウン", stock: 2, reorder: true },
  ]);

  const [search, setSearch] = useState("");

  const handleEdit = (id: string, field: keyof StockInfo, value: string | number | boolean) => {
    setStockData(prev =>
      prev.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  return (
    <div className="min-h-screen p-6" style={{background:"linear-gradient(180deg, #fff7fb 0%, #fef6f8 35%, #f5fbff 100%)"}}>
      {!isEmbed && (
        <header className="flex items-center gap-8 mb-6">
          <img src={logo} alt="logo" style={{height:40}} />
          <h1 style={{fontWeight:800, color:"#be123c"}}>アオイノメガネ フレームセレクター</h1>
        </header>
      )}

      <input
        type="text"
        placeholder="🔎 ブランド / 型番で検索…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{width:"100%", marginBottom:12, padding:"10px 12px", borderRadius:12, border:"1px solid #e5e7eb"}}
      />

      <div style={{display:"grid", gap:12}}>
        {stockData
          .filter(item => item.brand.includes(search) || item.model.includes(search))
          .map(item => (
          <div key={item.id} style={{background:"#fff", padding:16, borderRadius:20, boxShadow:"0 8px 20px rgba(0,0,0,.06)", display:"flex", justifyContent:"space-between", alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700}}>{item.brand} {item.model}</div>
              <div style={{color:"#64748b", fontSize:12}}>{item.color}</div>
              <div style={{fontSize:12}}>在庫: {item.stock}本</div>
              {item.reorder && <div style={{fontSize:12, color:"#ef4444"}}>発注が必要です</div>}
            </div>
            <div style={{display:"flex", gap:8}}>
              <button onClick={() => handleEdit(item.id, "stock", item.stock + 1)} style={{padding:"6px 10px", background:"#ecfdf5", borderRadius:8}}>＋</button>
              <button onClick={() => handleEdit(item.id, "stock", Math.max(0, item.stock - 1))} style={{padding:"6px 10px", background:"#fef2f2", borderRadius:8}}>－</button>
              <button onClick={() => handleEdit(item.id, "reorder", !item.reorder)} style={{padding:6, background:"#fffbeb", borderRadius:8}}><Pencil size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
