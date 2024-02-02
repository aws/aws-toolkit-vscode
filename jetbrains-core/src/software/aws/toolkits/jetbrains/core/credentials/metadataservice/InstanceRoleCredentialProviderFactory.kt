// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.metadataservice

import com.intellij.openapi.extensions.ExtensionNotApplicableException
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.InstanceProfileCredentialsProvider
import software.amazon.awssdk.core.SdkSystemSetting
import software.amazon.awssdk.regions.internal.util.EC2MetadataUtils
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialSourceId
import software.aws.toolkits.core.credentials.CredentialType
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.utils.isCodeCatalystDevEnv

class InstanceRoleCredentialProviderFactory : CredentialProviderFactory {
    init {
        if (isCodeCatalystDevEnv()) {
            throw ExtensionNotApplicableException.INSTANCE
        }
    }

    override val id = FACTORY_ID
    override val credentialSourceId: CredentialSourceId = CredentialSourceId.Ec2

    private val instanceRoleCredIdentifier: CredentialIdentifier by lazy {
        object : CredentialIdentifier {
            override val id: String = "ec2InstanceRoleCredential"
            override val displayName = "ec2:instanceProfile"
            override val factoryId = FACTORY_ID
            override val credentialType = CredentialType.Ec2Metadata
            override val defaultRegionId = try {
                EC2MetadataUtils.getEC2InstanceRegion()
            } catch (e: Exception) {
                LOG.warn(e) { "Failed to query instance region from ec2 instance metadata" }
                null
            }
        }
    }

    private val provider = InstanceProfileCredentialsProvider.builder()
        .asyncCredentialUpdateEnabled(false)
        .build()

    override fun setUp(credentialLoadCallback: CredentialsChangeListener) {
        if (SdkSystemSetting.AWS_EC2_METADATA_DISABLED.booleanValue.orElse(false)) {
            LOG.debug { "EC2 metadata provider disabled by system setting" }
            return
        }

        val endpoint = SdkSystemSetting.AWS_EC2_METADATA_SERVICE_ENDPOINT.stringValue.orElse("")
        if (endpoint.isBlank()) {
            LOG.debug { "Skipping instance role credential provider since endpoint was blank" }
            return
        }

        try {
            provider.resolveCredentials()
        } catch (e: Exception) {
            provider.close()
            LOG.debug { "Instance role credential provider failed to resolve credentials" }
            return
        }

        credentialLoadCallback(
            CredentialsChangeEvent(
                added = listOf(instanceRoleCredIdentifier),
                modified = emptyList(),
                removed = emptyList()
            )
        )
    }

    override fun createAwsCredentialProvider(providerId: CredentialIdentifier, region: AwsRegion): AwsCredentialsProvider =
        provider

    companion object {
        const val FACTORY_ID = "InstanceRoleCredentialProviderFactory"
        private val LOG = getLogger<InstanceRoleCredentialProviderFactory>()
    }
}
