![Build Status](https://codebuild.eu-west-1.amazonaws.com/badges?uuid=eyJlbmNyeXB0ZWREYXRhIjoiekhxeERIMmNLSkNYUktnUFJzUVJucmJqWnFLMGlpNXJiNE1LLzVWV3B1QUpSSkhCS04veHZmUGxZZ0ZmZlRzYjJ3T1VtVEs1b3JxbWNVOHFOeFJDOTAwPSIsIml2UGFyYW1ldGVyU3BlYyI6ImZXNW5KaytDRGNLdjZuZDgiLCJtYXRlcmlhbFNldFNlcmlhbCI6MX0%3D&branch=master) [![Coverage](https://img.shields.io/codecov/c/github/aws/aws-toolkit-jetbrains/master.svg)](https://codecov.io/gh/aws/aws-toolkit-jetbrains/branch/master) [![Gitter](https://badges.gitter.im/aws/aws-toolkit-jetbrains.svg)](https://gitter.im/aws/aws-toolkit-jetbrains?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge) 
# AWS Toolkit for JetBrains

AWS Toolkit for JetBrains - a plugin for interacting with AWS from JetBrains IDEs. The plugin includes features that make it easier to write applications on [Amazon Web Services](https://aws.amazon.com/) using a JetBrains IDE.

The Toolkit is currently in preview and only available if built from [source](#building-from-source).


## Features

Features are broken broadly into two categories **All IDEs** and **IDE/Language Specific**.

### All IDEs
These are features that will work in any JetBrains IDE you are using. They do not depend on a specific flavour of the IDE (e.g. IntelliJ, RubyMine).

Currently supported features are:

#### General

* **Credential management** - the ability to select how you want to authenticate with AWS, management of several credential types and the ability to easily switch between profiles.
* **Region management** - the ability to switch between viewing resources in different AWS regions.
* **Resource Explorer** - tree-view of AWS resources available (e.g. [AWS Lambda Functions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-introduction-function.html)) in your selected account/region. This does not represent all resources available in your account, only a sub-set of those resource types supported by the plugin.

#### Services

**![AWS Lambda][lambda-icon] AWS Lambda**

* **Invoke Function (Remote)** - the ability to invoke an AWS Lambda Function that is deployed in your account. You provide the input (or select from a set of event templates), the plugin will invoke the function and display the response.

### IDE / Language Specific Features
These features require some knowledge of the programming language/paradigm your project is authored in and thus are only available in certain contexts (e.g. IntelliJ Java Projects). 

The following table shows the features that are available in various JetBrains IDEs. Minimum supported version of IntelliJ platform is [2018.2](https://blog.jetbrains.com/idea/tag/2018-2/).

| AWS Service | Feature | IntelliJ | PyCharm | GoLand |
| --- | --- | --- | --- | --- |
| ![AWS Lambda][lambda-icon] AWS Lambda | Package & Deploy | :white_check_mark: | :white_check_mark: <br> (no external dependencies) | :white_check_mark: |
| ![AWS Lambda][lambda-icon] AWS Lambda | Invoke / Debug Function (Local) | :white_check_mark: | | |


*NB: If a feature is available in a non-IntelliJ plugin (e.g. PyCharm) it is also available through IntelliJ if the related IntelliJ plugin is available (e.g. [Python Plugin](https://www.jetbrains.com/help/idea/plugin-overview.html))*

## Roadmap
We use a combination of GitHub features to manage our milestones and roadmap.

* [Milestones](https://github.com/aws/aws-toolkit-jetbrains/milestones) - these are the upcoming releases for the plugin. Currently we are working towards an Initial GA release of the plugin. It has the following [features](https://github.com/aws/aws-toolkit-jetbrains/milestone/1) in the backlog.
* [Projects](https://github.com/aws/aws-toolkit-jetbrains/projects) - these are related areas of focus with features that could be split across multiple milestones.

## Building From Source

Currently the only way to consume the plugin is to build the source and add it as a local plugin.

### Requirements

* Java 8+
* [Git](https://git-scm.com/)

### Instructions

1. Clone the github repository

  ```
  git clone https://github.com/aws/aws-toolkit-jetbrains.git
  cd aws-toolkit-jetbrains
  ```

2. Build using gradle wrapper (included in the repository)

  On Linux/Mac
  
  ```
  ./gradlew buildPlugin
  ```
  
  On Windows
  
  ```
  gradlew buildPlugin
  ```
  
3. In your JetBrains IDE (e.g. IntelliJ) navigate to `Settings/Preferences` -> `Plugins` and select "Install Plugin from Disk". Navigate to the directory where you cloned the project and select the `build/distributions/aws-jetbrains-toolkit-0.1-SNAPSHOT.zip` file. 
4. You will be prompted to restart your IDE.

## Contributing

We love contributions! Please see the the [CONTRIBUTING](CONTRIBUTING.md) guide for how to help.

## Licensing

The plugin is distributed according to the terms outlined in our [LICENSE](LICENSE).

[lambda-icon]: jetbrains-core/resources/icons/logos/Lambda.svg
