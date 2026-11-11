import { ApplicationData, updateApplication } from "./applicationService";
import { EventData, Committee } from "./eventService";
import { belongsToCommittee } from "@/lib/utils/committee";
import { isFacultyRole } from "./staffService";

export interface AssignmentSuggestion {
  applicationId: string;
  userId: string;
  suggestedCountry: string;
  reason: string;
}

import { batchCheckConflicts, ConflictRecord } from "./conflictService";

/**
 * Heuristic-based AI assignment suggestion logic with conflict checking.
 */
export async function suggestCountryAssignments(
  applications: ApplicationData[],
  committee: Committee,
  eventId: string
): Promise<AssignmentSuggestion[]> {
  // 1. Get only approved applications for this committee
  const validApps = applications.filter(app =>
    app.status === "approved" &&
    !isFacultyRole(app.role) &&
    belongsToCommittee(app, committee.name)
  );

  // 2. Filter out already assigned ones
  const unassignedApps = validApps.filter(app => !app.assignedCountry);
  const availableCountries = [...committee.countries].filter(country => 
    !validApps.some(app => app.assignedCountry === country)
  );

  const suggestions: AssignmentSuggestion[] = [];

  // 3. Simple heuristic: match choices first, then experience length
  // Sort by experience length (proxy for complexity)
  const sortedApps = [...unassignedApps].sort((a, b) => (b.experience?.length || 0) - (a.experience?.length || 0));

  // Conflicts for every applicant x offered country, fetched once. Looking one up per
  // candidate country inside the loop below would be one network round-trip each.
  const conflictMap = await batchCheckConflicts(sortedApps, committee.countries ?? [], eventId);
  const conflictFor = (userId: string, country: string): ConflictRecord | null =>
    conflictMap.get(`${userId}_${country}`) ?? null;

  for (const app of sortedApps) {
    if (availableCountries.length === 0) break;

    let countryToAssign = "";
    let reason = "";

    const candidateCountries = [app.choices.primary.country, app.choices.secondary.country, ...availableCountries];
    let conflict: ConflictRecord | null = null;
    let foundSafe = false;

    for (const candidate of candidateCountries) {
      if (!availableCountries.includes(candidate)) continue;
      
      const potentialConflict = conflictFor(app.userId, candidate);
      if (potentialConflict) {
        if (!conflict) conflict = potentialConflict; // Save first conflict as fallback if no safe country found
        continue;
      }
      
      countryToAssign = candidate;
      if (candidate === app.choices.primary.country) reason = "Matched primary choice";
      else if (candidate === app.choices.secondary.country) reason = "Matched secondary choice";
      else reason = "Auto-assigned based on availability and experience";
      foundSafe = true;
      break;
    }

    if (!foundSafe && conflict && availableCountries.includes(conflict.country)) {
      countryToAssign = conflict.country;
      reason = `No conflict-free option available; reusing ${conflict.country} last held at ${conflict.eventName}.`;
    } else if (!foundSafe && availableCountries.length > 0) {
      // should only happen if somehow all countries conflict, just pick first
      countryToAssign = availableCountries[0];
      reason = "Assigned despite conflicts (no better options)";
    }

    if (countryToAssign) {
      suggestions.push({
        applicationId: (app as any).id,
        userId: app.userId,
        suggestedCountry: countryToAssign,
        reason
      });
      // Remove assigned country from pool
      const index = availableCountries.indexOf(countryToAssign);
      if (index > -1) availableCountries.splice(index, 1);
    }
  }

  return suggestions;
}

export async function applyAIAssignments(suggestions: AssignmentSuggestion[]): Promise<void> {
  await Promise.all(
    suggestions.map(s => 
      updateApplication(s.applicationId, { 
        assignedCountry: s.suggestedCountry 
      })
    )
  );
}
