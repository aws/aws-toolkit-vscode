// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Ref
import icons.AwsIcons
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.auth.credentials.ProcessCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.CorrectThreadCredentialsProvider
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.createShowMoreInfoDialogAction
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.util.function.Supplier

const val DEFAULT_PROFILE_ID = "profile:default"

private const val PROFILE_FACTORY_ID = "ProfileCredentialProviderFactory"

private class ProfileCredentialsIdentifier(internal val profileName: String) : ToolkitCredentialsIdentifier() {
    override val id = "profile:$profileName"
    override val displayName = message("credentials.profile.name", profileName)
    override val factoryId = PROFILE_FACTORY_ID
}

class ProfileCredentialProviderFactory : CredentialProviderFactory, Disposable {
    private val profileWatcher = ProfileWatcher(this)
    private val profileHolder = ProfileHolder()

    override val id = PROFILE_FACTORY_ID

    override fun setUp(credentialLoadCallback: CredentialsChangeListener) {
        // Load the initial data, then start the background watcher
        loadProfiles(credentialLoadCallback, true)

        profileWatcher.start(onFileChange = {
            loadProfiles(credentialLoadCallback, false)
        })
    }

    private fun loadProfiles(credentialLoadCallback: CredentialsChangeListener, initialLoad: Boolean) {
        val profilesAdded = mutableListOf<ProfileCredentialsIdentifier>()
        val profilesModified = mutableListOf<ProfileCredentialsIdentifier>()
        val profilesRemoved = mutableListOf<ProfileCredentialsIdentifier>()

        val previousProfilesSnapshot = profileHolder.snapshot()
        val newProfiles = try {
            validateAndGetProfiles()
        } catch (e: Exception) {
            notifyUserOfLoadFailure(e)

            return
        }

        newProfiles.validProfiles.forEach {
            val previousProfile = previousProfilesSnapshot.remove(it.key)
            if (previousProfile == null) {
                // It was not in the snapshot, so it must be new
                profilesAdded.add(ProfileCredentialsIdentifier(it.key))
            } else {
                // If the profile was modified, notify people, else do nothing
                if (previousProfile != it.value) {
                    profilesModified.add(ProfileCredentialsIdentifier(it.key))
                }
            }
        }

        // Any remaining profiles must have either become invalid or removed from the cred/config files
        previousProfilesSnapshot.keys.asSequence().map { ProfileCredentialsIdentifier(it) }.toCollection(profilesRemoved)

        profileHolder.update(newProfiles.validProfiles)
        credentialLoadCallback(CredentialsChangeEvent(profilesAdded, profilesModified, profilesRemoved))

        notifyUserOfResult(newProfiles, initialLoad)
    }

