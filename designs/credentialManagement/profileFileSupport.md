# Profile File Support

## Abstract

This document describes the process of supporting the AWS Profile files in the [Credential Management](credentialManagement.md) system

## Shared Credentials File(s)

AWS SDKs and tools are capable of sharing credentials by storing them in a common location. Also known as shared credential files, the **config** and 
**credentials** files are detailed at [CLI documentation][CliConfigDocs]. We try to comply as close as possible with the CLI credential resolution behavior, 
but only the keys related to credential management are supported in the toolkit. 

Supported keys:
* `aws_access_key_id`
* `aws_secret_access_key`
* `aws_session_token`
* `source_profile`
* `external_id`
* `role_session_name`
* `mfa_serial`
* `credential_process`
* `sso_*` - See [SSO Document](ssoSupport.md)

### File Parsing
Parsing and merging of the **config** and **credentials** files is out of scope of this document and is handled by the Java SDK. Please see [ProfileFile](https://github.com/aws/aws-sdk-java-v2/blob/master/core/profiles/src/main/java/software/amazon/awssdk/profiles/ProfileFile.java).

If there are any issues parsing either of the files, the entire parsing job MUST be treated as a failure and the error shown to the user and no state changes 
are made to the `CredentialManager`.

### File Locating Resolution
Locating of the profile files is handled by the Java SDK. Please see [ProfileFileLocation](https://github.com/aws/aws-sdk-java-v2/blob/master/core/profiles/src/main/java/software/amazon/awssdk/profiles/ProfileFileLocation.java).

If file location logic returns an invalid path, the files must be treated as not existing.

### Profile File Modification Detection

An Application Service (`ProfileWatcher`) is registered by the toolkit. The service instructs the IDE to notify it when the parent directory of the `config` 
and/or `credentials` files are modified. The Toolkit monitors the parent of the folder in case the files do not exist yet.

When the `ProfileCredentialProviderFactory` is created, it registers itself as a listener on the `ProfileWatcher`.

Profiles are considered modified if, and only if, its contents (properties keys/values) modified or dependent profiles are modified. The changing of a profile
name MUST be considered an addition of a new profile, and deletion of the old profile. Changes to the properties in the profile or a profile in its 
`source_profile` chain MUST be treated as an edit of the profile if the names of the profiles are unchanged.

### Multi-Factor Authentication

We support assuming a role with MFA. If the requested credential profile has the `mfa_serial` property , we will need to prompt the user for their OTP. 
This works by blocking the `resolveCredentials` call in `AwsCredentialProvider` and shows an input dialog message prompt is filled in on the UI thread.

**This has the downside of deadlocking if the UI (EDT) thread is blocking waiting on a call to AWS which always happens on a background thread.** This means
that any UI elements that are populated by an AWS call must be done so in an asynchronous manner.

[CliConfigDocs]: https://docs.aws.amazon.com/cli/latest/topic/config-vars.html#credentials
