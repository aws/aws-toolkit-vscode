package software.aws.toolkits.core.credentials

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.auth.credentials.AwsCredentials
import kotlin.reflect.KClass

class ToolkitCredentialsProviderManagerTest {
    @Rule
    @JvmField
    val temporaryFolder = TemporaryFolder()

    private val manager = ToolkitCredentialsProviderManager(MockToolkitCredentialsProviderRegistry())

    private val shutDownFactories = mutableSetOf<KClass<*>>()

    @Test
    fun testGettingCredentials() {
        assertThat(manager.getCredentialProvider("Mock1:Cred1")).isNotNull
        assertThat(manager.getCredentialProvider("Mock2:Cred2")).isNotNull
    }

    @Test
    fun testGettingCredentialsThatDontExist() {
        assertThatThrownBy { manager.getCredentialProvider("DoesNotExist") }
            .isInstanceOf(CredentialProviderNotFound::class.java)
    }

    @Test
    fun testShutdownIsCalledOnFactories() {
        manager.shutDown()
        assertThat(shutDownFactories)
            .containsOnly(MockToolkitCredentialProviderFactory::class, MockToolkitCredentialProviderFactory2::class)
    }

    private class MockToolkitCredentialsProvider(override val id: String) : ToolkitCredentialsProvider {
        override val displayName: String
            get() = id

        override fun getCredentials(): AwsCredentials = throw NotImplementedError()
    }

    private inner class MockToolkitCredentialProviderFactory : ToolkitCredentialsProviderFactory("Mock1") {
        init {
            add(MockToolkitCredentialsProvider("Mock1:Cred1"))
            add(MockToolkitCredentialsProvider("Mock1:Cred2"))
        }

        override fun shutDown() {
            shutDownFactories.add(this::class)
            throw RuntimeException("Simulated")
        }
    }

    private inner class MockToolkitCredentialProviderFactory2 : ToolkitCredentialsProviderFactory("Mock2") {
        init {
            add(MockToolkitCredentialsProvider("Mock2:Cred1"))
            add(MockToolkitCredentialsProvider("Mock2:Cred2"))
        }

        override fun shutDown() {
            shutDownFactories.add(this::class)
        }
    }

    private inner class MockToolkitCredentialsProviderRegistry : ToolkitCredentialsProviderRegistry {
        override fun listFactories() = listOf(
            MockToolkitCredentialProviderFactory(),
            MockToolkitCredentialProviderFactory2()
        )
    }
}