    private fun notifyUserOfLoadFailure(e: Exception) {
        val loadingFailureMessage = message("credentials.profile.failed_load")

        val detail = e.message?.let {
            ": $it"
        } ?: ""

        notifyError(
            title = message("credentials.profile.refresh_ok_title"),
            content = "$loadingFailureMessage$detail",
            action = createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))
        )
    }

    private fun notifyUserOfResult(newProfiles: Profiles, initialLoad: Boolean) {
        val refreshTitle = message("credentials.profile.refresh_ok_title")
        val totalProfiles = newProfiles.validProfiles.size + newProfiles.invalidProfiles.size
        val refreshBaseMessage = message("credentials.profile.refresh_ok_message", totalProfiles)

        // All provides were valid
        if (newProfiles.invalidProfiles.isEmpty()) {
            // Don't report we load creds on start to avoid spam
            if (!initialLoad) {
                notifyInfo(
                    title = message("credentials.profile.refresh_ok_title"),
                    content = refreshBaseMessage
                )

                return
            }
        }

        // Some profiles failed to load
        if (newProfiles.invalidProfiles.isNotEmpty()) {
            val message = newProfiles.invalidProfiles.values.joinToString("\n") { it.message ?: it::class.java.name }

            val errorDialogTitle = message("credentials.invalid.title")
            val numErrorMessage = message("credentials.profile.refresh_errors", newProfiles.invalidProfiles.size)

            notifyInfo(
                title = refreshTitle,
                content = "$refreshBaseMessage $numErrorMessage",
                notificationActions = listOf(
                    createShowMoreInfoDialogAction(message("credentials.invalid.more_info"), errorDialogTitle, numErrorMessage, message),
                    createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials"))
                )
            )
        }
    }

    override fun dispose() {}

    override fun createAwsCredentialProvider(
        providerId: ToolkitCredentialsIdentifier,
        region: AwsRegion,
        sdkClient: SdkHttpClient
    ): AwsCredentialsProvider {
        val profileProviderId = providerId as? ProfileCredentialsIdentifier
            ?: throw IllegalStateException("ProfileCredentialProviderFactory can only handle ProfileCredentialsIdentifier, but got ${providerId::class}")

        val profile = profileHolder.getProfile(profileProviderId.profileName)
            ?: throw IllegalStateException("Profile ${profileProviderId.profileName} looks to have been removed")

        return createAwsCredentialProvider(profile, region, sdkClient)
    }

    private fun createAwsCredentialProvider(
        profile: Profile,
        region: AwsRegion,
        sdkClient: SdkHttpClient
    ) = when {
        profile.propertyExists(ProfileProperty.ROLE_ARN) -> createAssumeRoleProvider(profile, region, sdkClient)
        profile.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> createStaticSessionProvider(profile)
        profile.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> createBasicProvider(profile)
        profile.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> createCredentialProcessProvider(profile)
        else -> {
            throw IllegalArgumentException(message("credentials.profile.unsupported", profile.name()))
        }
    }

    private fun createAssumeRoleProvider(
        profile: Profile,
        region: AwsRegion,
        sdkClient: SdkHttpClient
    ): AwsCredentialsProvider {
        val sourceProfileName = profile.requiredProperty(ProfileProperty.SOURCE_PROFILE)
        val sourceProfile = profileHolder.getProfile(sourceProfileName)
            ?: throw IllegalStateException("Profile $sourceProfileName looks to have been removed")

        // Override the default SPI for getting the active credentials since we are making an internal
        // to this provider client
        val stsClient = ToolkitClientManager.createNewClient(
            StsClient::class,
            sdkClient,
            Region.of(region.id),
            createAwsCredentialProvider(sourceProfile, region, sdkClient),
            AwsClientManager.userAgent
        )

        val roleArn = profile.requiredProperty(ProfileProperty.ROLE_ARN)
        val roleSessionName = profile.property(ProfileProperty.ROLE_SESSION_NAME)
            .orElseGet { "aws-toolkit-jetbrains-${System.currentTimeMillis()}" }
        val externalId = profile.property(ProfileProperty.EXTERNAL_ID)
            .orElse(null)
        val mfaSerial = profile.property(ProfileProperty.MFA_SERIAL)
            .orElse(null)

        return CorrectThreadCredentialsProvider(
            StsAssumeRoleCredentialsProvider.builder()
                .stsClient(stsClient)
                .refreshRequest(Supplier {
                    createAssumeRoleRequest(
                        profile.name(),
                        mfaSerial,
                        roleArn,
                        roleSessionName,
                        externalId
                    )
                })
                .build()
        )
    }

    private fun createAssumeRoleRequest(
        profileName: String,
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
                    .tokenCode(promptMfaToken(profileName, mfaSerial))
            }
        }.build()

    private fun promptMfaToken(name: String, mfaSerial: String): String {
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

    private fun createBasicProvider(profile: Profile) = StaticCredentialsProvider.create(
        AwsBasicCredentials.create(
            profile.requiredProperty(ProfileProperty.AWS_ACCESS_KEY_ID),
            profile.requiredProperty(ProfileProperty.AWS_SECRET_ACCESS_KEY)
        )
    )

    private fun createStaticSessionProvider(profile: Profile) = StaticCredentialsProvider.create(
        AwsSessionCredentials.create(
            profile.requiredProperty(ProfileProperty.AWS_ACCESS_KEY_ID),
            profile.requiredProperty(ProfileProperty.AWS_SECRET_ACCESS_KEY),
            profile.requiredProperty(ProfileProperty.AWS_SESSION_TOKEN)
        )
    )

    private fun createCredentialProcessProvider(profile: Profile) = ProcessCredentialsProvider.builder()
        .command(profile.requiredProperty(ProfileProperty.CREDENTIAL_PROCESS))
        .build()
}

private class ProfileHolder {
    private val profiles = mutableMapOf<String, Profile>()

    fun snapshot() = profiles.toMutableMap()

    fun update(validProfiles: Map<String, Profile>) {
        profiles.clear()
        profiles.putAll(validProfiles)
    }

    fun getProfile(profileName: String): Profile? = profiles[profileName]
}
