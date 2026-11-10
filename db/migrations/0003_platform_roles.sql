-- ENKAI LODGEFLOW — Phase 3
-- Restore the platform role catalog idempotently.
--
-- The platform roles and permission grants are normally created by
-- 0002_multitenant_erp.sql. This migration exists so environments whose
-- tables were truncated during testing (or that were provisioned before the
-- catalog was final) always end up with a usable platform administration role.

INSERT INTO permissions (key, description) VALUES
  ('platform.tenants.read',   'View registered business tenants'),
  ('platform.tenants.write',  'Create, activate, suspend and deactivate tenants'),
  ('platform.plans.write',    'Manage subscription plans and feature access'),
  ('platform.audit.read',     'Read platform-wide audit logs'),
  ('platform.health.read',    'View platform health and integration status'),
  ('platform.tenant.access',  'Explicitly elevated, audited read access to a tenant workspace')
ON CONFLICT (key) DO NOTHING;

INSERT INTO roles (id, tenant_id, key, name, description, is_system) VALUES
  ('role-platform-admin',   NULL, 'PLATFORM_ADMIN',   'Platform Administrator', 'Global platform governance', true),
  ('role-platform-support', NULL, 'PLATFORM_SUPPORT', 'Platform Support',       'Read-only platform diagnostics', true)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key)
SELECT 'role-platform-admin', key FROM permissions WHERE key LIKE 'platform.%'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_key) VALUES
  ('role-platform-support', 'platform.tenants.read'),
  ('role-platform-support', 'platform.audit.read'),
  ('role-platform-support', 'platform.health.read')
ON CONFLICT DO NOTHING;
