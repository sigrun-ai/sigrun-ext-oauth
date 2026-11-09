# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-11-07

## [Unreleased]

### Changed

- Login providers are declared as a JSON Schema (entries array with a
  `kind` variant; absent `kind` still means `oidc`) via
  `host.settings.declare` and edited as generated forms on the extension's
  settings page. Client secrets move from the legacy `<id>.clientSecret`
  store keys to `providers/<id>/clientSecret` (migrated automatically at
  factory time). Raises the `@sigrun/sigrun` peer floor to the
  settings-rework core.
- peer pi-durable/pi-ai/chord ~1.5.0 (requires sigrun 0.11.0).

## [0.1.1] - 2026-10-27
### Changed
- Re-released through CI trusted publishing; this version carries SLSA
  provenance. No functional change from 0.1.0.

## [Unreleased]

## [0.1.0] - 2026-10-24
### Added
- OIDC login providers with discovery, authorization code, PKCE S256, nonce, and issuer/audience/expiry/JWKS-signature validation.
- OAuth 2 explicit endpoints and field-path mapping, plus GitHub and Discord presets.
- Per-provider settings validation, scoped client-secret reads, and provisioning-policy contributions.
