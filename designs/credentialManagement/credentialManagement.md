# Credential Management

## Abstract

This document describes the process of managing and switching of AWS credentials within the toolkit.

## Motivation

AWS provides many different ways to retrieve the credentials required to make calls to AWS including but not limited to:
credential/config files, environment variables, system properties, and HTTP metadata APIs. A user may also assume roles using 
a source set of credentials and may have MFA enabled. 

Due to the large matrix of possible credential sources, the toolkit strives to provide an intuitive abstraction layer on top of some of these sources so that 
the implementation details are hidden fom the user. The system should also enable future expansion of new sources, including the possibility of sources provided 
by third party plugins.

## Classes and Concepts
![ClassDiagram]

1. `AwsRegion` - Date class that represents an AWS Region and joins together related data for that region. This data is sourced from the endpoints.json file.
It contains the following data:
    1. `ID` - Contains the ID of the region  (e.g. `us-west-2`)
    1. `Name` - Contains the human readable name for the region (e.g. `US West (Oregon)`)
    1. `Partiton ID` - Contains the ID of the top level AWS partition (e.g. `aws`, `aws-cn`)

1. `CredentialIdentifier` - Represents the globally unique identifier for a possible credential profile in the toolkit. This identifier must be deterministic 
meaning that if two `CredentialIdentifier`s for the same credential source should be equal even across different IDE sessions. 
This is shown to the user as the **Profile** in the UI.

1. `AwsCredentialsProvider` - SDK interface that resolves AWS Credentials from the provider. For more info, see [AwsCredentialsProvider] in the SDK.

1. `ToolkitCredentialsProvider` - A class that implements `AwsCredentialsProvider`. This class does not
do any actual resolving of credentials, but instead leaves it to another concrete implementation by delegating to another implementation of 
`AwsCredentialsProvider`. This class works as a bridge between a `CredentialIdentifier` and a `AwsCredentialsProvider`.

1. `CredentialProviderFactory` - Abstract class that knows and understands one "category" of credentials (e.g. Shared Credentials files) and has two jobs.
 
    1. Detect valid `CredentialIdentifier`s that should be presented to the user as a possible choice to use in the IDE. A `CredentialIdentifier` is determined 
    to be valid if and only if the credential source has all the required information to comply with the underlying credential source's contract. For example, 
    a factory that handles static credentials would need to make sure that both access and secret keys are provided. 

        **It MUST not verify if the credentials themselves are valid (able to make an AWS call) at creation time of the `CredentialIdentifier`.**

    1. Convert the `CredentialIdentifier` it created earlier iinto a valid `AwsCredentialProvider`. This is implementation specific and may re-use existing 
    `AwsCredentialProvider` implementations.

1. `CredentialManager` - Acts as the entry point to the credential system for the rest of the toolkit. Its 
job is to keep track of all `CredentialIdentifier` that should be presented to the user as a possible profile they can use. 

### Extension System

In order to make the credential management subsystem extendable, we leverage the IntelliJ [Extension Point] system. Whenever `CredentialManager` needs to 
communicate with a `CredentialProviderFactory`, it queries the Extension Point `aws.toolkit.credentialProviderFactory` for implementations and proceeds to 
search the list for the factory with the requested ID.

Example of usage:
```xml
<extensions defaultExtensionNs="aws.toolkit">
    <credentialProviderFactory implementation="software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileCredentialProviderFactory"/>
</extensions>
```

### Deep Credential Validation

In order to validate the credentials returned by the `ToolkitCredentialsProvider` are able to make AWS calls, we make a call to `sts::getCallerIdentity`. 
If the call fails, we consider the credentials to be invalid.

## Connection Settings Management

The class [AwsConnectionManager] is the entry point into this system.

The concept of _Active Connection Settings_ represents the current user selected credentials and region that the toolkit uses to perform actions in the AWS Explorer as well as 
being used as defaults when more than one option is possible. 

Due to the nature of the IntellJ projects (project level) each has their own windows while existing in one JVM (application level). Since we store active 
connection settings at the project level,  each window can have a different active `CredenitalIdentifier` and/or `AwsRegion` selected.

### Connection State

A state machine around the connection validation steps the toolkit goes through. Attempts to encapsulate both state, data available at each state and exposes an
`isTerminal` property that indicates if this state is temporary in the 'connection validation' workflow or if this is a terminal state.

States:
* `InitializingToolkit` - Initial state of of the `AwsConnectionManager` when a project is opened. In this state we are reading the previous settings for the
project for setting defaults if none are found. At this point the `CredentialManager` should be started, if it is not already.

    Note: Due to `AwsConnectionManager` being at the project level, another project may have started the `CredentialManager` since it is scoped at the 
    application level.
