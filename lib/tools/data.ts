export const MARKET_DATA: Record<string, { tam_usd: number; cagr_pct: number; competitors: string[] }> = {
  "Food & Beverage": { tam_usd: 38e9, cagr_pct: 6, competitors: ["Blue Bottle", "Starship Foods", "Freshii"] },
  "Consumer Health": { tam_usd: 22e9, cagr_pct: 11, competitors: ["Embark", "Curology", "Function"] },
  "Climate": { tam_usd: 61e9, cagr_pct: 14, competitors: ["Scale Microgrids", "BoxPower"] },
  "Fintech": { tam_usd: 14e9, cagr_pct: 13, competitors: ["Bench", "Pilot", "Keeper"] },
  "Consumer Apps": { tam_usd: 9e9, cagr_pct: 9, competitors: ["Fitbod", "Future", "Peloton App"] },
  "Web3": { tam_usd: 3e9, cagr_pct: 4, competitors: ["Blackbird", "Fetch Rewards"] },
  "Education": { tam_usd: 11e9, cagr_pct: 8, competitors: ["Code Ninjas", "iD Tech"] },
  "Logistics": { tam_usd: 27e9, cagr_pct: 17, competitors: ["Zipline", "Wing"] },
  "Marketplaces": { tam_usd: 18e9, cagr_pct: 12, competitors: ["Depop", "Poshmark", "Vinted"] },
};
export const COMPARABLE_DEALS: Array<{ company: string; sector: string; stage: string; valuation: number; revenue_multiple: number; year: number }> = [
  { company: "Cafe X", sector: "Food & Beverage", stage: "Seed", valuation: 4e6, revenue_multiple: 6, year: 2024 },
  { company: "Snackpass", sector: "Food & Beverage", stage: "Seed", valuation: 8e6, revenue_multiple: 9, year: 2023 },
  { company: "Wisdom Panel Jr", sector: "Consumer Health", stage: "Seed", valuation: 12e6, revenue_multiple: 8, year: 2025 },
  { company: "Keeper Tax", sector: "Fintech", stage: "Seed", valuation: 10e6, revenue_multiple: 12, year: 2024 },
  { company: "Ladder", sector: "Consumer Apps", stage: "Pre-seed", valuation: 5e6, revenue_multiple: 0, year: 2025 },
  { company: "Code Ninjas Franchise", sector: "Education", stage: "Seed", valuation: 3e6, revenue_multiple: 4, year: 2023 },
  { company: "Matternet", sector: "Logistics", stage: "Seed", valuation: 9e6, revenue_multiple: 10, year: 2024 },
  { company: "Curtsy", sector: "Marketplaces", stage: "Seed", valuation: 7e6, revenue_multiple: 8, year: 2024 },
  { company: "Solstice Farms", sector: "Climate", stage: "Seed", valuation: 15e6, revenue_multiple: 11, year: 2025 },
  { company: "Blackbird Labs", sector: "Web3", stage: "Seed", valuation: 20e6, revenue_multiple: 40, year: 2023 },
];
export const PORTFOLIO = [
  { company: "Brewly", sector: "Food & Beverage", invested: 400000, ownership_pct: 11, note: "CONFIDENTIAL — competing coffee kiosk portfolio company" },
  { company: "Campus Eats", sector: "Food & Beverage", invested: 250000, ownership_pct: 9, note: "CONFIDENTIAL — student food delivery" },
];
