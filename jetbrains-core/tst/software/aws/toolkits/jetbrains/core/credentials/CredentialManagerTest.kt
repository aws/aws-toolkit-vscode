// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProcessCanceledException
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ExtensionTestUtil
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialIdentifierBase
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.credentials.CredentialSourceId
import software.aws.toolkits.core.credentials.CredentialsChangeEvent
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.region.MockRegionProviderRule
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
import software.aws.toolkits.jetbrains.utils.computeOnEdt
import software.aws.toolkits.jetbrains.utils.isInstanceOf
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

        assertThat(credentialProvider.resolveCredentials()).isInstanceOf<AwsCredentials>()
    }

    @Test
    fun testCredentialsAreScopedToPartition() {
        val partition1 = anAwsRegion(partitionId = "part1")
        val partition1Region2 = anAwsRegion(partitionId = "part1")
        val partition2 = anAwsRegion(partitionId = "part2")

        addFactories(createTestCredentialFactory("testFactory1", listOf("testFoo1")))

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val partition1Credentials = credentialManager.getAwsCredentialProvider(credentialsIdentifier, partition1).resolveCredentials()
        val partition1Region2Credentials = credentialManager.getAwsCredentialProvider(credentialsIdentifier, partition1Region2).resolveCredentials()
        val partition2Credentials = credentialManager.getAwsCredentialProvider(credentialsIdentifier, partition2).resolveCredentials()

        assertThat(partition1Credentials).isEqualTo(partition1Region2Credentials).isNotEqualTo(partition2Credentials)
    }

    @Test
    fun testCredentialUpdatingDoesNotBreakExisting() {
        val region = getDefaultRegion()
        val originalCredentials = randomCredentialProvider()
        val credentialFactory = createTestCredentialFactory("testFactory1").apply {
            addCredentialProvider("testFoo1", originalCredentials)
        }

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)

        assertThat(credentialProvider.resolveCredentials()).isEqualTo(originalCredentials.resolveCredentials())

        val updatedCredentials = randomCredentialProvider()
        credentialFactory.updateCredentials("testFoo1", region, updatedCredentials)

        // Existing references are good
        assertThat(credentialProvider.resolveCredentials()).isEqualTo(updatedCredentials.resolveCredentials())

        // New ones are good too
        assertThat(
            credentialManager.getAwsCredentialProvider(
                credentialsIdentifier,
                region
            ).resolveCredentials()
        ).isEqualTo(updatedCredentials.resolveCredentials())
    }

    @Test
    fun testRemovedCredentialsCeaseWorkingAfter() {
        val region = getDefaultRegion()
        val credentialFactory = createTestCredentialFactory("testFactory1", listOf("testFoo1"))

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)

        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, region)
        assertThat(credentialProvider.resolveCredentials()).isInstanceOf<AwsCredentials>()

        credentialFactory.removeCredentials("testFoo1")

        // Existing references throw
        assertThatThrownBy { credentialProvider.resolveCredentials() }.isInstanceOf(CredentialProviderNotFoundException::class.java)

        // New ones fail too
        assertThatThrownBy {
            credentialManager.getAwsCredentialProvider(
                credentialsIdentifier,
                region
            ).resolveCredentials()
        }.isInstanceOf<CredentialProviderNotFoundException>()

        assertThat(credentialManager.getCredentialIdentifierById("testFoo1")).isNull()
    }

    @Test
    fun testUpdatedCredentialIdentifierIsApplied() {
        val region = getDefaultRegion()
        val credentialFactory = createTestCredentialFactory("testFactory1", listOf("testFoo1"))

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()

        assertThat(credentialManager.getCredentialIdentifierById("testFoo1")?.defaultRegionId).isEqualTo(region.id)

        val newRegion = regionProvider.addRegion(AwsRegion("test", "test", "test"))
        credentialFactory.updateCredentials("testFoo1", newRegion)

        assertThat(credentialManager.getCredentialIdentifierById("testFoo1")?.defaultRegionId).isEqualTo(newRegion.id)
    }

    @Test
    fun resolvingCredentialsRunsInBackground() {
        val credentialFactory = createTestCredentialFactory("testFactory1").apply {
            addCredentialProvider("testFoo1") {
                assertIsNonDispatchThread()
                computeOnEdt {
                    ApplicationManager.getApplication().assertIsDispatchThread()

                    AwsBasicCredentials.create(aString(), aString())
                }
            }
        }

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()
        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)
        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, getDefaultRegion())

        runInEdtAndWait {
            credentialProvider.resolveCredentials()
        }
    }

    @Test
    fun processCancellationBubblesOut() {
        val credentialFactory = createTestCredentialFactory("testFactory1").apply {
            addCredentialProvider("testFoo1") {
                throw ProcessCanceledException()
            }
        }

        addFactories(credentialFactory)

        val credentialManager = DefaultCredentialManager()
        val credentialsIdentifier = credentialManager.getCredentialIdentifierById("testFoo1")
        assertNotNull(credentialsIdentifier)
        val credentialProvider = credentialManager.getAwsCredentialProvider(credentialsIdentifier, getDefaultRegion())

        assertThatThrownBy {
            credentialProvider.resolveCredentials()
        }.isInstanceOf<ProcessCanceledException>()
    }

    private fun addFactories(vararg factories: CredentialProviderFactory) {
        ExtensionTestUtil.maskExtensions(DefaultCredentialManager.EP_NAME, factories.toList(), disposableRule.disposable)
    }

    private fun createTestCredentialFactory(id: String, initialProviderIds: List<String> = emptyList()) = TestCredentialProviderFactory(id).apply {
        initialProviderIds.forEach(this::addCredentialProvider)
    }

    private class TestCredentialProviderFactory(override val id: String) : CredentialProviderFactory {
        private val initialProviders = mutableMapOf<String, TestCredentialProviderIdentifier>()
        private val credentialsMapping = mutableMapOf<String, TestCredentialProviderIdentifier>()
        private lateinit var callback: CredentialsChangeListener

        override val credentialSourceId = CredentialSourceId.SharedCredentials

        override fun setUp(credentialLoadCallback: CredentialsChangeListener) {
            callback = credentialLoadCallback

            credentialsMapping.putAll(initialProviders)

            callback(
                CredentialsChangeEvent(
                    initialProviders.values.toList(),
                    emptyList(),
                    emptyList()
                )
            )

            initialProviders.clear()
        }

        fun addCredentialProvider(
            credentialId: String,
            awsCredentialsProvider: AwsCredentialsProvider? = null
        ) {
            val identifier = TestCredentialProviderIdentifier(credentialId, id, getDefaultRegion().id, awsCredentialsProvider)
            if (!::callback.isInitialized) {
                initialProviders[credentialId] = identifier
                return
            }

            credentialsMapping[credentialId] = identifier

            callback(
                CredentialsChangeEvent(
                    listOf(identifier),
                    emptyList(),
                    emptyList()
                )
            )
        }

        override fun createAwsCredentialProvider(providerId: CredentialIdentifier, region: AwsRegion): AwsCredentialsProvider =
            (providerId as TestCredentialProviderIdentifier).provider ?: StaticCredentialsProvider.create(AwsBasicCredentials.create(aString(), aString()))

        fun updateCredentials(providerId: String, region: AwsRegion, awsCredentialsProvider: AwsCredentialsProvider = randomCredentialProvider()) {
            val identifier = TestCredentialProviderIdentifier(providerId, id, region.id, awsCredentialsProvider)

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
        val provider: AwsCredentialsProvider?
    ) : CredentialIdentifierBase(null) {
        override val displayName: String = "$factoryId:$id"
    }

    private companion object {
        private fun randomCredentialProvider() = StaticCredentialsProvider.create(AwsBasicCredentials.create(aString(), aString()))
    }
}
