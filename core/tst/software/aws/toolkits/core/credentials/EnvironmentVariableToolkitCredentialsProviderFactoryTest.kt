package software.aws.toolkits.core.credentials

import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.aws.toolkits.core.rules.EnvironmentVariableHelper

class EnvironmentVariableToolkitCredentialsProviderFactoryTest {
    @Rule
    @JvmField
    val envHelper = EnvironmentVariableHelper()

    @Before
    fun setUp() {
        envHelper.remove(AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN)
    }

    @Test
    fun testLoadingWithNoneSet() {
        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory()
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
    }

    @Test
    fun testLoadingPartiallySet() {
        envHelper[AWS_ACCESS_KEY_ID] = "foo"

        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory()
        assertThat(providerFactory.listCredentialProviders()).isEmpty()
    }

    @Test
    fun testLoadingBasicCredentials() {
        envHelper[AWS_ACCESS_KEY_ID] = "foo"
        envHelper[AWS_SECRET_ACCESS_KEY] = "bar"

        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory()
        assertThat(providerFactory.listCredentialProviders())
            .hasSize(1)
            .element(0)
            .satisfies {
                assertThat(it.credentials).isExactlyInstanceOf(AwsCredentials::class.java)
            }
    }

    @Test
    fun testLoadingSessionCredentials() {
        envHelper[AWS_ACCESS_KEY_ID] = "foo"
        envHelper[AWS_SECRET_ACCESS_KEY] = "bar"
        envHelper[AWS_SESSION_TOKEN] = "baz"

        val providerFactory = EnvironmentVariableToolkitCredentialsProviderFactory()
        assertThat(providerFactory.listCredentialProviders())
            .hasSize(1)
            .element(0)
            .satisfies {
                assertThat(it.credentials).isExactlyInstanceOf(AwsSessionCredentials::class.java)
            }
    }

    companion object {
        const val AWS_ACCESS_KEY_ID = "AWS_ACCESS_KEY_ID"
        const val AWS_SECRET_ACCESS_KEY = "AWS_SECRET_ACCESS_KEY"
        const val AWS_SESSION_TOKEN = "AWS_SESSION_TOKEN"
    }
}