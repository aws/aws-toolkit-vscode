// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.util.messages.Topic
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
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialIdentifierBase
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialSourceId
import software.aws.toolkits.core.credentials.CredentialType
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.credentials.SsoSessionBackedCredentialIdentifier
import software.aws.toolkits.core.credentials.SsoSessionIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.core.credentials.ChangeConnectionSettingIfValid
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.InteractiveCredential
import software.aws.toolkits.jetbrains.core.credentials.MfaRequiredInteractiveCredentials
import software.aws.toolkits.jetbrains.core.credentials.PostValidateInteractiveCredential
import software.aws.toolkits.jetbrains.core.credentials.RefreshConnectionAction
import software.aws.toolkits.jetbrains.core.credentials.SsoRequiredInteractiveCredentials
import software.aws.toolkits.jetbrains.core.credentials.ToolkitAuthManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitCredentialProcessProvider
import software.aws.toolkits.jetbrains.core.credentials.UserConfigSsoSessionProfile
import software.aws.toolkits.jetbrains.core.credentials.diskCache
import software.aws.toolkits.jetbrains.core.credentials.profiles.Ec2MetadataConfigProvider.getEc2MedataEndpoint
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY
import software.aws.toolkits.jetbrains.core.credentials.profiles.SsoSessionConstants.SSO_SESSION_SECTION_NAME
import software.aws.toolkits.jetbrains.core.credentials.reauthConnectionIfNeeded
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

private class ProfileCredentialsIdentifierLegacySso(
    profileName: String,
    defaultRegionId: String?,
    override val ssoCache: SsoCache,
    override val ssoUrl: String,
    credentialType: CredentialType?
) : ProfileCredentialsIdentifier(profileName, defaultRegionId, credentialType),
    SsoRequiredInteractiveCredentials

class ProfileCredentialsIdentifierSso internal constructor(
    profileName: String,
    val ssoSessionName: String,
    defaultRegionId: String?,
    credentialType: CredentialType?
) : ProfileCredentialsIdentifier(profileName, defaultRegionId, credentialType), PostValidateInteractiveCredential, SsoSessionBackedCredentialIdentifier {
    override val sessionIdentifier = "$SSO_SESSION_SECTION_NAME:$ssoSessionName"

    override fun handleValidationException(e: Exception): ConnectionState.RequiresUserAction? {
        // in the new SSO flow, we must attempt validation before knowing if user action is truly required
        if (findUpException<SsoOidcException>(e) || findUpException<IllegalStateException>(e)) {
            return ConnectionState.RequiresUserAction(
                object : InteractiveCredential, CredentialIdentifier by this {
                    override val userActionDisplayMessage = message("credentials.sso.display", displayName)
                    override val userActionShortDisplayMessage = message("credentials.sso.display.short")
                    override val userAction = object : AnAction(message("credentials.sso.login.session", ssoSessionName)), DumbAware {
                        override fun actionPerformed(e: AnActionEvent) {
                            val session = CredentialManager.getInstance()
                                .getSsoSessionIdentifiers()
                                .first { it.id == sessionIdentifier }
                            val connection = ToolkitAuthManager.getInstance().getOrCreateSsoConnection(
                                UserConfigSsoSessionProfile(
                                    configSessionName = ssoSessionName,
                                    ssoRegion = session.ssoRegion,
                                    startUrl = session.startUrl,
                                    scopes = session.scopes.toList()
                                )
                            )
                            reauthConnectionIfNeeded(e.project, connection)
                            RefreshConnectionAction().actionPerformed(e)
                        }
                    }

                    override fun userActionRequired() = true
                }
            )
        }

        return null
    }

    // true exception could be further up the chain
    private inline fun<reified T : Throwable> findUpException(e: Throwable?): Boolean {
        // inline fun can't use recursion
        var throwable = e
        while (throwable != null) {
            if (throwable is T) {
                return true
            }
            throwable = throwable.cause
        }

        return false
    }
}

private class NeverShowAgain : DumbAwareAction(message("settings.never_show_again")) {
    override fun actionPerformed(e: AnActionEvent) {
        AwsSettings.getInstance().profilesNotification = ProfilesNotification.Never
    }
}

