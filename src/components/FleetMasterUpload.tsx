import React, { useState, useRef } from 'react';
import { read, utils, write } from 'xlsx';
import {
  collection,
  getDocs,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import {
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle,
  X,
  FileText,
  Download,
  AlertCircle,
  Car,
  Check,
  RefreshCw,
  Eye,
  Info,
} from 'lucide-react';

interface ParsedRow {
  rowIndex: number;
  cabNumber: string;
  site: string;
  firstDriverName: string;
  firstDriverPhone: string;
  secondDriverName: string;
  secondDriverPhone: string;
  vehicleType: string;
  baseHub: string;
  isValid: boolean;
  warning?: string;
  isExisting?: boolean;
}

interface FleetMasterUploadProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadComplete?: (stats: { added: number; updated: number; skipped: number }) => void;
}

export const FleetMasterUpload: React.FC<FleetMasterUploadProps> = ({
  isOpen,
  onClose,
  onUploadComplete,
}) => {
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadMode, setUploadMode] = useState<'file' | 'paste'>('file');
  const [pastedText, setPastedText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    added: number;
    updated: number;
    skipped: number;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetState = () => {
    setFileName(null);
    setFileSize(null);
    setPastedText('');
    setParsedRows([]);
    setWarnings([]);
    setUploadResult(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Helper to format bytes
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  // Generic matrix parser for both file uploads and copy-pasted text
  const parseMatrix = (rawRows: any[][], label: string, sizeLabel: string) => {
    if (rawRows.length === 0) {
      throw new Error('No rows found to process.');
    }

    setFileName(label);
    setFileSize(sizeLabel);

    // Check if row 0 is header
    let startIndex = 0;
    const firstRowStr = (rawRows[0] || []).map((c) => String(c).toLowerCase()).join(' ');
    if (
      firstRowStr.includes('cab') ||
      firstRowStr.includes('driver') ||
      firstRowStr.includes('vehicle') ||
      firstRowStr.includes('hub') ||
      firstRowStr.includes('phone')
    ) {
      startIndex = 1;
    }

    const rows: ParsedRow[] = [];
    const warningList: string[] = [];

    for (let i = startIndex; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const displayRowNumber = i + 1;

      if (!raw || raw.length === 0 || raw.every((cell) => cell === null || cell === undefined || String(cell).trim() === '')) {
        continue; // Skip entirely empty rows
      }

      let cabNumber = '';
      let site = '';
      let firstDriverName = '';
      let firstDriverPhone = '';
      let secondDriverName = '';
      let secondDriverPhone = '';
      let vehicleType = '';
      let baseHub = '';

      if (raw.length >= 8) {
        cabNumber = String(raw[0] || '').trim();
        site = String(raw[1] || '').trim();
        firstDriverName = String(raw[2] || '').trim();
        firstDriverPhone = String(raw[3] || '').trim();
        secondDriverName = String(raw[4] || '').trim();
        secondDriverPhone = String(raw[5] || '').trim();
        vehicleType = String(raw[6] || '').trim();
        baseHub = String(raw[7] || '').trim();
      } else if (raw.length === 7) {
        cabNumber = String(raw[0] || '').trim();
        firstDriverName = String(raw[1] || '').trim();
        firstDriverPhone = String(raw[2] || '').trim();
        secondDriverName = String(raw[3] || '').trim();
        secondDriverPhone = String(raw[4] || '').trim();
        vehicleType = String(raw[5] || '').trim();
        baseHub = String(raw[6] || '').trim();
        site = userProfile?.site || baseHub;
      } else {
        // 5 Columns backward compatible
        cabNumber = String(raw[0] || '').trim();
        firstDriverName = String(raw[1] || '').trim();
        firstDriverPhone = String(raw[2] || '').trim();
        vehicleType = String(raw[3] || '').trim();
        baseHub = String(raw[4] || '').trim();
        site = userProfile?.site || baseHub;
      }

      if (userProfile?.role === 'supervisor' && userProfile?.site) {
        site = userProfile.site;
      } else if (!site) {
        site = baseHub || userProfile?.site || 'North Terminal Hub';
      }

      // Sensible defaults if not specified
      if (!vehicleType) vehicleType = 'Sedan (Dzire / Etios)';
      if (!baseHub) baseHub = site || 'North Terminal Hub';

      const missingFields: string[] = [];
      if (!cabNumber) missingFields.push('Cab Number');
      if (!site) missingFields.push('Site / Location');
      if (!firstDriverName) missingFields.push('1st Driver Name');
      if (!firstDriverPhone) missingFields.push('1st Driver Phone');

      if (missingFields.length > 0) {
        const warnMsg = `Row ${displayRowNumber}: Missing required ${missingFields.join(', ')}.`;
        warningList.push(warnMsg);
        rows.push({
          rowIndex: displayRowNumber,
          cabNumber: cabNumber || '(Missing)',
          site: site || '(Missing)',
          firstDriverName: firstDriverName || '(Missing)',
          firstDriverPhone: firstDriverPhone || '(Missing)',
          secondDriverName: secondDriverName || '—',
          secondDriverPhone: secondDriverPhone || '—',
          vehicleType: vehicleType || '(Missing)',
          baseHub: baseHub || '(Missing)',
          isValid: false,
          warning: warnMsg,
        });
      } else {
        rows.push({
          rowIndex: displayRowNumber,
          cabNumber,
          site,
          firstDriverName,
          firstDriverPhone,
          secondDriverName,
          secondDriverPhone,
          vehicleType,
          baseHub,
          isValid: true,
        });
      }
    }

    if (rows.length === 0) {
      throw new Error('No valid data rows found in the input.');
    }

    setParsedRows(rows);
    setWarnings(warningList);
  };

  // Parse file buffer via SheetJS
  const processFile = async (file: File) => {
    setIsProcessingFile(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = read(data, { type: 'array' });

      if (!workbook.SheetNames.length) {
        throw new Error('The uploaded file does not contain any sheets.');
      }

      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const rawRows: any[][] = utils.sheet_to_json(worksheet, {
        header: 1,
        blankrows: false,
      });

      parseMatrix(rawRows, file.name, formatFileSize(file.size));
    } catch (err: any) {
      console.error('Error parsing spreadsheet:', err);
      setUploadError(err.message || 'Failed to read file. Please ensure it is a valid .xlsx or .csv file.');
      setParsedRows([]);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // Parse directly pasted text (from Excel, Google Sheets, or CSV)
  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      setUploadError('Please paste some rows before parsing.');
      return;
    }
    setIsProcessingFile(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      const lines = pastedText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const matrix: string[][] = lines.map((line) => {
        if (line.includes('\t')) {
          return line.split('\t').map((c) => c.trim());
        }
        return line.split(',').map((c) => c.trim());
      });

      parseMatrix(matrix, `Pasted_Rows_${lines.length}_Records`, `${lines.length} lines`);
    } catch (err: any) {
      setUploadError('Failed to parse pasted text: ' + err.message);
      setParsedRows([]);
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Download a pre-formatted template with Site / Location, 1st Driver and 2nd Driver details
  const downloadSampleTemplate = (format: 'xlsx' | 'csv') => {
    const activeSite = userProfile?.site || 'North Terminal Hub';
    const templateData = [
      ['Cab Number', 'Site / Location', '1st Driver Name', '1st Driver Phone', '2nd Driver Name', '2nd Driver Phone', 'Vehicle Type', 'Base Hub'],
      ['KA-01-AB-1024', activeSite, 'Rajesh Kumar', '+91 98765 43210', 'Vikram Malhotra', '+91 98111 22334', 'Sedan (Toyota Etios)', 'North Terminal Hub'],
      ['KA-01-MG-5588', userProfile?.site || 'Central Tech Park Hub', 'Amit Singh', '+91 98451 22334', 'Deepak Verma', '+91 98722 55667', 'SUV (Innova Crysta)', 'Central Tech Park Hub'],
      ['KA-01-ET-9901', userProfile?.site || 'South City Hub', 'Suresh Patil', '+91 99160 88990', 'Ramesh Yadav', '+91 99881 12233', 'EV Sedan (Tata Tigor)', 'South City Hub'],
      ['KA-02-CB-4411', userProfile?.site || 'Airport Expressway Hub', 'Pooja Nair', '+91 97412 33445', 'Anand Rao', '+91 96112 44556', 'Premium Sedan (Honda City)', 'Airport Expressway Hub'],
    ];

    const ws = utils.aoa_to_sheet(templateData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Fleet_Master');

    if (format === 'csv') {
      const csvOutput = utils.sheet_to_csv(ws);
      const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Fleet_Master_Template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const wbout = write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'Fleet_Master_Template.xlsx');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Quick load demo data directly into parser
  const loadDemoData = () => {
    const boundSite = userProfile?.site;
    const sampleRows: ParsedRow[] = [
      {
        rowIndex: 2,
        cabNumber: 'KA-01-AB-1024',
        site: boundSite || 'North Terminal Hub',
        firstDriverName: 'Rajesh Kumar',
        firstDriverPhone: '+91 98765 43210',
        secondDriverName: 'Vikram Malhotra',
        secondDriverPhone: '+91 98111 22334',
        vehicleType: 'Sedan (Toyota Etios)',
        baseHub: 'North Terminal Hub',
        isValid: true,
      },
      {
        rowIndex: 3,
        cabNumber: 'KA-01-MG-5588',
        site: boundSite || 'Central Tech Park Hub',
        firstDriverName: 'Amit Singh',
        firstDriverPhone: '+91 98451 22334',
        secondDriverName: 'Deepak Verma',
        secondDriverPhone: '+91 98722 55667',
        vehicleType: 'SUV (Innova Crysta)',
        baseHub: 'Central Tech Park Hub',
        isValid: true,
      },
      {
        rowIndex: 4,
        cabNumber: 'KA-01-ET-9901',
        site: boundSite || 'South City Hub',
        firstDriverName: 'Suresh Patil',
        firstDriverPhone: '+91 99160 88990',
        secondDriverName: 'Ramesh Yadav',
        secondDriverPhone: '+91 99881 12233',
        vehicleType: 'EV Sedan (Tata Tigor)',
        baseHub: 'South City Hub',
        isValid: true,
      },
      {
        rowIndex: 5,
        cabNumber: 'KA-04-NX-7821',
        site: boundSite || 'West Industrial Hub',
        firstDriverName: 'Manoj Verma',
        firstDriverPhone: '+91 98112 77665',
        secondDriverName: 'Kishore Kumar',
        secondDriverPhone: '+91 98223 34455',
        vehicleType: 'Sedan (Maruti Dzire)',
        baseHub: 'West Industrial Hub',
        isValid: true,
      },
      {
        rowIndex: 6,
        cabNumber: 'KA-05-HL-3109',
        site: boundSite || 'North Terminal Hub',
        firstDriverName: 'Deepak Sharma',
        firstDriverPhone: '',
        secondDriverName: 'Sunil Rao',
        secondDriverPhone: '+91 98334 45566',
        vehicleType: 'SUV (Mahindra XUV)',
        baseHub: 'North Terminal Hub',
        isValid: false,
        warning: 'Row 6: Missing required 1st Driver Phone.',
      },
    ];

    setFileName('Fleet_Master_Operations_Aug2026.xlsx');
    setFileSize('14.2 KB');
    setParsedRows(sampleRows);
    setWarnings(['Row 6: Missing required 1st Driver Phone.']);
    setUploadError(null);
    setUploadResult(null);
  };

  // Confirm Upload & Upsert into Firestore "fleet" collection
  const handleConfirmUpload = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setUploadError('No valid rows available to upload.');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Fetch current fleet collection to match by cabNumber
      const fleetColRef = collection(db, 'fleet');
      const fleetSnapshot = await getDocs(fleetColRef);

      // Create a map of normalized cabNumber -> existing doc
      const existingCabsMap = new Map<string, { id: string; data: any }>();
      fleetSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.cabNumber) {
          const normCab = String(data.cabNumber).trim().toUpperCase();
          existingCabsMap.set(normCab, { id: docSnap.id, data });
        }
      });

      let addedCount = 0;
      let updatedCount = 0;
      const skippedCount = parsedRows.filter((r) => !r.isValid).length;
      const supervisorName = userProfile?.name || 'Operations Supervisor';

      // Process in batches of 100 (Firestore limit is 500; 1 fleet doc + up to 2 driver user docs = max 300 writes per batch)
      const BATCH_SIZE = 100;
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const chunk = validRows.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const row of chunk) {
          const normCab = row.cabNumber.trim().toUpperCase();
          const cleanCabNo = normCab.replace(/[\s\-_]+/g, '');
          const existing = existingCabsMap.get(normCab);

          const firstDriverName = row.firstDriverName;
          const firstDriverPhone = row.firstDriverPhone;
          const secondDriverName = row.secondDriverName || '';
          const secondDriverPhone = row.secondDriverPhone || '';
          const cabSite = row.site || userProfile?.site || row.baseHub;

          if (existing) {
            // Existing cab: Keep current status and coordinates, update driver, site & vehicle fields
            const docRef = doc(db, 'fleet', existing.id);
            const activeSlot = existing.data?.activeDriverSlot;
            const primaryDriver = activeSlot === 'second' && secondDriverName ? secondDriverName : firstDriverName;
            const primaryPhone = activeSlot === 'second' && secondDriverPhone ? secondDriverPhone : firstDriverPhone;

            batch.update(docRef, {
              site: cabSite,
              firstDriverName,
              firstDriverPhone,
              firstDriverShift: 'morning_12h',
              secondDriverName,
              secondDriverPhone,
              secondDriverShift: 'night_12h',
              driverName: primaryDriver,
              driverPhone: primaryPhone,
              vehicleType: row.vehicleType,
              baseHub: row.baseHub,
              lastUpdated: serverTimestamp(),
              assignedSupervisor: supervisorName,
            });
            updatedCount++;
          } else {
            // New cab: Default status "reported_at_hub", default location to baseHub
            const cleanDocId = 'cab_' + normCab.replace(/[^A-Z0-9]/g, '_').toLowerCase();
            const docRef = doc(db, 'fleet', cleanDocId);
            batch.set(docRef, {
              cabNumber: row.cabNumber.trim(),
              site: cabSite,
              firstDriverName,
              firstDriverPhone,
              firstDriverShift: 'morning_12h',
              secondDriverName,
              secondDriverPhone,
              secondDriverShift: 'night_12h',
              driverName: firstDriverName,
              driverPhone: firstDriverPhone,
              activeDriverSlot: 'first',
              vehicleType: row.vehicleType,
              baseHub: row.baseHub,
              status: 'reported_at_hub', // New cabs default to status "reported_at_hub"
              currentLocationText: `${row.baseHub} (Depot)`,
              currentLocationLat: 12.9716,
              currentLocationLng: 77.5946,
              lastUpdated: serverTimestamp(),
              assignedSupervisor: supervisorName,
            });
            addedCount++;
          }

          // Auto-provision or link primary driver user account in 'users' so driver can log in immediately via mobile
          if (firstDriverName && firstDriverPhone) {
            const cleanPhone = firstDriverPhone.replace(/[^0-9]/g, '').slice(-10);
            const user1DocId = cleanPhone.length >= 10 ? `user_driver_${cleanPhone}` : `driver_${cleanCabNo}_1`;
            const user1Ref = doc(db, 'users', user1DocId);
            batch.set(
              user1Ref,
              {
                uid: user1DocId,
                name: firstDriverName,
                phoneNumber: firstDriverPhone,
                cabNumber: normCab,
                role: 'driver',
                site: cabSite,
                shift: 'morning_12h',
                driverSlot: 'first',
                temporaryPassword: 'Driver@12345',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }

          // Auto-provision or link 2nd driver user account if specified
          if (secondDriverName && secondDriverPhone) {
            const cleanPhone2 = secondDriverPhone.replace(/[^0-9]/g, '').slice(-10);
            const user2DocId = cleanPhone2.length >= 10 ? `user_driver_${cleanPhone2}` : `driver_${cleanCabNo}_2`;
            const user2Ref = doc(db, 'users', user2DocId);
            batch.set(
              user2Ref,
              {
                uid: user2DocId,
                name: secondDriverName,
                phoneNumber: secondDriverPhone,
                cabNumber: normCab,
                role: 'driver',
                site: cabSite,
                shift: 'night_12h',
                driverSlot: 'second',
                temporaryPassword: 'Driver@12345',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );
          }
        }

        await batch.commit();
      }

      const stats = {
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount,
      };

      setUploadResult(stats);
      if (onUploadComplete) {
        onUploadComplete(stats);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Failed to update Firestore fleet collection.');
    } finally {
      setIsUploading(false);
    }
  };

  const validRowCount = parsedRows.filter((r) => r.isValid).length;
  const invalidRowCount = parsedRows.filter((r) => !r.isValid).length;

  return (
    <div
      id="modal-fleet-master-upload"
      className="fixed inset-0 z-50 overflow-y-auto bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
    >
      <div className="bg-white border-2 border-[#e6e0d4] rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-[#1c1917]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#e6e0d4] flex items-center justify-between bg-[#fbf9f5]">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center">
              <UploadCloud className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#1c1917] flex items-center gap-2">
                Fleet Master Upload
              </h2>
              <p className="text-xs text-[#78716c]">
                Bulk upload or sync vehicles & drivers from Excel (.xlsx) or CSV
              </p>
            </div>
          </div>

          <button
            id="btn-close-fleet-upload-modal"
            onClick={handleClose}
            className="p-2 rounded-xl text-[#78716c] hover:text-[#1c1917] hover:bg-[#f5f0e6] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-white">
          {/* Success Banner */}
          {uploadResult && (
            <div
              id="upload-success-message"
              className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-sm space-y-2 shadow-xs"
            >
              <div className="flex items-center gap-2 font-bold text-emerald-800">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Fleet Master Upload Completed Successfully!</span>
              </div>
              <div className="grid grid-cols-3 gap-3 pt-2 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                  <div className="text-lg font-black text-emerald-950">{uploadResult.added}</div>
                  <div className="text-emerald-800">New Cabs Added</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                  <div className="text-lg font-black text-emerald-950">{uploadResult.updated}</div>
                  <div className="text-emerald-800">Existing Cabs Updated</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200 text-center">
                  <div className="text-lg font-black text-amber-900">{uploadResult.skipped}</div>
                  <div className="text-amber-800">Rows Skipped</div>
                </div>
              </div>
              <p className="text-[11px] text-emerald-800/90 pt-1">
                New cabs are set to &quot;reported_at_hub&quot; status. Existing cabs retained their current live duty status.
              </p>
            </div>
          )}

          {/* Error Banner */}
          {uploadError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-rose-900">Upload Processing Error</div>
                <div>{uploadError}</div>
              </div>
            </div>
          )}

          {/* Upload Area & Instructions */}
          {!uploadResult && (
            <>
              {/* Mode Toggle: File Upload vs Paste Data */}
              <div className="flex items-center gap-2 border-b border-[#e6e0d4] pb-3">
                <button
                  type="button"
                  id="tab-upload-mode-file"
                  onClick={() => setUploadMode('file')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    uploadMode === 'file'
                      ? 'bg-amber-400 text-[#1c1917] shadow-xs'
                      : 'bg-[#faf7f2] text-[#78716c] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                  }`}
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload Excel / CSV File</span>
                </button>
                <button
                  type="button"
                  id="tab-upload-mode-paste"
                  onClick={() => setUploadMode('paste')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    uploadMode === 'paste'
                      ? 'bg-amber-400 text-[#1c1917] shadow-xs'
                      : 'bg-[#faf7f2] text-[#78716c] hover:bg-[#f5f0e6] hover:text-[#1c1917]'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Paste Data (from Sheets / Excel)</span>
                </button>
              </div>

              {uploadMode === 'file' ? (
                /* Drag & Drop File Zone */
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                    fileName
                      ? 'border-amber-400 bg-amber-50/60'
                      : 'border-[#ded7c8] hover:border-amber-400 bg-[#faf7f2] hover:bg-[#f5f0e6]'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="hidden"
                    id="input-fleet-file"
                  />

                  {isProcessingFile ? (
                    <div className="flex flex-col items-center justify-center py-4 space-y-2">
                      <RefreshCw className="w-8 h-8 text-amber-600 animate-spin" />
                      <p className="text-sm font-medium text-[#1c1917]">
                        Parsing spreadsheet with SheetJS...
                      </p>
                    </div>
                  ) : fileName ? (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <FileSpreadsheet className="w-10 h-10 text-amber-700" />
                      <div className="font-semibold text-[#1c1917] text-base">{fileName}</div>
                      <div className="text-xs text-[#78716c]">
                        {fileSize} &bull; {parsedRows.length} rows detected
                      </div>
                      <span className="text-[11px] text-amber-700 underline pt-1">
                        Click to choose another file
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <UploadCloud className="w-10 h-10 text-[#78716c] mb-1" />
                      <div className="text-sm font-semibold text-[#1c1917]">
                        Click to browse or drag and drop your file here
                      </div>
                      <p className="text-xs text-[#78716c] max-w-sm">
                        Supported formats: Excel (<code className="text-amber-800 font-bold">.xlsx</code>, <code className="text-amber-800 font-bold">.xls</code>) or CSV (<code className="text-amber-800 font-bold">.csv</code>)
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* Paste Data Zone */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="textarea-paste-data" className="text-xs font-bold text-[#1c1917]">
                      Paste rows copied directly from Excel, Google Sheets, or CSV:
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setPastedText(
                          `Cab Number\tSite / Location\t1st Driver Name\t1st Driver Phone\t2nd Driver Name\t2nd Driver Phone\tVehicle Type\tBase Hub\nKA-01-AB-1024\tNorth Terminal Hub\tRajesh Kumar\t+91 98765 43210\tVikram Malhotra\t+91 98111 22334\tSedan\tNorth Terminal Hub\nKA-01-MG-5588\tCentral Tech Park Hub\tAmit Singh\t+91 98451 22334\tDeepak Verma\t+91 98722 55667\tSUV\tCentral Tech Park Hub`
                        )
                      }
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-800 underline cursor-pointer"
                    >
                      Fill Sample Data
                    </button>
                  </div>
                  <textarea
                    id="textarea-paste-data"
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Example:&#10;KA-01-AB-1024, North Terminal Hub, Rajesh Kumar, 9876543210, Vikram Malhotra, 9811122334, Sedan, North Hub&#10;KA-01-MG-5588, Central Hub, Amit Singh, 9845122334, Deepak Verma, 9872255667, SUV, Central Hub"
                    className="w-full font-mono text-xs p-3.5 rounded-xl border border-[#ded7c8] bg-[#faf7f2] focus:bg-white focus:border-amber-400 focus:outline-none text-[#1c1917]"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      id="btn-parse-pasted-data"
                      onClick={handleParsePastedText}
                      disabled={isProcessingFile || !pastedText.trim()}
                      className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-[#1c1917] font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer"
                    >
                      {isProcessingFile ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>Parse & Validate Pasted Rows</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Template & Helper Bar */}
              <div className="bg-[#faf7f2] border border-[#ded7c8] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-[#44403c]">
                  <Info className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    Template Columns: <strong className="text-[#1c1917]">Cab Number</strong>, <strong className="text-[#1c1917]">Site / Location</strong>, <strong className="text-[#1c1917]">1st Driver Name</strong>, <strong className="text-[#1c1917]">1st Driver Phone</strong>, <strong className="text-[#1c1917]">2nd Driver Name</strong>, <strong className="text-[#1c1917]">2nd Driver Phone</strong>, <strong className="text-[#1c1917]">Vehicle Type</strong>, <strong className="text-[#1c1917]">Base Hub</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate('xlsx')}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#f5f0e6] text-[#44403c] hover:text-[#1c1917] border border-[#ded7c8] flex items-center gap-1.5 transition text-[11px] cursor-pointer font-medium"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-700" />
                    <span>.XLSX Template</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadSampleTemplate('csv')}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#f5f0e6] text-[#44403c] hover:text-[#1c1917] border border-[#ded7c8] flex items-center gap-1.5 transition text-[11px] cursor-pointer font-medium"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-700" />
                    <span>.CSV Template</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Warnings list if any rows had missing data */}
          {warnings.length > 0 && !uploadResult && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>
                  {warnings.length} Row{warnings.length > 1 ? 's' : ''} with Missing Data (Will be skipped)
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 text-[11px] text-amber-900 font-mono">
                {warnings.map((w, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Table */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-[#1c1917]">
                  <Eye className="w-4 h-4 text-amber-700" />
                  <span>Preview Data ({parsedRows.length} total rows)</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-800 font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> {validRowCount} Valid
                  </span>
                  {invalidRowCount > 0 && (
                    <span className="text-amber-800 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" /> {invalidRowCount} Skipped
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-[#ded7c8] rounded-xl overflow-hidden bg-white">
                <div className="max-h-64 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-xs text-[#1c1917]">
                    <thead className="bg-[#fbf9f5] text-[#57534e] uppercase tracking-wider text-[10px] sticky top-0 z-10 border-b border-[#ded7c8]">
                      <tr>
                        <th className="py-2.5 px-3 font-bold">#</th>
                        <th className="py-2.5 px-3 font-bold">Cab Number</th>
                        <th className="py-2.5 px-3 font-bold">Site / Location</th>
                        <th className="py-2.5 px-3 font-bold">1st Driver</th>
                        <th className="py-2.5 px-3 font-bold">2nd Driver</th>
                        <th className="py-2.5 px-3 font-bold">Vehicle Type</th>
                        <th className="py-2.5 px-3 font-bold">Base Hub</th>
                        <th className="py-2.5 px-3 text-center font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#ded7c8]/60 font-sans">
                      {parsedRows.map((row) => (
                        <tr
                          key={row.rowIndex}
                          className={
                            row.isValid
                              ? 'hover:bg-[#faf7f2]'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-800'
                          }
                        >
                          <td className="py-2.5 px-3 text-[#78716c] font-mono text-[11px]">
                            {row.rowIndex}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-amber-800">
                            {row.cabNumber}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-900 border border-indigo-200">
                              {row.site}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-[#1c1917]">{row.firstDriverName}</div>
                            <div className="font-mono text-[11px] text-[#78716c]">{row.firstDriverPhone}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-[#1c1917]">{row.secondDriverName || '—'}</div>
                            <div className="font-mono text-[11px] text-[#78716c]">{row.secondDriverPhone || '—'}</div>
                          </td>
                          <td className="py-2.5 px-3 text-[#57534e]">
                            {row.vehicleType}
                          </td>
                          <td className="py-2.5 px-3 text-[#57534e]">
                            {row.baseHub}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {row.isValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                                Ready
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300"
                                title={row.warning}
                              >
                                Skip
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#e6e0d4] bg-[#fbf9f5] flex items-center justify-between">
          <button
            type="button"
            id="btn-cancel-upload"
            onClick={handleClose}
            className="px-4 py-2.5 rounded-xl bg-[#f5f0e6] hover:bg-[#eae3d2] text-[#44403c] hover:text-[#1c1917] border border-[#ded7c8] text-xs font-semibold transition cursor-pointer"
          >
            {uploadResult ? 'Close' : 'Cancel'}
          </button>

          {parsedRows.length > 0 && !uploadResult && (
            <button
              type="button"
              id="btn-confirm-fleet-upload"
              onClick={handleConfirmUpload}
              disabled={isUploading || validRowCount === 0}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-stone-950" />
                  <span>Syncing Fleet in Firestore...</span>
                </>
              ) : (
                <>
                  <Car className="w-4 h-4" />
                  <span>Confirm Upload ({validRowCount} Cabs)</span>
                </>
              )}
            </button>
          )}

          {uploadResult && (
            <button
              type="button"
              id="btn-done-upload"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Done (Return to Dashboard)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
