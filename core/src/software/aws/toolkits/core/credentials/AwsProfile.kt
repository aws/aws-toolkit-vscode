package software.aws.toolkits.core.credentials

import org.slf4j.LoggerFactory
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.client.builder.ClientHttpConfiguration
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperties
import software.amazon.awssdk.profiles.ProfileProperties.AWS_ACCESS_KEY_ID
import software.amazon.awssdk.profiles.ProfileProperties.AWS_SECRET_ACCESS_KEY
import software.amazon.awssdk.profiles.ProfileProperties.AWS_SESSION_TOKEN
import software.amazon.awssdk.profiles.ProfileProperties.ROLE_ARN
import software.amazon.awssdk.profiles.ProfileProperties.ROLE_SESSION_NAME
import software.amazon.awssdk.profiles.ProfileProperties.SOURCE_PROFILE
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.regions.providers.DefaultAwsRegionProviderChain
import software.amazon.awssdk.services.sts.STSClient
import software.amazon.awssdk.services.sts.auth.StsAssumeRoleCredentialsProvider
import software.amazon.awssdk.services.sts.model.AssumeRoleRequest
import software.aws.toolkits.core.credentials.ProfileToolkitCredentialsProviderFactory.Companion.TYPE
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.ToolkitRegionProvider
import software.aws.toolkits.resources.message
import java.nio.file.Path

class ProfileToolkitCredentialsProvider(
    private val profiles: MutableMap<String, Profile>,
    internal val profile: Profile,
    private val sdkHttpClient: SdkHttpClient,
    private val regionProvider: ToolkitRegionProvider
) : ToolkitCredentialsProvider() {
    private val internalCredentialsProvider = createInternalCredentialProvider()
    override val id = "$TYPE:${profile.name()}"
    override val displayName get() = message("credentials.profile.name", profile.name())

    override fun getCredentials(): AwsCredentials {
        return internalCredentialsProvider.credentials
    }

    private fun createInternalCredentialProvider(): AwsCredentialsProvider {
        return when {
            propertyExists(ROLE_ARN) -> {
                validateChain()

                val sourceProfile = requiredProperty(SOURCE_PROFILE)
                val roleArn = requiredProperty(ROLE_ARN)
                val roleSessionName = profile.property(ROLE_SESSION_NAME)
                    .orElseGet { "aws-toolkit-jetbrains-${System.currentTimeMillis()}" }
                val externalId = profile.property(ProfileProperties.EXTERNAL_ID).orElse(null)

                val assumeRoleRequest = AssumeRoleRequest.builder()
                    .roleArn(roleArn)
                    .roleSessionName(roleSessionName)
                    .externalId(externalId)
                    .build()

                val stsRegion = DefaultAwsRegionProviderChain().region?.let {
                    regionProvider.regions()[it.value()]
                } ?: AwsRegion.GLOBAL

                // Override the default SPI for getting the active credentials since we are making an internal
                // to this provider client
                val stsClient = STSClient.builder()
                    .httpConfiguration(
                        ClientHttpConfiguration.builder()
                            .httpClient(sdkHttpClient).build()
                    ).credentialsProvider(
                        ProfileToolkitCredentialsProvider(
                            profiles,
                            profiles[sourceProfile]!!,
                            sdkHttpClient,
                            regionProvider
                        )
                    )
                    .region(Region.of(stsRegion.id))
                    .build()

                StsAssumeRoleCredentialsProvider.builder()
                    .stsClient(stsClient)
                    .refreshRequest(assumeRoleRequest)
                    .build()
            }
            propertyExists(AWS_SESSION_TOKEN) -> {
                StaticCredentialsProvider.create(
                    AwsSessionCredentials.create(
                        requiredProperty(AWS_ACCESS_KEY_ID),
                        requiredProperty(AWS_SECRET_ACCESS_KEY),
                        requiredProperty(AWS_SESSION_TOKEN)
                    )
                )
            }
            propertyExists(AWS_ACCESS_KEY_ID) -> {
                StaticCredentialsProvider.create(
                    AwsCredentials.create(
                        requiredProperty(AWS_ACCESS_KEY_ID),
                        requiredProperty(AWS_SECRET_ACCESS_KEY)
                    )
                )
            }
            else -> throw IllegalArgumentException("Profile `$profile` is unsupported")
        }
    }

    private fun validateChain() {
        val profileChain = LinkedHashSet<String>()
        var currentProfile = profile

        while (currentProfile.property(SOURCE_PROFILE).isPresent) {
            val currentProfileName = currentProfile.name()
            if (!profileChain.add(currentProfileName)) {
                val chain = profileChain.joinToString("->", postfix = "->$currentProfileName")
                throw IllegalArgumentException("A circular profile dependency was found between $chain")
            }

            val sourceProfile = currentProfile.property(SOURCE_PROFILE).get()
            currentProfile = profiles[sourceProfile]
                    ?: throw IllegalArgumentException("Profile `$currentProfileName` references source profile `$sourceProfile` which does not exist")
        }
    }

    private fun propertyExists(property: String): Boolean {
        return profile.property(property).isPresent
    }

    private fun requiredProperty(property: String): String {
        return profile.property(property)
            .orElseThrow { IllegalArgumentException(message("credentials.profile.missing_property", profile.name(), property)) }
    }

    override fun toString(): String {
        return "ProfileToolkitCredentialsProvider(profile=$profile)"
    }
}

class ProfileToolkitCredentialsProviderFactory(
    private val sdkHttpClient: SdkHttpClient,
    private val regionProvider: ToolkitRegionProvider,
    private val credentialLocationOverride: Path? = null
) : ToolkitCredentialsProviderFactory(TYPE) {
    init {
        loadFromProfileFile()
        // TODO: Start file watchers
    }

    /**
     * Clean out all the current credentials and load all the profiles
     */
    private fun loadFromProfileFile() {
        try {
            val profiles = credentialLocationOverride?.let {
                ProfileFile.builder()
                    .content(credentialLocationOverride)
                    .type(ProfileFile.Type.CONFIGURATION)
                    .build()
                    .profiles()
            } ?: ProfileFile.defaultProfileFile().profiles()

            clear()
            profiles.values.forEach {
                add(ProfileToolkitCredentialsProvider(profiles, it, sdkHttpClient, regionProvider))
            }
        } catch (e: Exception) {
            // TODO: Need a better way to report this, a notification SPI?
            LOG.warn(message("credentials.profile.failed_load"), e)
        }
    }

    override fun shutDown() {
        // TODO: Shut down credential file watcher here
    }

    companion object {
        private val LOG = LoggerFactory.getLogger(ProfileToolkitCredentialsProviderFactory::class.java)

        const val TYPE = "profile"
    }
}