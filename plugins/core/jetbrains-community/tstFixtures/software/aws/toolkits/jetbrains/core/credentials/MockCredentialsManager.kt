// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.components.service
import com.intellij.testFramework.ApplicationRule
import org.junit.jupiter.api.extension.AfterEachCallback
import org.junit.jupiter.api.extension.ExtensionContext
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialIdentifierBase
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialSourceId
import software.aws.toolkits.core.credentials.CredentialsChangeListener
import software.aws.toolkits.core.credentials.SsoSessionIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.region.getDefaultRegion
import software.aws.toolkits.jetbrains.utils.rules.ClearableLazy

@Deprecated("Use MockCredentialManagerRule")
class MockCredentialsManager : CredentialManager() {
    init {
        reset()
    }

    @Suppress("DEPRECATION")
    fun reset() {
        getCredentialIdentifiers().filterNot { it.id == DUMMY_PROVIDER_IDENTIFIER.id }.forEach { removeProvider(it) }

        addProvider(DUMMY_PROVIDER_IDENTIFIER)
    }

    fun addCredentials(
        id: String,
        credentials: AwsCredentials = AwsBasicCredentials.create("Access", "Secret"),
        regionId: String? = null
    ): CredentialIdentifier = addCredentials(id, StaticCredentialsProvider.create(credentials), regionId)

    fun addCredentials(
        id: String,
        credentials: AwsCredentialsProvider,
        regionId: String? = null
    ): MockCredentialIdentifier = MockCredentialIdentifier(id, credentials, regionId).also {
        addProvider(it)
    }

    fun addCredentials(
        credentialIdentifier: CredentialIdentifier
    ): CredentialIdentifier {
        addProvider(credentialIdentifier)
        return credentialIdentifier
    }

    fun addSsoProvider(
        ssoSessionIdentifier: SsoSessionIdentifier
    ): SsoSessionIdentifier {
        super.addSsoSession(ssoSessionIdentifier)
        return ssoSessionIdentifier
    }

    fun createCredentialProvider(
        id: String = aString(),
        credentials: AwsCredentials,
        region: AwsRegion
    ): ToolkitCredentialsProvider {
        val credentialIdentifier = MockCredentialIdentifier(id, StaticCredentialsProvider.create(credentials), null)

        addProvider(credentialIdentifier)

        return getAwsCredentialProvider(credentialIdentifier, region)
    }

    fun removeCredentials(credentialIdentifier: CredentialIdentifier) {
        removeProvider(credentialIdentifier)
    }

    override fun factoryMapping(): Map<String, CredentialProviderFactory> =
        mapOf<String, CredentialProviderFactory>(MockCredentialProviderFactory.id to MockCredentialProviderFactory)

    companion object {
        @Suppress("DEPRECATION")
        fun getInstance(): MockCredentialsManager = service<CredentialManager>() as MockCredentialsManager
    }

    class MockCredentialIdentifier(override val displayName: String, val credentials: AwsCredentialsProvider, override val defaultRegionId: String?) :
        CredentialIdentifierBase(null) {
        override val id: String = displayName
        override val factoryId: String = "mockCredentialProviderFactory"
    }

    private object MockCredentialProviderFactory : CredentialProviderFactory {
        override val id: String = "mockCredentialProviderFactory"
        override val credentialSourceId: CredentialSourceId = CredentialSourceId.SharedCredentials

        override fun setUp(credentialLoadCallback: CredentialsChangeListener) {}

        override fun createAwsCredentialProvider(
            providerId: CredentialIdentifier,
            region: AwsRegion
        ): ToolkitCredentialsProvider = ToolkitCredentialsProvider(providerId, (providerId as MockCredentialIdentifier).credentials)
    }
}

@Suppress("DEPRECATION")
open class MockCredentialManagerRule : ApplicationRule() {
    private val lazyCredentialManager = ClearableLazy {
        MockCredentialsManager.getInstance()
    }

    private val credentialManager: MockCredentialsManager
        get() = lazyCredentialManager.value

    fun addCredentials(
        id: String = aString(),
        credentials: AwsCredentials = AwsBasicCredentials.create("Access", "Secret"),
        region: AwsRegion? = null
    ): CredentialIdentifier = credentialManager.addCredentials(id, credentials, region?.id)

    fun addCredentials(
        id: String,
        credentials: AwsCredentialsProvider,
        regionId: String? = null
    ): MockCredentialsManager.MockCredentialIdentifier = credentialManager.addCredentials(id, credentials, regionId)

    fun addCredentials(
        credentialIdentifier: CredentialIdentifier
    ): CredentialIdentifier = credentialManager.addCredentials(credentialIdentifier)

    fun addSsoProvider(
        ssoSessionIdentifier: SsoSessionIdentifier
    ): SsoSessionIdentifier = credentialManager.addSsoProvider(ssoSessionIdentifier)

    fun createCredentialProvider(
        id: String = aString(),
        credentials: AwsCredentials = AwsBasicCredentials.create("Access", "Secret"),
        // Do not store this value as we should be able to dynamically change it
        region: AwsRegion = getDefaultRegion()
    ): ToolkitCredentialsProvider = credentialManager.createCredentialProvider(id, credentials, region)

    fun getAwsCredentialProvider(providerId: CredentialIdentifier, region: AwsRegion): ToolkitCredentialsProvider =
        credentialManager.getAwsCredentialProvider(providerId, region)

    fun removeCredentials(credentialIdentifier: CredentialIdentifier) = credentialManager.removeCredentials(credentialIdentifier)

    override fun after() {
        lazyCredentialManager.ifSet {
            reset()
            lazyCredentialManager.clear()
        }
    }

    fun clear() {
        reset()
        credentialManager.removeCredentials(DUMMY_PROVIDER_IDENTIFIER)
    }

    fun reset() {
        credentialManager.reset()
    }
}

class MockCredentialManagerExtension : MockCredentialManagerRule(), AfterEachCallback {
    override fun afterEach(context: ExtensionContext) {
        after()
    }
}

@Deprecated(
    "DUMMY_PROVIDER_IDENTIFIER should not be used outside of the MockCredentialsManager, if you " +
        "need mock credentials set them up in the test instead of relying on the global one"
)
@Suppress("DEPRECATION")
val DUMMY_PROVIDER_IDENTIFIER: CredentialIdentifier = MockCredentialsManager.MockCredentialIdentifier(
    "DUMMY_CREDENTIALS",
    StaticCredentialsProvider.create(AwsBasicCredentials.create("DummyAccess", "DummySecret")),
    null
)
