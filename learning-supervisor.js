/* ============================================================================
 * Predict2U v193 — Learning Supervisor
 * ----------------------------------------------------------------------------
 * Applies forward-tested, sample-gated learning context to every engine output.
 * It never invents a replacement market. It may only:
 *   1) preserve a qualified market,
 *   2) lower its score,
 *   3) add a small evidence-backed stability bonus (max +2), or
 *   4) abstain when repeated historical failure patterns are strong.
 *
 * Scores are analytical confidence labels, not guaranteed probabilities.
 * ========================================================================== */
(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  if(root) root.P2ULearningSupervisor=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const VERSION="v193";
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number(n)||0));
  const uniq=a=>[...new Set((a||[]).filter(Boolean).map(String))];

  function familyOf(out){
    const f=String(out&&out.market_family||"");
    if(f) return f;
    const s=String(out&&out.primary||"");
    if(/^Home Win|Home DNB|Double Chance 1X/.test(s)) return "HOME_RESULT";
    if(/^Away Win|Away DNB|Double Chance X2/.test(s)) return "AWAY_RESULT";
    if(/^Home Team Over/.test(s)) return "HOME_SCORING";
    if(/^Away Team Over/.test(s)) return "AWAY_SCORING";
    if(/^Home Team Under/.test(s)) return "HOME_SUPPRESSION";
    if(/^Away Team Under/.test(s)) return "AWAY_SUPPRESSION";
    if(/^Over/.test(s)) return "MATCH_OVER";
    if(/^Under/.test(s)) return "MATCH_UNDER";
    if(s==="BTTS Yes") return "BTTS_YES";
    if(s==="BTTS No") return "BTTS_NO";
    return "NEUTRAL";
  }

  function alignsFavorite(family,side){
    if(side==="home") return ["HOME_RESULT","HOME_SCORING","AWAY_SUPPRESSION"].includes(family);
    if(side==="away") return ["AWAY_RESULT","AWAY_SCORING","HOME_SUPPRESSION"].includes(family);
    return false;
  }

  function isGoalsFamily(f){
    return ["MATCH_OVER","MATCH_UNDER","BTTS_YES","BTTS_NO","HOME_SCORING","AWAY_SCORING","HOME_SUPPRESSION","AWAY_SUPPRESSION","FIRST_HALF","SECOND_HALF"].includes(f);
  }

  function signal(score){
    return score>=88?"PRIME":score>=84?"ELITE":score>=81?"STRONG":score>=78?"QUALIFIED":score>=74?"WATCHLIST":"NONE";
  }

  function reviewDecision(input,m){
    if(!input||typeof input!=="object"||input._learningReviewed) return input;
    const out={...input,reasons:[...(input.reasons||[])],warnings:[...(input.warnings||[])]};
    out._learningReviewed=true;
    const ctx=m&&m.learningContext;
    out.learning_review={version:VERSION,applied:false,adjustment:0,flags:[],evidence:[]};
    if(!ctx||!ctx.decision) return out;

    const originalMarket=String(out.primary||out.market||"No Bet");
    const originalScore=Number(out.score||out.confidence||0);
    const family=familyOf(out);
    const favSide=ctx.favorite&&ctx.favorite.side;
    const favAligned=alignsFavorite(family,favSide);
    let adjustment=0;
    let hardVeto=false;
    const evidence=[];

    if(out.bet&&originalMarket!=="No Bet"){
      if(favAligned){
        adjustment+=Number(ctx.decision.favoriteMarketAdjustment||0);
        hardVeto=!!ctx.decision.hardVetoFavorite;
        if(ctx.favorite&&ctx.favorite.team) evidence.push(`Favourite review: ${ctx.favorite.team} · ${ctx.riskLevel||"monitored"} risk.`);
      }
      if(isGoalsFamily(family)){
        adjustment+=Number(ctx.decision.goalMarketAdjustment||0);
      }

      const engineRules=ctx.engineRules||{};
      const engineBlock=engineRules[out.engine]||engineRules[String(out.engine||"").replace(/^PurePPG\s+/i,"")]||{};
      const rule=engineBlock[originalMarket]||engineBlock[family];
      if(rule&&Number(rule.sample)>=6){
        adjustment+=Number(rule.adjustment||0);
        evidence.push(`${out.engine} has ${rule.sample} comparable settled decisions (${Math.round((rule.winRate||0)*100)}% won).`);
        if(rule.hardVeto) hardVeto=true;
      }

      // Positive learning is deliberately capped. It must never create a pick
      // from an engine output that was not already qualified.
      adjustment=clamp(adjustment,-20,2);
      const newScore=clamp(originalScore+adjustment,0,94);
      const flags=uniq(ctx.flags||[]);
      const reasons=uniq(ctx.reasons||[]).slice(0,4);
      evidence.push(...reasons);

      out.learning_review={
        version:VERSION,applied:true,adjustment,originalMarket,originalScore,
        reviewedScore:newScore,favoriteAligned:favAligned,hardVeto,
        riskScore:Number(ctx.riskScore||0),stabilityScore:Number(ctx.stabilityScore||0),
        riskLevel:ctx.riskLevel||"unknown",flags,evidence:uniq(evidence)
      };
      out.learningContextSummary={
        riskScore:Number(ctx.riskScore||0),
        stabilityScore:Number(ctx.stabilityScore||0),
        favorite:ctx.favorite||null,
        flags
      };

      const auditPrefix="Learning review";
      if(hardVeto||newScore<78){
        out.original_candidate=originalMarket;
        out.primary="No Bet";
        out.candidate_market="No Bet";
        out.market="No Bet";
        out.bet=false;
        out.banker=false;
        out.score=Number(newScore.toFixed(1));
        out.confidence=out.score;
        out.final_status="NO BET";
        out.veto=hardVeto?"HARD":"SOFT";
        out.veto_level=out.veto;
        out.veto_scope=hardVeto?"LEARNING_CONTEXT":"SCORE";
        out.signal_strength="NONE";
        out.grade="No Bet";
        out.reasons.unshift(`${auditPrefix}: ${hardVeto?"repeated pattern-break evidence triggered a veto":"historical adjustment moved the candidate below the qualification floor"}.`);
        reasons.forEach(r=>out.reasons.push(`Learning evidence: ${r}`));
        out.summary=`No Bet — learning review rejected ${originalMarket}`;
      }else{
        out.score=Number(newScore.toFixed(1));
        out.confidence=out.score;
        out.signal_strength=signal(out.score);
        if(adjustment<0) out.reasons.push(`${auditPrefix}: ${adjustment} point adjustment after comparable settled outcomes.`);
        else if(adjustment>0) out.reasons.push(`${auditPrefix}: +${adjustment} stability adjustment, capped to prevent overconfidence.`);
        reasons.slice(0,2).forEach(r=>out.reasons.push(`Learning evidence: ${r}`));
        out.banker=!!out.banker&&out.score>=84&&!hardVeto;
        out.summary=`${out.engine}: ${out.primary} (${out.score}) · learning reviewed`;
      }
    }
    return out;
  }

  return {VERSION,reviewDecision,familyOf,alignsFavorite,isGoalsFamily};
});
