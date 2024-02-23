// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

/**
 * TODO: Deprecate and remove this since it is less efficient than [CredentialsChangeEvent]
 */
interface ToolkitCredentialsChangeListener {
    fun providerAdded(identifier: CredentialIdentifier) {}
    fun providerModified(identifier: CredentialIdentifier) {}
    fun providerRemoved(identifier: CredentialIdentifier) {}
    fun providerRemoved(providerId: String) {}

    fun ssoSessionAdded(identifier: SsoSessionIdentifier) {}
    fun ssoSessionModified(identifier: SsoSessionIdentifier) {}
    fun ssoSessionRemoved(identifier: SsoSessionIdentifier) {}
}

class CredentialProviderNotFoundException : RuntimeException {
    constructor(msg: String) : super(msg)
    constructor(msg: String, exception: Exception) : super(msg, exception)
}
