## 1.13.0 2020-08-24

- **Feature** Toolkit automatically adds a launch configuration to the workspace when creating SAM applications
- **Feature** CloudWatch Logs functionality
- **Feature** Amazon States Language Server: Add validation for new ASL specification released on August 11.

## 1.12.0 2020-07-30

- **Feature** A new experience for locally Running/Debugging Lambdas with SAM that uses VS Code launch configurations (PR #1215)
- **Feature** SAM Apps that are in SAM Templates are now run/debugged through the Run panel via `aws-sam` Launch Configurations.
- **Feature** Add S3 integration to allow users to create buckets, list buckets, list files and folders, upload files, download files, delete files, delete buckets, and more!

## 1.11.0 2020-07-18

- **Breaking Change** Bumped minimum (inclusive) supported SAM CLI version from 0.38.0 to 0.47.0.
- **Bug Fix** Amazon States Language Server: Replaces "True" strings of End with boolean in snippets.
- **Bug Fix** Makes the ItemsPath property of Map state optional in ASL linter.
- **Bug Fix** Amazon States Language Server: Adds validation of next property for Catch of Map state.
- **Bug Fix** Amazon States Language Server: Adds missing "Comment" property for ChoiceRules, Catcher and Retrier.
- **Feature** Amazon States Language Server: Adds validation of JSON Paths within Parameters.
- **Feature** Added `dotnetcore3.1` app creation and local run support. Local debug is not currently supported.
- **Feature** support SAM CLI version 1.x

## 1.10.0 2020-05-27

- **Feature** Add basic visualisation capability for step function state machines defined in YAML.
- **Feature** Step Functions Linter: Resource property of Task state will accept any string instead of just arn. Additional disallowed properties will be marked as invalid.
- **Feature** If a file conflict is detected when downloading event schemas code bindings, a confirmation prompt is shown

## 1.9.0 2020-04-29

- **Breaking Change** Bumping VS Code minimum version: 1.31.1 => 1.42.0
- **Bug Fix** Bug fixes for step functions language server.: One is related to the error when there is "Default" property missing on "Choice" state.  Second,  “Unreachable state” error when the default state is declared before being referenced by “Choice” state.
- **Bug Fix** Fixed a validation issue with VS Code's `settings.json` and `launch.json` files (#1027)
- **Feature** Add context menu command to copy ARNs from the AWS Explorer
- **Feature** Bumped maximum (exclusive) supported SAM CLI version from 0.50.0 to 0.60.0.
- **Feature** Users are shown a notification reflecting changes to how usage data is gathered. Usage data can still be configured through the editor's settings.
- **Feature** Visualising of step functions step machines will be allowed when ARN strings within ASL definition are invalid.

## 1.8.0 2020-03-31

- **Bug Fix** SAM applications deployed through the toolkit now support IAM resources with custom names
- **Bug Fix** Fix issue where CodeLenses appeared on wrong lines in .js files when adding or removing lines
- **Feature** Toolkit dynamically chooses an available port when debugging SAM applications, starting at port 5858 and counting upwards until one is found
- **Feature** Rebranding the toolkit as the "AWS Toolkit"
- **Feature** New Step Function capabilities: Step Function state machine resources are now shown in the AWS Explorer. Language support (auto-completion, validation) for authoring state machine files. State machines can be created from starting templates. State machines can be downloaded from, published to, and executed within an account.

## 1.7.0 2020-02-18

- **Feature** The Toolkit now supports China and GovCloud regions. If you have a shared credentials profile based in one of these regions, you can add a "region" property to that profile, and the Toolkit will know to use a different region set.
- **Feature** Added the 'About AWS Toolkit' command and menu option to show AWS Toolkit versioning details that are useful to include with bug reports.

## 1.6.1 2020-02-10

- **Bug Fix** Fixed an issue related to toolkit metrics

## 1.6.0 2020-02-06

- **Breaking Change** Minimum version of SAM CLI has been adjusted from 0.32.0 to 0.38.0 to accommodate new SAM application support for EventBridge Schemas
- **Bug Fix** AWS Explorer no longer shows service nodes under regions where the service is not available (#850)
- **Bug Fix** Fixed an issue where invalid credentials were reused until VS Code was closed and re-opened, even if the credentials source was updated. It is no longer necessary to restart VS Code. (#705)
- **Feature** The MFA prompt now shows which MFA Device a code is being asked for.
- **Feature** When credentials are invalid a notification is shown. To help diagnose these situations, a button was added to the notification that can open the logs.
- **Feature** Removed the ability to create node.js 8.10 SAM Applications. This runtime has been deprecated. See https://docs.aws.amazon.com/lambda/latest/dg/runtime-support-policy.html for more information.
- **Feature** When changes are made to Shared Credentials files, they will be picked up by the Toolkit the next time credentials are selected during the 'Connect to AWS' command.
- **Feature** Added support to locally run SAM applications in containers.
- **Feature** AWS Explorer now sorts region nodes by the region name
- **Feature** Credentials were previously shown by their Shared Credentials profile names. They are now displayed in a "type:name" format, to better indicate the type of Credentials being used, and to support additional Credentials types in the future. Shared Credentials are shown with the type "profile".
- **Feature** Added the ability to create new Serverless Applications with EventBridge Schemas support.

## 1.5.0 2020-01-06

- **Breaking Change** Minimum version of SAM CLI has been adjusted from 0.16.0 to 0.32.0 to accommodate new runtime support
- **Feature** Bumped maximum (exclusive) supported SAM CLI version from 0.40.0 to 0.50.0.
- **Feature** SAM Application support for the python3.8 runtime
- **Feature** Reduced plugin size and startup time significantly
- **Feature** SAM Application support for the nodejs12.x runtime
- **Feature** The StatusBar item displaying the current credentials used by the toolkit now shows when no credentials are being used. It can also be clicked to change the Toolkit's active credentials.
- **Feature** The Toolkit now applies configuration changes to the log level when it changes instead of the next time the toolkit is started (#860)
- **Feature** The folder depth within a workspace that SAM Template files are searched for is now configurable. Previously, this was fixed at 2.

## 1.4.0 2019-12-02

- **Feature** Added support for Amazon EventBridge schema registry, making it easy to discover and write code for events in EventBridge

## 1.3.0 2019-11-22

- **Bug Fix** AWS Explorer now shows a node indicating when CloudFormation Stacks cannot be found in a region
- **Bug Fix** AWS Explorer now sorts the resources that belong to each CloudFormation Stack
- **Bug Fix** AWS Explorer now shows a node indicating when Lambda Functions cannot be found in a region
- **Feature** CDK projects can now be visualized with the CDK Explorer

## 1.2.0 2019-10-17

- **Bug Fix** Add '--no-interactive' flag to 'sam init' calls when SAM CLI version is greater than or equal to 0.30.0
- **Feature** Added docker network option support for invoking sam applications
- **Feature** Ansi codes are removed from text shown in the Output tab when Locally Invoking Lambda handlers
- **Feature** Adding support for SAM CLI 0.30.0 features in `sam init`: --app-template and --dependency-manager
- **Feature** Bumped maximum (exclusive) supported SAM CLI version from 0.30.0 to 0.40.0.

## 1.1.0 2019-09-20

- **Bug Fix** Creating SAM Applications into a different folder than the current VS Code workspaces will now open an application file after app creation (#678)
- **Feature** Support credential_process (#317)
- **Feature** Improved the description of the selection item when picking a location for a new SAM Application (#673, #675)
- **Feature** Added JSON validation for ECS task definition intellisense
- **Feature** Bumped maximum (exclusive) supported SAM CLI version from 0.23.0 to 0.30.0.

## 1.0.0

* A toast greets the user upon launching a new version of the toolkit for the first time which provides a link to a quick start page. This quick start page can be re-accessed through the explorer's context menu. (#610-612)
* Local Run/Debug now honors MemorySize values from SAM Template file (#509)
* Local Run/Debug now honors Timeout values from SAM Template file (#510)
* Local Run/Debug now honors the Globals section from SAM Template file
* Fixed issue preventing users from connecting with assumed roles (#620)
* Added ability to report an issue from the AWS Explorer menu (#613)
* Added SAM Application-related commands to the AWS Explorer menu
* Removed support for nodejs6.10 SAM Applications
* Regions that are not in the standard AWS partition have been removed from the UI until proper partition support can be added

## 0.2.1 (Developer Preview)

* Fixed issue preventing users from connecting with assumed roles (#620)

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