* `ValidatingConnection` - Represents that we are performing a [deep credential check](#deep-credential-validation) on the requested _Active Connection Settings_
* `ValidConnection` - Represents that the deep check passed and the user is told the credentials can be used
* `IncompleteConfiguration` - Represents the either a region or `CredentialIdentifier` is not selected so we lack the required data to talk to AWS.
* `InvalidConnection` - Represents that the deep check failed and the user should be told the why and possible remediate actions.
* `RequiresUserAction` - Represents that we have just left `InitializingToolkit` but the _Active Connection Settings_ will require user action in order for the 
deeper credential check to proceed such as an MFA prompt. This state is present in order to improve the UX by not forcing the user to perform an action on 
project opening.

### Picking Defaults
In order to provide a good "out of the box" experience, the toolkit will attempt to use sane defaults when a project is opened with out any previous settings.

#### Credential Profile
The Toolkit will attempt to load the `default` profile located in the Shared Credentials files.

An example `~/.aws/config`:
```ini
[default]
credential_process = /usr/bin/myCredentialProcess
```

#### Region
The Toolkit attempts to determine a default region based on a heuristic, the region ID must exist in the `endpoints.json` metadata to be considered valid. 
If a region ID resolved by one step in the heuristic does not exist in the metadata, the Toolkit will continue down the list until a valid region is found.

1. **Last selected (by Project)** - if the _Project_ has previously been opened with the Toolkit - the last region selected when the toolkit closed will be 
preserved.
1. **Environment variable / system property** - uses the AWS Java SDK [SystemSettingsRegionProvider] Region Provider to determine region based on the 
`AWS_REGION` environment variable or `aws.region` system property.
1. **Default Profile** - uses the AWS Java SDK [AwsProfileRegionProvider] Region Provider to interrogate the `default` profile from the Shared Credentials 
files, using `region` if found in the profile. 
    An example `~/.aws/config`:
    ```ini
    [default]
    region = us-west-2
    ```

1. **us-east-1** - looks for `us-east-1` in resolved metadata.
1. **First region in metadata** - if all else fails look for the first region that exists in the `endpoints.json` file.

If all of the above fails, the toolkit will throw an exception due to the region data has not been populated and must be considered a fatal error. This 
indicates that the toolkit either was built incorrectly, or has a severe bug in it since the toolkit can not operate without the region data.

### Combined State Flow
![StateFlow]

### Retrieving AWS Credentials
When another section of the toolkit needs to retrieve AWS credentials, it must request an `AwsCredentialProvider` using 
`CredentialManager.getAwsCredentialProvider(CredentialIdentifier, AwsRegion)`. The `CredentialIdentifier` represents the credential profile we are trying to
resolve, and the region parameter is required so that we can determine the correct STS endpoint to call.

`CredentialManager` returns a `ToolkitCredentialsProvider` which is an immutable class which exposes its underlying `CredentialIdentifier` while implementing the 
`AwsCredentialsProvider` interface so that it can be given transparently to the SDKs. The `AwsCredentialsProvider.resolveCredentials` method call is proxied
over to a `AwsCredentialProviderProxy`.

`AwsCredentialProviderProxy` acts as a "pointer" to the real `AwsCredentialProvider` created by the `CredentialProviderFactory` while also keeping track of the 
region that was used to create it. This allows us to keep references to the `ToolkitCredentialsProvider` to keep resolving credentials even when the underlying 
source has been updated, such as when the shared credentials files has been modified by an external process.

[AwsCredentialsProvider]: https://github.com/aws/aws-sdk-java-v2/blob/master/core/auth/src/main/java/software/amazon/awssdk/auth/credentials/AwsCredentialsProvider.java
[ClassDiagram]: images/classDiagram.svg
[Extension Point]: https://www.jetbrains.org/intellij/sdk/docs/basics/plugin_structure/plugin_extension_points.html
[AwsConnectionManager]: ../../jetbrains-core/src/software/aws/toolkits/jetbrains/core/credentials/AwsConnectionManager.kt
[StateFlow]: images/credManageStateFlow.svg
[SystemSettingsRegionProvider]: https://github.com/aws/aws-sdk-java-v2/blob/master/core/regions/src/main/java/software/amazon/awssdk/regions/providers/SystemSettingsRegionProvider.java
[AwsProfileRegionProvider]: https://github.com/aws/aws-sdk-java-v2/blob/master/core/regions/src/main/java/software/amazon/awssdk/regions/providers/AwsProfileRegionProvider.java
