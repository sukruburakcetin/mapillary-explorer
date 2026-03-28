# Security Policy

## Supported Versions

Only the latest release of Mapillary Explorer receives security updates.
Older versions are not actively maintained.

| Version | Supported |
|---------|-----------|
| 4.2.x (latest) | ✅ |
| < 4.2.0 | ❌ |

## Reporting a Vulnerability

If you discover a security vulnerability in Mapillary Explorer, please **do not** open a public GitHub issue. Public disclosure before a fix is available could put users at risk.

Instead, please report it privately using one of these methods:

- **GitHub Private Security Advisory**: open a private advisory directly in this repository via Security → Advisories → Report a vulnerability
- **Email**: if you prefer, contact the maintainer directly (mapillary.explorer@gmail.com)

Please include as much detail as possible:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof of concept
- The version of Mapillary Explorer where you found it
- Any suggested fix if you have one

## What to Expect

- You will receive an acknowledgement within **72 hours**
- The maintainer will investigate and keep you informed of progress
- Once a fix is ready, a patched release will be published, and you will 
  be credited in the release notes unless you prefer to remain anonymous

## Scope

Mapillary Explorer is a client-side ArcGIS Experience Builder widget. It runs entirely in the browser and does not operate a server or store user data. The most relevant security considerations for this project are:

- **Mapillary access token exposure**, the token is stored in `manifest.json` and should be treated as a secret. Do not commit a production token to a public repository.
- **Third-party API calls**, the widget communicates with the Mapillary Graph API and Overpass API. Vulnerabilities in how responses are handled 
  are in scope.
- **Cross-site scripting**, any user-controlled content rendered in the widget UI is in scope.

Vulnerabilities in ArcGIS Experience Builder itself, the Mapillary platform, or OSM/Overpass infrastructure are out of scope and should be reported directly to those maintainers.

## Attribution

Responsible disclosure is appreciated. Reporters who identify and responsibly disclose valid vulnerabilities will be acknowledged in the relevant release notes.
