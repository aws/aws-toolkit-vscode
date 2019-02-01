// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.invokeAndWaitIfNeed
import com.intellij.openapi.ui.Messages
import icons.AwsIcons
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileToolkitCredentialsProviderFactory.Companion.TYPE
import software.aws.toolkits.resources.message
import java.util.function.Supplier

class ProfileToolkitCredentialsProvider(
    private val profiles: MutableMap<String, Profile>,
    val profile: Profile,
    private val sdkHttpClient: SdkHttpClient,
    private val regionProvider: ToolkitRegionProvider
) : ToolkitCredentialsProvider() {
    private var internalCredentialsProvider = createInternalCredentialProvider()

    override val id = "$TYPE:${profile.name()}"
    override val displayName get() = message("credentials.profile.name", profile.name())
    override fun resolveCredentials(): AwsCredentials = internalCredentialsProvider.resolveCredentials()

    private fun createInternalCredentialProvider(): AwsCredentialsProvider = when {
        propertyExists(ProfileProperty.ROLE_ARN) -> {
            validateChain()

            val sourceProfile = requiredProperty(ProfileProperty.SOURCE_PROFILE)
            val roleArn = requiredProperty(ProfileProperty.ROLE_ARN)
            val roleSessionName = profile.property(ProfileProperty.ROLE_SESSION_NAME)
                .orElseGet { "aws-toolkit-jetbrains-${System.currentTimeMillis()}" }
            val externalId = profile.property(ProfileProperty.EXTERNAL_ID).orElse(null)
            val mfaSerial = profile.property(ProfileProperty.MFA_SERIAL).orElse(null)

            val stsRegion = tryOrNull {
                DefaultAwsRegionProviderChain().region?.let {
                    regionProvider.regions()[it.id()]
                }
            }

            // Override the default SPI for getting the active credentials since we are making an internal
            // to this provider client
            val stsClient = StsClient.builder()
                .httpClient(sdkHttpClient)
                .credentialsProvider(
                    ProfileToolkitCredentialsProvider(
                        profiles,
                        profiles[sourceProfile]!!,
                        sdkHttpClient,
                        regionProvider
                    )
                )
                .region(stsRegion?.let { Region.of(it.id) } ?: Region.US_EAST_1)
                .build()

            StsAssumeRoleCredentialsProvider.builder()
                .stsClient(stsClient)
                .refreshRequest(Supplier {
                    createAssumeRoleRequest(
                        mfaSerial,
                        roleArn,
                        roleSessionName,
                        externalId
                    )
                })
                .build()
        }
        propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> {
            StaticCredentialsProvider.create(
                AwsSessionCredentials.create(
                    requiredProperty(ProfileProperty.AWS_ACCESS_KEY_ID),
                    requiredProperty(ProfileProperty.AWS_SECRET_ACCESS_KEY),
                    requiredProperty(ProfileProperty.AWS_SESSION_TOKEN)
                )
            )
        }
        propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> {
            StaticCredentialsProvider.create(
                AwsBasicCredentials.create(
                    requiredProperty(ProfileProperty.AWS_ACCESS_KEY_ID),
                    requiredProperty(ProfileProperty.AWS_SECRET_ACCESS_KEY)
                )
            )
        }
        else -> throw IllegalArgumentException("Profile `$profile` is unsupported")
    }

    private fun createAssumeRoleRequest(
        mfaSerial: String?,
        roleArn: String,
        roleSessionName: String?,
        externalId: String?
    ): AssumeRoleRequest = AssumeRoleRequest.builder()
        .roleArn(roleArn)
        .roleSessionName(roleSessionName)
        .externalId(externalId).also { request ->
            mfaSerial?.let { _ ->
                request.serialNumber(mfaSerial)
                    .tokenCode(getMfaToken(profile.name(), mfaSerial))
            }
        }.build()

    private fun getMfaToken(name: String, mfaSerial: String): String = invokeAndWaitIfNeed(ModalityState.any()) {
        Messages.showInputDialog(
            message("credentials.profile.mfa.message", mfaSerial),
            message("credentials.profile.mfa.title", name),
            AwsIcons.Logos.IAM_LARGE
        ) ?: throw IllegalStateException("MFA challenge is required")
    }

    private fun validateChain() {
        val profileChain = LinkedHashSet<String>()
        var currentProfile = profile

        while (currentProfile.property(ProfileProperty.SOURCE_PROFILE).isPresent) {
            val currentProfileName = currentProfile.name()
            if (!profileChain.add(currentProfileName)) {
                val chain = profileChain.joinToString("->", postfix = "->$currentProfileName")
                throw IllegalArgumentException("A circular profile dependency was found between $chain")
            }

            val sourceProfile = currentProfile.property(ProfileProperty.SOURCE_PROFILE).get()
            currentProfile = profiles[sourceProfile]
                    ?: throw IllegalArgumentException("Profile `$currentProfileName` references source profile `$sourceProfile` which does not exist")
        }
    }

    private fun propertyExists(property: String): Boolean = profile.property(property).isPresent

    private fun requiredProperty(property: String): String = profile.property(property)
        .orElseThrow {
            IllegalArgumentException(
                message(
                    "credentials.profile.missing_property",
                    profile.name(),
                    property
                )
            )
        }

    override fun toString(): String = "ProfileToolkitCredentialsProvider(profile=$profile)"
}