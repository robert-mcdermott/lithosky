// SPDX-License-Identifier: Apache-2.0
//go:build !(windows || darwin || linux || freebsd || netbsd || openbsd || dragonfly)

package desktop

import "errors"

// Without a lock the persistent profile is never claimed; windows use temporary profiles.
func lockFile(string) (func(), error) { return nil, errors.ErrUnsupported }

func browserHolds(string) bool { return true }
