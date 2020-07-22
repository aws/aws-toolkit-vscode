# AWS SSO Support

## Abstract

This document describes the process of supporting Amazon SSO defined through a shared credentials profile.

## Specification

The [AWS SSO-OIDC service][SsoOidc] is SSO's implementation of the Device Authorization Grant flow as defined in [RFC8628][RFC8628].

## SSO Login Sequence
![][SsoLoginFlow]

## Cache
The SSO login flow contains two long lived tokens (`client registration id` and `access token`). These tokens MUST be cached in order to prevent the user from 
having to re-do the SSO login flow whenever their assumed role session credentials expire. We currently only offer one implementation of the cache.

### Disk Cache
The disk cache is is written to allow interop of the Toolkit with other tools (e.g. AWS CLI) meaning that if they perform an SSO login in the terminal before
starting the IDE, they do not need to perform it again and vice versa. The long lived tokens are cached in the `~/.aws/sso/cache/` folder with `0600` permissions.

## Profile keys
The AWS shared credential file added new standard keys to support SSO:

* `sso_start_url` - The URL that points to the organization's AWS SSO user portal.
* `sso_region` - The AWS Region that contains the AWS SSO portal host. This is separate from, and can be a different region than the default region parameter. 
* `sso_account_id` - The AWS account ID that contains the IAM role that you want to use with this profile. 
* `sso_role_name` - The name of the IAM role that defines the user's permissions when using this profile. 

[SsoOidc]: https://docs.aws.amazon.com/singlesignon/latest/OIDCAPIReference/Welcome.html
[RFC8628]: https://tools.ietf.org/html/rfc8628
[SsoLoginFlow]: images/ssoLoginFlow.svg
