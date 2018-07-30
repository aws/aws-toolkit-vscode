package software.aws.toolkits.jetbrains.core

import assertk.assert
import assertk.assertions.hasMessageContaining
import assertk.assertions.isEqualTo
import assertk.assertions.isInstanceOf
import assertk.assertions.isNotSameAs
import assertk.assertions.isSameAs
import assertk.assertions.isTrue
import com.intellij.testFramework.PlatformTestCase
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.awscore.client.builder.AwsDefaultClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.client.config.SdkAdvancedClientOption
import software.amazon.awssdk.core.client.config.SdkClientOption
import software.amazon.awssdk.core.interceptor.ExecutionAttributes
import software.amazon.awssdk.core.signer.Signer
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.http.SdkHttpFullRequest
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import kotlin.reflect.full.declaredMemberProperties
import kotlin.reflect.jvm.isAccessible

class AwsClientManagerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val temporaryDirectory = TemporaryFolder()

    @Test
    fun canGetAnInstanceOfAClient() {
        val sut = AwsClientManager.getInstance(projectRule.project)
        val client = sut.getClient<DummyServiceClient>()
        assert(client.serviceName()).isEqualTo("dummyClient")
    }

    @Test
    fun clientsAreCached() {
        val sut = AwsClientManager.getInstance(projectRule.project)
        val fooClient = sut.getClient<DummyServiceClient>()
        val barClient = sut.getClient<DummyServiceClient>()

        assert(fooClient).isSameAs(barClient)
    }

    @Test
    fun clientsAreClosedWhenProjectIsDisposed() {
        val project = PlatformTestCase.createProject(temporaryDirectory.newFolder(), "Fake project")
        val sut = AwsClientManager.getInstance(project)
        val client = sut.getClient<DummyServiceClient>()

        runInEdtAndWait {
            PlatformTestCase.closeAndDisposeProjectAndCheckThatNoOpenProjects(project)
        }

        assert(client.closed).isTrue()
    }

    @Test
    fun httpClientIsSharedAcrossClients() {
        val sut = AwsClientManager.getInstance(projectRule.project)
        val dummy = sut.getClient<DummyServiceClient>()
        val secondDummy = sut.getClient<SecondDummyServiceClient>()

        assert(dummy.httpClient.delegate).isSameAs(secondDummy.httpClient.delegate)
    }

    @Test
    fun clientWithoutBuilderFailsDescriptively() {
        val sut = AwsClientManager.getInstance(projectRule.project)

        assert { sut.getClient<InvalidServiceClient>() }.thrownError {
            isInstanceOf(IllegalArgumentException::class)
            hasMessageContaining("builder()")
        }
    }

    @Test
    fun newClientCreatedWhenRegionChanges() {
        val sut = AwsClientManager.getInstance(projectRule.project)
        val first = sut.getClient<DummyServiceClient>()

        val testSettings = ProjectAccountSettingsManager.getInstance(projectRule.project)

        testSettings.activeRegion = AwsRegion("us-east-1", "US-east-1")

        val afterRegionUpdate = sut.getClient<DummyServiceClient>()

        assert(afterRegionUpdate).isNotSameAs(first)
    }

    class DummyServiceClient(val httpClient: SdkHttpClient) : TestClient() {
        companion object {
            @Suppress("unused")
            @JvmStatic
            fun builder() = DummyServiceClientBuilder()
        }
    }

    class DummyServiceClientBuilder : TestClientBuilder<DummyServiceClientBuilder, DummyServiceClient>() {
        override fun signingName(): String = "DummyService"

        override fun buildClient() = DummyServiceClient(syncClientConfiguration().option(SdkClientOption.SYNC_HTTP_CLIENT))
    }

    class SecondDummyServiceClient(val httpClient: SdkHttpClient) : TestClient() {
        companion object {
            @Suppress("unused")
            @JvmStatic
            fun builder() = SecondDummyServiceClientBuilder()
        }
    }

    class SecondDummyServiceClientBuilder :
        TestClientBuilder<SecondDummyServiceClientBuilder, SecondDummyServiceClient>() {
        override fun signingName(): String = "SecondDummyService"

        override fun buildClient() = SecondDummyServiceClient(syncClientConfiguration().option(SdkClientOption.SYNC_HTTP_CLIENT))
    }

    class InvalidServiceClient : SdkClient {
        override fun close() {
            TODO("not implemented")
        }

        override fun serviceName() = "invalidClient"
    }

    abstract class TestClient : SdkClient, AutoCloseable {
        var closed = false

        override fun serviceName() = "dummyClient"

        override fun close() {
            closed = true
        }
    }

    abstract class TestClientBuilder<B : AwsClientBuilder<B, C>, C> : AwsDefaultClientBuilder<B, C>() {
        init {
            overrideConfiguration {
                it.advancedOptions(mapOf(SdkAdvancedClientOption.SIGNER to object : Signer {
                    override fun sign(
                        request: SdkHttpFullRequest?,
                        executionAttributes: ExecutionAttributes?
                    ): SdkHttpFullRequest {
                        throw NotImplementedError()
                    }
                }))
            }
        }

        override fun serviceEndpointPrefix() = "dummyClient"
    }

    private val SdkHttpClient.delegate: SdkHttpClient
        get() {
            val delegateProperty = this::class.declaredMemberProperties.find { it.name == "delegate" }
                    ?: throw IllegalArgumentException("Expected instance of software.amazon.awssdk.core.client.builder.SdkDefaultClientBuilder.NonManagedSdkHttpClient")
            delegateProperty.isAccessible = true
            return delegateProperty.call(this) as SdkHttpClient
        }
}