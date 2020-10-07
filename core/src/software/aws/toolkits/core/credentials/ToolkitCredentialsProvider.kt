// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider

enum class CredentialType {
    StaticProfile,
    StaticSessionProfile,
    CredentialProcessProfile,
    AssumeRoleProfile,
    AssumeMfaRoleProfile,
    SsoProfile
}

/**
 * Represents a possible credential provider that can be used within the toolkit.
 *
 * Implementers should extend [CredentialIdentifierBase] instead of directly implementing this interface.
 */
interface CredentialIdentifier {
    /**
     * The ID must be unique across all [CredentialIdentifier] instances.
     * It is recommended to concatenate the factory ID into this field to help enforce this requirement.
     */
    val id: String

    /**
     * A user friendly display name shown in the UI.
     */
    val displayName: String

    /**
     * An optional shortened version of the name to display in the UI where space is at a premium
     */
    val shortName: String get() = displayName

    /**
     * The ID of the corresponding [CredentialProviderFactory] so that the credential manager knows which factory to invoke in order
     * to resolve this into a [ToolkitCredentialsProvider]
     */
    val factoryId: String

    /**
     * The type of credential
     */
    val credentialType: CredentialType?

    /**
     * Some ID types (e.g. Profile) have a concept of a default region, this is optional.
     */
    val defaultRegionId: String? get() = null
}

abstract class CredentialIdentifierBase(override val credentialType: CredentialType?) : CredentialIdentifier {
    final override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as CredentialIdentifierBase

        if (id != other.id) return false

        return true
    }

    final override fun hashCode(): Int = id.hashCode()

    final override fun toString(): String = "${this::class.simpleName}(id='$id')"
}

class ToolkitCredentialsProvider(private val identifier: CredentialIdentifier, delegate: AwsCredentialsProvider) : AwsCredentialsProvider by delegate {
    val id: String = identifier.id
    val displayName = identifier.displayName
    val shortName = identifier.shortName

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as ToolkitCredentialsProvider

        if (identifier != other.identifier) return false

        return true
    }

    override fun hashCode(): Int = identifier.hashCode()

    override fun toString(): String = "${this::class.simpleName}(identifier='$identifier')"
}
