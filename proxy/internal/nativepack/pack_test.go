package nativepack

import "testing"

func TestCompiledPackLoadsWithBoundedUniqueClassifiedSkills(t *testing.T) {
	pack, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if pack.Schema != "caveman.native-pack.v1" || !pack.Core.Mandatory || pack.Core.EstimatedTokens > pack.Core.PromptTokenBudget {
		t.Fatalf("invalid compiled Core: %+v", pack.Core)
	}
	if len(pack.Skills) != 6 || len(pack.Targets) != 6 {
		t.Fatalf("compiled pack shape skills=%d targets=%d", len(pack.Skills), len(pack.Targets))
	}
	wants := map[string]string{
		"refactor": "safe-refactor", "migration": "migration",
	}
	for taskType, want := range wants {
		skill, ok := Select(taskType)
		if !ok || skill.ID != want || skill.EvidenceStatus != "structural-test-only" || len(skill.Instructions) > skill.PromptByteBudget {
			t.Fatalf("selection %s = %+v ok=%t", taskType, skill, ok)
		}
	}
	for _, taskType := range []string{"feature", "bugfix", "investigation", "verification", "review"} {
		if skill, ok := Select(taskType); ok {
			t.Fatalf("compatibility/unowned task %s selected %s instead of Core", taskType, skill.ID)
		}
	}
	for _, id := range []string{"lean-build", "surgical-patch", "investigate-first", "verify-and-stop"} {
		found := false
		for _, skill := range pack.Skills {
			if skill.ID == id {
				found = skill.Activation == "explicit" && skill.Instructions != ""
			}
		}
		if !found {
			t.Fatalf("explicit compatibility asset missing: %s", id)
		}
	}
}
