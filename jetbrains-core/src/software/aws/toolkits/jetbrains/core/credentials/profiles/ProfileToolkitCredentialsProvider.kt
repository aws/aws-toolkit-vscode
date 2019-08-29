// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Ref
import com.intellij.util.text.nullize
import icons.AwsIcons
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.auth.credentials.ProcessCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.CorrectThreadCredentialsProvider
import software.aws.toolkits.jetbrains.core.credentials.profiles.ProfileToolkitCredentialsProviderFactory.Companion.TYPE
import software.aws.toolkits.resources.message
import java.util.function.Supplier

/**
 * @param profiles Holds references to the loaded profiles, should always be fetched from to handle loading of newer data
 * @param profileName The name of the profile this provider uses as its source
 * @param sdkHttpClient Shared HTTP Client used through the toolkit
 * @param regionProvider Region provider used to retrieve information about STS
 */
class ProfileToolkitCredentialsProvider(
    private val profiles: ProfileHolder,
    val profileName: String,
    private val sdkHttpClient: SdkHttpClient,
    private val regionProvider: ToolkitRegionProvider
) : ToolkitCredentialsProvider() {
    @Volatile
    private var internalCredentialsProvider: AwsCredentialsProvider? = createInternalCredentialProvider()

    override val id = "$TYPE:$profileName"
    override val displayName get() = message("credentials.profile.name", profileName)
    override fun resolveCredentials(): AwsCredentials = internalCredentialsProvider?.resolveCredentials()
        ?: throw IllegalStateException(message("credentials.profile.not_valid", displayName))

    fun refresh() {
        // Null out the old data, this way if we fail to create the new one (or we delete the underlying profile) we
        // don't have stale data
        internalCredentialsProvider = null
        internalCredentialsProvider = createInternalCredentialProvider()
    }

    // Due to the inability to get the MFA into the standard ProfileToolkitProvider in the SDK, we have to recreate
    // the logic
    private fun createInternalCredentialProvider(): AwsCredentialsProvider =
        when {
            propertyExists(ProfileProperty.ROLE_ARN) -> {
                validateChain()

                val sourceProfile = requiredProperty(ProfileProperty.SOURCE_PROFILE)
                val roleArn = requiredProperty(ProfileProperty.ROLE_ARN)

                val roleSessionName = profile().property(ProfileProperty.ROLE_SESSION_NAME)
                    .orElseGet { "aws-toolkit-jetbrains-${System.currentTimeMillis()}" }
                val externalId = profile().property(ProfileProperty.EXTERNAL_ID)
                    .orElse(null)
                val mfaSerial = profile().property(ProfileProperty.MFA_SERIAL)
                    .orElse(null)

                val stsRegion = profile().property(ProfileProperty.REGION)
                    .map { Region.of(it) }
                    .orElseGet {
                        try {
                            DefaultAwsRegionProviderChain().region
                        } catch (e: RuntimeException) {
                            LOG.warn { "Failed to determine STS region, falling back to US_EAST_1" }
                            Region.US_EAST_1
                        }
                    }

                // Override the default SPI for getting the active credentials since we are making an internal
                // to this provider client
                val stsClient = ToolkitClientManager.createNewClient(
                    StsClient::class,
                    sdkHttpClient,
                    stsRegion,
                    ProfileToolkitCredentialsProvider(
                        profiles,
                        sourceProfile,
                        sdkHttpClient,
                        regionProvider
                    ),
                    AwsClientManager.userAgent
                )

                CorrectThreadCredentialsProvider(
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
                )
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

            propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> {
                ProcessCredentialsProvider.builder()
                    .command(requiredProperty(ProfileProperty.CREDENTIAL_PROCESS))
                    .build()
            }

            else -> {
                throw IllegalArgumentException(message("credentials.profile.unsupported", profile().name()))
            }
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
                    .tokenCode(getMfaToken(profileName, mfaSerial))
            }
        }.build()

    private fun getMfaToken(name: String, mfaSerial: String): String {
        val result = Ref<String>()

        ApplicationManager.getApplication().invokeAndWait({
            val mfaCode: String = Messages.showInputDialog(
                message("credentials.profile.mfa.message", mfaSerial),
                message("credentials.profile.mfa.title", name),
                AwsIcons.Logos.IAM_LARGE
            ) ?: throw IllegalStateException("MFA challenge is required")

            result.set(mfaCode)
        }, ModalityState.any())

        return result.get()
    }

    private fun validateChain() {
        val profileChain = LinkedHashSet<String>()
        var currentProfile = profile()

        while (propertyExists(ProfileProperty.SOURCE_PROFILE, currentProfile)) {
            val currentProfileName = currentProfile.name()
            if (!profileChain.add(currentProfileName)) {
                val chain = profileChain.joinToString("->", postfix = "->$currentProfileName")
                throw IllegalArgumentException(message("credentials.profile.circular_profiles", chain))
            }

            val sourceProfile = requiredProperty(ProfileProperty.SOURCE_PROFILE, currentProfile)
            currentProfile = profiles.getProfileOrNull(sourceProfile)
                ?: throw IllegalArgumentException(
                    message(
                        "credentials.profile.source_profile_not_found",
                        currentProfileName,
                        sourceProfile
                    )
                )
        }
    }

    private fun propertyExists(propertyName: String, profile: Profile = profile()): Boolean =
        profile.property(propertyName).isPresent

    private fun requiredProperty(propertyName: String, profile: Profile = profile()): String =
        profile.property(propertyName)
            .filter {
                it.nullize() != null
            }
            .orElseThrow {
                IllegalArgumentException(
                    message(
                        "credentials.profile.missing_property",
                        profileName,
                        propertyName
                    )
                )
            }

    private fun profile() = profiles.getProfile(profileName)

    override fun toString(): String = "ProfileToolkitCredentialsProvider(profile=$profileName)"

    private companion object {
        val LOG = getLogger<ProfileToolkitCredentialsProvider>()
    }
}