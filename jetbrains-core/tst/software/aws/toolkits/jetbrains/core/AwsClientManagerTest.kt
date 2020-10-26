// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.use
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import software.amazon.awssdk.awscore.client.builder.AwsClientBuilder
import software.amazon.awssdk.awscore.client.builder.AwsDefaultClientBuilder
import software.amazon.awssdk.core.SdkClient
import software.amazon.awssdk.core.client.config.SdkAdvancedClientOption
import software.amazon.awssdk.core.client.config.SdkClientOption
import software.amazon.awssdk.core.signer.Signer
import software.amazon.awssdk.http.SdkHttpClient
import software.aws.toolkits.core.region.Endpoint
import software.aws.toolkits.core.region.Service
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.MockAwsConnectionManager.ProjectAccountSettingsManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider.RegionProviderRule
import kotlin.reflect.full.declaredMemberProperties
import kotlin.reflect.jvm.isAccessible

class AwsClientManagerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val temporaryDirectory = TemporaryFolder()

    @Rule
    @JvmField
    val regionProviderRule = RegionProviderRule()

    @Rule
    @JvmField
    val projectSettingsRule = ProjectAccountSettingsManagerRule(projectRule)

    private lateinit var mockCredentialManager: MockCredentialsManager

    @Before
    fun setUp() {
        mockCredentialManager = MockCredentialsManager.getInstance()
        mockCredentialManager.reset()
    }

    @After
    fun tearDown() {
        mockCredentialManager.reset()
    }

    @Test
    fun canGetAnInstanceOfAClient() {
        val sut = getClientManager()
        val client = sut.getClient<DummyServiceClient>(mockCredentialManager.createCredentialProvider(), regionProviderRule.createAwsRegion())
        assertThat(client.serviceName()).isEqualTo("dummyClient")
    }

    @Test
    fun clientsAreCached() {
        val sut = getClientManager()
        val credProvider = mockCredentialManager.createCredentialProvider()
        val region = regionProviderRule.createAwsRegion()

        val fooClient = sut.getClient<DummyServiceClient>(credProvider, region)
        val barClient = sut.getClient<DummyServiceClient>(credProvider, region)

        assertThat(fooClient).isSameAs(barClient)
    }

    @Test
    fun oldClientsAreRemovedWhenCredentialsAreRemoved() {
        val sut = getClientManager()

        val credentialsIdentifier = mockCredentialManager.addCredentials("profile:admin")
        val credentialProvider = mockCredentialManager.getAwsCredentialProvider(credentialsIdentifier, MockRegionProvider.getInstance().defaultRegion())

        sut.getClient<DummyServiceClient>(credentialProvider, anAwsRegion())

        assertThat(sut.cachedClients().keys).anySatisfy {
            it.credentialProviderId == "profile:admin"
        }

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerRemoved(credentialsIdentifier)

        assertThat(sut.cachedClients().keys).noneSatisfy {
            it.credentialProviderId == "profile:admin"
        }
    }

    @Test
    fun clientsAreClosedWhenParentIsDisposed() {
        val client = Disposer.newDisposable().use { parent ->
            val sut = getClientManager()
            Disposer.register(parent, sut)

            sut.getClient<DummyServiceClient>(mockCredentialManager.createCredentialProvider(), regionProviderRule.createAwsRegion()).also {
                assertThat(it.closed).isFalse()
            }
        }

        assertThat(client.closed).isTrue()
    }

    @Test
    fun httpClientIsSharedAcrossClients() {
        val sut = getClientManager()
        val dummy = sut.getClient<DummyServiceClient>(mockCredentialManager.createCredentialProvider(), regionProviderRule.createAwsRegion())
        val secondDummy = sut.getClient<SecondDummyServiceClient>(mockCredentialManager.createCredentialProvider(), regionProviderRule.createAwsRegion())

        assertThat(dummy.httpClient.delegate).isSameAs(secondDummy.httpClient.delegate)
    }

    @Test
    fun clientWithoutBuilderFailsDescriptively() {
        val sut = getClientManager()

        assertThatThrownBy { sut.getClient<InvalidServiceClient>(mockCredentialManager.createCredentialProvider(), regionProviderRule.createAwsRegion()) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("builder()")
    }

    @Test
    fun clientInterfaceWithoutNameFieldFailsDescriptively() {
        val sut = getClientManager()

        assertThatThrownBy { sut.getClient<NoServiceNameClient>(mockCredentialManager.createCredentialProvider(), regionProviderRule.createAwsRegion()) }
            .isInstanceOf(NoSuchFieldException::class.java)
            .hasMessageContaining("SERVICE_NAME")
    }

    @Test
    fun clientsAreScopedToRegion() {
        val sut = getClientManager()
        val credProvider = mockCredentialManager.createCredentialProvider()

        val firstRegion = sut.getClient<DummyServiceClient>(credProvider, regionProviderRule.createAwsRegion())
        val secondRegion = sut.getClient<DummyServiceClient>(credProvider, regionProviderRule.createAwsRegion())

        assertThat(secondRegion).isNotSameAs(firstRegion)
    }

    @Test
    fun globalServicesCanBeGivenAnyRegion() {
        val sut = getClientManager()
        MockRegionProvider.getInstance().addService(
            "DummyService",
            Service(
                endpoints = mapOf("global" to Endpoint()),
                isRegionalized = false,
                partitionEndpoint = "global"
            )
        )
        val credProvider = mockCredentialManager.createCredentialProvider()

        val first = sut.getClient<DummyServiceClient>(credProvider, regionProviderRule.createAwsRegion(partitionId = "test"))
        val second = sut.getClient<DummyServiceClient>(credProvider, regionProviderRule.createAwsRegion(partitionId = "test"))

        assertThat(first.serviceName()).isEqualTo("dummyClient")
        assertThat(second).isSameAs(first)
    }

    // Test against real version so bypass ServiceManager for the client manager
    private fun getClientManager() = AwsClientManager()

    class DummyServiceClient(val httpClient: SdkHttpClient) : TestClient() {
        companion object {
            @Suppress("unused")
            @JvmStatic
            fun builder() = DummyServiceClientBuilder()
        }
    }

    class DummyServiceClientBuilder : TestClientBuilder<DummyServiceClientBuilder, DummyServiceClient>() {
        override fun serviceName(): String = "DummyService"

        override fun signingName(): String = serviceName()

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
        override fun serviceName(): String = "SecondDummyService"

        override fun signingName(): String = serviceName()

        override fun buildClient() = SecondDummyServiceClient(syncClientConfiguration().option(SdkClientOption.SYNC_HTTP_CLIENT))
    }

    class InvalidServiceClient : TestClient() {
        override fun close() {}

        override fun serviceName() = "invalidClient"
    }

    class NoServiceNameClient : SdkClient {
        override fun close() {}

        override fun serviceName() = "invalidClient"
    }

    abstract class TestClient : SdkClient, AutoCloseable {
        var closed = false

        override fun serviceName() = "dummyClient"

        override fun close() {
            closed = true
        }

        companion object {
            @Suppress("unused", "MayBeConstant")
            @JvmField
            val SERVICE_NAME = "DummyService"
        }
    }

    abstract class TestClientBuilder<B : AwsClientBuilder<B, C>, C> : AwsDefaultClientBuilder<B, C>() {
        init {
            overrideConfiguration {
                it.advancedOptions(mapOf(SdkAdvancedClientOption.SIGNER to Signer { _, _ -> throw NotImplementedError() }))
            }
        }

        override fun serviceEndpointPrefix() = "dummyClient"
    }

    private val SdkHttpClient.delegate: SdkHttpClient
        get() {
            val delegateProperty = this::class.declaredMemberProperties.find { it.name == "delegate" }
                ?: throw IllegalArgumentException(
                    "Expected instance of software.amazon.awssdk.core.client.builder.SdkDefaultClientBuilder.NonManagedSdkHttpClient"
                )
            delegateProperty.isAccessible = true
            return delegateProperty.call(this) as SdkHttpClient
        }
}
