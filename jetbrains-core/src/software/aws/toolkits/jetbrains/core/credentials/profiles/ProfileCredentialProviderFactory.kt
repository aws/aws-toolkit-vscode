// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsCredentialsProviderChain
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.auth.credentials.ContainerCredentialsProvider
import software.amazon.awssdk.auth.credentials.EnvironmentVariableCredentialsProvider
import software.amazon.awssdk.auth.credentials.InstanceProfileCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.auth.credentials.SystemPropertyCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialIdentifierBase
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialSourceId
import software.aws.toolkits.core.credentials.CredentialType
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.MfaRequiredInteractiveCredentials
import software.aws.toolkits.jetbrains.core.credentials.SsoRequiredInteractiveCredentials
import software.aws.toolkits.jetbrains.core.credentials.ToolkitCredentialProcessProvider
import software.aws.toolkits.jetbrains.core.credentials.diskCache
import software.aws.toolkits.jetbrains.core.credentials.profiles.Ec2MetadataConfigProvider.getEc2MedataEndpoint
import software.aws.toolkits.jetbrains.core.credentials.sso.SsoCache
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.settings.ProfilesNotification
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.createShowMoreInfoDialogAction
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

const val DEFAULT_PROFILE_NAME = "default"
const val DEFAULT_PROFILE_ID = "profile:default"

private const val PROFILE_FACTORY_ID = "ProfileCredentialProviderFactory"

open class ProfileCredentialsIdentifier internal constructor(val profileName: String, override val defaultRegionId: String?, credentialType: CredentialType?) :
    CredentialIdentifierBase(credentialType) {
    override val id = "profile:$profileName"
    override val displayName = message("credentials.profile.name", profileName)
    override val factoryId = PROFILE_FACTORY_ID
    override val shortName: String = profileName
}

private class ProfileCredentialsIdentifierMfa(profileName: String, defaultRegionId: String?, credentialType: CredentialType?) :
    ProfileCredentialsIdentifier(profileName, defaultRegionId, credentialType), MfaRequiredInteractiveCredentials

private class ProfileCredentialsIdentifierSso(
    profileName: String,
    defaultRegionId: String?,
    override val ssoCache: SsoCache,
    override val ssoUrl: String,
    credentialType: CredentialType?
) : ProfileCredentialsIdentifier(profileName, defaultRegionId, credentialType),
    SsoRequiredInteractiveCredentials

private class NeverShowAgain : DumbAwareAction(message("settings.never_show_again")) {
    override fun actionPerformed(e: AnActionEvent) {
        AwsSettings.getInstance().profilesNotification = ProfilesNotification.Never
    }
}

class ProfileCredentialProviderFactory(private val ssoCache: SsoCache = diskCache) : CredentialProviderFactory {
    private val profileHolder = ProfileHolder()

    override val id = PROFILE_FACTORY_ID
    override val credentialSourceId: CredentialSourceId = CredentialSourceId.SharedCredentials

    override fun setUp(credentialLoadCallback: CredentialsChangeListener) {
        // Load the initial data, then start the background watcher
        loadProfiles(credentialLoadCallback, true)

        ProfileWatcher.getInstance().addListener {
            loadProfiles(credentialLoadCallback, false)
        }
    }

    private fun loadProfiles(credentialLoadCallback: CredentialsChangeListener, initialLoad: Boolean) {
        val profilesAdded = mutableListOf<ProfileCredentialsIdentifier>()
        val profilesModified = mutableListOf<ProfileCredentialsIdentifier>()

        val previousProfilesSnapshot = profileHolder.snapshot()
        val existingProfiles = profileHolder.snapshot()

        val newProfiles = try {
            validateAndGetProfiles()
        } catch (e: Exception) {
            notifyUserOfLoadFailure(e)

            return
        }

        newProfiles.validProfiles.forEach {
            val previousProfile = existingProfiles.remove(it.key)
            if (previousProfile == null) {
                // It was not in the snapshot, so it must be new
                profilesAdded.add(it.value.asId(newProfiles.validProfiles))
            } else {
                // If the profile was modified, notify listeners, else do nothing
                if (previousProfile != it.value) {
                    profilesModified.add(it.value.asId(newProfiles.validProfiles))
                }
            }
        }

        // any profiles with a modified 'source_profile' need to be marked as well
        newProfiles.validProfiles.forEach { (_, profile) ->
            val profileId = profile.asId(newProfiles.validProfiles)
            if (profileId in profilesModified) {
                // already marked; skip
                return@forEach
            }
            for (source in profile.traverseCredentialChain(newProfiles.validProfiles)) {
                if (source != profile && source.asId(newProfiles.validProfiles) in profilesModified) {
                    profilesModified.add(profileId)
                    break
                }
            }
        }

        // Any remaining profiles must have either become invalid or removed from the cred/config files
        val profilesRemoved = existingProfiles.values.map { it.asId(previousProfilesSnapshot) }

        profileHolder.update(newProfiles.validProfiles)
        credentialLoadCallback(CredentialsChangeEvent(profilesAdded, profilesModified, profilesRemoved))

        notifyUserOfResult(newProfiles, initialLoad)
    }

