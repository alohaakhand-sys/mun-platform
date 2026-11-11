"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, Download, Printer, ShieldCheck, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { certificateTemplate } from "@/lib/data/eventLook";

interface CertificateDownloadProps {
  eventId: string;
  delegateUid: string;
  applicationId: string;
  delegateName: string;
  conferenceName: string;
  committeeName: string;
  countryName: string;
  date: string;
  role: string;
  /** event.certificateTemplate (the organizer's pick under Tools › Certificates). */
  template?: string;
}

export function CertificateDownload({ 
  eventId,
  delegateUid,
  applicationId,
  delegateName, 
  conferenceName, 
  committeeName, 
  countryName, 
  date,
  role,
  template,
}: CertificateDownloadProps) {
  const look = certificateTemplate(template);
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const handlePrint = () => {
    window.print();
  };

  // Built in the browser: the old generateCertificate Cloud Function needs the Blaze plan.
  const handleDownloadPdf = async () => {
    setIsGenerating(true);
    try {
      const { downloadCertificatePdf } = await import("@/lib/pdf/certificatePdf");
      await downloadCertificatePdf({
        template: look,
        title: "Certificate of Participation",
        name: delegateName,
        line: `has successfully participated as a ${role} representing ${countryName} in the ${committeeName} committee during the`,
        conference: conferenceName,
        date,
      }, `${conferenceName} certificate`);
    } catch (error) {
      console.error("Failed to build certificate", error);
      alert("Couldn't build the PDF. Please try again, or use Print Certificate.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass-card border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Award className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle>Recognition & Awards</CardTitle>
              <CardDescription>Download your official certificate of participation.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Certificate Preview */}
          <div className="relative overflow-hidden rounded-xl border border-border/40 shadow-sm bg-white aspect-[1.414/1] max-w-2xl mx-auto p-12 text-black print:m-0 print:shadow-none print:border-none print:w-[297mm] print:h-[210mm]">
            {/* Border Decorations */}
            <div className={
              look === "modern" ? "absolute inset-y-0 left-0 w-3 bg-violet-600 pointer-events-none"
              : look === "ornate" ? "absolute inset-3 border-[12px] border-[#d4af37] pointer-events-none"
              : "absolute inset-4 border-[10px] border-double border-slate-800/70 rounded-lg pointer-events-none"
            } />
            <div className="absolute top-0 left-0 w-32 h-32 bg-primary/5 rounded-br-full -z-10" />
            <div className="absolute bottom-0 right-0 w-32 h-32 bg-primary/5 rounded-tl-full -z-10" />
            
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                <ShieldCheck className="w-12 h-12 text-primary" />
              </div>
              
              <div className="space-y-2">
                <h4 className="text-sm font-bold uppercase tracking-[0.3em] text-primary/60">Certificate of Participation</h4>
                <p className="text-xs italic text-muted-foreground">This is to certify that</p>
              </div>

              <h2 className="text-4xl font-serif font-bold text-slate-900 border-b-2 border-primary/30 pb-2 px-8">
                {delegateName}
              </h2>

              <p className="max-w-md text-sm leading-relaxed text-slate-700">
                has successfully participated as a <span className="font-bold text-primary">{role}</span> representing <span className="font-bold">{countryName}</span> in the <span className="font-bold">{committeeName}</span> committee during the 
              </p>

              <h3 className="text-2xl font-bold tracking-tight text-slate-800">
                {conferenceName}
              </h3>

              <div className="flex justify-between w-full mt-12 pt-8 px-12 border-t border-slate-100">
                <div className="text-center">
                  <div className="h-0.5 w-32 bg-slate-200 mb-1" />
                  <p className="text-[10px] font-bold uppercase">Secretary General</p>
                </div>
                <div className="text-center flex flex-col items-center">
                   <p className="text-xs font-medium text-slate-500 mb-1">{date}</p>
                   <p className="text-[10px] font-bold uppercase">Dated</p>
                </div>
                <div className="text-center">
                  <div className="h-0.5 w-32 bg-slate-200 mb-1" />
                  <p className="text-[10px] font-bold uppercase">Organizing Chair</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button className="gap-2 shadow-sm" onClick={handlePrint} disabled={isGenerating}>
              <Printer className="w-4 h-4" /> Print Certificate
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleDownloadPdf} disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {isGenerating ? "Building PDF..." : "Download PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\:w-\[297mm\] {
            visibility: visible;
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .print\:w-\[297mm\] * {
            visibility: visible;
          }
        }
      `}</style>
    </div>
  );
}
