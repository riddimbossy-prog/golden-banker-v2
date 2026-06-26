/* =============================================
   STRICT BANKER MODE - New Conservative Engine
   Based on user's detailed rules (June 2026)
   One clean market per match or "No Bet"
   ============================================= */

const StrictBankerEngine = {
  // Team Tier Assignment (basic heuristic - enhance later with more data)
  getTier(team) {
    const ppg = team.overallPPG || 0;
    const position = team.leaguePosition || 10;
    const gd = team.goalDifference || 0;

    if (ppg >= 2.2 || position <= 3) return 1;           // Elite
    if (ppg >= 1.8 || position <= 6) return 2;           // Promotion/European
    if (ppg >= 1.4 || position <= 10) return 3;          // Upper mid
    if (ppg >= 1.0 || position <= 15) return 4;          // Lower mid
    return 5;                                             // Weak / Relegation
  },

  // Major Red Flags (2 or more = No Bet)
  hasMajorRedFlag(match) {
    const flags = [
      match.isDerby === true,
      match.isCup === true,
      match.neutralVenue === true,
      match.rotationRisk === true,
      match.keyInjuries === true,
      match.extremeWeather === true,
      match.motivationUnclear === true,
      match.deadRubber === true
    ];
    return flags.filter(Boolean).length >= 2;
  },

  // Main Analyzer
  analyze(match) {
    if (!match || !match.home || !match.away) {
      return { finalMarket: "No Bet", confidence: 0, reason: "Invalid data" };
    }

    // Red Flags
    if (this.hasMajorRedFlag(match)) {
      return {
        finalMarket: "No Bet",
        confidence: 0,
        reason: "Multiple major red flags detected",
        tierHome: this.getTier(match.home),
        tierAway: this.getTier(match.away)
      };
    }

    const homeTier = this.getTier(match.home);
    const awayTier = this.getTier(match.away);
    const tierGap = Math.abs(homeTier - awayTier);

    // Same Tier = No Bet
    if (homeTier === awayTier) {
      return {
        finalMarket: "No Bet",
        confidence: 0,
        reason: "Same-tier matchup (50/50 risk)",
        tierHome: homeTier,
        tierAway: awayTier,
        tierGap: 0
      };
    }

    const homePPG = match.home.homePPG || 0;
    const awayPPG = match.away.awayPPG || 0;
    const strongerIsHome = homeTier < awayTier;

    let candidate = null;
    let confidence = 5;

    if (strongerIsHome) {
      if (homePPG >= 2.5 && tierGap >= 2) {
        candidate = "Home Win";
        confidence += 4;
      } else {
        candidate = "Home DNB";
        confidence += 2;
      }
    } else {
      if (awayPPG >= 2.5 && tierGap >= 2 && (match.home.homePPG || 0) <= 1.3) {
        candidate = "Away Win";
        confidence += 4;
      } else {
        candidate = "Away DNB";
        confidence += 2;
      }
    }

    if (tierGap >= 3) confidence += 2;
    confidence = Math.min(10, Math.max(0, confidence));

    if (confidence < 7) {
      return {
        finalMarket: "No Bet",
        confidence,
        reason: `Confidence too low (${confidence}/10)`,
        tierHome: homeTier,
        tierAway: awayTier,
        tierGap
      };
    }

    return {
      finalMarket: candidate,
      confidence,
      reason: `Tier advantage + PPG check passed`,
      tierHome: homeTier,
      tierAway: awayTier,
      tierGap
    };
  }
};
/* =============================================
   STRICT BANKER MODE (added)
   One clean market per match or "No Bet"
   ============================================= */
