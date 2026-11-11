"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, BadgeCheck, FileBarChart, Presentation, Settings2, Users } from "lucide-react";

export default function ToolsOverviewPage() {
  const params = useParams();
  const eventId = params.id as string;

  const tools = [
    {
      title: "ID Card Generator",
      description: "Generate and print professional ID cards for all delegates and staff automatically.",
      icon: <Users className="w-6 h-6 text-blue-500" />,
      href: `/dashboard/organizer/events/${eventId}/tools/id-cards`,
      status: "active"
    },
    {
      title: "Certificates Studio",
      description: "Design and issue digital certificates to participants securely via blockchain.",
      icon: <BadgeCheck className="w-6 h-6 text-green-500" />,
      href: `/dashboard/organizer/events/${eventId}/tools/certificates`,
      status: "active"
    },
    {
      title: "Live Results",
      description: "Tally points, calculate awards, and publish final committee results instantly.",
      icon: <FileBarChart className="w-6 h-6 text-primary" />,
      href: `/dashboard/organizer/events/${eventId}/tools/results`,
      status: "beta"
    },
    {
      title: "Theme Settings",
      description: "Customize the public portal with your conference colors, logos, and styling.",
      icon: <Settings2 className="w-6 h-6 text-orange-500" />,
      href: `/dashboard/organizer/events/${eventId}/tools/theme`,
      status: "active"
    }
  ];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Organizer Tools & Modules</h2>
        <p className="text-muted-foreground mt-1">Access powerful utilities to streamline your conference operations.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map((tool, idx) => (
          <Card key={idx} className="glass-card flex flex-col hover:border-primary/30 transition-colors group">
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                  {tool.icon}
                </div>
                {tool.status === 'beta' && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">Beta</Badge>
                )}
              </div>
              <CardTitle className="text-xl">{tool.title}</CardTitle>
              <CardDescription className="line-clamp-2">{tool.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto pt-0">
              <Button variant="secondary" className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all" render={<Link href={tool.href} />} nativeButton={false}>
                Launch Tool <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        ))}
        
        {/* Placeholder for future tools */}
        <Card className="border-2 border-dashed border-border/50 bg-transparent flex flex-col items-center justify-center text-center p-8 min-h-[240px]">
          <Presentation className="w-10 h-10 text-muted-foreground/30 mb-4" />
          <h3 className="font-semibold text-muted-foreground">More coming soon</h3>
          <p className="text-sm text-muted-foreground/60 mt-1">We are constantly adding new tools to help organizers.</p>
        </Card>
      </div>
    </div>
  );
}
