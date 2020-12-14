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
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialIdentifierBase
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import kotlin.test.assertNotNull

class CredentialManagerTest {
    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val application = ApplicationRule()

    @Rule
    @JvmField
    val regionProvider = MockRegionProviderRule()

    @Test
    fun testCredentialsCanLoadFromExtensions() {
        val region = getDefaultRegion()

        addFactories(
            createTestCredentialFactory(
                "testFactory1",
                listOf("testFoo1", "testBar1")
            ),
            createTestCredentialFactory(
                "testFactory2",
                listOf("testFoo2", "testBar2")
            )
        )

        val credentialManager = DefaultCredentialManager()

        assertThat(credentialManager.getCredentialIdentifiers().map { it.id }).contains("testFoo1", "testFoo2", "testBar1", "testBar2")

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo2")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo2-aws-Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo2-aws-Secret")
        }
    }

    @Test
    fun testCredentialsAreScopedToPartition() {
        val partition1 = AwsRegion("test-1", "Test-1", "aws-test-1")
        val partition2 = AwsRegion("test-1", "Test-1", "aws-test-2")

        addFactories(
            createTestCredentialFactory(
                "testFactory1",
                listOf("testFoo1")
            )
        )

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, partition1)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1-aws-test-1-Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1-aws-test-1-Secret")
        }

        val credentialProvider2 = credentialManager.getAwsCredentialProvider(credentialsIdentifier, partition2)

        assertThat(credentialProvider2.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1-aws-test-2-Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1-aws-test-2-Secret")
        }
    }

    @Test
    fun testCredentialUpdatingDoesNotBreakExisting() {
        val region = getDefaultRegion()
        val credentialFactory = createTestCredentialFactory(
            "testFactory1",
            listOf("testFoo1")
        )

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1-aws-Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1-aws-Secret")
        }

        credentialFactory.updateCredentials("testFoo1", region, "Updated")

        // Existing references are good
        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1-aws-Access-Updated")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1-aws-Secret-Updated")
        }

        // New ones are good too
        assertThat(
            credentialManager.getAwsCredentialProvider(
                credentialsIdentifier,
                region
            ).resolveCredentials()
        ).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1-aws-Access-Updated")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1-aws-Secret-Updated")
        }
    }

    @Test
    fun testRemovedCredentialsCeaseWorkingAfter() {
        val region = getDefaultRegion()
        val credentialFactory = createTestCredentialFactory(
            "testFactory1",
            listOf("testFoo1")
        )

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)

        assertThat(credentialProvider.resolveCredentials()).isInstanceOfSatisfying(AwsBasicCredentials::class.java) {
            assertThat(it.accessKeyId()).isEqualTo("testFoo1-aws-Access")
            assertThat(it.secretAccessKey()).isEqualTo("testFoo1-aws-Secret")
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

        assertThat(credentialManager.getCredentialIdentifierById("testFoo1")).isNull()
    }

    @Test
    fun testUpdatedCredentialIdentifierIsApplied() {
        val region = getDefaultRegion()
        val credentialFactory = createTestCredentialFactory(
            "testFactory1",
            listOf("testFoo1")
        )

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        assertThat(credentialManager.getCredentialIdentifierById("testFoo1")?.defaultRegionId).isEqualTo(region.id)

        val newRegion = regionProvider.addRegion(AwsRegion("test", "test", "test"))

        credentialFactory.updateCredentials(
            "testFoo1",
            newRegion
        )

        assertThat(credentialManager.getCredentialIdentifierById("testFoo1")?.defaultRegionId).isEqualTo(newRegion.id)
    }

    private fun addFactories(vararg factories: CredentialProviderFactory) {
        ExtensionTestUtil.maskExtensions(DefaultCredentialManager.EP_NAME, factories.toList(), disposableRule.disposable)
    }

    private fun createTestCredentialFactory(
        id: String,
        initialProviderIds: List<String>
    ): TestCredentialProviderFactory = TestCredentialProviderFactory(id, initialProviderIds)

    private class TestCredentialProviderFactory(
        override val id: String,
        private val initialProviderIds: List<String>
    ) : CredentialProviderFactory {
        private val credentialsMapping = mutableMapOf<String, TestCredentialProviderIdentifier>()
        private lateinit var callback: CredentialsChangeListener

        override fun setUp(credentialLoadCallback: CredentialsChangeListener) {
            callback = credentialLoadCallback

            initialProviderIds.forEach {
                credentialsMapping[it] = TestCredentialProviderIdentifier(it, id, getDefaultRegion().id)
            }

            callback(
                CredentialsChangeEvent(
                    credentialsMapping.values.toList(),
                    emptyList(),
                    emptyList()
                )
            )
        }

        override fun createAwsCredentialProvider(
            providerId: CredentialIdentifier,
            region: AwsRegion,
            sdkHttpClientSupplier: () -> SdkHttpClient
        ): AwsCredentialsProvider {
            val echoField = (providerId as TestCredentialProviderIdentifier).credentialsEchoField
            val echoSuffix = echoField?.let { "-$it" } ?: ""

            return StaticCredentialsProvider.create(
                AwsBasicCredentials.create(
                    "${providerId.id}-${region.partitionId}-Access$echoSuffix",
                    "${providerId.id}-${region.partitionId}-Secret$echoSuffix"
                )
            )
        }

        fun updateCredentials(providerId: String, region: AwsRegion, echoField: String? = null) {
            val identifier = TestCredentialProviderIdentifier(providerId, id, region.id, echoField)

            credentialsMapping[providerId] = identifier

            callback(
                CredentialsChangeEvent(
                    emptyList(),
                    listOf(identifier),
                    emptyList()
                )
            )
        }

        fun removeCredentials(providerId: String) {
            callback(
                CredentialsChangeEvent(
                    emptyList(),
                    emptyList(),
                    listOf(credentialsMapping.remove(providerId)!!)
                )
            )
        }
    }

    private class TestCredentialProviderIdentifier(
        override val id: String,
        override val factoryId: String,
        override val defaultRegionId: String,
        val credentialsEchoField: String? = null
    ) : CredentialIdentifierBase(null) {
        override val displayName: String = "$factoryId:$id"
    }
}
