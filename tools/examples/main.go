// SPDX-License-Identifier: Apache-2.0
// Rebuild the original heightmap and portable scene used in the public guide.
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"github.com/robert-mcdermott/lithosky/internal/heightmap"
	"github.com/robert-mcdermott/lithosky/internal/project"
	"math"
	"os"
	"path/filepath"
)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
func run() error {
	const n = 256
	raw := make([]byte, (n+1)*(n+1)*2)
	for z := 0; z <= n; z++ {
		for x := 0; x <= n; x++ {
			u, v := float64(x)/n*64-32, float64(z)/n*64-32
			r := math.Hypot(u+3, v+6)
			h := 5*math.Exp(-math.Pow(r-13, 2)/30) + 1.2*math.Sin(u*.25)*math.Cos(v*.2) - 1
			h = math.Floor(h*2) / 2
			binary.BigEndian.PutUint16(raw[(z*(n+1)+x)*2:], uint16(math.Round((h+3)/11*65535)))
		}
	}
	scale := heightmap.Scale{Format: "lithosky-heightmap", Version: 1, Resolution: n, Minimum: -3, Maximum: 8, MetersPerUnit: 10, Elevation: 1, RowOrder: "z-increasing"}
	bundle, err := project.ExportHeightmap(raw, scale)
	if err != nil {
		return err
	}
	doc := map[string]any{"format": "lithosky", "version": 5, "title": "Terraced basin", "terrain": map[string]any{"generator": "heightmap-v1", "seed": 1847, "elevation": 1, "palette": "natural", "resolution": n, "sculpt": []any{}, "asset": heightmap.Hash(raw), "minimum": -3, "maximum": 8, "metersPerUnit": 10}, "surface": map[string]any{"preset": "rules", "snowHeight": 4.5, "sandHeight": .4, "rockSlope": 45, "blend": .4, "detail": .3, "detailScale": 1}, "camera": map[string]any{"yaw": .28, "pitch": .5, "distance": 32}, "water": map[string]any{"enabled": true, "level": .25}, "lighting": map[string]any{"sunElevation": 28}}
	manifest, _ := json.Marshal(doc)
	portable, err := project.Save(manifest, raw)
	if err != nil {
		return err
	}
	png, _ := heightmap.EncodePNG(raw, n)
	metadata, _ := json.MarshalIndent(scale, "", "  ")
	for name, data := range map[string][]byte{"terraced-basin.png": png, "terraced-basin-scale.json": metadata, "terraced-basin.heightmap": bundle, "terraced-basin.lithosky": portable} {
		if err := os.WriteFile(filepath.Join("docs/site/assets", name), data, 0644); err != nil {
			return err
		}
	}
	fmt.Println("Wrote original heightmap bundle and portable terrain example.")
	return nil
}