    private fun notifyUserOfLoadFailure(e: Exception) {
        val loadingFailureMessage = message("credentials.profile.failed_load")

        val detail = e.message?.let {
            ": $it"
        } ?: ""

        LOG.warn(e) { loadingFailureMessage }

        if (AwsSettings.getInstance().profilesNotification != ProfilesNotification.Never) {
            notifyError(
                title = message("credentials.profile.refresh_ok_title"),
                content = "$loadingFailureMessage$detail",
                notificationActions = listOf(
                    createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials")),
                    createNotificationExpiringAction(NeverShowAgain())
                )
            )
        }
    }

    private fun notifyUserOfResult(newProfiles: Profiles, initialLoad: Boolean) {
        val refreshTitle = message("credentials.profile.refresh_ok_title")
        val totalProfiles = newProfiles.validProfiles.size + newProfiles.invalidProfiles.size
        val refreshBaseMessage = message("credentials.profile.refresh_ok_message", totalProfiles)

        // All provides were valid
        if (newProfiles.invalidProfiles.isEmpty()) {
            // Don't report we load creds on start to avoid spam
            if (!initialLoad && AwsSettings.getInstance().profilesNotification == ProfilesNotification.Always) {
                notifyInfo(
                    title = message("credentials.profile.refresh_ok_title"),
                    content = refreshBaseMessage,
                    notificationActions = listOf(
                        createNotificationExpiringAction(NeverShowAgain())
                    )
                )

                return
            }
        }

        // Some profiles failed to load
        if (newProfiles.invalidProfiles.isNotEmpty()) {
            val message = newProfiles.invalidProfiles.values.joinToString("\n")

            val errorDialogTitle = message("credentials.profile.failed_load")
            val numErrorMessage = message("credentials.profile.refresh_errors", newProfiles.invalidProfiles.size)

            if (AwsSettings.getInstance().profilesNotification != ProfilesNotification.Never) {
                notifyInfo(
                    title = refreshTitle,
                    content = "$refreshBaseMessage $numErrorMessage",
                    notificationActions = listOf(
                        createNotificationExpiringAction(ActionManager.getInstance().getAction("aws.settings.upsertCredentials")),
                        createNotificationExpiringAction(NeverShowAgain()),
                        createShowMoreInfoDialogAction(message("credentials.invalid.more_info"), errorDialogTitle, numErrorMessage, message)
                    )
                )
            }
        }
    }

    override fun createAwsCredentialProvider(providerId: CredentialIdentifier, region: AwsRegion): AwsCredentialsProvider {
        val profileProviderId = providerId as? ProfileCredentialsIdentifier
            ?: throw IllegalStateException("ProfileCredentialProviderFactory can only handle ProfileCredentialsIdentifier, but got ${providerId::class}")

        val profile = profileHolder.getProfile(profileProviderId.profileName)
            ?: throw IllegalStateException("Profile ${profileProviderId.profileName} looks to have been removed")

        return createAwsCredentialProvider(profile, region)
    }

    private fun createAwsCredentialProvider(profile: Profile, region: AwsRegion) = when {
        profile.propertyExists(ProfileProperty.SSO_START_URL) -> createSsoProvider(profile)
        profile.propertyExists(ProfileProperty.ROLE_ARN) -> createAssumeRoleProvider(profile, region)
        profile.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> createStaticSessionProvider(profile)
        profile.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> createBasicProvider(profile)
        profile.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> createCredentialProcessProvider(profile)
        else -> {
            throw IllegalArgumentException(message("credentials.profile.unsupported", profile.name()))
        }
    }

