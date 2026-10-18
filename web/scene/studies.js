// SPDX-License-Identifier: Apache-2.0
import { validateScene } from './document.js';
export function validateStudies(value, schema) {
  if (!Array.isArray(value) || value.length !== 3) throw new Error('Expected three starter scenes.');
  const ids = new Set();
  return value.map(study => {
    if (!['alpine', 'highland', 'distant'].includes(study?.id) || ids.has(study.id) || typeof study.description !== 'string') throw new Error('Invalid starter scene catalog.');
    ids.add(study.id);
    return { id: study.id, description: study.description, scene: validateScene(study.scene, schema) };
  });
}
