import Link from "next/link";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Footer } from "@/components/ui/Footer";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { AudienceCard } from "@/components/marketing/AudienceCard";
import { InteractiveQueueDemo } from "@/components/marketing/InteractiveQueueDemo";

const TRUST_ITEMS = [
  "Verified Doctor Registrations (NMC)",
  "Real-Time OPD Queue Tracking",
  "Dynamic Arrival Windows (ETA)",
  "Authorized Patient Health Locker",
];

const POPULAR_SPECIALTIES = [
  { name: "General Physician", count: "Fever, Cold, General Health", icon: "🩺" },
  { name: "Cardiologist", count: "Heart, Blood Pressure, ECG", icon: "❤️" },
  { name: "Pediatrician", count: "Child Care, Vaccination", icon: "👶" },
  { name: "Dermatologist", count: "Skin, Hair & Allergies", icon: "✨" },
  { name: "Orthopedic", count: "Joints, Bones, Back Pain", icon: "🦴" },
  { name: "Gynecologist", count: "Women's Health, Pregnancy", icon: "🌸" },
  { name: "ENT Specialist", count: "Ear, Nose, Throat & Sinus", icon: "👂" },
  { name: "Ophthalmologist", count: "Eye Care, Vision Check", icon: "👁️" },
];

const HOW_IT_WORKS = [
  { step: "Need", body: "You or a family member needs to see a doctor." },
  { step: "Discover", body: "Search by specialty, doctor name, or city with verified credentials." },
  { step: "Book Serial", body: "Reserve a digital OPD token for an open session in seconds." },
  { step: "Track Live", body: "Track your queue position and dynamic arrival window in real time." },
  { step: "Consult", body: "Your doctor reviews your authorized care history at point-of-care." },
  { step: "Prescription", body: "Your digital E-Prescription and advice stay in your health locker." },
];

const COMPARISON_POINTS = [
  {
    feature: "Waiting Room Experience",
    fragmented: "2–4 hours sitting in crowded clinics with no visibility into queue pace",
    apnahealth: "Real-time ETA on your phone; arrive right when it's your turn",
  },
  {
    feature: "Doctor Trust & Credentials",
    fragmented: "Uncertain qualifications and unverified local clinic claims",
    apnahealth: "Every doctor verified with official State Medical Council / NMC registration",
  },
  {
    feature: "Doctor Breaks & Delays",
    fragmented: "Unexpected doctor hospital rounds leave patients stranded in the dark",
    apnahealth: "Dynamic ETA engine automatically recalculates arrival times for breaks and delays",
  },
  {
    feature: "Medical History",
    fragmented: "Lost paper files, repeated blood tests, and re-explaining past diagnoses",
    apnahealth: "Authorized longitudinal health record carried securely with the patient",
  },
];