    private fun createSsoProvider(profile: Profile): AwsCredentialsProvider = ProfileSsoProvider(profile)

    private fun createAssumeRoleProvider(profile: Profile, region: AwsRegion): AwsCredentialsProvider {
        val sourceProfileName = profile.property(ProfileProperty.SOURCE_PROFILE)
        val credentialSource = profile.property(ProfileProperty.CREDENTIAL_SOURCE)

        val parentCredentialProvider = when {
            sourceProfileName.isPresent -> {
                val sourceProfile = profileHolder.getProfile(sourceProfileName.get())
                    ?: throw IllegalStateException("Profile $sourceProfileName looks to have been removed")
                createAwsCredentialProvider(sourceProfile, region)
            }
            credentialSource.isPresent -> {
                // Can we parse the credential_source
                credentialSourceCredentialProvider(CredentialSourceType.parse(credentialSource.get()), profile)
            }
            else -> {
                throw IllegalArgumentException(message("credentials.profile.assume_role.missing_source", profile.name()))
            }
        }

        return ProfileAssumeRoleProvider(parentCredentialProvider, region, profile)
    }

    private fun credentialSourceCredentialProvider(credentialSource: CredentialSourceType, profile: Profile): AwsCredentialsProvider =
        when (credentialSource) {
            CredentialSourceType.ECS_CONTAINER -> ContainerCredentialsProvider.builder().build()
            CredentialSourceType.EC2_INSTANCE_METADATA -> {
                // The IMDS credentials provider should source the endpoint config properties from the currently active profile
                InstanceProfileCredentialsProvider.builder()
                    .endpoint(profile.getEc2MedataEndpoint())
                    .build()
            }
            CredentialSourceType.ENVIRONMENT -> AwsCredentialsProviderChain.builder()
                .addCredentialsProvider(SystemPropertyCredentialsProvider.create())
                .addCredentialsProvider(EnvironmentVariableCredentialsProvider.create())
                .build()
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

    private fun createCredentialProcessProvider(profile: Profile) =
        ToolkitCredentialProcessProvider(profile.requiredProperty(ProfileProperty.CREDENTIAL_PROCESS))

    private fun Profile.asId(profiles: Map<String, Profile>): ProfileCredentialsIdentifier {
        val name = this.name()
        val defaultRegion = this.properties()[ProfileProperty.REGION]
        val requestedProfileType = this.toCredentialType()

        return when {
            this.requiresMfa(profiles) -> ProfileCredentialsIdentifierMfa(name, defaultRegion, requestedProfileType)
            this.requiresSso(profiles) -> ProfileCredentialsIdentifierSso(
                name,
                defaultRegion,
                ssoCache,
                this.traverseCredentialChain(profiles).map { it.property(ProfileProperty.SSO_START_URL) }.first { it.isPresent }.get(),
                requestedProfileType
            )
            else -> ProfileCredentialsIdentifier(name, defaultRegion, requestedProfileType)
        }
    }

    private fun Profile.requiresMfa(profiles: Map<String, Profile>) = this.traverseCredentialChain(profiles)
        .any { it.propertyExists(ProfileProperty.MFA_SERIAL) }

    private fun Profile.requiresSso(profiles: Map<String, Profile>) = this.traverseCredentialChain(profiles)
        .any { it.propertyExists(ProfileProperty.SSO_START_URL) }

    companion object {
        private val LOG = getLogger<ProfileCredentialProviderFactory>()
    }
}

private fun Profile.toCredentialType(): CredentialType? = when {
    this.propertyExists(ProfileProperty.SSO_START_URL) -> CredentialType.SsoProfile
    this.propertyExists(ProfileProperty.ROLE_ARN) -> {
        if (this.propertyExists(ProfileProperty.MFA_SERIAL)) {
            CredentialType.AssumeMfaRoleProfile
        } else {
            CredentialType.AssumeRoleProfile
        }
    }
    this.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> CredentialType.StaticSessionProfile
    this.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> CredentialType.StaticProfile
    this.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> CredentialType.CredentialProcessProfile
    else -> null
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
