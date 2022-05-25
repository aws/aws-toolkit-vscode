# Configure your toolchain

The AWS Toolkit for Visual Studio Code supports multiple languages that you can use to interact with AWS\. This walkthrough describes how to set up the toolchain for each of these languages\.

## Configure a toolchain for \.NET Core

1. Install the [C\# extension](command:workbench.extensions.search?"ms-dotnettools.csharp")\. This extension enables VS Code to debug \.NET Core applications\.

2. Open an AWS Serverless Application Model \(AWS SAM\) application, or [create one](command:aws.lambda.createNewSamApp)\.

3. Open the folder that contains `template.yaml`\.

## Configure a toolchain for Node\.js

1. Open an AWS SAM application, or [create one](command:aws.lambda.createNewSamApp)\.

2. Open the folder that contains `template.yaml`\.

## Configure a toolchain for Python

1. Install the [Python extension for Visual Studio Code](command:workbench.extensions.search?"ms-python.python")\. This extension enables VS Code to debug Python applications\.

2. Open an AWS SAM application, or [create one](command:aws.lambda.createNewSamApp)\.

3. Open the folder that contains `template.yaml`\.

4. Open a terminal at the root of your application, and configure `virtualenv` by running `python -m venv ./.venv`\.
   **Note**
   You only need to configure `virtualenv` once per system\.

5. Activate `virtualenv` by running one of the following:
    - Bash shell: `./.venv/Scripts/activate`
    - PowerShell: `./.venv/Scripts/Activate.ps1`

## Configure a toolchain for Java

1. Install the [Java extension and Java 11](command:workbench.extensions.search?"redhat.java")\. This extension enables VS Code to recognize Java functions\.

2. Install the [Java debugger extension](command:workbench.extensions.search?"vscjava.vscode-java-debug")\. This extension enables VS Code to debug Java applications\.

3. Open an AWS SAM application, or [create one](command:aws.lambda.createNewSamApp)\.

4. Open the folder that contains `template.yaml`\.

## Configure a toolchain for Go

1. Go 1\.14 or higher is required for debugging Go Lambda functions\.

2. Install the [Go extension](command:workbench.extensions.search?"golang.Go")\.
   **Note**
   Version 0\.25\.0 or higher is required for debugging Go1\.15\+ runtimes\.

3. Install Go tools using the [Command Palette](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/toolkit-navigation.html#command-locations):

    1. From the command pallete, choose `Go: Install/Update Tools`\.

    2. From the set of checkboxes, select `dlv` and `gopls`\.

4. Open an AWS SAM application, or [create one](serverless-apps.md#serverless-apps-create)\.

5. Open the folder that contains `template.yaml`\.

## Using Your toolchain

Once you have your toolchain set up, you can use it to [run or debug](https://docs.aws.amazon.com/toolkit-for-vscode/latest/userguide/serverless-apps.html#serverless-apps-debug) the AWS SAM application\.

Try the [AWS Code Sample Catalog](https://docs.aws.amazon.com/code-samples/latest/catalog/welcome.html) to start coding with the AWS SDK.
