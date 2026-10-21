import type { AiProvider } from "./ai/provider.js";
import { arrayOf, object, STRING } from "./ai/schema.js";
import { SECTION_KEYS, type Profile, type ProfileQuestion, type Role } from "./profileTypes.js";

const SCHEMA = object({
  questions: arrayOf(
    object({
      section: { enum: [...SECTION_KEYS] },
      entry: { type: ["integer", "null"] },
      question: STRING,
    }),
  ),
});

const SYSTEM = `You help a job seeker complete their profile. The profile is the only source of facts for
CVs tailored to each job, and later for filling in application forms, so gaps cost them.
Read the profile and ask the follow-up questions whose answers would most improve it, for example:
- results and numbers missing from a job's facts ("How many tests did the framework run?"),
- tools or skills used in a job or project but not listed,
- missing dates, links, grades, or a missing summary,
- sections that are empty but probably have something (projects, languages, military service),
- target roles: which kinds of jobs they want, and what to emphasise for each,
- preferences: locations, work model, seniority, job types.
Rules:
- At most 15 questions, most useful first. Short and concrete; name the entry you ask about.
- section: where the answer belongs. entry: the index (from 0) of the item in that section's list
  the question is about, or null for the section as a whole.
- Never ask about something the profile already answers.
- Write the questions in English.`;

// Follow-up questions about what is missing or thin in the profile.
export async function profileQuestions(
  ai: AiProvider,
  profile: Profile,
  roles: Role[],
): Promise<ProfileQuestion[]> {
  const prompt =
    "The profile (JSON):\n" +
    JSON.stringify(profile, null, 2) +
    "\n\nTarget roles (JSON, section \"roles\"):\n" +
    JSON.stringify(roles, null, 2);
  const answer = await ai.generateJson<{ questions: ProfileQuestion[] }>({ system: SYSTEM, prompt, schema: SCHEMA });
  return answer.questions;
}
