// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.use
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
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
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import kotlin.reflect.full.declaredMemberProperties
import kotlin.reflect.jvm.isAccessible

class AwsClientManagerTest {
    private val projectRule = ProjectRule()
    private val temporaryDirectory = TemporaryFolder()
    private val regionProvider = MockRegionProviderRule()
    private val credentialManager = MockCredentialManagerRule()
    private val projectSettingsRule = ProjectAccountSettingsManagerRule(projectRule)

    @Rule
    @JvmField
    val ruleChain = RuleChain(
        projectRule,
        temporaryDirectory,
        credentialManager,
        regionProvider,
        projectSettingsRule
    )

    @Test
    fun canGetAnInstanceOfAClient() {
        val sut = getClientManager()
        val client = sut.getClient<DummyServiceClient>(credentialManager.createCredentialProvider(), regionProvider.createAwsRegion())
        assertThat(client.serviceName()).isEqualTo("dummyClient")
    }

    @Test
    fun clientsAreCached() {
        val sut = getClientManager()
        val credProvider = credentialManager.createCredentialProvider()
        val region = regionProvider.createAwsRegion()

        val fooClient = sut.getClient<DummyServiceClient>(credProvider, region)
        val barClient = sut.getClient<DummyServiceClient>(credProvider, region)

        assertThat(fooClient).isSameAs(barClient)
    }

    @Test
    fun oldClientsAreRemovedWhenCredentialsAreRemoved() {
        val sut = getClientManager()

        val credentialsIdentifier = credentialManager.addCredentials("profile:admin")
        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, regionProvider.defaultRegion())

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

            sut.getClient<DummyServiceClient>(credentialManager.createCredentialProvider(), regionProvider.createAwsRegion()).also {
                assertThat(it.closed).isFalse()
            }
        }

        assertThat(client.closed).isTrue()
    }

    @Test
    fun httpClientIsSharedAcrossClients() {
        val sut = getClientManager()
        val dummy = sut.getClient<DummyServiceClient>(credentialManager.createCredentialProvider(), regionProvider.createAwsRegion())
        val secondDummy = sut.getClient<SecondDummyServiceClient>(credentialManager.createCredentialProvider(), regionProvider.createAwsRegion())

        assertThat(dummy.httpClient.delegate).isSameAs(secondDummy.httpClient.delegate)
    }

    @Test
    fun clientWithoutBuilderFailsDescriptively() {
        val sut = getClientManager()

        assertThatThrownBy { sut.getClient<InvalidServiceClient>(credentialManager.createCredentialProvider(), regionProvider.createAwsRegion()) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("builder()")
    }

    @Test
    fun clientInterfaceWithoutNameFieldFailsDescriptively() {
        val sut = getClientManager()

        assertThatThrownBy { sut.getClient<NoServiceNameClient>(credentialManager.createCredentialProvider(), regionProvider.createAwsRegion()) }
            .isInstanceOf(NoSuchFieldException::class.java)
            .hasMessageContaining("SERVICE_NAME")
    }

    @Test
    fun clientsAreScopedToRegion() {
        val sut = getClientManager()
        val credProvider = credentialManager.createCredentialProvider()

        val firstRegion = sut.getClient<DummyServiceClient>(credProvider, regionProvider.createAwsRegion())
        val secondRegion = sut.getClient<DummyServiceClient>(credProvider, regionProvider.createAwsRegion())

        assertThat(secondRegion).isNotSameAs(firstRegion)
    }

    @Test
    fun globalServicesCanBeGivenAnyRegion() {
        val sut = getClientManager()
        regionProvider.addService(
            "DummyService",
            Service(
                endpoints = mapOf("global" to Endpoint()),
                isRegionalized = false,
                partitionEndpoint = "global"
            )
        )
        val credProvider = credentialManager.createCredentialProvider()

        val first = sut.getClient<DummyServiceClient>(credProvider, regionProvider.createAwsRegion(partitionId = "test"))
        val second = sut.getClient<DummyServiceClient>(credProvider, regionProvider.createAwsRegion(partitionId = "test"))

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
