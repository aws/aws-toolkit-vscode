## 1.1.0 2024-04-30

- **Bug Fix** Amazon Q Chat: Fixed markdown is not getting parsed inside list items.
- **Bug Fix** Amazon Q Chat: Copy to clipboard on code blocks doesn't work
- **Bug Fix** Fixed a crash when trying to use Q /dev on large projects or projects containing files with unsupported encoding.

## 1.0.0 2024-04-29

- **Bug Fix** Code Transformation: Address various issues in TransformationHub UX.
- **Bug Fix** Code Transformation: Transform may fail if JAVA_HOME has leading or trailing whitespace
- **Bug Fix** Chat: Q panel doesn't fit to its parent
- **Bug Fix** Feature Development: update welcome message and menu item description for /dev command
- **Bug Fix** Code Transformation: show error messages in chat
- **Bug Fix** Code Transformation: Proposed changes not updated when multiple transformation jobs run in sequence.
- **Bug Fix** Feature Development: Update error message for monthly conversation limit reach
- **Bug Fix** Code Transformation: Omit Maven metadata files when uploading dependencies to fix certain build failures in backend.
- **Feature** Code Transformation: Refreshed UI during CodeTransformation
- **Feature** Chat: cmd + i to open chat
- **Feature** Right Click + no code selected shows Q context menu
- **Feature** Security Scan: Scans can now run on all files in the project
- **Feature** Chat: Updates quick action commands style and groupings
- **Feature** Code Transformation: add details about expected changes in transformation plan
- **Feature** Enable Amazon Q feature development and Amazon Q transform capabilities (/dev and /transform) for AWS Builder ID users.
- **Feature** Initial release
- **Feature** Chat: Added metric parameters to recordAddMessage telemetry event.
- **Feature** Security Scan: Scans can now run automatically when file changes are made
- **Feature** Chat: brief CodeLens to advertise chat
- **Feature** Security Scan: Send security issue to chat for explanation and fix

