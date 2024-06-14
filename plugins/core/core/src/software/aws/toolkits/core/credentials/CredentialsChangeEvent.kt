// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

/**
 * Event that indicates that credentials were manipulated in a way that the toolkit needs to be notified so state can be updated
 * to give an accurate representation of the state of the credentials system
 */
data class CredentialsChangeEvent(
    val added: List<CredentialIdentifier> = emptyList(),
    val modified: List<CredentialIdentifier> = emptyList(),
    val removed: List<CredentialIdentifier> = emptyList(),

    val ssoAdded: List<SsoSessionIdentifier> = emptyList(),
    val ssoModified: List<SsoSessionIdentifier> = emptyList(),
    val ssoRemoved: List<SsoSessionIdentifier> = emptyList()
)

typealias CredentialsChangeListener = (changeEvent: CredentialsChangeEvent) -> Unit
