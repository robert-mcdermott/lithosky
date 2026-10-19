// SPDX-License-Identifier: Apache-2.0
package scene

import (
	"errors"
	"regexp"
	"strings"
	"unicode"
)

var entityID = regexp.MustCompile(`^[a-z][a-z0-9-]{0,47}$`)

func entityKind(n map[string]any) string {
	c := n["components"].(map[string]any)
	if c["terrain"] != nil {
		return "terrain"
	}
	if c["primitive"] != nil {
		return "primitive"
	}
	if c["group"] != nil {
		return "group"
	}
	if c["areaLight"] != nil {
		return "light"
	}
	for k := range c {
		return k
	}
	return ""
}

// Structural types and bounds are checked by the shared schema first.
func validateEntities(doc map[string]any) error {
	nodes := doc["entities"].([]any)
	byID := map[string]map[string]any{}
	counts := map[string]int{}
	for _, v := range nodes {
		n := v.(map[string]any)
		id := n["id"].(string)
		if !entityID.MatchString(id) || byID[id] != nil {
			return errors.New("invalid or duplicate entity ID")
		}
		if strings.TrimFunc(n["name"].(string), func(r rune) bool { return unicode.IsSpace(r) || r == '\ufeff' }) == "" {
			return errors.New("entity names cannot be blank")
		}
		byID[id] = n
		counts[entityKind(n)]++
	}
	for _, kind := range []string{"terrain", "water", "camera", "environment"} {
		if counts[kind] != 1 {
			return errors.New("scene requires exactly one " + kind + " entity")
		}
	}
	if counts["light"] > 4 {
		return errors.New("at most four area lights are supported")
	}
	for _, n := range byID {
		kind := entityKind(n)
		parent := n["parent"].(string)
		seen := map[string]bool{n["id"].(string): true}
		depth := 0
		for parent != "" {
			p := byID[parent]
			if p == nil || entityKind(p) != "group" || seen[parent] {
				return errors.New("invalid or cyclic entity parent")
			}
			depth++
			if depth > 8 {
				return errors.New("group nesting exceeds eight levels")
			}
			seen[parent] = true
			parent = p["parent"].(string)
		}
		if kind == "camera" && (!n["visible"].(bool) || n["parent"] != "") {
			return errors.New("active camera must remain visible and outside groups")
		}
		if kind == "environment" && counts["light"] > 0 {
			e := n["components"].(map[string]any)["environment"].(map[string]any)
			if e["lighting"].(map[string]any)["transport"] == nil {
				return errors.New("area lights require studio lighting")
			}
		}
	}
	if doc["version"] == float64(12) {
		return validateSpatial(doc)
	}
	return nil
}

// Legacy-shaped data is a read-only view, never a second persisted copy.
func componentView(doc map[string]any) map[string]any {
	if doc["version"].(float64) < 11 {
		return doc
	}
	view := map[string]any{}
	for _, v := range doc["entities"].([]any) {
		c := v.(map[string]any)["components"].(map[string]any)
		for _, key := range []string{"terrain", "surface", "water", "camera"} {
			if c[key] != nil {
				view[key] = c[key]
			}
		}
		if c["environment"] != nil {
			e := c["environment"].(map[string]any)
			view["lighting"] = e["lighting"]
			if e["atmosphere"] != nil {
				view["atmosphere"] = e["atmosphere"]
			}
		}
	}
	return view
}