data class ProfileSsoSessionIdentifier(
    val profileName: String,
    override val startUrl: String,
    override val ssoRegion: String,
    override val scopes: Set<String>
) : SsoSessionIdentifier {
    override val id = "$SSO_SESSION_SECTION_NAME:$profileName"
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
        val ssoAdded = mutableListOf<ProfileSsoSessionIdentifier>()
        val ssoModified = mutableListOf<ProfileSsoSessionIdentifier>()

        val previousConfig = profileHolder.snapshot()
        val currentConfig = profileHolder.snapshot()

        val newProfiles = try {
            validateAndGetProfiles()
        } catch (e: Exception) {
            notifyUserOfLoadFailure(e)

            return
        }

        newProfiles.validProfiles.forEach {
            val previousProfile = currentConfig.profiles.remove(it.key)
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

        newProfiles.validSsoSessions.forEach {
            val previousProfile = currentConfig.ssoSessions.remove(it.key)
            if (previousProfile == null) {
                // It was not in the snapshot, so it must be new
                ssoAdded.add(it.value.asSsoSessionId())
            } else {
                // If the profile was modified, notify listeners, else do nothing
                if (previousProfile != it.value) {
                    ssoModified.add(it.value.asSsoSessionId())
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

        // any profiles with a modified 'sso_session' need to be marked as well
        newProfiles.validProfiles.forEach { (_, profile) ->
            val profileId = profile.asId(newProfiles.validProfiles)
            if (profileId in profilesModified) {
                // already marked; skip
                return@forEach
            }

            val sessionProperty = profile.property(SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY)
            if (sessionProperty.isPresent) {
                val session = sessionProperty.get()
                if (ssoModified.any { it.profileName == session }) {
                    profilesModified.add(profileId)
                }
            }
        }

        // Any remaining profiles must have either become invalid or removed from the cred/config files
        val profilesRemoved = currentConfig.profiles.values.map { it.asId(previousConfig.profiles) }
        val ssoRemoved = currentConfig.ssoSessions.values.map { it.asSsoSessionId() }

        profileHolder.updateState(newProfiles.validProfiles, newProfiles.validSsoSessions)
        credentialLoadCallback(CredentialsChangeEvent(profilesAdded, profilesModified, profilesRemoved, ssoAdded, ssoModified, ssoRemoved))

        notifyUserOfResult(newProfiles, initialLoad)
        if (profilesAdded.isNotEmpty() && newProfiles.validProfiles.size == 1) {
            ApplicationManager.getApplication().messageBus.syncPublisher(NEW_PROFILE_ADDED).changeConnection(profilesAdded.first())
        }
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
        profile.propertyExists(PROFILE_SSO_SESSION_PROPERTY) -> createSsoSessionProfileProvider(profile)
        profile.propertyExists(ProfileProperty.SSO_START_URL) -> createLegacySsoProvider(profile)
        profile.propertyExists(ProfileProperty.ROLE_ARN) -> createAssumeRoleProvider(profile, region)
        profile.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> createStaticSessionProvider(profile)
        profile.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> createBasicProvider(profile)
        profile.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> createCredentialProcessProvider(profile)
        else -> {
            throw IllegalArgumentException(message("credentials.profile.unsupported", profile.name()))
        }
    }

    private fun createLegacySsoProvider(profile: Profile): AwsCredentialsProvider = ProfileLegacySsoProvider(ssoCache, profile)

    private fun createSsoSessionProfileProvider(profile: Profile): AwsCredentialsProvider {
        val ssoSessionName = profile.requiredProperty(SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY)
        val ssoSession = profileHolder.getSsoSession(ssoSessionName)
            ?: error("Profile ${profile.name()} refers to sso-session $ssoSessionName which appears to have been removed")

        return ProfileSsoSessionProvider(ssoSession, profile)
    }

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
            this.requiresLegacySso(profiles) -> ProfileCredentialsIdentifierLegacySso(
                name,
                defaultRegion,
                ssoCache,
                this.traverseCredentialChain(profiles).map { it.property(ProfileProperty.SSO_START_URL) }.first { it.isPresent }.get(),
                requestedProfileType
            )
            this.requiresSso() -> ProfileCredentialsIdentifierSso(
                name,
                requiredProperty(SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY),
                defaultRegion,
                requestedProfileType
            )
            else -> ProfileCredentialsIdentifier(name, defaultRegion, requestedProfileType)
        }
    }

    private fun Profile.asSsoSessionId() = ProfileSsoSessionIdentifier(
        name(),
        requiredProperty(ProfileProperty.SSO_START_URL),
        requiredProperty(ProfileProperty.SSO_REGION),
        ssoScopes()
    )

    private fun Profile.requiresMfa(profiles: Map<String, Profile>) = this.traverseCredentialChain(profiles)
        .any { it.propertyExists(ProfileProperty.MFA_SERIAL) }

    private fun Profile.requiresLegacySso(profiles: Map<String, Profile>) = this.traverseCredentialChain(profiles)
        .any { it.propertyExists(ProfileProperty.SSO_START_URL) }

    private fun Profile.requiresSso() = propertyExists(SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY)

    companion object {
        private val LOG = getLogger<ProfileCredentialProviderFactory>()

        val NEW_PROFILE_ADDED: Topic<ChangeConnectionSettingIfValid> = Topic.create(
            "Change to newly added profile",
            ChangeConnectionSettingIfValid::class.java
        )
    }
}

private fun Profile.toCredentialType(): CredentialType? = when {
    this.propertyExists(ProfileProperty.SSO_START_URL) -> CredentialType.SsoProfile
    this.propertyExists(SsoSessionConstants.PROFILE_SSO_SESSION_PROPERTY) -> CredentialType.SsoProfile
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

private data class ProfileHolder(
    val profiles: MutableMap<String, Profile> = mutableMapOf(),
    val ssoSessions: MutableMap<String, Profile> = mutableMapOf()
) {
    fun snapshot() = copy(
        profiles = profiles.toMutableMap(),
        ssoSessions = ssoSessions.toMutableMap()
    )

    /**
     * Update the holder with the latest view of valid state
     */
    fun updateState(validProfiles: Map<String, Profile>, validSsoSessions: Map<String, Profile>) {
        profiles.clear()
        profiles.putAll(validProfiles)

        ssoSessions.clear()
        ssoSessions.putAll(validSsoSessions)
    }

    fun getProfile(profileName: String): Profile? = profiles[profileName]

    fun getSsoSession(sessionName: String): Profile? = ssoSessions[sessionName]
}
