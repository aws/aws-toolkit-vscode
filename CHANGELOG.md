# _1.11_ (2020-02-25)
- **(Breaking Change)** Remove NodeJS 8.10 from the new project wizard since the runtime is deprecated
- **(Feature)** IDE trust manager is now used to connect to AWS allowing configuration of untrusted certificates through the UI
- **(Bug Fix)** Fix being unable to use `--parameter-overrides` with SAM build
- **(Bug Fix)** Fixed not being able to view EventService Schemas on Windows 10

# _1.10_ (2020-01-07)
- **(Breaking Change)** Minimum SAM CLI version has been increased to 0.38.0
- **(Breaking Change)** Remove the Lambda nodes underneath of the CloudFromation stack in the explorer
- **(Feature)** Add S3 node and S3 Browser:
  - Browse files and folders in a tree view
  - Drag and drop upload
  - Double click to open files directly in the IDE
- **(Feature)** Add support for NodeJS 12 SAM/Lambdas
- **(Feature)** Add support for Java 11 SAM/Lambda
- **(Feature)** Add support for Java 11 SAM/Lambdas
- **(Bug Fix)** Profile name restrictions has been relaxed to allow `.`, `%`, `@`. amd `/`

# _1.9_ (2019-12-02)
- **(Feature)** Added support for Amazon EventBridge schema registry, making it easy to discover and write code for events in EventBridge.

# _1.8-192_ (2019-11-25)
- **(Breaking Change)** Now requires a minimum version of 2019.2 to run
- **(Feature)** Enable Cloud Debugging of ECS Services (beta)
- **(Feature)** Respect the default region in config file on first start of the IDE
- **(Feature)** Allow credential_process commands (in aws/config) to produce up to 64KB, permitting longer session tokens
- **(Feature)** Adding support for WebStorm
- **(Feature)** Enabled pasting of key value pairs into the environment variable table of local AWS Lambda run configurations
- **(Feature)** Adding support for Rider
- **(Bug Fix)** Fix an IDE error showing up during "SAM local debug" caused by running "docker ps" on the wrong thread
- **(Bug Fix)** Browsing for files in the Lambda run configuration is now rooted at the project directory
- **(Bug Fix)** Add an error on empty CloudFormation template or template that lacks a "Resources" section
- **(Bug Fix)** Rider: Fix unsupported Node runtime showing up in the "Create Serverless Applications" menu
- **(Bug Fix)** Fix the IDE showing an error sometimes when the SAM template file is invalid
- **(Bug Fix)** Resolve initialization errors on 2019.3 EAP
- **(Bug Fix)** Fix getting SAM version timing out in some circumstances which caused SAM related commands to fail
- **(Bug Fix)** Fix being able to run "SAM local run" configurations without Docker running
- **(Bug Fix)** Fix IDE error caused by editor text field being requested at the wrong scope level
- **(Bug Fix)** Rider: Fix the "Deploy Serverless" menu not appearing when right clicking on the project view

# _1.7_ (2019-10-17)
- **(Feature)** A notification is shown on startup indicating that JetBrains 2019.2 or greater will be required in an upcoming AWS Toolkit release
- **(Feature)** Add --no-interactive to SAM init when running a version of SAM >= 0.30.0
- **(Feature)** Bump minimum SAM CLI version from 0.14.1 to 0.16.0
- **(Feature)** Adding support for JetBrains Platform version 2019.3.
- **(Bug Fix)** Fix error thrown adding Lambda gutter icons and not having any active credentials
- **(Bug Fix)** Fix validating a Lambda handler not under a ReadAction

