package software.aws.toolkits.core.credentials

import org.slf4j.LoggerFactory
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileFile
import software.amazon.awssdk.profiles.ProfileProperties.AWS_ACCESS_KEY_ID
import software.amazon.awssdk.profiles.ProfileProperties.AWS_SECRET_ACCESS_KEY
import software.aws.toolkits.core.credentials.ProfileToolkitCredentialsProviderFactory.Companion.NAME
import software.aws.toolkits.core.credentials.ProfileToolkitCredentialsProviderFactory.Companion.TYPE
import java.nio.file.Path

class ProfileToolkitCredentialsProvider(
    internal val profile: Profile
) : ToolkitCredentialsProvider {
    override val id: String
        get() = "$TYPE:${profile.name()}"
    override val displayName: String
        get() = "$NAME: ${profile.name()}"

    override fun getCredentials(): AwsCredentials {
        // Use an internal AwsCredentialsProvider so that session creds can be refreshed underneath of us
        val internalCredProvider by lazy {
            when {
                propertyExists(AWS_ACCESS_KEY_ID) -> {
                    val credentials = AwsCredentials.create(
                        requiredProperty(AWS_ACCESS_KEY_ID),
                        requiredProperty(AWS_SECRET_ACCESS_KEY)
                    )
                    StaticCredentialsProvider.create(credentials)
                }
                else -> TODO("Add more advanced logic to respect things like MFA, STS, see ProfileCredentialsUtils in V2")
            }
        }

        return internalCredProvider.credentials
    }

    private fun propertyExists(property: String): Boolean {
        return profile.property(property).isPresent
    }

    private fun requiredProperty(property: String): String {
        return profile.property(property)
            .orElseThrow { IllegalArgumentException("Profile ${profile.name()} is missing required property $property") }
    }

    override fun toString(): String {
        return "ProfileToolkitCredentialsProvider(profile=$profile)"
    }
}

class ProfileToolkitCredentialsProviderFactory(private val credentialLocationOverride: Path? = null) :
    ToolkitCredentialsProviderFactory(TYPE) {
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
                add(ProfileToolkitCredentialsProvider(it))
            }
        } catch (e: Exception) {
            // TODO: Need a better way to report this, a notification SPI?
            LOG.warn("Failed to load AWS profiles", e)
        }
    }

    override fun shutDown() {
        // TODO: Shut down credential file watcher here
    }

    companion object {
        private val LOG = LoggerFactory.getLogger(ProfileToolkitCredentialsProviderFactory::class.java)

        const val TYPE = "profile"
        const val NAME = "AWS Profile"
    }
}