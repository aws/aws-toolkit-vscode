package software.aws.toolkits.core.credentials

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Condition
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.profiles.Profile
import software.amazon.awssdk.profiles.ProfileProperties
import java.io.File

class ProfileToolkitCredentialsProviderFactoryTest {
    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    private lateinit var profileFile: File

    @Before
    fun setUp() {
        profileFile = temporaryFolder.newFile("config")
    }

    @Test
    fun testLoading_withEmptyProfiles() {
        val providerFactory = createProviderFactory()
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
    }

    @Test
    fun testLoading_withExpectedProfiles() {
        profileFile.writeText(TEST_PROFILE_FILE_CONTENTS)

        val providerFactory = createProviderFactory()

        assertThat(providerFactory.listCredentialProviders())
            .hasSize(2)
            .has(correctProfile(FOO_PROFILE))
            .has(correctProfile(BAR_PROFILE))
    }

    private fun correctProfile(expectedProfile: Profile): Condition<Iterable<ToolkitCredentialsProvider>> {
        return object : Condition<Iterable<ToolkitCredentialsProvider>>(expectedProfile.toString()) {
            override fun matches(value: Iterable<ToolkitCredentialsProvider>): Boolean {
                return value.filterIsInstance<ProfileToolkitCredentialsProvider>()
                    .any { it.profile == expectedProfile }
            }
        }
    }

    private fun createProviderFactory() = ProfileToolkitCredentialsProviderFactory(profileFile.toPath())

    companion object {
        val TEST_PROFILE_FILE_CONTENTS = """
            [profile bar]
            aws_access_key_id=BarAccessKey
            aws_secret_access_key=BarSecretKey

            [profile foo]
            aws_access_key_id=FooAccessKey
            aws_secret_access_key=FooSecretKey
            aws_session_token=FooSessionToken
        """.trimIndent()

        const val FOO_PROFILE_NAME = "foo"
        const val FOO_ACCESS_KEY = "FooAccessKey"
        const val FOO_SECRET_KEY = "FooSecretKey"
        const val FOO_SESSION_TOKEN = "FooSessionToken"

        const val BAR_PROFILE_NAME = "bar"
        const val BAR_ACCESS_KEY = "BarAccessKey"
        const val BAR_SECRET_KEY = "BarSecretKey"

        val FOO_PROFILE: Profile = Profile.builder()
            .name(FOO_PROFILE_NAME)
            .properties(
                mapOf(
                    ProfileProperties.AWS_ACCESS_KEY_ID to FOO_ACCESS_KEY,
                    ProfileProperties.AWS_SECRET_ACCESS_KEY to FOO_SECRET_KEY,
                    ProfileProperties.AWS_SESSION_TOKEN to FOO_SESSION_TOKEN
                )
            )
            .build()

        val BAR_PROFILE: Profile = Profile.builder()
            .name(BAR_PROFILE_NAME)
            .properties(
                mapOf(
                    ProfileProperties.AWS_ACCESS_KEY_ID to BAR_ACCESS_KEY,
                    ProfileProperties.AWS_SECRET_ACCESS_KEY to BAR_SECRET_KEY
                )
            )
            .build()
    }
}