# _1.6_ (2019-09-23)
- **(Feature)** Open Stack Status UI on CloudFormation stack deletion.
- **(Feature)** Removed requirement of having to double-click to load more resources in AWS Explorer if there is more than one page returned
- **(Feature)** Added a Copy Arn action to AWS Explorer
- **(Feature)** Move AWS Connection details into a common Run Configuration tab for remote and local Lambda execution.
- **(Feature)** Enable caching of describe calls to avoid repeated network calls for already known resources.
- **(Feature)** Support timeout and memory size settings in run configuration
- **(Feature)** Porting resource selector to use resource-cache so network won't be hit on each dialog load.
- **(Feature)** Add support to link Gradle project.
- **(Feature)** Additional SAM build and SAM local invocation args configurable from Run/Debug Configuration settings
- **(Bug Fix)** Fix the bug that PyCharm pipenv doesn't create the project location folder
- **(Bug Fix)** Fix the CloudFormation explorer node not showing Lambdas that belong to the stack
- **(Bug Fix)** Log errors to idea.log when we fail to swtich the active AWS credential profile
- **(Bug Fix)** Handle the "me-" region prefix Treat the "me-" region prefix as Middle East
- **(Bug Fix)** Fixing issue where explorer does not load even with credentials/region selected.
- **(Bug Fix)** Fixing random AssertionError exception caused by Guava cache.
- **(Bug Fix)** Fix the bug that underscores in profile names are not shown in AWS settings panel
- **(Bug Fix)** Fixed bug in Pycharm's New Project pane where VirtualEnv path is not changed as project path is changed after switching Runtime
- **(Bug Fix)** Handle non-cloudformation yaml files gracefully
- **(Bug Fix)** Fix thread issue in PyCharm new project wizard
- **(Bug Fix)** Fix the bug that toolkit throws unhandled exception on startup when active credential is not configured

