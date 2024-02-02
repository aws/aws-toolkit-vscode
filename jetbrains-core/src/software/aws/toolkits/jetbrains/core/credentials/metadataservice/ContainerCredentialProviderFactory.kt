// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.metadataservice

import com.intellij.openapi.extensions.ExtensionNotApplicableException
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.ContainerCredentialsProvider
import software.amazon.awssdk.core.SdkSystemSetting
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialSourceId
import software.aws.toolkits.core.credentials.CredentialType
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.isCodeCatalystDevEnv

class ContainerCredentialProviderFactory : CredentialProviderFactory {
    init {
        if (isCodeCatalystDevEnv()) {
            throw ExtensionNotApplicableException.INSTANCE
        }
    }

    override val id = "ContainerCredentialProviderFactory"
    override val credentialSourceId: CredentialSourceId = CredentialSourceId.Ecs

    private val containerCredIdentifier by lazy {
        credentialId()
    }

    override fun setUp(credentialLoadCallback: CredentialsChangeListener) {
        // deviates from SDK behavior by treating the empty value as unset
        val credSettings = arrayOf(SdkSystemSetting.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI, SdkSystemSetting.AWS_CONTAINER_CREDENTIALS_FULL_URI)
        if (credSettings.none { it.stringValue.orElse("").isNotBlank() }) {
            getLogger<ContainerCredentialProviderFactory>().debug {
                "Skipping container credential provider since container credentials environment variables were not available"
            }

            return
        }

        credentialLoadCallback(
            CredentialsChangeEvent(
                added = listOf(containerCredIdentifier),
                modified = emptyList(),
                removed = emptyList()
            )
        )
    }

    override fun createAwsCredentialProvider(providerId: CredentialIdentifier, region: AwsRegion): AwsCredentialsProvider =
        ContainerCredentialsProvider.builder()
            .asyncCredentialUpdateEnabled(false)
            .build()

    companion object {
        const val FACTORY_ID = "ContainerCredentialProviderFactory"

        fun credentialId() = object : CredentialIdentifier {
            override val id: String = "containerRoleCredential"
            override val displayName = "ecs:containerRole"
            override val factoryId = FACTORY_ID
            override val credentialType = CredentialType.EcsMetadata
            override val defaultRegionId = System.getenv(SdkSystemSetting.AWS_REGION.environmentVariable())
        }
    }
}
