# Section Labeling System - User Testing Checklist

## ✅ Pre-Testing Verification

### Integration Status
- ✅ **semanticLabeler.js**: Complete rewrite with multi-phase detection
- ✅ **theorist.js**: Updated to pass `linearAnalysis` to labeling function
- ✅ **main.js**: All calls to `correctStructuralMap` pass `linearAnalysis`
- ✅ **Smoke Tests**: All tests passing

### Key Features Ready for Testing

1. **Multi-Factor Similarity Scoring**
   - Chroma (35%), MFCC (15%), Energy (20%), Rhythm (15%), Progression (15%)
   - Dynamic threshold (0.65 base, adjusts for section characteristics)

2. **Rule-Based Labeling**
   - 8 labeling rules with confidence scores
   - Intro, Outro, Chorus, Verse, Bridge, Pre-Chorus, Instrumental/Solo detection

3. **Variant Numbering**
   - Contextual suffixes (alt, finale)
   - Smart numbering based on repetition

4. **Post-Processing Validation**
   - Ensures at least one chorus exists
   - Validates intro/outro lengths
   - Removes orphan pre-choruses

## 🧪 Testing Scenarios

### Test Case 1: Standard Pop Song
**Expected Structure**: Intro → Verse → Chorus → Verse → Chorus → Bridge → Chorus → Outro

**What to Check:**
- [ ] Intro is detected at the beginning (low energy/vocals)
- [ ] Chorus sections are grouped together (high repetition)
- [ ] Verses precede choruses
- [ ] Bridge is detected as unique section after first chorus
- [ ] Outro is detected at the end (fading/extended)

**Success Criteria:**
- At least 70% of sections correctly labeled
- Chorus detection accuracy > 80%
- No orphan pre-choruses

### Test Case 2: Rock Song with Instrumental
**Expected Structure**: Intro → Verse → Chorus → Verse → Chorus → Instrumental → Verse → Chorus → Outro

**What to Check:**
- [ ] Instrumental section detected (no vocals, mid-track)
- [ ] Chorus sections still grouped correctly
- [ ] Verses maintain correct sequence

**Success Criteria:**
- Instrumental section correctly identified
- Chorus grouping unaffected by instrumental

### Test Case 3: Song with Pre-Chorus
**Expected Structure**: Intro → Verse → Pre-Chorus → Chorus → Verse → Pre-Chorus → Chorus → Outro

**What to Check:**
- [ ] Pre-chorus detected between verse and chorus
- [ ] Pre-chorus is short (< 3 seconds)
- [ ] No orphan pre-choruses (must be between verse and chorus)

**Success Criteria:**
- Pre-chorus correctly identified
- No false positives for pre-chorus

### Test Case 4: Complex Structure (Jazz/Fusion)
**Expected Structure**: Multiple unique sections, less repetition

**What to Check:**
- [ ] Unique sections labeled appropriately
- [ ] No forced chorus detection if repetition is low
- [ ] Bridge detection works for unique sections

**Success Criteria:**
- Labels make musical sense
- No over-labeling of generic sections as chorus

### Test Case 5: Short Song (< 2 minutes)
**Expected Structure**: Simplified structure

**What to Check:**
- [ ] Dynamic threshold adjusts for short sections
- [ ] Labels still accurate despite shorter sections
- [ ] No crashes or errors

**Success Criteria:**
- System handles short songs gracefully
- Labels are still meaningful

## 📊 Metrics to Track

### Accuracy Metrics
- **Overall Labeling Accuracy**: Target 70%+
- **Chorus Detection**: Target 85%+
- **Verse Detection**: Target 75%+
- **Bridge Detection**: Target 70%+
- **False Positive Rate**: Target < 20%

### Performance Metrics
- **Processing Time**: Should be < 1 second for typical song
- **Memory Usage**: Should be reasonable (no memory leaks)

### User Experience Metrics
- **Label Confidence**: Average confidence score
- **Label Clarity**: Are labels understandable?
- **Edge Case Handling**: How well does it handle unusual structures?

## 🐛 Known Issues to Watch For

1. **Over-labeling**: System might label too many sections as chorus if repetition is high
   - **Workaround**: Check confidence scores - lower confidence (< 0.6) may indicate uncertainty

2. **Under-labeling**: System might miss chorus if repetition is low
   - **Workaround**: Check cluster statistics - if large clusters exist but no chorus, may need manual review

3. **Bridge Detection**: May incorrectly label unique sections as bridge
   - **Workaround**: Check position - bridges should be mid-to-late (40-85% through song)

4. **Pre-Chorus Orphans**: Pre-choruses not between verse and chorus
   - **Workaround**: System should auto-fix these, but verify in results

## 🔍 How to Verify Results

### Console Logs
Look for these log messages during analysis:
```
[SemanticLabeler] Processing X sections...
[SemanticLabeler] Created Y clusters
[SemanticLabeler] Final labels: { intro: 1, verse: 2, chorus: 3, ... }
[SemanticLabeler] Confidence scores: intro: 90%, verse: 75%, ...
```

### Section Properties
Each section should have:
- `section_label`: Primary label (intro, verse, chorus, etc.)
- `section_variant`: Variant number (1, 2, 3, ...)
- `section_suffix`: Contextual suffix (alt, finale) - optional
- `label_confidence`: Confidence score (0-1)
- `label_reason`: Human-readable reason
- `cluster_id`: Cluster ID for grouping

### Visual Inspection
In the Sandbox/Grid view:
- Check that sections are grouped correctly
- Verify labels match musical structure
- Confirm variant numbers are sequential
- Check confidence scores are reasonable (> 0.5 for most labels)

## 📝 Reporting Issues

When reporting issues, include:
1. **Song Information**: Title, artist, genre, duration
2. **Expected Structure**: What the structure should be
3. **Actual Structure**: What the system detected
4. **Console Logs**: Relevant log messages
5. **Confidence Scores**: For incorrectly labeled sections
6. **Screenshots**: If applicable

## ✅ Ready for User Testing

**Status**: ✅ **READY**

All integration points verified:
- ✅ semanticLabeler.js integrated with theorist.js
- ✅ theorist.js passes linearAnalysis to labeling function
- ✅ main.js calls pass correct parameters
- ✅ Smoke tests passing
- ✅ Error handling in place
- ✅ Logging enabled for debugging

**Next Steps:**
1. Test with real songs (various genres)
2. Collect accuracy metrics
3. Gather user feedback
4. Iterate on edge cases

---

**Last Updated**: After complete overhaul implementation
**Version**: 2.0 (Multi-Phase Detection System)

