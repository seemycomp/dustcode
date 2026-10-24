# Security

## IMPORTANT

We do not accept AI generated security reports. We receive a large number of
these and we absolutely do not have the resources to review them all. If you
submit one that will be an automatic ban from the project.

## Threat Model

### Overview

Dustcode is an AI-powered coding assistant for VS Code with a local backend. It provides an agent system with access to powerful tools including shell execution, file operations, and web access.

### Permissions and Isolation

Dustcode's permission prompts help users control agent actions; they are not a security isolation boundary. Optional operating-system sandboxing restricts supported shell operations, but does not make all tools, plugins, MCP servers, or browser activity safe for untrusted projects.

Use a separate container or VM when stronger isolation is required.

### Server Mode

The VS Code extension starts its embedded backend with a generated password. If you run the retained CLI server directly, set `KILO_SERVER_PASSWORD` to require HTTP Basic Auth and secure its network exposure. The environment variable name remains a backend compatibility identifier.

### Out of Scope

| Category | Rationale |
|---|---|
| **Authorized server access** | API access with the configured credentials is expected behavior |
| **Permission prompts as isolation** | The permission system is not a security sandbox (see above) |
| **LLM provider data handling** | Data sent to your configured LLM provider is governed by their policies |
| **MCP server behavior** | External MCP servers you configure are outside our trust boundary |
| **Malicious config files** | Users control their own config; modifying it is not an attack vector |

---

# Reporting Security Issues

We value the contributions of the security research community and recognize the importance of a coordinated approach to vulnerability disclosure. If you have discovered a security vulnerability, we encourage you to let us know immediately. We welcome the opportunity to work with you to resolve the issue promptly.

Use the [Dustcode repository's security reporting page](https://github.com/seemycomp/dustcode/security) if private vulnerability reporting is available. Do not disclose exploit details, credentials, or private data in a public issue. If private reporting is unavailable, open a minimal issue requesting a private contact channel without including sensitive details.

For vulnerabilities in upstream Kilo Code rather than this fork, use the [upstream disclosure process](https://kilo.ai/security).
