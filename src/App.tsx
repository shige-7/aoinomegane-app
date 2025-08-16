
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
    <div className="min-h-screen p-6 bg-gradient-to-b from-pink-50 via-rose-50 to-sky-50">
      {!isEmbed && (
        <header className="flex items-center gap-3 mb-6">
          <img src={logo} alt="logo" className="h-10" />
          <h1 className="text-xl font-bold text-rose-600">アオイノメガネ フレームセレクター</h1>
        </header>
      )}

      <input
        type="text"
        placeholder="🔎 ブランド / 型番で検索…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full mb-4 p-2 border rounded-lg"
      />

      <div className="grid gap-4">
        {stockData
          .filter(item => item.brand.includes(search) || item.model.includes(search))
          .map(item => (
          <div key={item.id} className="bg-white p-4 rounded-2xl shadow flex justify-between items-center">
            <div>
              <p className="font-semibold">{item.brand} {item.model}</p>
              <p className="text-sm text-gray-500">{item.color}</p>
              <p className="text-sm">在庫: {item.stock}本</p>
              {item.reorder && <p className="text-xs text-red-500">発注が必要です</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleEdit(item.id, "stock", item.stock + 1)}
                className="px-2 py-1 bg-green-100 rounded"
              >＋</button>
              <button
                onClick={() => handleEdit(item.id, "stock", Math.max(0, item.stock - 1))}
                className="px-2 py-1 bg-red-100 rounded"
              >－</button>
              <button
                onClick={() => handleEdit(item.id, "reorder", !item.reorder)}
                className="p-1 bg-yellow-100 rounded"
              ><Pencil size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
