// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider

abstract class ToolkitCredentialsIdentifier {
    /**
     * The ID must be unique across all [ToolkitCredentialsIdentifier].
     * It is recommended to concatenate the factory ID into this field to help enforce this requirement.
     */
    abstract val id: String

    /**
     * A user friendly display name shown in the UI.
     */
    abstract val displayName: String

    /**
     * The ID of the corresponding [CredentialProviderFactory] so that the credential manager knows which factory to invoke in order
     * to resolve this into a [ToolkitCredentialsProvider]
     */
    abstract val factoryId: String

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (javaClass != other?.javaClass) return false

        other as ToolkitCredentialsIdentifier

        if (id != other.id) return false

        return true
    }

    override fun hashCode(): Int = id.hashCode()

    override fun toString(): String = "${this::class.simpleName}(id='$id')"
}

class ToolkitCredentialsProvider(private val identifier: ToolkitCredentialsIdentifier, delegate: AwsCredentialsProvider) : AwsCredentialsProvider by delegate {
    val id: String = identifier.id
    val displayName = identifier.displayName

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
