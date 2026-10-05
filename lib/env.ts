export const isMockMode = () => process.env.NEXT_PUBLIC_MOCK_MODE === "true" || !process.env.ANTHROPIC_API_KEY;
