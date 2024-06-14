// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.aws.toolkits.resources.message

enum class CredentialType {
    StaticProfile,
    StaticSessionProfile,
    CredentialProcessProfile,
    AssumeRoleProfile,
    AssumeMfaRoleProfile,
    SsoProfile,
    Ec2Metadata,
    EcsMetadata
}

enum class CredentialSourceId {
    SharedCredentials,
    SdkStore,
    Ecs,
    Ec2,
    EnvVars
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

interface SsoSessionBackedCredentialIdentifier {
    val sessionIdentifier: String
}

interface SsoSessionIdentifier {
    val id: String
    val startUrl: String
    val ssoRegion: String
    val scopes: Set<String>
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

interface ToolkitAuthenticationProvider {
    val id: String
    val displayName: String
}

class ToolkitCredentialsProvider(
    val identifier: CredentialIdentifier,
    val delegate: AwsCredentialsProvider
) : ToolkitAuthenticationProvider, AwsCredentialsProvider by delegate {
    override val id: String = identifier.id
    override val displayName = identifier.displayName
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

// TODO: try to get rid of this because it's really annoying casting the delegate everywhere
interface ToolkitBearerTokenProviderDelegate : SdkTokenProvider, ToolkitAuthenticationProvider

class ToolkitBearerTokenProvider(val delegate: ToolkitBearerTokenProviderDelegate) : SdkTokenProvider by delegate, ToolkitAuthenticationProvider by delegate {
    companion object {
        // TODO: is there a better place for this
        fun ssoIdentifier(startUrl: String, region: String = DEFAULT_SSO_REGION) = "sso;$region;$startUrl"

        // TODO: For AWS Builder ID, we only have startUrl for now instead of each users' metadata data i.e. Email address
        fun ssoDisplayName(startUrl: String) = if (startUrl == SONO_URL) {
            message("aws_builder_id.service_name")
        } else {
            message("iam_identity_center.service_name", ssoIdentifierFromUrl(startUrl))
        }

        fun diskSessionIdentifier(profileName: String) = "sso-session:$profileName"
        fun diskSessionDisplayName(profileName: String) = "IAM Identity Center Session ($profileName)"
    }
}

private const val SONO_URL = "https://view.awsapps.com/start"

const val DEFAULT_SSO_REGION = "us-east-1"
