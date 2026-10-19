-- Violations/Salik RBAC simplification (idempotent).
-- review_dues + collect_charges → manual_collection (collect_charges grants only).

INSERT INTO permissions (key, category, description, "createdAt")
SELECT
  'diamond.fn.violations.manual_collection',
  'functional_v2',
  'RBAC V2 functional capability: diamond.fn.violations.manual_collection',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE key = 'diamond.fn.violations.manual_collection'
);

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", new_p.id
FROM role_permissions rp
JOIN permissions old_p ON old_p.id = rp."permissionId"
CROSS JOIN permissions new_p
WHERE new_p.key = 'diamond.fn.violations.manual_collection'
  AND old_p.key = 'diamond.fn.violations.collect_charges'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing."roleId" = rp."roleId"
      AND existing."permissionId" = new_p.id
  );

DELETE FROM role_permissions
WHERE "permissionId" IN (
  SELECT id FROM permissions
  WHERE key IN (
    'diamond.fn.violations.review_dues',
    'diamond.fn.violations.collect_charges'
  )
);

DELETE FROM permissions
WHERE key IN (
  'diamond.fn.violations.review_dues',
  'diamond.fn.violations.collect_charges'
);
