# Coast prototype

## ADDED Requirements

### Requirement: Complete one playable coastal run
The prototype SHALL connect briefing, driving, completion or time-out, result and immediate retry without reloading the page. Optional supply objectives SHALL NOT prevent completion.

#### Scenario: Finish without supplies
- WHEN the player reaches the route endpoint with time remaining
- THEN the run wins, regardless of the optional supply count.

#### Scenario: Time runs out
- WHEN the timer reaches zero outside training mode
- THEN the run stops, shows the loss cause and offers retry.

### Requirement: Readable independent rules
Rules SHALL run at fixed 60Hz independently from rendering. The course SHALL provide a ten-second safe introduction at maximum speed and at least one safe lateral path per hazard row.

#### Scenario: Input and hazards
- WHEN the player steers, adjusts speed or jumps
- THEN continuous position, speed or explicit anticipation/air/landing phases change.
- AND collision recovery prevents additional immediate penalties.

### Requirement: Meaningful route choice
The game SHALL offer safe and faster-riskier routes before a commitment gate.

#### Scenario: Commit to the shortcut
- WHEN the player selects the fast route
- THEN the endpoint becomes shorter, extra route-specific hazards activate and the decision cannot be overwritten.

### Requirement: Reproducible diagnostic recording
The game SHALL record seed, rules fingerprint, build version, options and tick inputs. Import SHALL validate bounds and the replayed final summary before playback.

#### Scenario: Replay a valid run
- WHEN the same runtime receives a compatible recording
- THEN replay reproduces the recorded result and does not update live best scores.

#### Scenario: Reject incompatible data
- WHEN inputs, versions or the final summary are invalid
- THEN import reports an error without replacing the active application.

### Requirement: Explicit validation boundaries
Automated software-renderer tests SHALL NOT be presented as hardware WebGL, real-device performance or human playtest approval.

#### Scenario: GPU unavailable
- WHEN WebGL creation fails
- THEN the app uses the software 3D compatibility renderer and identifies the active renderer in diagnostics.
