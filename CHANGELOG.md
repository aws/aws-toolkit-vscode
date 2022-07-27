## 1.46.0 2022-07-25

- **Bug Fix** "Read-only file system" error when deploying or debugging a SAM project #2395

## 1.45.0 2022-07-07

- **Bug Fix** `Add SAM Debug Configuration` codelenses in source files are now disabled by default. (To enable the codelenses, use the `AWS: Toggle SAM hints in source files` command or the `Enable SAM hints` setting.)
- **Bug Fix** CodeWhisperer features were not fully disabled if the experiment was disabled
- **Bug Fix** 'security token expired' errors when using CodeWhisperer in Cloud9 with managed credentials

## 1.44.0 2022-06-30

- **Bug Fix** Fixed a bug where CodeWhisperer incorrectly changes the `snippetSuggestions` setting in VSCode

## 1.42.0 2022-06-23

- **Feature** [CodeWhisperer](https://aws.amazon.com/codewhisperer) uses machine learning to generate code suggestions from the existing code and comments in your IDE. Supported languages include: Java, Python, and JavaScript.

## 1.41.0 2022-06-22

- **Bug Fix** Credentials are now automatically refreshed on certain AWS API errors

## 1.40.0 2022-06-17

- **Bug Fix** The `Upload Lambda` command now automatically causes the Toolkit to login
- **Bug Fix** S3 "Presigned URL" feature may silently fail #2687
- **Bug Fix** Fix issue where some http errors were logging undefined on error
- **Feature** UI: buttons for Lambda invoke, API invoke, and other forms are now always visible at the top of the form

## 1.39.0 2022-06-06

- **Bug Fix** StepFunctions: allow state machines with non-object values for Parameters property
- **Bug Fix** Fix incorrect use of Markdown in new SAM application READMEs
- **Bug Fix** Fix: syntax support (JSON schemas) for CloudFormation/SAM yaml sometimes doesn't work
- **Bug Fix** Credential profiles that do not require user-input now correctly refresh when expired
- **Feature** "Upload Lambda" from any folder in VS Code File Explorer
- **Feature** "Send Feedback" form always enables Send button and doesn't require text input
- **Feature** SAM: create, run and debug nodejs16.x Lambdas
- **Feature** CDK features are now found in the _Developer Tools_ view. This view will contain more ways to work with local project resources in future releases.

## 1.38.0 2022-05-12

- **Breaking Change** Removed the `aws.onDefaultRegionMissing` setting
- **Bug Fix** SAM template.yaml syntax support for condition, requestmodel, requestparameters, custom resources, SSMParameterReadPolicy and AWSSecretsManagerGetSecretValuePolicy
- **Bug Fix** Fixed issue with API Gateway 'Invoke on AWS' resource names always showing 'resource.path'
- **Bug Fix** S3 File Viewer: file paths containing reserved URI characters are now handled correctly
- **Feature** `Edit SAM Debug Configuration` and `View Toolkit Logs` commands are now shown in the AWS Explorer main menu
- **Feature** Lambda: Use Upload Lambda from a folder, template file, or the command palette.
- **Feature** renamed `SAM Debug Configuration Editor` command to `Edit SAM Debug Configuration`
- **Feature** SAM run/debug now uses the current active credentials (if the `aws.credentials` launch-config field is not set)
- **Feature** Show "Add Debug Config" codelens in JS/TS files even if package.json is missing #2579
- **Feature** "Show or Hide Regions" is now one command that supports multiple selections
- **Feature** added `Show AWS Commands...` command to AWS Explorer menu
- **Feature** Open schemas directly when clicking on schema item nodes

## 1.37.0 2022-03-25

- **Bug Fix** SAM run/debug: slow debugger attachment for API configurations now shows a cancellable notification instead of automatically failing
- **Feature** "Adding Go (Golang) as a supported language for code binding generation through the EventBridge Schemas service"

## 1.36.0 2022-03-03

- **Bug Fix** Step Functions: fixed issue with opening a graph render from the editor
- **Bug Fix** ECS: avoid null reference error when loading nodes #2441
- **Feature** SAM/Lambda: add support for .NET 6 (dotnet6)
- **Feature** ECS: Container node displays when there is no running containers
- **Feature** Cloud9: user can choose which Resources to show
- **Feature** ECS: Toolkit checks if the current credentials have permissions for "Run Command in Container"

## 1.35.0 2022-01-13

- **Bug Fix** Schemas: handle errors for invalid settings configurations on activation
- **Bug Fix** Logging: Toolkit logs are now cleaned up automatically by the extension to prevent excessive storage consumption
- **Bug Fix** fix newline in 'About Toolkit' command
- **Bug Fix** S3: fix 'Upload to Parent...' command
- **Bug Fix** Credentials: profile field names no longer need to be all lowercase
- **Feature** ECS Exec: only show tasks that have the ECS Exec agent. #2416
- **Feature** IoT: add attached policies in Things subtree

## 1.34.0 2021-11-22

- **Bug Fix** Improve auto-connect reliability
- **Bug Fix** Toolkit appeared stuck at "Connecting..."
- **Bug Fix** CDK: fixed performance issue with project detection. Detection is no longer limited to a depth of two directories.
- **Feature** S3: Upload now supports multiple files
- **Feature** Add AWS IoT Explorer
- **Feature** AWS Explorer shows ECS resources and supports "Run command in container"

## 1.33.0 2021-11-04

- **Breaking Change** Bumping VS Code minimum version: 1.42.0 => 1.44.2
- **Bug Fix** Credentials: Handle case when running in an ECS container but no credentials are available.
- **Bug Fix** Resources: Avoid redundant close of active editor when resource documents are explicitly closed

## 1.32.0 2021-10-21

- **Breaking Change** DEPRECATION: SAM actions using `dotnetcore2.1` runtime (Phase 2 Lambda deprecation)
- **Bug Fix** Resources: Better handling of unsupported resource actions
- **Bug Fix** Resources: Filter S3 bucket resources by region in list view
- **Bug Fix** Resources: Exclude resource types that do not support LIST in Cloud9
- **Bug Fix** Resources: Handle undefined type schema properties

## 1.31.0 2021-10-14

- **Bug Fix** StepFunctions: "Publish" command now asks for target region
- **Feature** SAM "Edit Debug Configuration" UI is no longer "Beta"
- **Feature** Surface read-only support for hundreds of resources under the Resources node in the AWS Explorer
- **Feature** Create new Step Functions state machine template from AWS Explorer

## 1.30.0 2021-10-04

- **Breaking Change** DEPRECATION:  SAM actions using `python2.7` and `nodejs10.x` runtimes (Phase 2 Lambda deprecation)
- **Breaking Change** SAM run/debug: The launch configuration options 'timeoutSec' and 'memoryMb' no longer apply to template or API targets
- **Bug Fix** SAM/nodejs: do not check for "tsc" (typescript compiler) for plain javascript projects
- **Bug Fix** SAM Debug Configuration Editor: All fields will persist after Save or Invoke action.
- **Bug Fix** SAM: refresh timeout timer during build step
- **Bug Fix** SAM/typescript: fix run/debug for target=code if source dir name has special chars
- **Bug Fix** App Runner: fix issue with create wizard failing at the end after backing out of the select file dialog
- **Feature** SAM: `arm64` support (through SAM CLI's Architectures property) on select runtimes
- **Feature** Step Functions: Adds ability to render state machine graph from AWS Explorer.
- **Feature** Credentials: SSO profiles will reconnect on startup if the token is still valid
- **Feature** SAM run/debug: You can now change where SAM CLI builds your lambda by adding a 'buildDir' field to your launch configuration's "sam" section
- **Feature** UI: Toolkit statusbar now shows on the left and takes less space
- **Feature** Step Functions: enable visualizing ASL files in YAML (not asl-yaml) mode.
- **Feature** SAM/CFN schema support: avoid changes to user settings, improve reliability.
- **Feature** Adds Command Palette and CDK Explorer tree visualization capability for Step Functions state machines defined using the AWS CDK
- **Feature** SAM/typescript: search node_modules in the workspace for "tsc" typescript compiler
- **Feature** SAM Debug Configuration Editor: The UI has been updated to more closely match VS Code's style

## 1.29.0 2021-08-19

- **Bug Fix** SAM: the Toolkit now correctly skips sending '--env-vars' when no environment variables are present in the launch config
- **Bug Fix** Credentials: correctly handle different `source_profile` combinations
- **Bug Fix** SAM/CFN: fix JSON schema path causing a symlink on some operating systems
- **Bug Fix** SAM/CFN JSON schema: schemas now load correctly on first-load
- **Bug Fix** SAM/CFN JSON schema: write yaml.customTags to user-global settings (instead of workspace-local)
- **Feature** SAM Application support for the python3.9 runtime

## 1.28.0 2021-08-09

- **Bug Fix** SAM Invoke Webview: fix 'Show All Fields' causing a blank page
- **Bug Fix** CloudWatch Logs: show a placeholder message instead of an error when no logs exist
- **Feature** Credentials: support for ECS container provided credentials
- **Feature** Credentials: Improved guidance during new credential profile creation
- **Feature** Added Getting Started walkthroughs to aid in configuring the Toolkit
- **Feature** S3: new command/action: 'Generate Presigned URL'
- **Feature** App Runner: You can now create, pause, resume, deploy, and delete App Runner services within the AWS explorer.
- **Feature** New SAM applications come with toolkit-specific instructions
- **Feature** Apply JSON schemas to Cloudformation and SAM templates (must be named `template.yaml`)

## 1.27.0 2021-07-01

- **Bug Fix** SAM: fixed issue with downloading deployed lambdas
- **Bug Fix** Credentials: Validate attached IAM role when deciding if EC2 instance credentials are available

## 1.26.0 2021-06-30

- **Bug Fix** S3: improved performance in private VPC (via getBucketLocation)
- **Bug Fix** Add new setting `aws.samcli.lambda.timeout` and remove `aws.samcli.debug.attach.timeout.millis` setting. The new setting sets the maximum time to wait for a local Lambda to start.
- **Bug Fix** CloudWatch Logs: timestamps were incorrectly shown in 12 hour notation instead of 24 hour notation
- **Bug Fix** Settings: write 'recently used buckets' setting as JSON object
- **Feature** Renamed "Import Lambda" -> "Download Lambda" for clarity
- **Feature** New command: `AWS: Upload current file to S3`
- **Feature** File Explorer: "Deploy SAM Application" is available from the context-menu for template.yaml files #263
- **Feature** SAM run/debug: support TypeScript SAM Lambda projects #1845
- **Feature** credentials: support for credentials provided by EC2 instance metadata and environment variables

## 1.25.0 2021-05-10

- **Bug Fix** Credentials: cannot access 'canAutoConnect' of undefined
- **Feature** UX: Add progress notification when connecting to AWS
- **Feature** SAM run/debug: fail early so that build/invoke errors are more obvious #1689
- **Feature** CDK: search for CDK projects up to 2 levels deep (previously 1)
- **Feature** CDK: menu includes standard items if AWS view is hidden
- **Feature** Skip auto-connect until AWS Explorer is shown #1433
- **Feature** Toggle CodeLenses via "AWS: Toggle SAM hints in source files" command
- **Feature** SAM run/debug: Add support for Go 1.x
- **Feature** UX: write logs to extension's 'globalStoragePath' for all operating systems #1692
- **Feature** Create aws-sam debug configurations via Command Palette using the `AWS: Add SAM Debug Configuration` command
- **Removal** Settings: remove "Enable CDK Explorer" option (VSCode has built-in support for showing/hiding panels already)

## 1.24.0 2021-04-22

- **Bug Fix** SAM Python debugging: restore retry to ensure successful attach #1666
- **Feature** SAM run/debug: Add support for Java 8, Java 8.al2, and Java 11 runtimes using Maven and Gradle
- **Feature** CDK panel now appears below the AWS Explorer instead of the VSCode File Explorer
- **Feature** UI: Refresh AWS Explorer after performing "Deploy SAM application"

## 1.23.0 2021-04-16

- **Feature** Beta UI for editing and directly invoking AWS SAM debug configurations
- **Feature** AWS Explorer: clicking "Failed to load" node navigates to failure details #1569
- **Feature** SAM Deploy wizard: show recently-used S3 buckets; ability to input S3 bucket name manually #1527
- **Feature** SAM run/debug: Add support for Java 8, Java 8.al2, and Java 11 runtimes using Maven and Gradle
- **Feature** Step Functions: adds ability to publish/update state machine from ASL YAML files.
- **Feature** SAM run/debug: improve display of partial lines #1581
- **Feature** "Create Lambda SAM Application": navigate to README.md instead of template.yaml #1574

## 1.22.0 2021-03-19

- **Bug Fix** fix unwanted "invalid SAM CLI" error on startup
- **Feature** StepFunctions: show "View Logs" button on failure

## 1.21.0 2021-03-17

- **Breaking Change** SAM debug: remove nodejs8.10 support
- **Bug Fix** Toolkit correctly handles failures when importing Lambdas for supported language families that have not been added explicitly as importable
- **Bug Fix** Launch configurations created by the Toolkit use correct relative paths
- **Feature** Support ${workspaceFolder} in aws-sam debug configs
- **Feature** Renaming "Create new SAM Application" to "Create Lambda SAM Application" to make it clear that this is an entrypoint for creating a Lambda function
- **Feature** SAM deploy wizard: optionally create a new S3 bucket

## 1.20.0 2021-02-04

- **Feature** SAM templates handle Global values correctly when Resource-level fields are missing.
- **Feature** Support for SAM CLI 1.17: SAM create/run nodejs14.x

## 1.19.0 2021-02-01

- **Bug Fix** Schemas: download failure would not trigger code generation under certain conditions
- **Feature** "Create new SAM Application" command suggests a more-intuitive name
- **Feature** Support for SAM CLI 1.16: SAM create/run dotnet5.0
- **Feature** List API Gateway names with their ID (so Toolkit can list APIs with identical names)
- **Feature** Improved validation when searching for SAM CLI #1465

## 1.18.0 2021-01-07

- **Bug Fix** WatchedFiles improvements (Windows) #1416
- **Bug Fix** SAM debug: Fix deployment for image based lambdas in sam cli 1.14+ #1448
- **Bug Fix** SAM debug: fix payload JSON validation #1440
- **Feature** Adds ASL YAML linting and visualization support.
- **Feature** SAM debug: use debugpy instead of ptvsd #1365
- **Feature** SAM debug: Ignore build failures and attempt to continue invoke/deploy
- **Feature** SAM debug: detect & surface "low disk space"
- **Feature** Adds Amazon States Language (YAML) format to the ASL Language Server. Adds option to choose YAML format when creating new Step Functions state machine from a template.

## 1.17.0 2020-12-11

- **Bug Fix** Automatically add runtime to the autogenerated launch configuration for Image-based Lambdas
- **Feature** API Gateway support: debug local SAM resources, list and run remote resources

## 1.16.0 2020-12-01

- **Bug Fix** Fix showing templates from .aws-sam in Sam Deploy (#1380)
- **Bug Fix** Fix creating S3 buckets in us-east-1
- **Bug Fix** Retain view state for Step Functions and Lambda when changing tabs
- **Feature** Container Image Support in Lambda
- **Feature** Add an explorer node for managing ECR repositories
- **Feature** NodeJS and Python Lambda functions can be imported from an AWS account into a local workspace
- **Feature** Lambda functions can be updated with code from ZIP files and directories containing built or unbuilt code
- **Feature** Codelenses in source files can create launch configurations that reference template.yaml resources.
- **Feature** "Create new SAM Application" action is available from the context menu of Lambda nodes in the AWS Explorer
- **Feature** The amount of CloudWatch Logs entries retrieved per request is now configurable.
- **Feature** "Deploy SAM Application" action is available from the context menu of Lambda, CloudFormation, and Region nodes in the AWS Explorer

## 1.15.0 2020-10-06

- **Bug Fix** Fix issues which prevented SAM debugging in WSL #1300
- **Feature** Add support for debugging dotnet 3.1 local lambdas (requires minimum SAM CLI version of 1.4.0)
- **Feature** Add Arn and Region to Lambda invoke view

## 1.14.0 2020-09-30

- **Bug Fix** Fix ASL validation bug marking states as unreachable when defined before a Choice state
- **Feature** Add AWS Systems Manager integration to allow users to view, create and publish Automation documents. Support for code completion and validation with templates and code snippets to help users author their Automation documents.
- **Feature** When deploying a SAM application, the S3 bucket is now chosen from a list. Previously, the bucket name had to be typed in.

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
