// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.profiles

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.util.registry.Registry
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperty
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.aws.toolkits.core.ToolkitClientManager
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialIdentifierBase
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.credentials.sso.SSO_ACCOUNT
import software.aws.toolkits.core.credentials.sso.SSO_EXPERIMENTAL_REGISTRY_KEY
import software.aws.toolkits.core.credentials.sso.SSO_REGION
import software.aws.toolkits.core.credentials.sso.SSO_ROLE_NAME
import software.aws.toolkits.core.credentials.sso.SSO_URL
import software.aws.toolkits.core.credentials.sso.SsoAccessTokenProvider
import software.aws.toolkits.core.credentials.sso.SsoCache
import software.aws.toolkits.core.credentials.sso.SsoCredentialProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.credentials.CorrectThreadCredentialsProvider
import software.aws.toolkits.jetbrains.core.credentials.MfaRequiredInteractiveCredentials
import software.aws.toolkits.jetbrains.core.credentials.SsoPrompt
import software.aws.toolkits.jetbrains.core.credentials.SsoRequiredInteractiveCredentials
import software.aws.toolkits.jetbrains.core.credentials.ToolkitCredentialProcessProvider
import software.aws.toolkits.jetbrains.core.credentials.diskCache
import software.aws.toolkits.jetbrains.core.credentials.promptForMfaToken
import software.aws.toolkits.jetbrains.utils.createNotificationExpiringAction
import software.aws.toolkits.jetbrains.utils.createShowMoreInfoDialogAction
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.util.function.Supplier

const val DEFAULT_PROFILE_ID = "profile:default"

private const val PROFILE_FACTORY_ID = "ProfileCredentialProviderFactory"

private open class ProfileCredentialsIdentifier(val profileName: String, override val defaultRegionId: String?) : CredentialIdentifierBase() {
    override val id = "profile:$profileName"
    override val displayName = message("credentials.profile.name", profileName)
    override val factoryId = PROFILE_FACTORY_ID
    override val shortName: String = profileName
}

private class ProfileCredentialsIdentifierMfa(profileName: String, defaultRegionId: String?) :
    ProfileCredentialsIdentifier(profileName, defaultRegionId), MfaRequiredInteractiveCredentials

private class ProfileCredentialsIdentifierSso(
    profileName: String,
    defaultRegionId: String?,
    override val ssoCache: SsoCache,
    override val ssoUrl: String
) : ProfileCredentialsIdentifier(profileName, defaultRegionId),
    SsoRequiredInteractiveCredentials

class ProfileCredentialProviderFactory : CredentialProviderFactory {
    private val profileHolder = ProfileHolder()

