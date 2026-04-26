import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search, X, ChevronLeft, ChevronRight, ChevronDown, SlidersHorizontal,
  Loader2, Package, Boxes, Hammer, FileText, Briefcase,
  Coins, CheckCircle2, AlertCircle, Send,
} from "lucide-react";
import { Dialog, DialogContent, DialogClose } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PDFDocument } from "pdf-lib";

/* ─── Types ─── */
interface PaketData {
  id: number;
  paket: string;
  pagu: number;
  satuanKerja: string;
  kldi: string;
  idKldi: string;
  metode: string;
  idMetode: number;
  lokasi: string;
  idlokasi: number;
  idsLokasi: string;
  pemilihan: string;
  idBulan: number;
  jenisPengadaan: string;
  idJenisPengadaan: number;
  sumberDana: string;
  isPDN: boolean;
  isUMK: boolean;
  idSatker: number;
  id_referensi: number;
  pds: boolean;
}
interface ApiResponse { recordsTotal: number; recordsFiltered: number; data: PaketData[] }

interface CookForm {
  id_pengaduan: string;
  pengirim: string;
  email_pengirim: string;
  tanggal_pengaduan: string;
  kode_paket: string;
  uraian_pengaduan: string;
  email_instansi_klpd: string;
  sumber_pengaduan: string;
  no_surat_keluar_apip: string;
  files: File[];
}

const EMPTY_COOK_FORM: CookForm = {
  id_pengaduan: "",
  pengirim: "",
  email_pengirim: "",
  tanggal_pengaduan: "",
  kode_paket: "",
  uraian_pengaduan: "",
  email_instansi_klpd: "",
  sumber_pengaduan: "",
  no_surat_keluar_apip: "Email Sekretaris PPH",
  files: [],
};

const SUMBER_OPTIONS = [
  "Aplikasi Pengaduan",
  "Sumber: E-Office 2026",
  "Sumber: SP4N LAPOR",
];

const A4 = { width: 595.28, height: 841.89 };
const PDF_MARGIN = 36;

const readAsArrayBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Gagal membaca gambar"));
    image.src = src;
  });

const dataUrlToBytes = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

async function imageFileToJpegBytes(file: File) {
  const image = await loadImage(await readAsDataUrl(file));
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser tidak bisa memproses gambar");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  return dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92));
}

async function buildAttachmentPdf(files: File[]) {
  if (!files.length) return null;

  const outputPdf = await PDFDocument.create();

  for (const file of files) {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      const sourcePdf = await PDFDocument.load(await readAsArrayBuffer(file));
      const pages = await outputPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
      pages.forEach(page => outputPdf.addPage(page));
      continue;
    }

    if (file.type.startsWith("image/")) {
      const image = await outputPdf.embedJpg(await imageFileToJpegBytes(file));
      const page = outputPdf.addPage([A4.width, A4.height]);
      const maxWidth = A4.width - PDF_MARGIN * 2;
      const maxHeight = A4.height - PDF_MARGIN * 2;
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: (A4.width - width) / 2,
        y: (A4.height - height) / 2,
        width,
        height,
      });
      continue;
    }

    throw new Error(`Format file tidak didukung: ${file.name}`);
  }

  const bytes = await outputPdf.save();
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

  return new File(
    [arrayBuffer],
    "Lampiran Pengaduan.pdf",
    { type: "application/pdf" },
  );
}

/* ─── Constants ─── */
const ITEMS   = 20;
const CATS = [
  { id: "",  label: "Semua",       icon: Package  },
  { id: "1", label: "Barang",      icon: Boxes    },
  { id: "2", label: "Konstruksi",  icon: Hammer   },
  { id: "3", label: "Konsultansi", icon: FileText  },
  { id: "4", label: "Jasa Lainnya",icon: Briefcase },
];
const CARD_COLORS: Record<string,string> = {
  "Barang":               "from-sky-100 to-blue-200",
  "Pekerjaan Konstruksi": "from-amber-100 to-orange-200",
  "Jasa Konsultansi":     "from-violet-100 to-purple-200",
  "Jasa Lainnya":         "from-emerald-100 to-green-200",
};
const BADGE_COLORS: Record<string,string> = {
  "Barang":               "bg-sky-100 text-sky-800",
  "Pekerjaan Konstruksi": "bg-orange-100 text-orange-800",
  "Jasa Konsultansi":     "bg-violet-100 text-violet-800",
  "Jasa Lainnya":         "bg-emerald-100 text-emerald-800",
};

