// ============================================================================
// Golden native fixtures — dossier-exact wire shapes (§6.C.1, §6.E.1, §6.F.1,
// §6.G.1). These are the stub seam: the fake transport replays them so the
// whole cell self-tests with zero network and zero real keys. Swapping in the
// live network is createCell({fetchImpl: fetch}) — nothing else changes.
//
// FACADE: the fixtures are split BY PROVIDER under ./goldens/ (anthropic /
// openai / gemini / task) with every golden byte-identical to the single-file
// version this replaced. This module path keeps the full fixture surface.
// ============================================================================

export {
  anthropicWeatherResponse, anthropicContinuationResponse, anthropicModelsResponse,
  anthropicAuthErrorBody, anthropicBillingErrorBody, anthropicOverloadedBody,
  anthropicRateLimitBody,
} from "./goldens/anthropic.ts";
export {
  openaiWeatherResponse, openaiContinuationResponse,
  openaiResponsesFunctionCallItem, openaiResponsesUsage, openaiModelsResponse,
  openaiInvalidKeyBody, openaiInsufficientQuotaBody, openaiRateLimitBody,
  openaiServerErrorBody,
} from "./goldens/openai.ts";
export {
  geminiWeatherResponse, geminiWeatherResponseNoId, geminiContinuationResponse,
  geminiModelsResponse, geminiKeyInvalidBody, geminiResourceExhaustedBody,
  geminiFailedPreconditionBody, geminiUnavailableBody,
} from "./goldens/gemini.ts";
export { weatherTask, executeWeatherTool } from "./goldens/task.ts";
