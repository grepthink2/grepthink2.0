# Test Plan and Report

- **Product:** Trailhead
- **Team:** Trailhead
- **Date:** December 4, 2026

## System test scenarios

### Scenario 1

- a. US-1: Find a trail
- b. US-3: Filter trails

**Search by name** (Pass)

> 1. Open the app
> 2. Type "Pogonip" in search
>
> The trail shows first.

Note: Tested on iOS and Android.

### Scenario 2

- a. A story that is no longer on the board

**Save a trail offline** (Fail)

> 1. Turn on airplane mode

### Scenario 3

**Export a trail** (Not run)

## Unit tests

- `backend/tests/test_trails.py` (failing): Covers search
- `frontend/src/__tests__/` (passing)

Run them with npm test and pytest.

Repositories:

- https://github.com/team/trailhead
