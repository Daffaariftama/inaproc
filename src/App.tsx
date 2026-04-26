import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search, X, ChevronLeft, ChevronRight, ChevronDown, SlidersHorizontal,
  Loader2, Package, Boxes, Hammer, FileText, Briefcase,
  Coins, CheckCircle2, AlertCircle, Send,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PDFDocument } from "pdf-lib";
import { KLPD_OPTIONS, LOKASI_OPTIONS } from "./data/filterOptions";

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

interface SearchFilters {
  metodePengadaan: string;
  pdn: string;
  ukm: string;
  bulan: string;
  minPagu: string;
  maxPagu: string;
  kldi: string;
  lokasi: string;
}

interface CookForm {
  id_pengaduan: string;
  pengirim: string;
  email_pengirim: string;
  tanggal_pengaduan: string;
  kode_paket: string;
  uraian_pengaduan: string;
  email_instansi_klpd: string;
  email_instansi_klpd_input: string;
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
  email_instansi_klpd_input: "",
  sumber_pengaduan: "",
  no_surat_keluar_apip: "Email Sekretaris PPH",
  files: [],
};

const SUMBER_OPTIONS = [
  "Aplikasi Pengaduan",
  "Sumber: E-Office 2026",
  "Sumber: SP4N LAPOR",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const parseEmailList = (value: string) =>
  value
    .split(/[,\n;\s]+/)
    .map(email => email.trim())
    .filter(Boolean);

const mergeEmailLists = (current: string, incoming: string[]) => {
  const merged = [...parseEmailList(current)];
  for (const email of incoming) {
    if (!merged.some(existing => existing.toLowerCase() === email.toLowerCase())) merged.push(email);
  }
  return merged.join(",");
};

const parseMultiValue = (value: string) =>
  value.split(",").map(item => item.trim()).filter(Boolean);
const joinMultiValue = (items: string[]) => items.join(", ");
const addMultiValue = (current: string, option: string) => {
  const values = parseMultiValue(current);
  if (!values.some(value => value.toLowerCase() === option.toLowerCase())) values.push(option);
  return joinMultiValue(values);
};
const removeMultiValue = (current: string, option: string) =>
  joinMultiValue(parseMultiValue(current).filter(value => value.toLowerCase() !== option.toLowerCase()));
const getSuggestions = (options: readonly string[], input: string, selected: string, limit = 8) => {
  const query = input.trim().toLowerCase();
  if (!query) return [];
  const picked = new Set(parseMultiValue(selected).map(item => item.toLowerCase()));
  return options
    .filter(option => !picked.has(option.toLowerCase()) && option.toLowerCase().includes(query))
    .slice(0, limit);
};

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
const EMPTY_FILTERS: SearchFilters = {
  metodePengadaan: "",
  pdn: "",
  ukm: "",
  bulan: "",
  minPagu: "",
  maxPagu: "",
  kldi: "",
  lokasi: "",
};
const METODE_OPTIONS = [
  { id: "9", label: "E-Purchasing" },
  { id: "20", label: "Pembayaran untuk Kontrak Tahun Jamak" },
  { id: "8", label: "Pengadaan Langsung" },
  { id: "7", label: "Penunjukan Langsung" },
  { id: "15", label: "Seleksi" },
  { id: "13", label: "Tender" },
  { id: "14", label: "Tender Cepat" },
];
const BULAN_OPTIONS = [
  { id: "1", label: "Januari" },
  { id: "2", label: "Februari" },
  { id: "3", label: "Maret" },
  { id: "4", label: "April" },
  { id: "5", label: "Mei" },
  { id: "6", label: "Juni" },
  { id: "7", label: "Juli" },
  { id: "8", label: "Agustus" },
  { id: "9", label: "September" },
  { id: "10", label: "Oktober" },
  { id: "11", label: "November" },
  { id: "12", label: "Desember" },
];
const PAGU_PRESETS = [
  { label: "Rp 0 - Rp 100 jt", min: "0", max: "100000000" },
  { label: "Rp 100 jt - Rp 200 jt", min: "100000000", max: "200000000" },
  { label: "Rp 200 jt - Rp 2,5 M", min: "200000000", max: "2500000000" },
  { label: "Rp 2,5 M - Rp 15 M", min: "2500000000", max: "15000000000" },
  { label: "> Rp 15 M", min: "15000000000", max: "" },
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

const onlyDigits = (value: string) => value.replace(/\D/g, "");
const compactNumber = (value: string) => value ? Number(value).toLocaleString("id-ID") : "";
const getOptionLabel = (options: {id:string; label:string}[], id: string) => options.find(option => option.id === id)?.label || id;
const composeSearchQuery = (baseQuery: string, filters: SearchFilters) =>
  [baseQuery, ...parseMultiValue(filters.kldi), ...parseMultiValue(filters.lokasi)].filter(Boolean).join(" ").trim();
const hasAdvancedFilters = (filters: SearchFilters) => Object.values(filters).some(Boolean);
const YEARS = ["2022","2023","2024","2025","2026"];

const SIRUP_API_BASE_URL = (import.meta.env.VITE_SIRUP_API_BASE_URL || "https://obtuse-serve-steersman.ngrok-free.dev").replace(/\/$/, "");
const N8N_WEBHOOK_URL = "https://obtuse-serve-steersman.ngrok-free.dev/webhook/9e05947a-5e2c-4b12-970a-689091127319";

/* ─── API ─── */
function buildParams(q: string, cat: string, p: number, year: string, filters: SearchFilters = EMPTY_FILTERS) {
  const cols = ["","paket","pagu","jenisPengadaan","isPDN","isUMK","metode","pemilihan","kldi","satuanKerja","lokasi","id"];
  const ps: Record<string,string> = {
    tahunAnggaran: year, jenisPengadaan:cat, metodePengadaan:filters.metodePengadaan,
    minPagu:filters.minPagu,maxPagu:filters.maxPagu,bulan:filters.bulan,lokasi:"",kldi:"",pdn:filters.pdn,ukm:filters.ukm,draw:"1",
    "order[0][column]":"5","order[0][dir]":"DESC",
    start:(p*ITEMS).toString(), length:ITEMS.toString(),
    "search[value]":composeSearchQuery(q, filters),"search[regex]":"false",_:Date.now().toString(),
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
  const [filters, setFilters] = useState<SearchFilters>({...EMPTY_FILTERS});
  const [draftFilters, setDraftFilters] = useState<SearchFilters>({...EMPTY_FILTERS});
  const [showFilters, setShowFilters] = useState(false);
  const [klpdInput, setKlpdInput] = useState("");
  const [lokasiInput, setLokasiInput] = useState("");
  const [focusedSuggest, setFocusedSuggest] = useState<"kldi"|"lokasi"|null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const infoBarSentinelRef = useRef<HTMLDivElement>(null);
  const [isInfoBarPinned, setIsInfoBarPinned] = useState(false);
  const [infoBarTop, setInfoBarTop] = useState(0);

  const pages = Math.ceil(total / ITEMS);
  const klpdSuggestions = getSuggestions(KLPD_OPTIONS, klpdInput, draftFilters.kldi);
  const lokasiSuggestions = getSuggestions(LOKASI_OPTIONS, lokasiInput, draftFilters.lokasi);

  const fetchData = useCallback(async(q:string,c:string,p:number,yr:string, flt:SearchFilters = EMPTY_FILTERS)=>{
    setLoading(true);
    try {
      const res = await fetch(`${SIRUP_API_BASE_URL}/api/sirup/caripaketctr/search?${buildParams(q,c,p,yr,flt)}`, {
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if(!res.ok) throw new Error();
      const json:ApiResponse = await res.json();
      setResults(json.data||[]); setTotal(json.recordsFiltered||0);
    } catch { setResults([]); setTotal(0); }
    finally { setLoading(false); }
  },[]);

  useEffect(()=>{ fetchData("","",0,"2026"); },[fetchData]);

  useEffect(() => {
    const updateInfoBarPosition = () => {
      const header = headerRef.current;
      const sentinel = infoBarSentinelRef.current;
      if (!header || !sentinel) return;

      const headerBottom = header.getBoundingClientRect().bottom;
      const nextTop = Math.ceil(headerBottom);
      setInfoBarTop(nextTop);
      setIsInfoBarPinned(sentinel.getBoundingClientRect().top <= nextTop + 6);
    };

    updateInfoBarPosition();
    const resizeObserver = new ResizeObserver(updateInfoBarPosition);
    if (headerRef.current) resizeObserver.observe(headerRef.current);
    window.addEventListener("scroll", updateInfoBarPosition, { passive: true });
    window.addEventListener("resize", updateInfoBarPosition);
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updateInfoBarPosition);
      window.removeEventListener("resize", updateInfoBarPosition);
    };
  }, [showFilters]);

  const handleSearch = (e:React.FormEvent) => {
    e.preventDefault();
    const q = [inputKw,inputLoc].filter(Boolean).join(" ");
    setQuery(q); setPage(0); fetchData(q,cat,0,year,filters);
  };
  const handleCat = (c:string) => { setCat(c); setPage(0); fetchData(query,c,0,year,filters); };
  const handlePage = (p:number) => { setPage(p); fetchData(query,cat,p,year,filters); window.scrollTo({top:0,behavior:"smooth"}); };
  const handleYear = (yr:string) => { setYear(yr); setPage(0); fetchData(query,cat,0,yr,filters); };
  const openFilters = () => { setDraftFilters({...filters}); setKlpdInput(""); setLokasiInput(""); setFocusedSuggest(null); setShowFilters(true); };
  const closeFilters = () => { setDraftFilters({...filters}); setKlpdInput(""); setLokasiInput(""); setFocusedSuggest(null); setShowFilters(false); };
  const toggleFilters = () => {
    if (showFilters) closeFilters();
    else openFilters();
  };
  const updateFilter = <K extends keyof SearchFilters>(field: K, value: SearchFilters[K]) => {
    setDraftFilters(prev => ({ ...prev, [field]: value }));
  };
  const applyFilters = () => {
    const next = {...draftFilters};
    setFilters(next); setKlpdInput(""); setLokasiInput(""); setFocusedSuggest(null); setPage(0); fetchData(query,cat,0,year,next); setShowFilters(false);
  };
  const clearFilters = () => {
    const empty = {...EMPTY_FILTERS};
    setFilters(empty); setDraftFilters(empty); setKlpdInput(""); setLokasiInput(""); setFocusedSuggest(null); setCat(""); setPage(0); fetchData(query,"",0,year,empty);
  };
  const removeFilter = (field: keyof SearchFilters) => {
    const next = { ...filters, [field]: "" };
    setFilters(next); setDraftFilters(next); setPage(0); fetchData(query,cat,0,year,next);
  };
  const clearSearchFilter = () => { setInputKw(""); setInputLoc(""); setQuery(""); setPage(0); fetchData("",cat,0,year,filters); };
  const clearCategoryFilter = () => { setCat(""); setPage(0); fetchData(query,"",0,year,filters); };
  const activeFilterItems = [
    ...(query ? [{ key: "query", label: `Pencarian: ${query}`, onRemove: clearSearchFilter }] : []),
    ...(cat ? [{ key: "cat", label: `Jenis: ${getOptionLabel(CATS, cat)}`, onRemove: clearCategoryFilter }] : []),
    ...(filters.metodePengadaan ? [{ key: "metodePengadaan", label: `Metode: ${getOptionLabel(METODE_OPTIONS, filters.metodePengadaan)}`, onRemove: () => removeFilter("metodePengadaan") }] : []),
    ...(filters.pdn ? [{ key: "pdn", label: filters.pdn === "true" ? "Produk Dalam Negeri" : "Produk Impor", onRemove: () => removeFilter("pdn") }] : []),
    ...(filters.ukm ? [{ key: "ukm", label: filters.ukm === "true" ? "Usaha Kecil/Koperasi" : "Bukan UKM/Koperasi", onRemove: () => removeFilter("ukm") }] : []),
    ...(filters.bulan ? [{ key: "bulan", label: `Bulan: ${getOptionLabel(BULAN_OPTIONS, filters.bulan)}`, onRemove: () => removeFilter("bulan") }] : []),
    ...(filters.minPagu || filters.maxPagu ? [{ key: "pagu", label: `Pagu: ${filters.minPagu ? fmtFull(Number(filters.minPagu)) : "Rp 0"} - ${filters.maxPagu ? fmtFull(Number(filters.maxPagu)) : "∞"}`, onRemove: () => { const next = { ...filters, minPagu: "", maxPagu: "" }; setFilters(next); setDraftFilters(next); setPage(0); fetchData(query,cat,0,year,next); } }] : []),
    ...parseMultiValue(filters.kldi).map(option => ({
      key: `kldi-${option}`,
      label: `KLPD: ${option}`,
      onRemove: () => {
        const next = { ...filters, kldi: removeMultiValue(filters.kldi, option) };
        setFilters(next); setDraftFilters(next); setPage(0); fetchData(query,cat,0,year,next);
      },
    })),
    ...parseMultiValue(filters.lokasi).map(option => ({
      key: `lokasi-${option}`,
      label: `Lokasi: ${option}`,
      onRemove: () => {
        const next = { ...filters, lokasi: removeMultiValue(filters.lokasi, option) };
        setFilters(next); setDraftFilters(next); setPage(0); fetchData(query,cat,0,year,next);
      },
    })),
  ];
  const selectKlpdSuggestion = (option: string) => {
    setDraftFilters(prev => ({ ...prev, kldi: addMultiValue(prev.kldi, option) }));
    setKlpdInput("");
    setFocusedSuggest("kldi");
  };
  const selectLokasiSuggestion = (option: string) => {
    setDraftFilters(prev => ({ ...prev, lokasi: addMultiValue(prev.lokasi, option) }));
    setLokasiInput("");
    setFocusedSuggest("lokasi");
  };
  const removeDraftKlpd = (option: string) => setDraftFilters(prev => ({ ...prev, kldi: removeMultiValue(prev.kldi, option) }));
  const removeDraftLokasi = (option: string) => setDraftFilters(prev => ({ ...prev, lokasi: removeMultiValue(prev.lokasi, option) }));

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

  const addCookFiles = (files: File[]) => {
    if (!files.length) return;
    setCookForm(prev => ({
      ...prev,
      files: [
        ...prev.files,
        ...files.filter(file => !prev.files.some(existing =>
          existing.name === file.name &&
          existing.size === file.size &&
          existing.lastModified === file.lastModified
        )),
      ],
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeCookFile = (index: number) => {
    setCookForm(prev => ({
      ...prev,
      files: prev.files.filter((_, fileIndex) => fileIndex !== index),
    }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const commitInstansiEmailInput = () => {
    const inputEmails = parseEmailList(cookForm.email_instansi_klpd_input);
    if (!inputEmails.length) return true;

    const invalid = inputEmails.find(email => !EMAIL_PATTERN.test(email));
    if (invalid) {
      showToast("error", `Format email tidak valid: ${invalid}`);
      setShowOptional(true);
      return false;
    }

    setCookForm(prev => ({
      ...prev,
      email_instansi_klpd: mergeEmailLists(prev.email_instansi_klpd, inputEmails),
      email_instansi_klpd_input: "",
    }));
    return true;
  };

  const removeInstansiEmail = (email: string) => {
    setCookForm(prev => ({
      ...prev,
      email_instansi_klpd: parseEmailList(prev.email_instansi_klpd)
        .filter(item => item.toLowerCase() !== email.toLowerCase())
        .join(","),
    }));
  };

  const handleInstansiEmailChange = (value: string) => {
    const shouldCommit = /[,;\n\s]$/.test(value);
    const emails = parseEmailList(value);
    if (shouldCommit && emails.length > 0) {
      const invalid = emails.find(email => !EMAIL_PATTERN.test(email));
      if (invalid) {
        updateCookForm("email_instansi_klpd_input", value);
        showToast("error", `Format email tidak valid: ${invalid}`);
        return;
      }
      setCookForm(prev => ({
        ...prev,
        email_instansi_klpd: mergeEmailLists(prev.email_instansi_klpd, emails),
        email_instansi_klpd_input: "",
      }));
      return;
    }
    updateCookForm("email_instansi_klpd_input", value);
  };

  const resetCookForm = () => {
    setCookForm({...EMPTY_COOK_FORM});
    setShowCookForm(false);
    setShowOptional(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const sendToWebhook = async (pkg: PaketData) => {
    // validate required fields
    if (!cookForm.id_pengaduan || !cookForm.pengirim || !cookForm.email_pengirim || !cookForm.tanggal_pengaduan || !cookForm.kode_paket || !cookForm.uraian_pengaduan) {
      showToast("error", "Harap isi semua field yang wajib");
      return;
    }
    // validate email format
    if (!EMAIL_PATTERN.test(cookForm.email_pengirim)) {
      showToast("error", "Format email pengirim tidak valid");
      return;
    }

    if (!commitInstansiEmailInput()) return;
    const instansiEmails = parseEmailList(cookForm.email_instansi_klpd).concat(
      parseEmailList(cookForm.email_instansi_klpd_input).filter(email => !parseEmailList(cookForm.email_instansi_klpd).some(existing => existing.toLowerCase() === email.toLowerCase()))
    );
    if (instansiEmails.length === 0) {
      showToast("error", "Email Instansi KLPD wajib diisi");
      setShowOptional(true);
      return;
    }
    if (instansiEmails.some(email => !EMAIL_PATTERN.test(email))) {
      showToast("error", "Format Email Instansi KLPD tidak valid. Pisahkan banyak email dengan koma.");
      setShowOptional(true);
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
        email_instansi_klpd: instansiEmails.join(","),
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

      const sentEmails = typeof responseBody === "object" && responseBody && "sentTo" in responseBody && Array.isArray(responseBody.sentTo)
        ? responseBody.sentTo.join(", ")
        : instansiEmails.join(", ");
      const fileName = typeof responseBody === "object" && responseBody && "file" in responseBody && responseBody.file && typeof responseBody.file === "object" && "name" in responseBody.file
        ? String(responseBody.file.name)
        : "file hasil olahan";
      const successMessage = typeof responseBody === "object" && responseBody && "message" in responseBody
        ? `${String(responseBody.message)} ke: ${sentEmails}. File: ${fileName}`
        : `Email paket #${pkg.id} berhasil dikirim ke: ${sentEmails}`;

      showToast("success", successMessage);
      resetCookForm();
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      showToast("error", isTimeout
        ? `Email paket #${pkg.id} belum memberi balasan setelah 2 menit`
        : err instanceof Error && err.message
          ? `Gagal mengirim email paket #${pkg.id}: ${err.message}`
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
      <header ref={headerRef} className="sticky top-0 z-40 bg-white">

        {/* Single row: logo + search pill */}
        <div className="border-b border-[#ebebeb] px-6 md:px-10 flex items-center gap-5 py-3">
          {/* Logo */}
          <div
            className="flex items-center gap-1.5 cursor-pointer text-[#FF385C] shrink-0"
            onClick={()=>{ const empty = {...EMPTY_FILTERS}; setInputKw(""); setInputLoc(""); setQuery(""); setCat(""); setYear("2026"); setFilters(empty); setDraftFilters(empty); fetchData("","",0,"2026",empty); }}
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
          <div className="shrink-0 flex items-center gap-3">
            <button onClick={toggleFilters} className={`flex items-center gap-2 border rounded-xl px-4 py-2.5 text-[14px] font-medium hover:shadow-md transition-shadow whitespace-nowrap ${showFilters || hasAdvancedFilters(filters) ? "border-[#222] text-[#222]" : "border-[#ddd]"}`}>
              <SlidersHorizontal size={16} /> Filters
              {hasAdvancedFilters(filters) && <span className="rounded-full bg-[#FF385C] px-1.5 py-0.5 text-[10px] font-bold text-white">{Object.values(filters).filter(Boolean).length}</span>}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="fixed inset-0 z-50 bg-black/30 md:static md:bg-transparent" onClick={closeFilters}>
            <div className="absolute inset-x-3 top-20 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[#ebebeb] bg-white px-4 py-4 shadow-2xl md:static md:max-h-[70vh] md:rounded-none md:border-x-0 md:border-b md:border-t md:px-10 md:py-5 md:shadow-sm" onClick={e=>e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between md:hidden">
                <div>
                  <div className="text-[15px] font-bold text-[#222]">Filter Pencarian</div>
                  <div className="text-[12px] text-[#717171]">Perubahan muncul setelah diterapkan</div>
                </div>
                <button type="button" onClick={closeFilters} className="rounded-full border border-[#ddd] p-2 text-[#555]">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="relative">
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">KLPD</label>
                  <div className="min-h-[46px] rounded-xl border border-[#ddd] bg-white px-2.5 py-2 focus-within:border-[#FF385C]">
                    <div className="flex flex-wrap gap-2">
                      {parseMultiValue(draftFilters.kldi).map(option => (
                        <span key={option} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#FF385C]/10 px-2.5 py-1 text-[12px] font-medium text-[#FF385C]">
                          <span className="max-w-[180px] truncate">{option}</span>
                          <button type="button" onClick={()=>removeDraftKlpd(option)} className="hover:text-[#d9284c]">×</button>
                        </span>
                      ))}
                      <input
                        value={klpdInput}
                        onChange={e=>setKlpdInput(e.target.value)}
                        onFocus={()=>setFocusedSuggest("kldi")}
                        onKeyDown={e=>{
                          if (e.key === "Enter" && klpdSuggestions[0]) { e.preventDefault(); selectKlpdSuggestion(klpdSuggestions[0]); }
                          if (e.key === "Backspace" && !klpdInput) { const values = parseMultiValue(draftFilters.kldi); if (values.length) removeDraftKlpd(values[values.length - 1]); }
                        }}
                        placeholder={parseMultiValue(draftFilters.kldi).length ? "Tambah KLPD..." : "Ketik KLPD..."}
                        className="min-w-[160px] flex-1 border-0 bg-transparent px-1 py-1 text-[16px] outline-none md:text-[14px]"
                      />
                    </div>
                  </div>
                  {focusedSuggest === "kldi" && klpdSuggestions.length > 0 && (
                    <div className="absolute z-[60] mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#ddd] bg-white py-1 shadow-xl">
                      {klpdSuggestions.map(option => (
                        <button key={option} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>selectKlpdSuggestion(option)} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f7f7f7]">{option}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">Lokasi</label>
                  <div className="min-h-[46px] rounded-xl border border-[#ddd] bg-white px-2.5 py-2 focus-within:border-[#FF385C]">
                    <div className="flex flex-wrap gap-2">
                      {parseMultiValue(draftFilters.lokasi).map(option => (
                        <span key={option} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#FF385C]/10 px-2.5 py-1 text-[12px] font-medium text-[#FF385C]">
                          <span className="max-w-[180px] truncate">{option}</span>
                          <button type="button" onClick={()=>removeDraftLokasi(option)} className="hover:text-[#d9284c]">×</button>
                        </span>
                      ))}
                      <input
                        value={lokasiInput}
                        onChange={e=>setLokasiInput(e.target.value)}
                        onFocus={()=>setFocusedSuggest("lokasi")}
                        onKeyDown={e=>{
                          if (e.key === "Enter" && lokasiSuggestions[0]) { e.preventDefault(); selectLokasiSuggestion(lokasiSuggestions[0]); }
                          if (e.key === "Backspace" && !lokasiInput) { const values = parseMultiValue(draftFilters.lokasi); if (values.length) removeDraftLokasi(values[values.length - 1]); }
                        }}
                        placeholder={parseMultiValue(draftFilters.lokasi).length ? "Tambah lokasi..." : "Ketik lokasi..."}
                        className="min-w-[160px] flex-1 border-0 bg-transparent px-1 py-1 text-[16px] outline-none md:text-[14px]"
                      />
                    </div>
                  </div>
                  {focusedSuggest === "lokasi" && lokasiSuggestions.length > 0 && (
                    <div className="absolute z-[60] mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-[#ddd] bg-white py-1 shadow-xl">
                      {lokasiSuggestions.map(option => (
                        <button key={option} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>selectLokasiSuggestion(option)} className="block w-full px-3 py-2 text-left text-[13px] hover:bg-[#f7f7f7]">{option}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">Metode Pengadaan</label>
                  <select value={draftFilters.metodePengadaan} onChange={e=>updateFilter("metodePengadaan", e.target.value)} className="w-full rounded-xl border border-[#ddd] bg-white px-3 py-2.5 text-[16px] outline-none focus:border-[#FF385C] md:text-[14px]">
                    <option value="">Semua metode</option>
                    {METODE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">Bulan Pemilihan</label>
                  <select value={draftFilters.bulan} onChange={e=>updateFilter("bulan", e.target.value)} className="w-full rounded-xl border border-[#ddd] bg-white px-3 py-2.5 text-[16px] outline-none focus:border-[#FF385C] md:text-[14px]">
                    <option value="">Semua bulan</option>
                    {BULAN_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">Produk Dalam Negeri</label>
                  <select value={draftFilters.pdn} onChange={e=>updateFilter("pdn", e.target.value)} className="w-full rounded-xl border border-[#ddd] bg-white px-3 py-2.5 text-[16px] outline-none focus:border-[#FF385C] md:text-[14px]">
                    <option value="">Semua</option>
                    <option value="true">Produk Dalam Negeri</option>
                    <option value="false">Produk Impor</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">Usaha Kecil/Koperasi</label>
                  <select value={draftFilters.ukm} onChange={e=>updateFilter("ukm", e.target.value)} className="w-full rounded-xl border border-[#ddd] bg-white px-3 py-2.5 text-[16px] outline-none focus:border-[#FF385C] md:text-[14px]">
                    <option value="">Semua</option>
                    <option value="true">Usaha Kecil/Koperasi</option>
                    <option value="false">Bukan UKM/Koperasi</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">Min Pagu</label>
                  <input inputMode="numeric" value={compactNumber(draftFilters.minPagu)} onChange={e=>updateFilter("minPagu", onlyDigits(e.target.value))} placeholder="Rp" className="w-full rounded-xl border border-[#ddd] px-3 py-2.5 text-[16px] outline-none focus:border-[#FF385C] md:text-[14px]" />
                </div>
                <div>
                  <label className="mb-1 block text-[12px] font-semibold text-[#555]">Max Pagu</label>
                  <input inputMode="numeric" value={compactNumber(draftFilters.maxPagu)} onChange={e=>updateFilter("maxPagu", onlyDigits(e.target.value))} placeholder="Rp" className="w-full rounded-xl border border-[#ddd] px-3 py-2.5 text-[16px] outline-none focus:border-[#FF385C] md:text-[14px]" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {PAGU_PRESETS.map(preset => (
                  <button key={preset.label} type="button" onClick={()=>setDraftFilters(prev=>({...prev, minPagu:preset.min, maxPagu:preset.max}))} className="rounded-full border border-[#ddd] px-3 py-1.5 text-[12px] font-medium text-[#555] hover:border-[#FF385C] hover:text-[#FF385C]">
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="sticky bottom-0 -mx-4 mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ebebeb] bg-white px-4 py-3 md:-mx-10 md:px-10">
                <button type="button" onClick={clearFilters} className="text-[13px] font-semibold text-[#717171] hover:text-[#222]">Hapus semua filter</button>
                <div className="flex gap-2">
                  <button type="button" onClick={closeFilters} className="rounded-xl border border-[#ddd] px-4 py-2.5 text-[14px] font-semibold text-[#555] hover:bg-[#f7f7f7]">Tutup</button>
                  <button type="button" onClick={applyFilters} className="rounded-xl bg-[#FF385C] px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-[#e0334f]">Terapkan Filter</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ══════════ MAIN ══════════ */}
      <main className="flex-1 px-6 md:px-10 py-8">

        {/* Sticky count + active filters */}
        <div ref={infoBarSentinelRef} className="h-px" aria-hidden="true" />
        {(!loading || activeFilterItems.length > 0) ? (
          <div
            className={`sticky z-30 -mx-6 mb-6 border-b border-[#f1f1f1] bg-white/95 px-6 py-3 backdrop-blur transition-all duration-200 ease-out md:-mx-10 md:px-10
              ${isInfoBarPinned ? "shadow-sm" : ""}`}
            style={{ top: infoBarTop }}
          >
            <div className={`flex gap-3 transition-all duration-200 ease-out ${isInfoBarPinned ? "flex-row items-center justify-between" : "flex-row flex-wrap items-center justify-between"}`}>
              {!loading && (
                <p className="shrink-0 text-left text-[13px] font-medium text-[#717171] transition-all duration-200 ease-out">
                  {total.toLocaleString("id-ID")} paket ditemukan{query ? ` · "${query}"` : ""}
                </p>
              )}

              {activeFilterItems.length > 0 && (
                <div
                  className={`flex gap-2 overflow-y-auto overscroll-contain pr-1 transition-all duration-200 ease-out
                    ${isInfoBarPinned ? "ml-auto max-h-10 max-w-[62vw] flex-nowrap justify-end" : "ml-auto max-h-24 flex-wrap justify-end"}`}
                >
                  {activeFilterItems.map(item => (
                    <span key={item.key} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f7f7f7] border border-[#ebebeb] px-3 py-1.5 text-[12px] font-medium text-[#555]">
                      <span className="max-w-[240px] truncate">{item.label}</span>
                      <button type="button" onClick={item.onRemove} className="rounded-full text-[#999] hover:text-[#FF385C]" aria-label={`Hapus filter ${item.label}`}>
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

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
                      { label: "Jenis Pengadaan",     value: selected.jenisPengadaan },
                      { label: "Metode",              value: selected.metode },
                      { label: "Instansi (KLDI)",     value: selected.kldi },
                      { label: "Satuan Kerja",        value: selected.satuanKerja },
                      { label: "ID Satker",           value: selected.idSatker.toString() },
                      { label: "Lokasi",              value: selected.lokasi },
                      { label: "Jadwal Pemilihan",    value: selected.pemilihan },
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
                        <div className="relative w-full max-w-full min-w-0">
                          {!cookForm.tanggal_pengaduan && (
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-[#aaa] sm:text-[14px]">Pilih tanggal</span>
                          )}
                          <input
                            type="date"
                            value={cookForm.tanggal_pengaduan}
                            onChange={e=>updateCookForm("tanggal_pengaduan", e.target.value)}
                            className={`date-input w-full max-w-full min-w-0 appearance-none border border-[#ddd] rounded-xl px-4 py-3 sm:py-2.5 text-[16px] sm:text-[14px] outline-none focus:border-[#FF385C] focus:ring-1 focus:ring-[#FF385C]/20 transition bg-white ${cookForm.tanggal_pengaduan ? "text-[#222]" : "text-transparent"}`}
                          />
                        </div>
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
                        ref={fileInputRef}
                        type="file" 
                        multiple
                        accept=".pdf,image/jpeg,image/png,image/webp,image/*" 
                        onChange={e => addCookFiles(Array.from(e.target.files || []))}
                        className="sr-only"
                      />

                      <div className="rounded-2xl border border-dashed border-[#ddd] bg-[#fafafa] p-3 sm:p-4">
                        {cookForm.files.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full rounded-xl bg-white border border-[#ddd] px-4 py-3 text-[14px] font-semibold text-[#FF385C] hover:bg-[#FF385C]/5 transition"
                          >
                            Pilih PDF atau Foto
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <ul className="space-y-2">
                              {cookForm.files.map((file, index) => (
                                <li key={`${file.name}-${file.size}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-white border border-[#eee] px-3 py-2 max-w-full overflow-hidden">
                                  <FileText size={15} className="shrink-0 text-[#FF385C]" />
                                  <div className="min-w-0 max-w-full overflow-hidden">
                                    <p title={file.name} className="block w-full max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-medium text-[#333]">{file.name}</p>
                                    <p className="text-[11px] text-[#999]">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeCookFile(index)}
                                    className="shrink-0 rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-100 transition"
                                  >
                                    Hapus
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full rounded-xl border border-[#FF385C]/25 bg-[#FF385C]/5 px-4 py-2.5 text-[13px] font-semibold text-[#FF385C] hover:bg-[#FF385C]/10 transition"
                            >
                              + Tambahkan file
                            </button>
                          </div>
                        )}
                      </div>
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
                        <label className="text-[12px] font-semibold text-[#555] mb-1 block">Email Instansi KLPD <span className="text-red-500">*</span></label>
                        <div className="min-h-[48px] rounded-xl border border-[#ddd] bg-white px-2.5 py-2 focus-within:border-[#FF385C] focus-within:ring-1 focus-within:ring-[#FF385C]/20 transition">
                          <div className="flex flex-wrap gap-2">
                            {parseEmailList(cookForm.email_instansi_klpd).map(email => (
                              <span key={email} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#FF385C]/10 px-3 py-1.5 text-[13px] font-medium text-[#FF385C]">
                                <span className="max-w-[210px] truncate">{email}</span>
                                <button type="button" onClick={() => removeInstansiEmail(email)} className="text-[#FF385C] hover:text-[#d9284c]">×</button>
                              </span>
                            ))}
                            <input
                              type="text"
                              value={cookForm.email_instansi_klpd_input}
                              onChange={e=>handleInstansiEmailChange(e.target.value)}
                              onBlur={()=>commitInstansiEmailInput()}
                              onKeyDown={e=>{
                                if (e.key === "Enter" || e.key === ",") {
                                  e.preventDefault();
                                  commitInstansiEmailInput();
                                }
                                if (e.key === "Backspace" && !cookForm.email_instansi_klpd_input) {
                                  const emails = parseEmailList(cookForm.email_instansi_klpd);
                                  if (emails.length) removeInstansiEmail(emails[emails.length - 1]);
                                }
                              }}
                              onPaste={e=>{
                                const text = e.clipboardData.getData("text");
                                if (parseEmailList(text).length > 1) {
                                  e.preventDefault();
                                  const emails = parseEmailList(text);
                                  const invalid = emails.find(email => !EMAIL_PATTERN.test(email));
                                  if (invalid) {
                                    showToast("error", `Format email tidak valid: ${invalid}`);
                                    return;
                                  }
                                  setCookForm(prev => ({
                                    ...prev,
                                    email_instansi_klpd: mergeEmailLists(prev.email_instansi_klpd, emails),
                                    email_instansi_klpd_input: "",
                                  }));
                                }
                              }}
                              placeholder={parseEmailList(cookForm.email_instansi_klpd).length ? "Tambah email..." : "email1@instansi.go.id, email2@instansi.go.id"}
                              className="min-w-[180px] flex-1 border-0 bg-transparent px-1 py-1.5 text-[16px] sm:text-[14px] outline-none"
                            />
                          </div>
                        </div>
                        <p className="text-[11px] text-[#aaa] mt-1">Tekan koma/Enter untuk membuat chip. Bisa paste banyak email sekaligus.</p>
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
