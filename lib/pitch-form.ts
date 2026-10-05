import { z } from "zod";

export const NewPitchSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  tagline: z.string().trim().min(1, "Tagline is required"),
  founder: z.string().trim().min(1, "Founder is required"),
  sector: z.string().min(1, "Sector is required"),
  ask_amount: z.number({ message: "Ask must be a number" }).positive("Ask must be positive"),
  equity_offered: z.number({ message: "Equity must be a number" }).min(1, "Equity must be 1–100").max(100, "Equity must be 1–100"),
  revenue: z.number({ message: "Revenue must be a number" }).min(0, "Revenue cannot be negative"),
  growth_pct: z.number({ message: "Growth must be a number" }),
  monthly_burn: z.number({ message: "Burn must be a number" }).min(0, "Burn cannot be negative"),
  pitch_text: z.string().trim().min(50, "Pitch text needs at least 50 characters"),
});
export type NewPitchInput = z.infer<typeof NewPitchSchema>;
