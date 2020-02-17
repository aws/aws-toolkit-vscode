// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.ex.ProjectManagerEx
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
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
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialsManager
import software.aws.toolkits.jetbrains.core.credentials.MockProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import software.aws.toolkits.jetbrains.utils.CompatibilityUtils.createProject
import software.aws.toolkits.jetbrains.utils.spinUntil
import java.time.Duration
import kotlin.reflect.full.declaredMemberProperties
import kotlin.reflect.jvm.isAccessible

class AwsClientManagerTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val temporaryDirectory = TemporaryFolder()

    private lateinit var mockCredentialManager: MockCredentialsManager

    @Before
    fun setUp() {
        mockCredentialManager = MockCredentialsManager.getInstance()
        mockCredentialManager.reset()
        MockProjectAccountSettingsManager.getInstance(projectRule.project).reset()
    }

    @After
    fun tearDown() {
        MockProjectAccountSettingsManager.getInstance(projectRule.project).reset()
        mockCredentialManager.reset()
    }

    @Test
    fun canGetAnInstanceOfAClient() {
        val sut = getClientManager()
        val client = sut.getClient<DummyServiceClient>()
        assertThat(client.serviceName()).isEqualTo("dummyClient")
    }

    @Test
    fun clientsAreCached() {
        val sut = getClientManager()
        val fooClient = sut.getClient<DummyServiceClient>()
        val barClient = sut.getClient<DummyServiceClient>()

        assertThat(fooClient).isSameAs(barClient)
    }

    @Test
    fun oldClientsAreRemovedWhenProfilesAreRemoved() {
        val sut = getClientManager()

        val credentialsIdentifier = mockCredentialManager.addCredentials("profile:admin")
        val credentialProvider = mockCredentialManager.getAwsCredentialProvider(credentialsIdentifier, MockRegionProvider.getInstance().defaultRegion())

        sut.getClient<DummyServiceClient>(credentialProvider)

        assertThat(sut.cachedClients().keys).anySatisfy {
            it.credentialProviderId == "profile:admin"
        }

        ApplicationManager.getApplication().messageBus.syncPublisher(CredentialManager.CREDENTIALS_CHANGED).providerRemoved(credentialsIdentifier)

        assertThat(sut.cachedClients().keys).noneSatisfy {
            it.credentialProviderId == "profile:admin"
        }
    }

    @Test
    fun clientsAreClosedWhenProjectIsDisposed() {
        val project = createProject(temporaryDirectory.newFolder().toPath())
        val projectManager = ProjectManagerEx.getInstanceEx()

        runInEdtAndWait {
            projectManager.openTestProject(project)
        }

        val sut = getClientManager(project)
        val client = sut.getClient<DummyServiceClient>()

        runInEdtAndWait {
            projectManager.closeAndDispose(project)
        }

        assertThat(client.closed).isTrue()
    }

    @Test
    fun httpClientIsSharedAcrossClients() {
        val sut = getClientManager()
        val dummy = sut.getClient<DummyServiceClient>()
        val secondDummy = sut.getClient<SecondDummyServiceClient>()

        assertThat(dummy.httpClient.delegate).isSameAs(secondDummy.httpClient.delegate)
    }

    @Test
    fun clientWithoutBuilderFailsDescriptively() {
        val sut = getClientManager()

        assertThatThrownBy { sut.getClient<InvalidServiceClient>() }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("builder()")
    }

    @Test
    fun newClientCreatedWhenRegionChanges() {
        val sut = getClientManager()
        val first = sut.getClient<DummyServiceClient>()

        val testSettings = MockProjectAccountSettingsManager.getInstance(projectRule.project)
        testSettings.changeRegionAndWait(AwsRegion("us-west-2", "us-west-2", "aws"))

        spinUntil(Duration.ofSeconds(10)) { testSettings.connectionState == ConnectionState.VALID || testSettings.connectionState == ConnectionState.INVALID }

        val afterRegionUpdate = sut.getClient<DummyServiceClient>()

        assertThat(afterRegionUpdate).isNotSameAs(first)
    }

    // Test against real version so bypass ServiceManager for the client manager
    private fun getClientManager(project: Project = projectRule.project) = AwsClientManager(project, AwsSdkClient.getInstance())

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

    class InvalidServiceClient : SdkClient {
        override fun close() {}

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
