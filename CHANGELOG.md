CHANGELOG

## [1.1.0] - 2026-01-30

### Added
- Individual source detail pages at `/source/[slug].html` with change timeline
- Timeline visualization with before/after screenshot comparison sliders
- Chronological change history display
- Back button navigation from source pages to dashboard
- Hash comparison view for each detected change

### Changed
- Dashboard simplified to show only source names and change count
- No longer displays current status on dashboard (moved to individual pages)
- Emphasis shifted from dashboard overview to detailed source history tracking
- UI redesigned for timeline-first viewing experience

## [1.0.0] - 2026-01-30

### Added
- Initial release
- Change detection via content hashing (SHA256)
- Support for content, HTML selector, and JSON path extraction
- Static HTML dashboard generation
- Multi-language support (English, Spanish)
- Zero-dependency design using only Node.js built-ins
- GitHub Pages deployment support
- Source status API endpoints
- Email/webhook notifications ready for GitHub Actions integration
