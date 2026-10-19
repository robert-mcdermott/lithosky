// SPDX-License-Identifier: Apache-2.0
package scene

import (
	"errors"
	"strings"
	"unicode"
)

func validateComposition(doc map[string]any) error {
	seen := map[string]bool{}
	for _, v := range doc["entities"].([]any) {
		seen[v.(map[string]any)["id"].(string)] = true
	}
	for _, v := range doc["bookmarks"].([]any) {
		b := v.(map[string]any)
		id := b["id"].(string)
		if !entityID.MatchString(id) || seen[id] || strings.TrimFunc(b["name"].(string), func(r rune) bool { return unicode.IsSpace(r) || r == '\ufeff' }) == "" {
			return errors.New("invalid or duplicate camera bookmark")
		}
		seen[id] = true
	}
	surface, _ := componentView(doc)["surface"].(map[string]any)
	if surface == nil {
		return nil
	}
	strokes, _ := surface["paint"].([]any)
	if len(strokes) > 0 && surface["geology"] == nil {
		return errors.New("paint masks require geological surfaces")
	}
	points := 0
	for _, s := range strokes {
		points += len(s.(map[string]any)["points"].([]any))
	}
	if points > 512 {
		return errors.New("paint masks exceed 512 points")
	}
	return nil
}
