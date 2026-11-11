// Premade MUN committee templates.
// Country values are ISO-2 lowercase codes matching src/flags/*.webp filenames.

export interface CommitteeTemplateGroup {
  label: string;
  countries: string[];
}

export interface CommitteeTemplate {
  id: string;
  name: string;
  shortName: string;
  description: string;
  countries: string[];
  groups?: CommitteeTemplateGroup[];
  recommendedCapacity?: number;
}

export const COMMITTEE_TEMPLATES: CommitteeTemplate[] = [
  {
    id: "unsc",
    name: "United Nations Security Council",
    shortName: "UNSC",
    description:
      "15-member council. 5 Permanent Members (P5) with veto + 10 rotating Non-Permanent Members.",
    recommendedCapacity: 15,
    groups: [
      {
        label: "Permanent Members (P5)",
        countries: ["us", "gb", "cn", "fr", "ru"],
      },
      {
        label: "Non-Permanent Members",
        countries: ["dz", "ec", "gy", "jp", "mt", "mz", "kr", "sl", "si", "ch"],
      },
    ],
    countries: [
      "us", "gb", "cn", "fr", "ru",
      "dz", "ec", "gy", "jp", "mt", "mz", "kr", "sl", "si", "ch",
    ],
  },
  {
    id: "undp",
    name: "United Nations Development Programme",
    shortName: "UNDP",
    description:
      "36-member Executive Board allocated across five regional blocks.",
    recommendedCapacity: 36,
    groups: [
      {
        label: "African States (8)",
        countries: ["dz", "td", "km", "ci", "et", "ls", "ng", "so"],
      },
      {
        label: "Asia-Pacific States (7)",
        countries: ["bd", "cn", "in", "id", "ir", "pk", "qa"],
      },
      {
        label: "Eastern European States (4)",
        countries: ["am", "cz", "ro", "ua"],
      },
      {
        label: "Latin American & Caribbean States (5)",
        countries: ["br", "co", "gt", "pe", "tt"],
      },
      {
        label: "Western European & Other States (12)",
        countries: ["at", "ca", "dk", "fi", "fr", "de", "jp", "nl", "no", "se", "gb", "us"],
      },
    ],
    countries: [
      "dz", "td", "km", "ci", "et", "ls", "ng", "so",
      "bd", "cn", "in", "id", "ir", "pk", "qa",
      "am", "cz", "ro", "ua",
      "br", "co", "gt", "pe", "tt",
      "at", "ca", "dk", "fi", "fr", "de", "jp", "nl", "no", "se", "gb", "us",
    ],
  },
];

export function getTemplate(id: string): CommitteeTemplate | undefined {
  return COMMITTEE_TEMPLATES.find(t => t.id === id);
}
