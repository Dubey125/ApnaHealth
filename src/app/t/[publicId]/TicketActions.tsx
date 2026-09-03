"use client";

interface TicketActionsProps {
  tokenNumber: number;
  doctorName: string;
  clinicName: string;
  clinicAddress: string;
  clinicCity: string;
  clinicPhone: string;
  publicId: string;
}

export function TicketActions({
  tokenNumber,
  doctorName,
  clinicName,
  clinicAddress,
  clinicCity,
  clinicPhone,
  publicId,
}: TicketActionsProps) {
  const currentUrl = typeof window !== "undefined" ? window.location.href : `https://apnahealth.in/t/${publicId}`;

  const shareText = encodeURIComponent(
    `ApnaHealth Live OPD Token #${tokenNumber} for ${doctorName} at ${clinicName}.\nTrack live queue: ${currentUrl}`
  );
  const whatsappUrl = `https://api.whatsapp.com/send?text=${shareText}`;

  const mapsQuery = encodeURIComponent(`${clinicName}, ${clinicAddress}, ${clinicCity}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 no-print">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">Quick Actions</span>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:border-success hover:text-success transition-colors"
        >
          <span>💬 Share on WhatsApp</span>
        </a>

        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <span>🖨️ Print OPD Pass</span>
        </button>

        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <span>📍 Google Maps</span>
        </a>

        <a
          href={`tel:${clinicPhone}`}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <span>📞 Call Clinic</span>
        </a>
      </div>
    </div>
  );
}
