# Change Log

All notable changes to the "aws-vscode-tools" extension will be documented in this file.

## NEXT (Developer Preview)

* A toast greets the user upon launching a new version of the toolkit for the first time which provides a link to a quick start page. This quick start page can be re-accessed through the explorer's context menu. (#610-612)
* Local Run/Debug now honors MemorySize values from SAM Template file (#509)
* Local Run/Debug now honors Timeout values from SAM Template file (#510)
* Local Run/Debug now honors the Globals section from SAM Template file
* Fixed issue preventing users from connecting with assumed roles (#620)
* Added ability to report an issue from the AWS Explorer menu (#613)

## 0.2.0 (Developer Preview)

* Local Run/Debug is now available for .NET Core 2.1 functions within SAM Applications
* Local Run/Debug is now available for Python 2.7, 3.6, and 3.7 functions within SAM Applications
* Local Run/Debug is now available for NodeJS 10.x functions within SAM Applications
* Local Run/Debug of SAM Lambda Functions now outputs to the Output and Debug Console, and reduces timing issues for attaching the debugger
* Removed Lambda view that showed the Lambda Policy
* Removed Lambda view that showed the Lambda Configuration
* Removed unsupported Lambda runtimes from the 'Create New SAM Application' wizard.
* The AWS Explorer menu items no longer appear on other VS Code panel menus
* When creating a new SAM Application, the toolkit now checks for a valid SAM CLI version before prompting the user for inputs
* When deploying a SAM Application, the toolkit now checks for a valid SAM CLI version before prompting the user for inputs
* Telemetry now sends AWS account data
* Minimum SAM CLI version has been bumped to 0.16.0

## 0.1.2 (Developer Preview)

* Bumped maximum (exclusive) supported SAM CLI version from 0.16.0 to 0.23.0.

## 0.1.1 (Developer Preview)

* Updated Marketplace page to display information on how to use the Toolkit once installed

## 0.1.0 (Developer Preview)

* Initial release
