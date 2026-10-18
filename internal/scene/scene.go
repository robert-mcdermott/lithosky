// SPDX-License-Identifier: Apache-2.0
package scene

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"unicode/utf8"
)

const MaxBytes = 16 * 1024

//go:embed schema.json
var Schema []byte

// Rule implements only the schema vocabulary used by our bundled scene schema.
// It is not a general-purpose JSON Schema engine; untrusted schemas are never loaded.
type Rule struct {
	Type                 string          `json:"type"`
	Required             []string        `json:"required"`
	Properties           map[string]Rule `json:"properties"`
	AdditionalProperties bool            `json:"additionalProperties"`
	Enum                 []any           `json:"enum"`
	Minimum              *float64        `json:"minimum"`
	Maximum              *float64        `json:"maximum"`
	MinLength            *int            `json:"minLength"`
	MaxLength            *int            `json:"maxLength"`
}

var schema = func() Rule {
	var r Rule
	if err := json.Unmarshal(Schema, &r); err != nil {
		panic(err)
	}
	return r
}()

func Validate(data []byte) ([]byte, error) {
	if len(data) > MaxBytes {
		return nil, errors.New("scene exceeds 16 KiB")
	}
	if !utf8.Valid(data) {
		return nil, errors.New("scene must be valid UTF-8")
	}
	var value any
	if err := json.Unmarshal(data, &value); err != nil {
		return nil, errors.New("invalid scene JSON")
	}
	if object, ok := value.(map[string]any); ok && object["version"] != float64(1) {
		return nil, errors.New("unsupported scene version; this build opens version 1 only")
	}
	if err := validate(value, schema, "scene"); err != nil {
		return nil, err
	}
	return json.Marshal(value)
}

func validate(value any, rule Rule, path string) error {
	invalid := func(detail string) error { return fmt.Errorf("%s: %s", path, detail) }
	switch rule.Type {
	case "object":
		obj, ok := value.(map[string]any)
		if !ok {
			return invalid("expected an object")
		}
		for _, key := range rule.Required {
			if _, ok := obj[key]; !ok {
				return invalid("missing " + key)
			}
		}
		for key, val := range obj {
			child, ok := rule.Properties[key]
			if !ok {
				return invalid("unknown field " + key)
			}
			if err := validate(val, child, path+"."+key); err != nil {
				return err
			}
		}
	case "string":
		s, ok := value.(string)
		if !ok {
			return invalid("expected text")
		}
		n := utf8.RuneCountInString(s)
		if rule.MinLength != nil && n < *rule.MinLength || rule.MaxLength != nil && n > *rule.MaxLength {
			return invalid("text length is outside bounds")
		}
	case "number", "integer":
		n, ok := value.(float64)
		if !ok || math.IsNaN(n) || math.IsInf(n, 0) {
			return invalid("expected a finite number")
		}
		if rule.Type == "integer" && math.Trunc(n) != n {
			return invalid("expected an integer")
		}
		if rule.Minimum != nil && n < *rule.Minimum || rule.Maximum != nil && n > *rule.Maximum {
			return invalid("number is outside bounds")
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			return invalid("expected true or false")
		}
	default:
		return invalid("unsupported schema rule")
	}
	if len(rule.Enum) > 0 {
		for _, allowed := range rule.Enum {
			if reflect.DeepEqual(allowed, value) {
				return nil
			}
		}
		return invalid("unsupported value")
	}
	return nil
}

func Equal(a, b []byte) bool { return bytes.Equal(a, b) }
