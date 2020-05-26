// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ExtensionTestUtil
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.http.SdkHttpClient
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.MockRegionProvider
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class CredentialManagerTest {
    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val application = ApplicationRule()

    @Test
    fun testCredentialsCanLoadFromExtensions() {
        val region = MockRegionProvider.getInstance().defaultRegion()

        addFactories(
            createTestCredentialFactory(
                "testFactory1",
                mapOf(
                    "testFoo1" to region to createCredentials("testFoo1"),
                    "testBar1" to region to createCredentials("testBar1")
                )
            ),
            createTestCredentialFactory(
                "testFactory2",
                mapOf(
                    "testFoo2" to region to createCredentials("testFoo2"),
                    "testBar2" to region to createCredentials("testBar2")
                )
            )
        )

        val credentialManager = DefaultCredentialManager()

        assertThat(credentialManager.getCredentialIdentifiers().map { it.id }).contains("testFoo1", "testFoo2", "testBar1", "testBar2")

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo2")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo2Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo2Secret")
        }
    }

    @Test
    fun testCredentialsAreScopedToPartition() {
        val partition1 = AwsRegion("test-1", "Test-1", "aws-test-1")
        val partition2 = AwsRegion("test-1", "Test-1", "aws-test-2")

        addFactories(
            createTestCredentialFactory(
                "testFactory1",
                mapOf(
                    "testFoo1" to partition1 to createCredentials(partition1.partitionId),
                    "testFoo1" to partition2 to createCredentials(partition2.partitionId)
                )
            )
        )

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, partition1)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("aws-test-1Access")
            assertThat(it.secretAccessKey()).isEqualTo("aws-test-1Secret")
        }

        val credentialProvider2 = credentialManager.getAwsCredentialProvider(credentialsIdentifier, partition2)

        assertThat(credentialProvider2.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("aws-test-2Access")
            assertThat(it.secretAccessKey()).isEqualTo("aws-test-2Secret")
        }
    }

    @Test
    fun testCredentialUpdatingDoesNotBreakExisting() {
        val region = MockRegionProvider.getInstance().defaultRegion()
        val credentialFactory = createTestCredentialFactory(
            "testFactory1",
            mapOf(
                "testFoo1" to region to createCredentials("testFoo1")
            )
        )

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1Secret")
        }

        credentialFactory.updateCredentials(
            "testFoo1",
            mapOf(
                region to createCredentials("testFoo1Updated")
            )
        )

        // Existing references are good
        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1UpdatedAccess")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1UpdatedSecret")
        }

        // New ones are good too
        assertThat(
            credentialManager.getAwsCredentialProvider(
                credentialsIdentifier,
                region
            ).resolveCredentials()
        ).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1UpdatedAccess")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1UpdatedSecret")
        }
    }

    @Test
    fun testRemovedCredentialsCeaseWorkingAfter() {
        val region = MockRegionProvider.getInstance().defaultRegion()
        val credentialFactory = createTestCredentialFactory(
            "testFactory1",
            mapOf(
                "testFoo1" to region to createCredentials("testFoo1")
            )
        )

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1Secret")
        }

        credentialFactory.removeCredentials("testFoo1")

        // Existing references throw
        assertThatThrownBy { credentialProvider.resolveCredentials() }.isInstanceOf(CredentialProviderNotFoundException::class.java)

        // New ones fail too
        assertThatThrownBy {
            credentialManager.getAwsCredentialProvider(
                credentialsIdentifier,
                region
            ).resolveCredentials()
        }.isInstanceOf(CredentialProviderNotFoundException::class.java)

        assertNull(credentialManager.getCredentialIdentifierById("testFoo1"))
    }

    private fun addFactories(vararg factories: CredentialProviderFactory) {
        ExtensionTestUtil.maskExtensions(DefaultCredentialManager.EP_NAME, factories.toList(), disposableRule.disposable)
    }

    private fun createCredentials(id: String) = StaticCredentialsProvider.create(AwsBasicCredentials.create("${id}Access", "${id}Secret"))

    private fun createTestCredentialFactory(
        id: String,
        initialCredentials: Map<Pair<String, AwsRegion>, AwsCredentialsProvider>
    ): TestCredentialProviderFactory = TestCredentialProviderFactory(id, initialCredentials)

    private class TestCredentialProviderFactory(
        override val id: String,
        private val initialCredentials: Map<Pair<String, AwsRegion>, AwsCredentialsProvider>
    ) : CredentialProviderFactory {
        private val credentialsMapping = mutableMapOf<String, MutableMap<AwsRegion, AwsCredentialsProvider>>()
        private lateinit var callback: CredentialsChangeListener

        override fun setUp(credentialLoadCallback: CredentialsChangeListener) {
            callback = credentialLoadCallback

            val credentialsAdded = initialCredentials
                .onEach {
                    val providerIdCredentials = credentialsMapping.computeIfAbsent(it.key.first) { mutableMapOf() }
                    providerIdCredentials[it.key.second] = it.value
                }
                .map { createCredentialIdentifier(it.key.first) }

            callback(
                CredentialsChangeEvent(
                    credentialsAdded,
                    emptyList(),
                    emptyList()
                )
            )
        }

        override fun createAwsCredentialProvider(
            providerId: ToolkitCredentialsIdentifier,
            region: AwsRegion,
            sdkHttpClientSupplier: () -> SdkHttpClient
        ): AwsCredentialsProvider = credentialsMapping.getValue(providerId.id).getValue(region)

        private fun createCredentialIdentifier(providerId: String): TestCredentialProviderIdentifier = TestCredentialProviderIdentifier(providerId, id)

        fun updateCredentials(providerId: String, credentials: Map<AwsRegion, AwsCredentialsProvider>) {
            credentialsMapping[providerId] = credentials.toMutableMap()
            callback(
                CredentialsChangeEvent(
                    emptyList(),
                    listOf(createCredentialIdentifier(providerId)),
                    emptyList()
                )
            )
        }

        fun removeCredentials(providerId: String) {
            credentialsMapping.remove(providerId)
            callback(
                CredentialsChangeEvent(
                    emptyList(),
                    emptyList(),
                    listOf(createCredentialIdentifier(providerId))
                )
            )
        }
    }

    private class TestCredentialProviderIdentifier(override val id: String, override val factoryId: String) : ToolkitCredentialsIdentifier() {
        override val displayName: String = "$factoryId:$id"
    }
}
