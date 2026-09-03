"use client";

import { formatClinicDate, formatClinicTime } from "@/lib/format";

export interface TokenSlipData {
  tokenNumber: number;
  clinicName: string;
  doctorName: string;
  doctorSpecialty: string;
  locationLabel: string;
  sessionDate: Date | string;
  patientName: string;
  patientPhone?: string | null;
  source: string;
  issuedAt: Date | string;
  estimatedWindowStart?: Date | string | null;
  estimatedWindowEnd?: Date | string | null;
}

export function TokenSlipPrintView({ data }: { data: TokenSlipData }) {
  const sessionDate = typeof data.sessionDate === "string" ? new Date(data.sessionDate) : data.sessionDate;
  const issuedAt = typeof data.issuedAt === "string" ? new Date(data.issuedAt) : data.issuedAt;
  const winStart = data.estimatedWindowStart ? (typeof data.estimatedWindowStart === "string" ? new Date(data.estimatedWindowStart) : data.estimatedWindowStart) : null;
  const winEnd = data.estimatedWindowEnd ? (typeof data.estimatedWindowEnd === "string" ? new Date(data.estimatedWindowEnd) : data.estimatedWindowEnd) : null;

  return (
    <div className="printable-token-slip hidden print:block text-black bg-white text-center font-mono p-4 border border-dashed border-gray-400 max-w-[80mm] mx-auto">
      <div className="border-b border-black pb-2 mb-2">
        <h1 className="text-base font-bold uppercase">{data.clinicName}</h1>
        <p className="text-xs">OPD Consultation Serial</p>
      </div>

      <div className="my-3">
        <p className="text-xs font-semibold uppercase">Token Number</p>
        <p className="text-5xl font-black tabular-nums my-1">#{data.tokenNumber}</p>
        <p className="text-xs font-medium uppercase text-gray-800">{data.source === "WALK_IN" ? "Walk-In Patient" : "Online Booked"}</p>
      </div>

      <div className="border-t border-b border-gray-400 py-2 my-2 text-xs text-left space-y-1">
        <div><span className="font-bold">Doctor:</span> {data.doctorName}</div>
        <div><span className="font-bold">Specialty:</span> {data.doctorSpecialty}</div>
        <div><span className="font-bold">Room:</span> {data.locationLabel}</div>
        <div><span className="font-bold">Patient:</span> {data.patientName}</div>
        {data.patientPhone && <div><span className="font-bold">Phone:</span> {data.patientPhone}</div>}
        <div><span className="font-bold">Date:</span> {formatClinicDate(sessionDate)}</div>
        {winStart && winEnd && (
          <div className="mt-1 pt-1 border-t border-dotted border-gray-400 font-bold">
            <span>Est. Arrival: </span>
            <span>{formatClinicTime(winStart)} – {formatClinicTime(winEnd)}</span>
          </div>
        )}
      </div>

      <div className="text-[10px] text-gray-600 mt-2 space-y-1">
        <p>Issued at: {formatClinicTime(issuedAt)}</p>
        <p>Please wait for your token to be announced on the waiting hall screen.</p>
        <p className="font-bold mt-1">Powered by ApnaHealth</p>
      </div>
    </div>
  );
}