const StrictBankerEngine = {
  getTier(team) {
    const ppg = team.overallPPG || 0;
    const position = team.leaguePosition || 10;
    const gd = team.goalDifference || 0;
    if (ppg >= 2.2 || position <= 3) return 1;
    if (ppg >= 1.8 || position <= 6) return 2;
    if (ppg >= 1.4 || position <= 10) return 3;
    if (ppg >= 1.0 || position <= 15) return 4;
    return 5;
  },

  hasMajorRedFlag(match) {
    const flags = [
      match.isDerby === true,
      match.isCup === true,
      match.neutralVenue === true,
      match.rotationRisk === true,
      match.keyInjuries === true,
      match.extremeWeather === true,
      match.motivationUnclear === true,
      match.deadRubber === true
    ];
    return flags.filter(Boolean).length >= 2;
  },

  analyze(match) {
    if (!match || !match.home || !match.away) {
      return { finalMarket: "No Bet", confidence: 0, reason: "Invalid data" };
    }

    if (this.hasMajorRedFlag(match)) {
      return {
        finalMarket: "No Bet",
        confidence: 0,
        reason: "Multiple major red flags detected",
        tierHome: this.getTier(match.home),
        tierAway: this.getTier(match.away)
      };
    }

    const homeTier = this.getTier(match.home);
    const awayTier = this.getTier(match.away);
    const tierGap = Math.abs(homeTier - awayTier);

    if (homeTier === awayTier) {
      return {
        finalMarket: "No Bet",
        confidence: 0,
        reason: "Same-tier matchup (50/50 risk)",
        tierHome: homeTier,
        tierAway: awayTier,
        tierGap: 0
      };
    }

    const homePPG = match.home.homePPG || 0;
    const awayPPG = match.away.awayPPG || 0;
    const strongerIsHome = homeTier < awayTier;

    let candidate = null;
    let confidence = 5;

    if (strongerIsHome) {
      if (homePPG >= 2.5 && tierGap >= 2) {
        candidate = "Home Win";
        confidence += 4;
      } else {
        candidate = "Home DNB";
        confidence += 2;
      }
    } else {
      if (awayPPG >= 2.5 && tierGap >= 2 && (match.home.homePPG || 0) <= 1.3) {
        candidate = "Away Win";
        confidence += 4;
      } else {
        candidate = "Away DNB";
        confidence += 2;
      }
    }

    if (tierGap >= 3) confidence += 2;
    confidence = Math.min(10, Math.max(0, confidence));

    if (confidence < 7) {
      return {
        finalMarket: "No Bet",
        confidence,
        reason: `Confidence too low (${confidence}/10)`,
        tierHome: homeTier,
        tierAway: awayTier,
        tierGap
      };
    }

    return {
      finalMarket: candidate,
      confidence,
      reason: `Tier advantage + PPG check passed`,
      tierHome: homeTier,
      tierAway: awayTier,
      tierGap
    };
  }
};

window.StrictBankerEngine = StrictBankerEngine;
console.log("✅ Strict Banker Mode loaded successfully.");
// Make it available in browser
window.StrictBankerEngine = StrictBankerEngine;

console.log("✅ Strict Banker Mode loaded successfully.");
/* =============================================
   STRICT BANKER MODE (added to main file)
   ============================================= */
const StrictBankerEngine = {
  getTier(team) {
    const ppg = team.overallPPG || 0;
    const position = team.leaguePosition || 10;
    if (ppg >= 2.2 || position <= 3) return 1;
    if (ppg >= 1.8 || position <= 6) return 2;
    if (ppg >= 1.4 || position <= 10) return 3;
    if (ppg >= 1.0 || position <= 15) return 4;
    return 5;
  },

  hasMajorRedFlag(match) {
    const flags = [
      match.isDerby === true, match.isCup === true, match.neutralVenue === true,
      match.rotationRisk === true, match.keyInjuries === true,
      match.extremeWeather === true, match.motivationUnclear === true,
      match.deadRubber === true
    ];
    return flags.filter(Boolean).length >= 2;
  },

  analyze(match) {
    if (!match || !match.home || !match.away) return { finalMarket: "No Bet", confidence: 0, reason: "Invalid data" };

    if (this.hasMajorRedFlag(match)) {
      return { finalMarket: "No Bet", confidence: 0, reason: "Multiple major red flags" };
    }

    const homeTier = this.getTier(match.home);
    const awayTier = this.getTier(match.away);
    const tierGap = Math.abs(homeTier - awayTier);

    if (homeTier === awayTier) {
      return { finalMarket: "No Bet", confidence: 0, reason: "Same-tier matchup" };
    }

    const homePPG = match.home.homePPG || 0;
    const awayPPG = match.away.awayPPG || 0;
    const strongerIsHome = homeTier < awayTier;

    let candidate = null;
    let confidence = 5;

    if (strongerIsHome) {
      candidate = (homePPG >= 2.5 && tierGap >= 2) ? "Home Win" : "Home DNB";
      confidence += (candidate === "Home Win") ? 4 : 2;
    } else {
      candidate = (awayPPG >= 2.5 && tierGap >= 2 && (match.home.homePPG || 0) <= 1.3) ? "Away Win" : "Away DNB";
      confidence += (candidate === "Away Win") ? 4 : 2;
    }

    if (tierGap >= 3) confidence += 2;
    confidence = Math.min(10, Math.max(0, confidence));

    if (confidence < 7) {
      return { finalMarket: "No Bet", confidence, reason: `Confidence too low (${confidence}/10)` };
    }

    return {
      finalMarket: candidate,
      confidence,
      reason: "Tier advantage + PPG check passed",
      tierHome: homeTier,
      tierAway: awayTier,
      tierGap
    };
  }
};

window.StrictBankerEngine = StrictBankerEngine;
console.log("✅ Strict Banker Mode added to main engine");

