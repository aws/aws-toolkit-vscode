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

