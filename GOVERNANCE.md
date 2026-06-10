# MCP Depot Governance

## Overview

MCP Depot is an open-source project hosted under [BSC Ideas](https://github.com/bscideas). This document describes how the project is governed, how decisions are made, and how contributors can grow their involvement.

## Roles

### Users
Anyone who uses MCP Depot. Users are encouraged to open issues, ask questions, and participate in discussions.

### Contributors
Anyone who has submitted a pull request that has been merged, reported a bug that led to a fix, improved documentation, or participated meaningfully in design discussions. No formal application required.

### Maintainers
Maintainers have write access to the repository and are responsible for:
- Reviewing and merging pull requests
- Triaging issues
- Making releases
- Participating in governance decisions

Current maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md).

**Becoming a maintainer:** Any contributor who has made sustained, high-quality contributions over at least 3 months may be nominated by an existing maintainer. Nomination is approved by consensus of the current maintainers. Maintainers who are inactive for 6+ months may be moved to emeritus status.

### Project Lead
The Project Lead is responsible for overall project direction and acts as the tiebreaker when maintainer consensus cannot be reached. The current Project Lead is **Imran Bagwan** ([@ibagwan](https://github.com/ibagwan)).

## Decision Making

### Day-to-day decisions
Routine decisions (bug fixes, minor features, dependency updates) are made by any maintainer via pull request approval. One maintainer approval is sufficient for merging.

### Significant decisions
Changes that affect the public API, architecture, governance, or project direction require:
1. An issue or discussion thread opened for community input (minimum 5 business days)
2. Consensus among active maintainers (or majority vote if consensus is not reached within 10 business days)
3. Documentation of the decision in the issue/PR

### Controversial decisions
If a significant decision is contested, any maintainer may call a formal vote. Each maintainer has one vote. A simple majority decides. The Project Lead breaks ties.

## Releases

- Releases follow [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH)
- Any maintainer may propose a release by opening a release PR
- Releases require approval from at least one other maintainer
- Release notes are published in [CHANGELOG.md](CHANGELOG.md)

## Code of Conduct

All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Maintainers are responsible for enforcing it. Serious or repeated violations may result in removal from the project.

## Amendments

This governance document may be amended by a significant decision as described above. Changes take effect when merged to the main branch.

## Attribution

This governance model is inspired by the [CNCF project governance template](https://github.com/cncf/project-template).