# _1.5_ (2019-07-29)
- **(Feature)** Support Globals configuration in SAM template for serverless functions.
- **(Feature)** Enable searching for `requirements.txt` when determining if a python method is a handler to match SAM build
- **(Feature)** Enable toolkit in 2019.2 EAP
- **(Feature)** Support building only the requested function when sam cli version is newer than 0.16
- **(Bug Fix)** Upgraded AWS Java SDK to pull in latest model changes ([#1099](https://github.com/aws/aws-toolkit-jetbrains/issues/1099))
- **(Bug Fix)** Fix DynamoDB template for Python does not create correctly.
- **(Bug Fix)** Fix DaemonCodeAnalyzer restart not happening in a read action ([#1012](https://github.com/aws/aws-toolkit-jetbrains/issues/1012))
- **(Bug Fix)** Fix the bug when project is in different drive than the temp folder drive for Windows. [#950](https://github.com/aws/aws-toolkit-jetbrains/issues/950)
- **(Bug Fix)** Fix invalid credentials file reporting an IDE error
- **(Bug Fix)** Fix issue where modifying a cloned run config results in mutation of the original
- **(Bug Fix)** Fix runtime exceptions on project startup and run configuration validation
- **(Bug Fix)** Fix read/write action issues when invoking a Lambda using SAM ([#1081](https://github.com/aws/aws-toolkit-jetbrains/issues/1081))
- **(Bug Fix)** Make sure all STS assume role calls are not on the UI thread ([#1024](https://github.com/aws/aws-toolkit-jetbrains/issues/1024))

# _1.4_ (2019-06-10)
- **(Feature)** Usability enhancements to the CloudFormation UI
  - color coding status similar to the AWS Console
  - preventing multiple tabs opening for the same stack ([#798](https://github.com/aws/aws-toolkit-jetbrains/issues/798))
  - opening from AWS Explorer with right-click instead of double click ([#799](https://github.com/aws/aws-toolkit-jetbrains/issues/799))
  - adding status reason to event view
- **(Feature)** Open README.md file after creating a project
- **(Feature)** Auto-create run configurations when using the New Project wizard
- **(Feature)** Enable toolkit in 2019.2 EAP
- **(Bug Fix)** Fix unable to map paths that have `.` or `..` in them
- **(Bug Fix)** Do not load proxy settings from Java system properties since it conflicts with IDE setting
- **(Bug Fix)** Make sure we commit all open documents if using a file-based event input ([#910](https://github.com/aws/aws-toolkit-jetbrains/issues/910))
- **(Bug Fix)** Fix being unable to open an empty credentials/config file for editing

# _1.3_ (2019-04-25)
- **(Feature)** Respect IDE HTTP proxy settings when making calls to AWS services. Fixes [#685](https://github.com/aws/aws-toolkit-jetbrains/issues/685).
- **(Feature)** Add Tooltips to the UI components
- **(Feature)** Java 8 Maven projects created through the Project Wizard templates will auto-import
- **(Feature)** Optimize plugin start up and responsiveness by making sure AWS calls happen on background threads
- **(Feature)** Added plugin icon
- **(Feature)** Documentation link added to AWS Explorer's gear menu
- **(Feature)** Add more help links from Toolkit's UI components into tech docs
- **(Feature)** Support credential_process in profile file.
- **(Bug Fix)** Fix being unable to add breakpoints to Python Lambdas on Windows, Fixes [#908](https://github.com/aws/aws-toolkit-jetbrains/issues/908)
- **(Bug Fix)** Fix gutter icon not shown in Project whoses runtime is not supported by Lambda but runtime group is supported
- **(Bug Fix)** Fix building of a Java Lambda handler failing due to unable to locate build.gradle/pom.xml Fixes [#868](https://github.com/aws/aws-toolkit-jetbrains/issues/868), [#857](https://github.com/aws/aws-toolkit-jetbrains/issues/857)
- **(Bug Fix)** Fix template not found after creating a project, fixes [#856](https://github.com/aws/aws-toolkit-jetbrains/issues/856)

# _1.2_ (2019-03-26)
- **(Breaking Change)** Minimum SAM CLI version has been increased to 0.14.1
- **(Feature)** You can now specify a docker network when locally running a Lambda
- **(Feature)** You can now specify if SAM should skip checking for newer docker images when invoking local Lambda functions
- **(Feature)** Add Gradle based SAM project template
- **(Feature)** Java8 functions using `sam build` can now be deployed
- **(Feature)** Building of Python based Lambda functions has been migrated to using `sam build`. This adds the option to use a container-based build during local run/debug of Lambda functions.
- **(Feature)** The AWS CLI config and credential files are now monitored for changes. Changes automatically take effect.
- **(Feature)** Enable support for IntelliJ/Pycharm 2019.1
- **(Feature)** Add option to use a container-based build during serverless application deployment
- **(Feature)** Enable support for running, debugging, and deploying Python 3.7 lambdas
- **(Feature)** Building of Java 8 based Lambda functions has been migrated to using `sam build` (Maven and Gradle are supported).
- **(Bug Fix)** Fix sort order for CloudFormation nodes in the AWS Explorer
- **(Bug Fix)** Clarify validation error when SAM CLI is too old
- **(Bug Fix)** Fix issue where 'Edit Credentials' action didn't check for both 'config' and 'credentials'
- **(Bug Fix)** Fix issue where the cancel button in the Serverless Deploy progress dialog did nothing
- **(Bug Fix)** Improve 'Invalid AWS Credentials' messaging to include error details
- **(Bug Fix)** Unable to edit AWS credential file via pycharm ([#759](https://github.com/aws/aws-toolkit-jetbrains/issues/759))
- **(Bug Fix)** Fix issue where invalid AWS Credentials prevent plugin startup
- **(Bug Fix)** Require SAM run configurations to have an associated credential profile ([#526](https://github.com/aws/aws-toolkit-jetbrains/issues/526))

# _1.1_ (2019-01-08)
- **(Feature)** Additional information provided when AWS Explorer isn't able to load data - [#634](https://github.com/aws/aws-toolkit-jetbrains/issues/634) [#578](https://github.com/aws/aws-toolkit-jetbrains/issues/578)
- **(Feature)** Able to view CloudFormation stack details by double clicking it in the Explorer
- **(Feature)** Added AWS Credential validation when changing profiles
- **(Bug Fix)** Fix case where packaging Java code was not releasing file locks [#694](https://github.com/aws/aws-toolkit-jetbrains/issues/694)
- **(Bug Fix)** Suppress FileNotFoundException that can be thrown if the endpoints file fails to download
- **(Bug Fix)** Fixed issue where accounts without Lambda access were unable to open CloudFormation stack nodes
- **(Bug Fix)** Use us-east-1 instead of global endpoint for STS
- **(Bug Fix)** Ignore .DS_Store files when building Lambda zip ([#725](https://github.com/aws/aws-toolkit-jetbrains/issues/725))
- **(Bug Fix)** Fix IllegalStateException: context.module must not be null ([#643](https://github.com/aws/aws-toolkit-jetbrains/issues/643))
- **(Bug Fix)** Fixed issue on OS X where the SAM CLI is unable to use an UTF-8 locale.
- **(Bug Fix)** Fix the status message for certain states during CloudFormation stack updates ([#702](https://github.com/aws/aws-toolkit-jetbrains/issues/702))

