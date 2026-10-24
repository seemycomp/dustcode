# Dustcode Privacy Information

**Last Updated: October 24, 2026**

Dustcode is a VS Code extension with a local agent backend. This document describes the fork's local storage and provider connections. Kilo Gateway and other external providers have their own privacy policies; their services are not operated by this fork.

### **Where Your Data Goes (And Where It Doesn't)**

- **Code & Files**: Dustcode accesses local files for AI-assisted features. Relevant code and context may be sent to the model provider you configure, including through Kilo Gateway when selected. Provider retention and processing are governed by their policies.
- **Commands**: Agent commands run on your machine. Their output and related context may be included in subsequent model requests. Tools, MCP servers, plugins, and browser automation may contact additional services according to the actions you authorize.
- **Prompts & Sessions**: Prompts, responses, and session history are stored locally in Dustcode's isolated profile. AI requests send prompts and relevant project context to your configured provider. Optional cloud features can transmit session data to the external service you enable.
- **API Keys & Credentials**: Configured provider credentials are stored locally and used to authenticate to the selected services. Dustcode does not import credentials or sessions from your Kilo Code installation.
- **Telemetry**: The Dustcode extension's telemetry proxy is disabled. External providers and services may collect their own operational data under their policies.

### **Your Choices & Control**

- You can run models locally to prevent data being sent to third-parties.

### **Security & Updates**

We take reasonable measures to secure your data, but no system is 100% secure. If our privacy policy changes, we will update this document and note the changes in our release notes.

### **Contact Us**

Report Dustcode privacy concerns in the [fork repository](https://github.com/seemycomp/dustcode). Do not post credentials, private code, or session transcripts in a public issue. Questions about a provider's handling of data belong with that provider.

---

Upstream Kilo Code privacy statements and contact addresses do not describe the operator of this fork.
