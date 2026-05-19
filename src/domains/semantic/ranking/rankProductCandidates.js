const ABSOLUTE_CONFIDENCE_THRESHOLD = 0.72;

const DOMINANCE_THRESHOLD = 0.18;

const AMBIGUOUS_WINDOW = 0.08;

const MINIMUM_CANDIDATE_SCORE = 0.3;

export function rankProductCandidates({ candidates = [] }) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      decision: "NONE",
      bestScore: 0,
      topCandidates: [],
      ranked: [],
    };
  }

  // =====================================================
  // SORT
  // =====================================================

  const ranked = [...candidates].sort((a, b) => b.score - a.score);

  const bestScore = ranked[0]?.score || 0;

  // =====================================================
  // TOP CANDIDATES WINDOW
  // =====================================================

  const topCandidates = ranked.filter(
    (candidate) => candidate.score >= bestScore - 0.15,
  );

  // =====================================================
  // DECISION ENGINE
  // =====================================================

  let decision = "NONE";

  if (topCandidates.length === 1 && bestScore >= MINIMUM_CANDIDATE_SCORE) {
    decision = "WINNER";
  } else if (topCandidates.length > 1) {
    decision = "AMBIGUOUS";
  }

  return {
    decision,
    bestScore,
    topCandidates,
    ranked,
  };
}
