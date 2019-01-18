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

