# Credentials Management

This outlines how the Toolkit produces and obtains credentials.

## Terminology

### Credentials

Credentials allow the Toolkit to interact with AWS on a user's behalf. Service clients require a [Credentials](https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Credentials.html) object, and the Toolkit obtains these objects through Credentials Providers.

### Credentials Provider

Credentials Providers are how the toolkit abstracts away different ways of obtaining a user's credentials, and produces Credentials objects. For example, a Shared Credentials Provider knows how to obtain credentials for a specific profile within [Shared Credentials Files](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/loading-node-credentials-shared.html).

A Credentials Provider is produced by a Credentials Provider Factory

### Credentials Provider Factory

A factory is capable of producing one or more Credentials Providers for a single credentials type. For example, a Shared Credentials related factory produces Credentials Providers for each profile found within shared credentials files.

### Credentials Provider Id

All Credentials Providers are uniquely identified by a Credentials Provider Id. These take the format "(credentials type):(credentials type id)". For example, Shared Credentials Providers have the type `profile`, and the id represents the profile name. So if shared credentials contained a profile named "foo", its corresponding Credentials Provider Id would be `profile:foo`.

Credentials Provider Id may be surfaced to users, however it is an internal identification construct.

## How it Works

When the user connects to AWS in the Toolkit, a Credentials Provider is requested, which is then used to obtain credentials. The toolkit requests a Credentials Provider by checking which credentials provider factories support the provider's credentials type. The factories of interest are queried to see which (if any) have the requested Credentials Provider.

At the time of writing this document, there is only support for Shared Credentials. If additional credentials support was implemented (and this document was not updated), it would be found in [/src/credentials/providers](/src/credentials/providers).

### Shared Credentials Profiles

Profiles are retrieved from the user's shared credentials files. The profile is handled and validated differently based on which fields are present. Handling and validation logic can be found in [sharedCredentialsProvider.ts](/src/credentials/providers/sharedCredentialsProvider.ts).

Profiles that are not considered valid are not provided to the toolkit. When connecting in the toolkit, the user is not able to select these Credentials to work with. Validation issues detected are written to the logs to help users understand why a profile is not available in the toolkit.

Examples of validation include:

-   missing fields that are expected to be paired with other fields
-   profiles referencing other profiles that do not exist
-   profiles referencing other profiles, resulting in a cycle

Supported keys:

-   aws_access_key_id
-   aws_secret_access_key
-   aws_session_token
-   role_arn
-   source_profile
-   credential_process
-   region

Credentials Providers for Shared Credentials are only ever refreshed when the user brings up the credential selection list. If a profile is considered to have changed since it was last used in the current toolkit session, Credentials are produced from the updated profile.

## Architecture

![Class Diagram](class-diagram.svg)

When the Toolkit is initialized, it sets up an `CredentialsProviderManager` instance to manage Credentials Providers for the Toolkit session. `CredentialsProviderFactory` objects (like `SharedCredentialsProviderFactory`) are added to it during setup.

When the toolkit wants to list available Credentials Providers, `CredentialsProviderManager` is queried using `getAllCredentialsProviders`. This in turn calls `listProviders` on every `CredentialsProviderFactory`. Implementations for `listProviders` determine what `CredentialsProvider` objects are available/valid and return them.

When the toolkit wants a specific Credentials Provider, `getCredentialsProvider` is called on `CredentialsProviderManager`. This in turn queries `getProvider` on its `CredentialsProviderFactory` objects until a provider is returned.