/* ─── Helpers ─── */
const fmt = (n: number) =>
  n >= 1e9 ? `Rp ${(n/1e9).toFixed(1)} M`
  : n >= 1e6 ? `Rp ${(n/1e6).toFixed(1)} jt`
  : new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);

const YEARS = ["2022","2023","2024","2025","2026"];

const SIRUP_API_BASE_URL = (import.meta.env.VITE_SIRUP_API_BASE_URL || "https://obtuse-serve-steersman.ngrok-free.dev").replace(/\/$/, "");
const N8N_WEBHOOK_URL = "https://obtuse-serve-steersman.ngrok-free.dev/webhook/9e05947a-5e2c-4b12-970a-689091127319";

/* ─── API ─── */
function buildParams(q: string, cat: string, p: number, year: string) {
  const cols = ["","paket","pagu","jenisPengadaan","isPDN","isUMK","metode","pemilihan","kldi","satuanKerja","lokasi","id"];
  const ps: Record<string,string> = {
    tahunAnggaran: year, jenisPengadaan:cat, metodePengadaan:"",
    minPagu:"",maxPagu:"",bulan:"",lokasi:"",kldi:"",pdn:"",ukm:"",draw:"1",
    "order[0][column]":"5","order[0][dir]":"DESC",
    start:(p*ITEMS).toString(), length:ITEMS.toString(),
    "search[value]":q,"search[regex]":"false",_:Date.now().toString(),
  };
  cols.forEach((d,i)=>{
    ps[`columns[${i}][data]`]=d; ps[`columns[${i}][name]`]="";
    ps[`columns[${i}][searchable]`]=i===0?"false":"true";
    ps[`columns[${i}][orderable]`]=i===0?"false":"true";
    ps[`columns[${i}][search][value]`]=""; ps[`columns[${i}][search][regex]`]="false";
  });
  return new URLSearchParams(ps);
}

