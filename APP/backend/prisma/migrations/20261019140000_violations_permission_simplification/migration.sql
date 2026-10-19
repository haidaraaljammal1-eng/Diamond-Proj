-- Violations/Salik RBAC alignment (idempotent).
-- Keeps review_dues + collect_charges for deferred receivables / charge review routes.
-- Adds manual_collection and grants it to roles that already have collect_charges (EndRole behavior).

INSERT INTO permissions (key, category, description, "createdAt")
SELECT v.key, 'functional_v2', v.description, NOW()
FROM (
  VALUES
    (
      'diamond.fn.violations.manual_collection',
      'RBAC V2 functional capability: diamond.fn.violations.manual_collection'
    ),
    (
      'diamond.fn.violations.review_dues',
      'RBAC V2 functional capability: diamond.fn.violations.review_dues'
    ),
    (
      'diamond.fn.violations.collect_charges',
      'RBAC V2 functional capability: diamond.fn.violations.collect_charges'
    )
) AS v(key, description)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = v.key);

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