    override val id = PROFILE_FACTORY_ID

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
                profilesAdded.add(it.value.asId(newProfiles.validProfiles))
            } else {
                // If the profile was modified, notify people, else do nothing
                if (previousProfile != it.value) {
                    profilesModified.add(it.value.asId(newProfiles.validProfiles))
                }
            }
        }

        // Any remaining profiles must have either become invalid or removed from the cred/config files
        previousProfilesSnapshot.values.asSequence().map { it.asId(newProfiles.validProfiles) }.toCollection(profilesRemoved)

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

            val errorDialogTitle = message("credentials.profile.failed_load")
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

    override fun createAwsCredentialProvider(
        providerId: CredentialIdentifier,
        region: AwsRegion,
        sdkHttpClientSupplier: () -> SdkHttpClient
    ): AwsCredentialsProvider {
        val profileProviderId = providerId as? ProfileCredentialsIdentifier
            ?: throw IllegalStateException("ProfileCredentialProviderFactory can only handle ProfileCredentialsIdentifier, but got ${providerId::class}")

        val profile = profileHolder.getProfile(profileProviderId.profileName)
            ?: throw IllegalStateException("Profile ${profileProviderId.profileName} looks to have been removed")

        return createAwsCredentialProvider(profile, region, sdkHttpClientSupplier)
    }

    private fun createAwsCredentialProvider(profile: Profile, region: AwsRegion, sdkHttpClientSupplier: () -> SdkHttpClient) = when {
        profile.propertyExists(SSO_URL) && Registry.`is`(SSO_EXPERIMENTAL_REGISTRY_KEY) -> createSsoProvider(profile, sdkHttpClientSupplier)
        profile.propertyExists(ProfileProperty.ROLE_ARN) -> createAssumeRoleProvider(profile, region, sdkHttpClientSupplier)
        profile.propertyExists(ProfileProperty.AWS_SESSION_TOKEN) -> createStaticSessionProvider(profile)
        profile.propertyExists(ProfileProperty.AWS_ACCESS_KEY_ID) -> createBasicProvider(profile)
        profile.propertyExists(ProfileProperty.CREDENTIAL_PROCESS) -> createCredentialProcessProvider(profile)
        else -> {
            throw IllegalArgumentException(message("credentials.profile.unsupported", profile.name()))
        }
    }

    private fun createSsoProvider(profile: Profile, sdkHttpClientSupplier: () -> SdkHttpClient): AwsCredentialsProvider {
        val ssoRegion = profile.requiredProperty(SSO_REGION)
        val sdkHttpClient = sdkHttpClientSupplier()
        val ssoClient = ToolkitClientManager.createNewClient(
            SsoClient::class,
            sdkHttpClient,
            Region.of(ssoRegion),
            AnonymousCredentialsProvider.create(),
            AwsClientManager.userAgent
        )

        val ssoOidcClient = ToolkitClientManager.createNewClient(
            SsoOidcClient::class,
            sdkHttpClient,
            Region.of(ssoRegion),
            AnonymousCredentialsProvider.create(),
            AwsClientManager.userAgent
        )

        val ssoAccessTokenProvider = SsoAccessTokenProvider(
            profile.requiredProperty(SSO_URL),
            ssoRegion,
            SsoPrompt,
            diskCache,
            ssoOidcClient
        )

        return SsoCredentialProvider(
            profile.requiredProperty(SSO_ACCOUNT),
            profile.requiredProperty(SSO_ROLE_NAME),
            ssoClient,
            ssoAccessTokenProvider
        )
    }

    private fun createAssumeRoleProvider(profile: Profile, region: AwsRegion, sdkHttpClientSupplier: () -> SdkHttpClient): AwsCredentialsProvider {
        val sourceProfileName = profile.requiredProperty(ProfileProperty.SOURCE_PROFILE)
        val sourceProfile = profileHolder.getProfile(sourceProfileName)
            ?: throw IllegalStateException("Profile $sourceProfileName looks to have been removed")

        val sdkHttpClient = sdkHttpClientSupplier()

        val parentCredentialProvider = createAwsCredentialProvider(sourceProfile, region, sdkHttpClientSupplier)

        // Override the default SPI for getting the active credentials since we are making an internal
        // to this provider client
        val stsClient = ToolkitClientManager.createNewClient(
            StsClient::class,
            sdkHttpClient,
            Region.of(region.id),
            parentCredentialProvider,
            AwsClientManager.userAgent
        )

        val roleArn = profile.requiredProperty(ProfileProperty.ROLE_ARN)
        val roleSessionName = profile.property(ProfileProperty.ROLE_SESSION_NAME)
            .orElseGet { "aws-toolkit-jetbrains-${System.currentTimeMillis()}" }
        val externalId = profile.property(ProfileProperty.EXTERNAL_ID)
            .orElse(null)
        val mfaSerial = profile.property(ProfileProperty.MFA_SERIAL)
            .orElse(null)

        val assumeRoleCredentialsProvider = StsAssumeRoleCredentialsProvider.builder()
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

        // TODO: Do we still need this wrapper?
        return CorrectThreadCredentialsProvider(assumeRoleCredentialsProvider)
    }

    private fun createAssumeRoleRequest(
        profileName: String,
        mfaSerial: String?,
        roleArn: String,
        roleSessionName: String?,
        externalId: String?
    ): AssumeRoleRequest {
        val requestBuilder = AssumeRoleRequest.builder()
            .roleArn(roleArn)
            .roleSessionName(roleSessionName)
            .externalId(externalId)

        mfaSerial?.let { _ ->
            requestBuilder
                .serialNumber(mfaSerial)
                .tokenCode(promptForMfaToken(profileName, mfaSerial))
        }

        return requestBuilder.build()
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

        return when {
            this.requiresMfa(profiles) -> ProfileCredentialsIdentifierMfa(name, defaultRegion)
            this.requiresSso(profiles) -> ProfileCredentialsIdentifierSso(name, defaultRegion,
                diskCache, this.requiredProperty(SSO_URL))
            else -> ProfileCredentialsIdentifier(name, defaultRegion)
        }
    }

    private fun Profile.requiresMfa(profiles: Map<String, Profile>) = this.traverseCredentialChain(profiles)
        .any { it.propertyExists(ProfileProperty.MFA_SERIAL) }

    private fun Profile.requiresSso(profiles: Map<String, Profile>) = this.traverseCredentialChain(profiles)
        .any { it.propertyExists(SSO_URL) }
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
