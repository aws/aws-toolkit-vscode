## 1.5.0 2024-05-17

- **Bug Fix** Security Scan: Fixes an issue when scanning projects with binary files
- **Bug Fix** Fixes an issue where the /dev chat wouldn't let customers modify the source folder when exceeding the size limit
- **Bug Fix** Security Scan: Improved error notifications
- **Feature** Security Scan: Added custom command to run the security scan.
- **Feature** Security Scan: "View details" and "Explain" options can now be accessed from the problems panel

## 1.4.0 2024-05-13

- **Bug Fix** Auth: No longer request AWS account scopes during login.
- **Bug Fix** Security Scan: Fixes an issue where scans fail for projects with Terraform files
- **Bug Fix** Amazon Q Code Transform: Show additional status messages to align with experience when JAVA_HOME set incorrectly.
- **Feature** UX: Added keyboard navigation to login screen.
- **Feature** New SSO Authorization Code flow for faster logins
- **Feature** Transform: Add human intervention to help update dependencies during transformation.

## 1.3.0 2024-05-08

- **Bug Fix** modifying the root folder for /dev now modifies it
- **Bug Fix** Q chat may stop responding after processing Javascript/Typescript code
- **Bug Fix** Completion may fail unexpected if user opened many tabs
- **Feature** Inline Suggestions: Only display the 'Open Chat' CodeLens if the user is signed into Amazon Q.
- **Feature** Security Scan: Scans can now be run without an open editor
- **Feature** Security Scan: Multi-root workspace support

## 1.2.0 2024-05-07

- **Bug Fix** Fix bug when Amazon Q chat sends code selection while user has no selection
- **Bug Fix** Amazon Q Code Transformation: make jobId visible in job history tab at start of job and allow summary.md + icons to be saved when accepting changes
- **Bug Fix** Amazon Q Chat: Typewriter animator parts showing up in code fields inside listitems
- **Bug Fix** Security Scan: Addresses a bug where security issues sometimes appear multiple times
- **Feature** Update cross file context config for Q inline suggestion
- **Feature** Amazon Q: Security scans now support C, C++, and PHP files

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

