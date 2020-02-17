# Credential Management

## Abstract

This document describes the process of managing and switching of AWS credentials within the toolkit.

## Motivation

AWS provides many different ways to retrieve the credentials required to make calls to AWS including but not limited to:
credential/config files, environment variables, system properties, EC2 metadata APIs. You can also assume roles using 
a source set of credentials or use MFA. Due to this large matrix of possibilities the toolkit strives to provide an 
intuitive abstraction layer on top of some of these sources so that the implementation details are hidden and a 
consistent user experience can be provided, while also enabling future expansion of new sources, including possibly by 
third party plugins.

## Specification

This toolkit will introduce the following concepts:

1. `ToolkitCredentialsProvider` - An abstract class that implements [AwsCredentialsProvider] in the SDK. This class does not
do any actual resolving of credentials, but instead leaves that to concrete implementations. It instead provides
an ID that is globally unique across all credential providers as well as defining a way to generate a display name.

2. `ToolkitCredentialsProviderFactory` - Factory interface that knows how to create one or more `ToolkitCredentialsProvider`
for a credential source. A `ToolkitCredentialsProviderFactory` can create 0 or more instances of `ToolkitCredentialsProvider` 
as long as each one is valid. Valid is defined as the credential source has all the required information to comply with
the underlying credential source's contract. For example, a factory that handles static credentials would need to make sure that 
both access and secret keys are provided. It does not verify if the credentials themselves are valid (able to make an AWS call) 
at creation time of the `ToolkitCredentialsProvider`.

3. `ToolkitCredentialsProviderManager` - This class acts as the union of all `ToolkitCredentialsProviderFactory`. Its 
job is to be able to list all `ToolkitCredentialsProvider` and return the provider that is referenced by its unique global ID.
 It also has the ability to have listeners registered to it so they can listen for changes when `ToolkitCredentialsProvider` are
added or removed such as when the shared credentials file is modified.

4. `Active Connection Settings` - Represents the current credentials and region that the toolkit uses to perform actions or defaults to when
more than one option is possible. Due to the nature of the IntellJ IDE being multiple windows in one JVM, each project
window can have a different active credential selected.

### Diagram
![ClassDiagram]

### Extension System

We register all `ToolkitCredentialsProviderFactory` through the IntelliJ extension point system by creating a custom
extension point bean (`CredentialProviderFactoryEP`) under the FQN `aws.toolkit.credentialProviderFactory` which has a 
single `implementation` attribute. The extension system is only queried once, and the list of instances of
`ToolkitCredentialsProviderFactory` must be immutable.

Example of usage:
```xml
    <extensions defaultExtensionNs="aws.toolkit">
        <credentialProviderFactory implementation="software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialProviderFactory"/>
    </extensions>
```

### Credential Validation

In order to validate the credentials returned by the `ToolkitCredentialsProvider`, we make a call to 
`sts::getCallerIdentity`. If the call fails, we consider the credentials to be invalid.

### Built-in Providers

#### Shared Credentials File(s) (Profile file)

Also known as credential profiles, this sources the credentials from the `~/.aws/config` and `~/.aws/credentials` file
according to [CLI documentation][CliConfigDocs]. We try to comply as close as possible with the CLI behavior, but not
all keys are supported in the toolkit. We ignore properties not related to credential management as well.

Supported keys:
* `aws_access_key_id`
* `aws_secret_access_key`
* `aws_session_token`
* `source_profile`
* `external_id`
* `role_session_name`
* `mfa_serial`
* `credential_process`

##### Refreshing

We start a file watcher to watch the `credential` and `config` files for changes. Upon detecting changes we will internally
reload, add, or remove instances of `ProfileToolkitCredentialsProvider` based on if the profile is still syntactically valid.

If a profile is modified, but its name is not changed, its `ProfileToolkitCredentialsProvider` should be modified internally. 
This means external references to the object are still valid.

## Settings Management

### Active Connection Settings Flow

Active connection settings are managed at the project level and does validation upon switching of either the active credential provider or region.
The credential manager can have an internal state of one of the following:
1. `Initializing` - The state upon loading of the IDE, this state is the initial state whenever a new project is opened.
It can be entered from either the UI (EDT) thread of a background thread based on the loading order of the IDE, but the processing of the
state must happen on a background thread. This state includes loading of previous settings and if settings do not exist, query for defaults according to
the default profile resolving logic as defined by the SDKs. This state must exit into the `Validating` state.
2. `Validating` - This state is can be entered into by any thread, but the validation logic as defined by [Credential Validation](#credential-validation) must 
be on a background thread. The result of the validation should be notified on the UI thread. If they are valid, the manager will enter the `Active` state, 
else it will enter `Invalid`.
3. `Active` - This state represents that there are active credentials and they are valid.
4. `Invalid` - This state represents that the selected credential profile / region pair has failed the validation check. When we enter this state, we report
that there are no active credentials, but we do not clear the users selection. This is required to allow for switching of credentials and regions that may take two
operations to succeed.

### Status Bar

We register a status bar widget in order to provide the user with an indicator of what credential is active in their 
project. It will also indicate what state we are in inside of the account settings manager.

The status bar also acts as an entry point to switching by having a switcher in the context menu.

![NoCredentialsStatusBar]

*Image when no credentials are active*

![DefaultCredentialsStatusBar]

*Image when a profile named `default is active*

### Multi-Factor Authentication

If the credential provider has MFA, we will need to prompt the user for their OTP. This works by blocking the 
`resolveCredentials` call in [AwsCredentialProvider] until a input dialog message prompt is filled in.

[AwsCredentialsProvider]: https://github.com/aws/aws-sdk-java-v2/blob/master/core/auth/src/main/java/software/amazon/awssdk/auth/credentials/AwsCredentialsProvider.java
[CliConfigDocs]: https://docs.aws.amazon.com/cli/latest/topic/config-vars.html#credentials
[DefaultCredentialsStatusBar]: images/defaultCrdentialsStatusBar.png
[NoCredentialsStatusBar]: images/noCrdentialsStatusBar.png
[ClassDiagram]: images/classDiagram.svg