const CARE_TIMELINE = [
  { date: "12 Jun 2026", doctor: "Dr. Aditi Sharma", clinic: "Apex Heart & Medical Care", note: "Follow-up: BP 120/80 mmHg stable. Prescribed Telmisartan 40mg. Next review in 3 months." },
  { date: "3 Mar 2026", doctor: "Dr. Aditi Sharma", clinic: "Apex Heart & Medical Care", note: "Primary diagnosis: Essential Hypertension. Ordered Lipid Profile & ECG." },
  { date: "18 Nov 2025", doctor: "Dr. Rohan Mehta", clinic: "Mehta Pediatric & Family Clinic", note: "Viral Upper Respiratory Infection. Symptomatic relief prescribed. Resolved in 5 days." },
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-primary" aria-hidden="true">
      <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="flex w-full flex-1 flex-col">
        {/* 1. HERO SECTION */}
        <section className="border-b border-border bg-surface relative overflow-hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary border border-primary/20">
                🇮🇳 Connected Healthcare for India
              </span>
            </div>

            <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-foreground leading-[1.15]">
              Say Goodbye to Endless Clinic Waiting Rooms.
            </h1>
            <p className="max-w-2xl text-base text-muted sm:text-xl leading-relaxed">
              Discover verified doctors, clinics and hospitals near you, book your digital OPD token, track the live
              queue from home, and keep your authorized longitudinal medical history in one unified platform.
            </p>

            {/* Quick Search Form */}
            <form
              method="GET"
              action="/doctors"
              className="mt-2 flex w-full max-w-3xl flex-col gap-2 rounded-xl border border-border bg-background p-3.5 shadow-sm sm:flex-row sm:items-center"
            >
              <Input name="name" placeholder="Doctor name (e.g. Dr. Sharma)" aria-label="Doctor name" className="sm:flex-1" />
              <Input name="specialty" placeholder="Specialty (e.g. Cardiologist)" aria-label="Specialty" className="sm:flex-1" />
              <Input name="city" placeholder="City or Area (e.g. Pune, Bandra)" aria-label="City" className="sm:w-44" />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shrink-0"
              >
                Find Doctors
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/doctors"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Browse All Doctors
              </Link>
              <Link
                href="/clinics"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-border/40"
              >
                Browse Clinics
              </Link>
              <Link
                href="/hospitals"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-medium text-foreground transition-colors hover:bg-border/40"
              >
                Browse Hospitals
              </Link>
            </div>
          </div>
        </section>

        {/* Trust Credibility Strip */}
        <section className="border-b border-border bg-background">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-4 px-4 py-6 sm:px-6 lg:grid-cols-4">
            {TRUST_ITEMS.map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-foreground">
                <CheckIcon />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 2. INTERACTIVE QUEUE DEMO */}
        <section className="border-b border-border bg-surface py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6">
            <div className="flex flex-col gap-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Live Queue Intelligence in Action</h2>
              <p className="text-sm text-muted max-w-xl">
                See how ApnaHealth predicts your arrival window, tracks the live OPD queue, and dynamically adjusts
                for doctor breaks in real-time.
              </p>
            </div>
            <InteractiveQueueDemo />
          </div>
        </section>

        {/* 3. BROWSE BY POPULAR SPECIALTIES */}
        <section className="border-b border-border bg-background py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Consult Top Specialists</h2>
                <p className="text-sm text-muted">Book verified doctors across major clinical specialties in your city.</p>
              </div>
              <Link href="/doctors" className="text-sm font-medium text-primary hover:underline">
                View all specialties &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {POPULAR_SPECIALTIES.map((spec) => (
                <Link
                  key={spec.name}
                  href={`/doctors?specialty=${encodeURIComponent(spec.name)}`}
                  className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/50 hover:shadow-sm"
                >
                  <span className="text-3xl">{spec.icon}</span>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {spec.name}
                    </h3>
                    <p className="text-xs text-muted mt-0.5">{spec.count}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* 4. OLD WAY VS APNAHEALTH COMPARISON */}
        <section className="border-b border-border bg-surface py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
            <div className="flex flex-col gap-1 text-center sm:text-left">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why India Needs ApnaHealth</h2>
              <p className="text-sm text-muted max-w-xl">
                Transforming the high-friction, uncoordinated outpatient experience into a modern, transparent system.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-4 rounded-xl border border-danger/20 bg-danger/5 p-6">
                <div className="flex items-center gap-2 text-danger font-bold text-base">
                  <span>❌</span> Traditional Outpatient Experience
                </div>
                <ul className="flex flex-col gap-4 text-sm text-foreground">
                  {COMPARISON_POINTS.map((pt) => (
                    <li key={pt.feature} className="flex flex-col gap-1">
                      <span className="font-semibold text-muted text-xs uppercase tracking-wider">{pt.feature}</span>
                      <span className="text-muted">{pt.fragmented}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-4 rounded-xl border border-success/30 bg-success/5 p-6">
                <div className="flex items-center gap-2 text-success font-bold text-base">
                  <span>✅</span> The ApnaHealth Experience
                </div>
                <ul className="flex flex-col gap-4 text-sm text-foreground">
                  {COMPARISON_POINTS.map((pt) => (
                    <li key={pt.feature} className="flex flex-col gap-1">
                      <span className="font-semibold text-primary text-xs uppercase tracking-wider">{pt.feature}</span>
                      <span className="font-medium text-foreground">{pt.apnahealth}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. FOUR EXPERIENCES / ROLES */}
        <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-16 sm:px-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">One Coordinated Platform. Four Roles.</h2>
            <p className="max-w-xl text-sm text-muted">
              Designed specifically for the four people who make every OPD session work smoothly.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <AudienceCard
              id="for-patients"
              title="Patients"
              bullets={["Find verified doctors", "Book digital OPD tokens", "Live queue ETA tracker", "Longitudinal care locker"]}
              ctaLabel="Find a Doctor"
              ctaHref="/doctors"
            />
            <AudienceCard
              id="for-doctors"
              title="Doctors"
              bullets={["Point-of-care session hub", "Patient history timeline", "Structured E-Prescriptions", "Consultation timer"]}
              ctaLabel="Doctor Portal"
              ctaHref="/login"
            />
            <AudienceCard
              id="for-clinics"
              title="Clinics & Hospitals"
              bullets={["Doctor credential verification", "Session & break scheduler", "Queue analytics & heatmaps", "Staff management"]}
              ctaLabel="Clinic Portal"
              ctaHref="/login"
            />
            <AudienceCard
              id="for-front-desk"
              title="Front Desk & Reception"
              bullets={["Instant walk-in tokens", "Waiting room TV display", "Queue reordering & check-in", "Call next with audio chime"]}
              ctaLabel="Reception Desk"
              ctaHref="/login"
            />
          </div>
        </section>

        {/* 6. VERIFIED CREDENTIALS & TRUST */}
        <section className="border-t border-border bg-surface py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex max-w-2xl flex-col gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-success border border-success/20 w-fit">
                Doctor Verification Standard
              </span>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What &quot;Verified&quot; Actually Means on ApnaHealth</h2>
              <p className="text-sm text-muted leading-relaxed">
                Doctor profiles carry the verified badge only after their registration number is verified against the
                National Medical Commission (NMC) or relevant State Medical Council register. Verification is never
                automated or assumed — giving patients authentic peace of mind.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-3 rounded-2xl border border-border bg-background p-6 shadow-sm">
              <VerificationStatusBadge status="VERIFIED" />
              <div className="text-center">
                <span className="text-xs font-bold text-foreground block">NMC / State Council Verified</span>
                <span className="text-[11px] text-muted">Official Registration Checked</span>
              </div>
            </div>
          </div>
        </section>

        {/* 7. PATIENT CARE HISTORY SHOWCASE */}
        <section className="border-t border-border bg-background py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Your Longitudinal Care History, Always With You</h2>
              <p className="max-w-xl text-sm text-muted">
                Every consultation record and prescription your doctor enters attaches directly to your account.
                You control access and carry your medical story wherever you go.
              </p>
            </div>
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
              {CARE_TIMELINE.map((entry) => (
                <Card key={entry.date} className="flex gap-4 p-5">
                  <div className="flex w-2 shrink-0 justify-center">
                    <div className="mt-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-primary/10" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-primary">{entry.date}</span>
                      <span className="text-xs text-muted">·</span>
                      <span className="text-xs font-medium text-foreground">{entry.doctor}</span>
                      <span className="text-xs text-muted">({entry.clinic})</span>
                    </div>
                    <p className="text-sm text-foreground leading-relaxed">{entry.note}</p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 8. HOW IT WORKS */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-border bg-surface py-14">
          <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How ApnaHealth Works</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {HOW_IT_WORKS.map((item, i) => (
                <div key={item.step} className="flex flex-col gap-2 rounded-xl border border-border bg-background p-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {i + 1}
                  </div>
                  <h3 className="font-semibold text-foreground">{item.step}</h3>
                  <p className="text-sm text-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 9. STRONG CLINIC CALL TO ACTION */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <Card className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between bg-gradient-to-r from-teal-950/20 to-surface border-primary/30">
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl text-foreground">
                Run Your Clinic With Zero Waiting Room Chaos.
              </h2>
              <ul className="flex flex-col gap-2 text-sm text-muted">
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Doctor Verification &amp; Session Scheduling
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Front-Desk Queue Console &amp; Waiting TV Screen
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Longitudinal Patient Care &amp; E-Prescriptions
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon />
                  Clinic Wait-Time &amp; Throughput Analytics
                </li>
              </ul>
            </div>
            <Link
              href="/register/clinic"
              className="inline-flex h-12 shrink-0 items-center justify-center rounded-lg bg-primary px-8 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 shadow-md"
            >
              Register Your Clinic
            </Link>
          </Card>
        </section>
      </main>
      <Footer />
    </>
  );
}
