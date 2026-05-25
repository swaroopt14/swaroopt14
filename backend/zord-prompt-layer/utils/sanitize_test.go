package utils

import (
	"strings"
	"testing"
)

func TestSanitizeAnswerTextPreservesMarkdownStructure(t *testing.T) {
	in := "**Summary**\n- First item\n- tenant_id: 123e4567-e89b-12d3-a456-426614174000\n\n| Col | Val |\n| --- | --- |\n| A | B |\n"

	got := SanitizeAnswerText(in)

	if !strings.Contains(got, "**Summary**\n- First item") {
		t.Fatalf("expected markdown bullets to be preserved, got %q", got)
	}
	if !strings.Contains(got, "\n| Col | Val |\n| --- | --- |\n| A | B |") {
		t.Fatalf("expected markdown table to be preserved, got %q", got)
	}
	if strings.Contains(got, "tenant_id") {
		t.Fatalf("expected sensitive identifier label to be removed, got %q", got)
	}
	if strings.Contains(got, "123e4567-e89b-12d3-a456-426614174000") {
		t.Fatalf("expected uuid to be redacted, got %q", got)
	}
}

func TestSanitizeAnswerTextPreservesCodeFenceLineBreaks(t *testing.T) {
	in := "```json\n{\"token\":\"secret-value\"}\n```"

	got := SanitizeAnswerText(in)

	if !strings.Contains(got, "```json\n") || !strings.Contains(got, "\n```") {
		t.Fatalf("expected fenced block structure to remain, got %q", got)
	}
}
