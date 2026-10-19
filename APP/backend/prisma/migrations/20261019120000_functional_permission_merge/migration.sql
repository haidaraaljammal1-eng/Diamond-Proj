-- Merge functional RBAC capabilities (idempotent).
-- Contracts: delivery_return_reconcile + collection_closure → operations_closure
-- Users: assign_roles absorbed into users.edit

INSERT INTO permissions (key, category, description, "createdAt")
SELECT
  'diamond.fn.contracts.operations_closure',
  'functional_v2',
  'RBAC V2 functional capability: diamond.fn.contracts.operations_closure',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE key = 'diamond.fn.contracts.operations_closure'
);

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", new_p.id
FROM role_permissions rp
JOIN permissions old_p ON old_p.id = rp."permissionId"
CROSS JOIN permissions new_p
WHERE new_p.key = 'diamond.fn.contracts.operations_closure'
  AND old_p.key IN (
    'diamond.fn.contracts.delivery_return_reconcile',
    'diamond.fn.contracts.collection_closure'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing."roleId" = rp."roleId"
      AND existing."permissionId" = new_p.id
  );

INSERT INTO role_permissions ("roleId", "permissionId")
SELECT DISTINCT rp."roleId", edit_p.id
FROM role_permissions rp
JOIN permissions assign_p ON assign_p.id = rp."permissionId"
CROSS JOIN permissions edit_p
WHERE assign_p.key = 'diamond.fn.users.assign_roles'
  AND edit_p.key = 'diamond.fn.users.edit'
  AND NOT EXISTS (
    SELECT 1
    FROM role_permissions existing
    WHERE existing."roleId" = rp."roleId"
      AND existing."permissionId" = edit_p.id
  );

DELETE FROM role_permissions
WHERE "permissionId" IN (
  SELECT id FROM permissions
  WHERE key IN (
    'diamond.fn.contracts.delivery_return_reconcile',
    'diamond.fn.contracts.collection_closure',
    'diamond.fn.users.assign_roles'
  )
);

DELETE FROM permissions
WHERE key IN (
  'diamond.fn.contracts.delivery_return_reconcile',
  'diamond.fn.contracts.collection_closure',
  'diamond.fn.users.assign_roles'
);
