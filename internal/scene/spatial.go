// SPDX-License-Identifier: Apache-2.0
package scene

import (
	"errors"
	"math"
)

type matrix [16]float64

func identityMatrix() matrix { return matrix{1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1} }
func multiplyMatrix(a, b matrix) (out matrix) {
	for c := 0; c < 4; c++ {
		for r := 0; r < 4; r++ {
			for k := 0; k < 4; k++ {
				out[c*4+r] += a[k*4+r] * b[c*4+k]
			}
		}
	}
	return
}
func entityMatrix(n map[string]any) matrix {
	t, ok := n["components"].(map[string]any)["transform"].(map[string]any)
	if !ok {
		return identityMatrix()
	}
	p, r, s := t["position"].([]any), t["rotation"].([]any), t["scale"].([]any)
	x, y, z := r[0].(float64)*math.Pi/180, r[1].(float64)*math.Pi/180, r[2].(float64)*math.Pi/180
	cx, sx, cy, sy, cz, sz := math.Cos(x), math.Sin(x), math.Cos(y), math.Sin(y), math.Cos(z), math.Sin(z)
	a, b, c := s[0].(float64), s[1].(float64), s[2].(float64)
	return matrix{cz * cy * a, sz * cy * a, -sy * a, 0, (cz*sy*sx - sz*cx) * b, (sz*sy*sx + cz*cx) * b, cy * sx * b, 0, (cz*sy*cx + sz*sx) * c, (sz*sy*cx - cz*sx) * c, cy * cx * c, 0, p[0].(float64), p[1].(float64), p[2].(float64), 1}
}
func validateSpatial(doc map[string]any) error {
	byID := map[string]map[string]any{}
	primitives := 0
	for _, v := range doc["entities"].([]any) {
		n := v.(map[string]any)
		byID[n["id"].(string)] = n
		if entityKind(n) == "primitive" {
			primitives++
		}
	}
	if primitives > 32 {
		return errors.New("at most 32 primitives are supported")
	}
	for _, n := range byID {
		kind := entityKind(n)
		components := n["components"].(map[string]any)
		if kind == "group" {
			s := components["transform"].(map[string]any)["scale"].([]any)
			a, b, c := s[0].(float64), s[1].(float64), s[2].(float64)
			if math.Max(a, math.Max(b, c))-math.Min(a, math.Min(b, c)) > 1e-8 {
				return errors.New("groups require uniform scaling")
			}
		}
		m := entityMatrix(n)
		for parent := n["parent"].(string); parent != ""; {
			p := byID[parent]
			pm := entityMatrix(p)
			if kind != "primitive" && kind != "group" {
				identity := identityMatrix()
				for i, x := range pm {
					if math.Abs(x-identity[i]) > 1e-8 {
						return errors.New("unsupported inherited transform")
					}
				}
			}
			m = multiplyMatrix(pm, m)
			parent = p["parent"].(string)
		}
		if components["transform"] == nil {
			continue
		}
		for _, c := range []int{0, 4, 8} {
			length := math.Sqrt(m[c]*m[c] + m[c+1]*m[c+1] + m[c+2]*m[c+2])
			if length < .01-1e-8 || length > 64+1e-8 {
				return errors.New("world transform exceeds size budget")
			}
		}
		shape := "box"
		if kind == "primitive" {
			shape = components["primitive"].(map[string]any)["shape"].(string)
		}
		for i := 0; i < 3; i++ {
			extent := .5 * (math.Abs(m[i]) + math.Abs(m[4+i]) + math.Abs(m[8+i]))
			if shape == "sphere" {
				extent = .5 * math.Sqrt(m[i]*m[i]+m[4+i]*m[4+i]+m[8+i]*m[8+i])
			}
			if shape == "cylinder" {
				extent = .5 * (math.Hypot(m[i], m[8+i]) + math.Abs(m[4+i]))
			}
			if math.Abs(m[12+i])+extent > 256+1e-8 {
				return errors.New("world transform exceeds extent budget")
			}
		}
	}
	return nil
}