/* ─── Component ─── */
export default function App() {
  const [inputKw,  setInputKw]  = useState("");
  const [inputLoc, setInputLoc] = useState("");
  const [query,    setQuery]    = useState("");
  const [cat,      setCat]      = useState("");
  const [year,     setYear]     = useState("2026");
  const [results,  setResults]  = useState<PaketData[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(0);
  const [selected, setSelected] = useState<PaketData|null>(null);
  const [toast, setToast] = useState<{type:"loading"|"success"|"error"; message:string; id:number}|null>(null);
  const [sending, setSending] = useState(false);
  const [showCookForm, setShowCookForm] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [cookForm, setCookForm] = useState<CookForm>({...EMPTY_COOK_FORM});
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const cookFormRef = useRef<HTMLDivElement>(null);

  const pages = Math.ceil(total / ITEMS);

  const fetchData = useCallback(async(q:string,c:string,p:number,yr:string)=>{
    setLoading(true);
    try {
      const res = await fetch(`${SIRUP_API_BASE_URL}/api/sirup/caripaketctr/search?${buildParams(q,c,p,yr)}`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if(!res.ok) throw new Error();
      const json:ApiResponse = await res.json();
      setResults(json.data||[]); setTotal(json.recordsFiltered||0);
    } catch { setResults([]); setTotal(0); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ fetchData("","",0,"2026"); },[fetchData]);

  const handleSearch = (e:React.FormEvent) => {
    e.preventDefault();
    const q = [inputKw,inputLoc].filter(Boolean).join(" ");
    setQuery(q); setPage(0); fetchData(q,cat,0,year);
  };
  const handleCat = (c:string) => { setCat(c); setPage(0); fetchData(query,c,0,year); };
  const handlePage = (p:number) => { setPage(p); fetchData(query,cat,p,year); window.scrollTo({top:0,behavior:"smooth"}); };
  const handleYear = (yr:string) => { setYear(yr); setPage(0); fetchData(query,cat,0,yr); };
  const showToast = (type:"loading"|"success"|"error", message:string) => {
    if(toastTimer.current) clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({type, message, id});
    if(type !== "loading") {
      toastTimer.current = setTimeout(()=> setToast(null), 3500);
    }
  };

  const updateCookForm = <K extends keyof CookForm>(field: K, value: CookForm[K]) => {
    setCookForm(prev => ({ ...prev, [field]: value }));
  };

  const resetCookForm = () => {
    setCookForm({...EMPTY_COOK_FORM});
    setShowCookForm(false);
    setShowOptional(false);
  };

  const sendToWebhook = async (pkg: PaketData) => {
    // validate required fields
    if (!cookForm.id_pengaduan || !cookForm.pengirim || !cookForm.email_pengirim || !cookForm.tanggal_pengaduan || !cookForm.kode_paket || !cookForm.uraian_pengaduan) {
      showToast("error", "Harap isi semua field yang wajib");
      return;
    }
    // validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cookForm.email_pengirim)) {
      showToast("error", "Format email pengirim tidak valid");
      return;
    }

    const payload = {
      ...pkg,
      pengaduan: {
        id_pengaduan: cookForm.id_pengaduan,
        pengirim: cookForm.pengirim,
        email_pengirim: cookForm.email_pengirim,
        tanggal_pengaduan: cookForm.tanggal_pengaduan,
        kode_paket: cookForm.kode_paket,
        uraian_pengaduan: cookForm.uraian_pengaduan,
        ...(cookForm.email_instansi_klpd && { email_instansi_klpd: cookForm.email_instansi_klpd }),
        ...(cookForm.sumber_pengaduan && { sumber_pengaduan: cookForm.sumber_pengaduan }),
        no_surat_keluar_apip: cookForm.no_surat_keluar_apip,
      },
    };

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);

    setSending(true);
    showToast("loading", cookForm.files.length > 0
      ? `Memproses ${cookForm.files.length} lampiran dan menunggu email selesai...`
      : `Mengirim paket #${pkg.id}. Menunggu email selesai dikirim...`
    );

    try {
      const formData = new FormData();
      formData.append("payload", JSON.stringify({
        ...payload,
        attachmentCount: cookForm.files.length,
        attachmentNames: cookForm.files.map(file => file.name),
      }));

      const attachmentPdf = await buildAttachmentPdf(cookForm.files);
      if (attachmentPdf) {
        formData.append("file", attachmentPdf);
      }

      const res = await fetch(N8N_WEBHOOK_URL, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") || "";
      const responseBody = contentType.includes("application/json")
        ? await res.json().catch(() => null)
        : await res.text().catch(() => "");

      if (!res.ok) {
        const message = typeof responseBody === "object" && responseBody && "message" in responseBody
          ? String(responseBody.message)
          : `HTTP ${res.status}`;
        throw new Error(message);
      }

      const successMessage = typeof responseBody === "object" && responseBody && "message" in responseBody
        ? String(responseBody.message)
        : `Email paket #${pkg.id} berhasil dikirim`;

      showToast("success", successMessage);
      resetCookForm();
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      showToast("error", isTimeout
        ? `Email paket #${pkg.id} belum memberi balasan setelah 2 menit`
        : `Gagal mengirim email paket #${pkg.id}`
      );
      console.error("Webhook error:", err);
    } finally {
      window.clearTimeout(timeout);
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#222]" style={{fontFamily:"'Inter',sans-serif"}}>

      {/* ══════════ HEADER ══════════ */}
      <header className="sticky top-0 z-40 bg-white">

        {/* Single row: logo + search pill */}
        <div className="border-b border-[#ebebeb] px-6 md:px-10 flex items-center gap-5 py-3">
          {/* Logo */}
          <div
            className="flex items-center gap-1.5 cursor-pointer text-[#FF385C] shrink-0"
            onClick={()=>{ setInputKw(""); setInputLoc(""); setQuery(""); setCat(""); setYear("2026"); fetchData("","",0,"2026"); }}
          >
            <Search strokeWidth={3} size={24} />
            <div className="flex flex-col -space-y-1">
              <span className="hidden md:inline font-bold text-[20px] tracking-tight leading-tight">inaproc</span>
              <span className="hidden md:inline text-[8px] font-medium text-[#717171] ml-0.5 tracking-wide">by dave</span>
            </div>
          </div>

          {/* Search pill */}
          <form
            onSubmit={handleSearch}
            className="flex items-center flex-1 bg-white border border-[#ddd] rounded-full shadow-md hover:shadow-lg transition-shadow divide-x divide-[#ddd] overflow-hidden"
          >
            {/* Nama Paket */}
            <div className="flex-1 px-5 py-3 cursor-text min-w-0">
              <div className="text-[11px] font-bold text-[#222] mb-0.5">Cari Paket</div>
              <input
                type="text"
                value={inputKw}
                onChange={e=>setInputKw(e.target.value)}
                placeholder="Nama paket, instansi..."
                className="w-full bg-transparent outline-none text-[14px] text-[#555] placeholder:text-[#aaa] min-w-0"
              />
            </div>

            {/* Tahun */}
            <div className="relative hidden md:flex items-center shrink-0 divide-x divide-[#ddd]">
              <div className="flex flex-col px-5 py-3 w-[120px]">
                <span className="text-[11px] font-bold text-[#222] mb-0.5">Tahun</span>
                <select
                  value={year}
                  onChange={e => handleYear(e.target.value)}
                  className="bg-transparent outline-none text-[14px] text-[#555] font-medium cursor-pointer appearance-none w-full"
                >
                  {YEARS.map(yr => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lokasi */}
            <div className="hidden md:block px-5 py-3 w-[170px] shrink-0 cursor-text">
              <div className="text-[11px] font-bold text-[#222] mb-0.5">Lokasi</div>
              <input
                type="text"
                value={inputLoc}
                onChange={e=>setInputLoc(e.target.value)}
                placeholder="Semua lokasi"
                className="w-full bg-transparent outline-none text-[14px] text-[#555] placeholder:text-[#aaa]"
              />
            </div>

            {/* Search btn */}
            <div className="pr-2 pl-2">
              <button
                type="submit"
                className="bg-[#FF385C] hover:bg-[#e0334f] text-white rounded-full w-11 h-11 flex items-center justify-center transition-colors shadow-sm"
              >
                {loading ? <Loader2 size={18} className="animate-spin"/> : <Search size={18} strokeWidth={2.5}/>}
              </button>
            </div>
          </form>
        </div>

        {/* Row-3: Category tabs + filters toggle */}
        <div className="border-t border-[#ebebeb] px-6 md:px-10 flex items-center justify-between gap-4 overflow-hidden">
          <div className="flex items-center gap-0 overflow-x-auto scrollbar-none">
            {CATS.map(c => {
              const Icon = c.icon;
              const active = cat===c.id;
              return (
                <button
                  key={c.id}
                  onClick={()=>handleCat(c.id)}
                  className={`flex flex-col items-center gap-1.5 px-5 py-3.5 shrink-0 border-b-2 transition-all
                    ${active ? "border-[#222] text-[#222]" : "border-transparent text-[#717171] hover:text-[#222] hover:border-[#ddd]"}`}
                >
                  <Icon size={24} strokeWidth={active?2.5:1.8} />
                  <span className="text-[12px] font-medium whitespace-nowrap">{c.label}</span>
                </button>
              );
            })}
          </div>

          {/* Filters button */}
          <div className="shrink-0 hidden md:flex items-center gap-3">
            <button className="flex items-center gap-2 border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] font-medium hover:shadow-md transition-shadow whitespace-nowrap">
              <SlidersHorizontal size={16} /> Filters
            </button>
          </div>
        </div>
      </header>

      {/* ══════════ MAIN ══════════ */}
      <main className="flex-1 px-6 md:px-10 py-8">

        {/* Count */}
        {!loading && total > 0 && (
          <p className="text-[13px] text-[#717171] mb-6 font-medium">
            {total.toLocaleString("id-ID")} paket ditemukan{query ? ` · "${query}"` : ""}
          </p>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 gap-y-8">
            {Array.from({length:8}).map((_,i)=>(
              <div key={i} className="animate-pulse">
                <div className="bg-[#ebebeb] rounded-2xl aspect-[3/2] mb-3"/>
                <div className="space-y-2">
                  <div className="bg-[#ebebeb] h-3 rounded w-4/5"/>
                  <div className="bg-[#f5f5f5] h-3 rounded w-3/5"/>
                  <div className="bg-[#f5f5f5] h-3 rounded w-1/3"/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && results.length===0 && (
          <div className="py-28 flex flex-col items-center text-center">
            <Search size={48} className="text-[#ccc] mb-4"/>
            <h2 className="text-[22px] font-bold mb-2">Tidak ada paket ditemukan</h2>
            <p className="text-[#717171] text-[15px]">Coba ubah kata kunci atau pilih kategori lain.</p>
          </div>
        )}

        {/* Grid */}
        {!loading && results.length>0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 gap-y-10">
            {results.map((pkg) => {
              const color = CARD_COLORS[pkg.jenisPengadaan] ?? "from-slate-100 to-slate-200";
              return (
                <article
                  key={pkg.id}
                  id={`paket-${pkg.id}`}
                  className="group cursor-pointer select-none"
                  onClick={()=>setSelected(pkg)}
                >
                  {/* ── Thumbnail block ── */}
                  <div className={`relative rounded-2xl aspect-[3/2] overflow-hidden bg-gradient-to-br ${color} mb-3 flex flex-col justify-between p-4`}>
                    {/* Center: Package name */}
                    <div className="flex-1 flex items-center justify-center px-2 py-2">
                      <p className="text-[13px] font-semibold text-[#333] text-center leading-snug line-clamp-3 tracking-tight drop-shadow-sm">
                        {pkg.paket}
                      </p>
                    </div>

                    {/* Bottom: Category pill */}
                    <div className={`self-start text-[11px] font-semibold px-2.5 py-1 rounded-lg shadow-sm bg-white/80 backdrop-blur ${BADGE_COLORS[pkg.jenisPengadaan]??""}`}>
                      {pkg.jenisPengadaan}
                    </div>
                  </div>

                  {/* ── Card text ── */}
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[14px] text-[#222] line-clamp-1 leading-snug">
                      {pkg.kldi}
                    </p>
                    <p className="text-[13px] text-[#717171] line-clamp-1">{pkg.lokasi}</p>
                    <p className="text-[13px] text-[#717171]">{pkg.pemilihan}</p>
                    <p className="text-[14px] text-[#222] mt-1.5">
                      <span className="font-semibold">{fmt(pkg.pagu)}</span>
                      <span className="font-normal text-[#717171]"> total pagu</span>
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && pages>1 && (
          <div className="mt-16 pt-8 border-t border-[#ebebeb] flex flex-col items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={()=>page>0 && handlePage(page-1)}
                disabled={page===0}
                className="w-10 h-10 rounded-full border border-[#ddd] flex items-center justify-center hover:shadow-md transition disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronLeft size={16}/></button>

              {Array.from({length:Math.min(5,pages)}).map((_,idx)=>{
                let p=idx;
                if(pages>5&&page>=3){ p=page-2+idx; if(p>=pages) p=pages-5+idx; }
                const active=page===p;
                return(
                  <button key={p} onClick={()=>handlePage(p)}
                    className={`w-10 h-10 rounded-full text-[14px] font-medium transition flex items-center justify-center
                      ${active?"bg-[#222] text-white":"text-[#222] hover:bg-[#f5f5f5]"}`}
                  >{p+1}</button>
                );
              })}

              <button
                onClick={()=>page<pages-1 && handlePage(page+1)}
                disabled={page>=pages-1}
                className="w-10 h-10 rounded-full border border-[#ddd] flex items-center justify-center hover:shadow-md transition disabled:opacity-30 disabled:cursor-not-allowed"
              ><ChevronRight size={16}/></button>
            </div>
            <p className="text-[12px] text-[#717171]">
              Halaman {page+1} dari {pages.toLocaleString("id-ID")} · {total.toLocaleString("id-ID")} paket
            </p>
          </div>
        )}
      </main>

      {/* ══════════ DETAIL MODAL ══════════ */}
      <Dialog open={!!selected} onOpenChange={open=>{ if(!open){ setSelected(null); resetCookForm(); } }}>
        <DialogContent className="max-w-2xl w-full p-0 rounded-2xl overflow-hidden border-none shadow-2xl bg-white">
          {selected && (
            <>
              {/* Close */}
              <DialogClose className="absolute top-4 left-4 z-50 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center hover:scale-105 transition">
                <X size={15}/>
              </DialogClose>

              {/* Banner */}
              <div className={`w-full h-44 bg-gradient-to-br ${CARD_COLORS[selected.jenisPengadaan]??"from-slate-100 to-slate-200"} flex items-end px-6 pb-4`}>
                <span className={`text-[12px] font-semibold px-3 py-1 rounded-lg shadow-sm bg-white/80 backdrop-blur ${BADGE_COLORS[selected.jenisPengadaan]??""}`}>
                  {selected.jenisPengadaan}
                </span>
              </div>

              <ScrollArea className="max-h-[70vh]">
                <div className="p-8 space-y-6">

                  {/* Title */}
                  <div>
                    <h2 className="text-[20px] font-bold leading-snug text-[#222] mb-1.5">{selected.paket}</h2>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${BADGE_COLORS[selected.jenisPengadaan]??"bg-slate-100 text-slate-700"}`}>
                        {selected.jenisPengadaan}
                      </span>
                      {selected.isPDN && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">PDN</span>}
                      {selected.isUMK && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">UMK</span>}
                      {selected.pds && <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">PDS</span>}
                    </div>
                  </div>

                  {/* Pagu highlight card */}
                  <div className={`rounded-2xl bg-gradient-to-br ${CARD_COLORS[selected.jenisPengadaan]??"from-slate-50 to-slate-100"} p-5`}>
                    <p className="text-[12px] font-semibold text-[#555] uppercase tracking-wider mb-1 flex items-center gap-1.5"><Coins size={13}/>Pagu Anggaran</p>
                    <p className="text-[28px] font-extrabold text-[#222] tracking-tight">{fmtFull(selected.pagu)}</p>
                    <p className="text-[13px] text-[#666] mt-0.5">Sumber Dana: <span className="font-semibold">{selected.sumberDana}</span></p>
                  </div>

                  <hr className="border-[#ebebeb]"/>

                  {/* Detail rows — semua field */}
                  <div className="space-y-0 divide-y divide-[#f5f5f5]">
                    {([
                      { label: "ID Paket",           value: selected.id.toString() },
                      { label: "Nama Paket",          value: selected.paket },
                      { label: "Jenis Pengadaan",     value: `${selected.jenisPengadaan} (ID: ${selected.idJenisPengadaan})` },
                      { label: "Metode",              value: `${selected.metode} (ID: ${selected.idMetode})` },
                      { label: "Instansi (KLDI)",     value: `${selected.kldi} — Kode: ${selected.idKldi}` },
                      { label: "Satuan Kerja",        value: selected.satuanKerja },
                      { label: "ID Satker",           value: selected.idSatker.toString() },
                      { label: "Lokasi",              value: selected.lokasi },
                      { label: "Jadwal Pemilihan",    value: `${selected.pemilihan} (Bulan ke-${selected.idBulan})` },
                      { label: "Sumber Dana",         value: selected.sumberDana },
                      { label: "Produk Dalam Negeri", value: selected.isPDN ? "✅ Ya" : "❌ Tidak" },
                      { label: "Usaha Mikro & Kecil", value: selected.isUMK ? "✅ Ya" : "❌ Tidak" },
                      { label: "PDS",                 value: selected.pds ? "✅ Ya" : "❌ Tidak" },
                      { label: "ID Referensi",        value: selected.id_referensi.toString() },
                    ] as { label: string; value: string }[]).map(({ label, value }) => (
                      <div key={label} className="flex justify-between items-start gap-4 py-3">
                        <span className="text-[13px] text-[#717171] shrink-0 w-[150px]">{label}</span>
                        <span className="text-[13px] font-medium text-[#222] text-right">{value}</span>
                      </div>
                    ))}
                  </div>

                  <hr className="border-[#ebebeb]"/>

                  {/* Footer CTA */}
                  {!showCookForm ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[18px] font-bold text-[#222]">{fmtFull(selected.pagu)}</p>
                      <p className="text-[12px] text-[#717171]">Total pagu anggaran</p>
                    </div>
                    <button
                      onClick={()=>{ setShowCookForm(true); setTimeout(()=>cookFormRef.current?.scrollIntoView({behavior:"smooth",block:"start"}), 100); }}
                      className="bg-[#FF385C] hover:bg-[#e0334f] text-white text-[14px] font-semibold px-6 py-3 rounded-xl transition-colors flex items-center gap-2"
                    >
                      <Send size={16} /> Cook
                    </button>
                  </div>
                  ) : (
                  <div ref={cookFormRef} className="space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[16px] font-bold text-[#222] flex items-center gap-2">
                        <Send size={16} className="text-[#FF385C]" /> Form Pengaduan
                      </h3>
                      <button onClick={()=>setShowCookForm(false)} className="text-[13px] text-[#717171] hover:text-[#222] transition">
                        Batal
                      </button>
                    </div>

                    {/* Required fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">ID Pengaduan <span className="text-red-500">*</span></label>
                        <input type="text" value={cookForm.id_pengaduan} onChange={e=>updateCookForm("id_pengaduan", e.target.value)} placeholder="Masukkan ID pengaduan" className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">Pengirim <span className="text-red-500">*</span></label>
                        <input type="text" value={cookForm.pengirim} onChange={e=>updateCookForm("pengirim", e.target.value)} placeholder="Nama pengirim" className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">Email Pengirim <span className="text-red-500">*</span></label>
                        <input type="email" value={cookForm.email_pengirim} onChange={e=>updateCookForm("email_pengirim", e.target.value)} placeholder="email@contoh.com" className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">Tanggal Pengaduan <span className="text-red-500">*</span></label>
                        <input type="date" value={cookForm.tanggal_pengaduan} onChange={e=>updateCookForm("tanggal_pengaduan", e.target.value)} className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">Kode Tender <span className="text-red-500">*</span></label>
                        <input type="text" value={cookForm.kode_paket} onChange={e=>updateCookForm("kode_paket", e.target.value)} placeholder="Kode tender" className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition bg-[#f9f9f9]" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[12px] font-semibold text-[#555] mb-1 block">Uraian Pengaduan <span className="text-red-500">*</span></label>
                      <textarea value={cookForm.uraian_pengaduan} onChange={e=>updateCookForm("uraian_pengaduan", e.target.value)} placeholder="Tuliskan uraian pengaduan..." rows={3} className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition resize-none" />
                    </div>

                    <div>
                      <label className="text-[12px] font-semibold text-[#555] mb-1 block">Lampiran (PDF/Foto, bisa banyak)</label>
                      <input 
                        type="file" 
                        multiple
                        accept=".pdf,image/jpeg,image/png,image/webp,image/*" 
                        onChange={e => updateCookForm("files", Array.from(e.target.files || []))}
                        className="w-full border border-[#ddd] rounded-xl px-4 py-2 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[12px] file:font-semibold file:bg-[#FF385C]/10 file:text-[#FF385C] hover:file:bg-[#FF385C]/20 cursor-pointer" 
                      />
                      {cookForm.files.length > 0 && (
                        <ul className="mt-2 space-y-1 text-[12px] text-[#717171]">
                          {cookForm.files.map((file, index) => (
                            <li key={`${file.name}-${index}`} className="truncate">
                              {index + 1}. {file.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-[11px] text-[#aaa] mt-1">Foto akan otomatis dijadikan PDF dan digabung sebelum dikirim.</p>
                    </div>

                    {/* Optional section toggle */}
                    <button type="button" onClick={()=>setShowOptional(!showOptional)} className="flex items-center gap-2 text-[13px] font-semibold text-[#717171] hover:text-[#222] transition w-full">
                      <ChevronDown size={16} className={`transition-transform duration-200 ${showOptional ? "rotate-180" : ""}`} />
                      Data Opsional
                      <div className="flex-1 border-t border-dashed border-[#ddd] ml-2" />
                    </button>

                    {showOptional && (
                    <div className="space-y-4 animate-in slide-in-from-top-2 fade-in duration-200">
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">Email Instansi KLPD</label>
                        <input type="email" value={cookForm.email_instansi_klpd} onChange={e=>updateCookForm("email_instansi_klpd", e.target.value)} placeholder="email@instansi.go.id" className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition" />
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">Sumber Pengaduan</label>
                        <select value={cookForm.sumber_pengaduan} onChange={e=>updateCookForm("sumber_pengaduan", e.target.value)} className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition bg-white cursor-pointer">
                          <option value="">— Pilih sumber —</option>
                          {SUMBER_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">No Surat Keluar APIP</label>
                        <input type="text" value={cookForm.no_surat_keluar_apip} disabled className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-[14px] outline-none bg-[#f5f5f5] text-[#999] cursor-not-allowed" />
                        <p className="text-[11px] text-[#aaa] mt-1">Form dinonaktifkan sementara</p>
                      </div>
                    </div>
                    )}

                    {/* Submit */}
                    <button onClick={()=>sendToWebhook(selected)} disabled={sending} className="w-full bg-[#FF385C] hover:bg-[#e0334f] disabled:bg-[#ffb3c1] text-white text-[14px] font-semibold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm">
                      {sending ? (
                        <><Loader2 size={16} className="animate-spin" /> Menunggu email selesai...</>
                      ) : (
                        <><Send size={16} /> Kirim Email</>
                      )}
                    </button>
                  </div>
                  )}

                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════ TOAST NOTIFICATION ══════════ */}
      {toast && (
        <div
          key={toast.id}
          className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border text-[14px] font-medium transition-all animate-in slide-in-from-bottom-4 fade-in duration-300
            ${toast.type === "loading" ? "bg-white border-[#ddd] text-[#222]" : ""}
            ${toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : ""}
            ${toast.type === "error" ? "bg-red-50 border-red-200 text-red-800" : ""}`}
        >
          {toast.type === "loading" && <Send size={16} className="animate-pulse text-[#FF385C]" />}
          {toast.type === "success" && <CheckCircle2 size={16} className="text-emerald-600" />}
          {toast.type === "error" && <AlertCircle size={16} className="text-red-600" />}
          <span>{toast.message}</span>
          <button onClick={()=>setToast(null)} className="ml-2 opacity-50 hover:opacity-100 transition">
            <X size={14} />
          </button>
        </div>
      )}
      {/* ══════════ FOOTER ══════════ */}
      <footer className="mt-auto border-t border-[#ebebeb] bg-[#fafafa]">
        <div className="max-w-screen-2xl mx-auto px-6 md:px-10 py-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-[13px] text-[#717171] text-center md:text-left">
            © 2026 • Data bersumber dari <a href="https://sirup.inaproc.id" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FF385C] hover:text-[#e0334f] transition-colors">Sistem Informasi Rencana Umum Pengadaan (SiRUP) LKPP</a>.
          </div>
          <div className="text-[13px] text-[#717171] flex items-center gap-1.5">
            Dikembangkan oleh 
            <a href="mailto:daffaariftama@gmail.com" className="font-semibold text-[#222] hover:text-[#FF385C] transition-colors">
              Daffa Ariftama
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
