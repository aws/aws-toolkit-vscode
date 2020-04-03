// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SimpleModificationTracker
import com.intellij.util.messages.MessageBus
import com.intellij.util.messages.Topic
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsIdentifier
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import java.util.concurrent.ConcurrentHashMap

abstract class CredentialManager : SimpleModificationTracker() {
    private val providerIds = ConcurrentHashMap<String, ToolkitCredentialsIdentifier>()
    private val awsCredentialProviderCache = ConcurrentHashMap<ToolkitCredentialsIdentifier, ConcurrentHashMap<String, AwsCredentialsProvider>>()

    protected abstract fun factoryMapping(): Map<String, CredentialProviderFactory>

    @Throws(CredentialProviderNotFoundException::class)
    fun getAwsCredentialProvider(providerId: ToolkitCredentialsIdentifier, region: AwsRegion): ToolkitCredentialsProvider =
        ToolkitCredentialsProvider(providerId, AwsCredentialProviderProxy(providerId, region))

    fun getCredentialIdentifiers(): List<ToolkitCredentialsIdentifier> = providerIds.values
        .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.displayName })

    fun getCredentialIdentifierById(id: String): ToolkitCredentialsIdentifier? = providerIds[id]

    // TODO: Convert these to bulk listeners so we only send N messages where N is # of extensions vs # of providers
    protected fun addProvider(identifier: ToolkitCredentialsIdentifier) {
        providerIds[identifier.id] = identifier

        incModificationCount()
        ApplicationManager.getApplication().messageBus.syncPublisher(CREDENTIALS_CHANGED).providerAdded(identifier)
    }

    protected fun modifyProvider(identifier: ToolkitCredentialsIdentifier) {
        awsCredentialProviderCache.remove(identifier)

        incModificationCount()
        ApplicationManager.getApplication().messageBus.syncPublisher(CREDENTIALS_CHANGED).providerModified(identifier)
    }

    protected fun removeProvider(identifier: ToolkitCredentialsIdentifier) {
        providerIds.remove(identifier.id)
        awsCredentialProviderCache.remove(identifier)

        incModificationCount()
        ApplicationManager.getApplication().messageBus.syncPublisher(CREDENTIALS_CHANGED).providerRemoved(identifier)
    }

    /**
     * Inner class that lazy-ily requests the true AwsCredentialsProvider from the factory when needed. This acts as a middle man that allows for existing
     * ToolkitCredentialsProvider (like ones passed to existing SDK clients), to keep operating even if the credentials they represent have been updated such
     * as loading from disk when new values.
     */
    private inner class AwsCredentialProviderProxy(private val providerId: ToolkitCredentialsIdentifier, private val region: AwsRegion) :
        AwsCredentialsProvider {
        override fun resolveCredentials(): AwsCredentials = getOrCreateAwsCredentialsProvider(providerId, region).resolveCredentials()

        private fun getOrCreateAwsCredentialsProvider(providerId: ToolkitCredentialsIdentifier, region: AwsRegion): AwsCredentialsProvider {
            val partitionCache = awsCredentialProviderCache.computeIfAbsent(providerId) { ConcurrentHashMap() }

            // If we already resolved creds for this partition and provider ID, just return it
            return partitionCache.computeIfAbsent(region.partitionId) {
                val providerFactory = factoryMapping()[providerId.factoryId]
                    ?: throw CredentialProviderNotFoundException("No provider found with ID ${providerId.id}")

                try {
                    providerFactory.createAwsCredentialProvider(providerId, region) { AwsSdkClient.getInstance().sdkHttpClient }
                } catch (e: Exception) {
                    throw CredentialProviderNotFoundException("Failed to create underlying AwsCredentialProvider", e)
                }
            }
        }
    }

    companion object {
        @JvmStatic
        fun getInstance(): CredentialManager = ServiceManager.getService(CredentialManager::class.java)

        /***
         * [MessageBus] topic for when credential providers get added/changed/deleted
         */
        val CREDENTIALS_CHANGED: Topic<ToolkitCredentialsChangeListener> = Topic.create(
            "AWS toolkit credential providers changed",
            ToolkitCredentialsChangeListener::class.java
        )
    }
}

class DefaultCredentialManager : CredentialManager() {
    private val rootDisposable = Disposer.newDisposable()

    private val extensionMap: Map<String, CredentialProviderFactory> by lazy {
        EP_NAME.extensionList
            .onEach {
                if (it is Disposable) {
                    Disposer.register(rootDisposable, it)
                }
            }.associateBy {
                it.id
            }
    }

    init {
        Disposer.register(ApplicationManager.getApplication(), rootDisposable)

        extensionMap.values.forEach { providerFactory ->
            LOG.tryOrNull("Failed to set up $providerFactory") {
                providerFactory.setUp { change ->
                    change.added.forEach {
                        addProvider(it)
                    }

                    change.modified.forEach {
                        modifyProvider(it)
                    }

                    change.removed.forEach {
                        removeProvider(it)
                    }
                }
            }
        }
    }

    override fun factoryMapping(): Map<String, CredentialProviderFactory> = extensionMap

    companion object {
        val EP_NAME = ExtensionPointName.create<CredentialProviderFactory>("aws.toolkit.credentialProviderFactory")
        private val LOG = getLogger<DefaultCredentialManager>()
    }
}

fun AwsCredentials.toEnvironmentVariables(): Map<String, String> {
    val map = mutableMapOf<String, String>()
    map["AWS_ACCESS_KEY"] = this.accessKeyId()
    map["AWS_ACCESS_KEY_ID"] = this.accessKeyId()
    map["AWS_SECRET_KEY"] = this.secretAccessKey()
    map["AWS_SECRET_ACCESS_KEY"] = this.secretAccessKey()

    if (this is AwsSessionCredentials) {
        map["AWS_SESSION_TOKEN"] = this.sessionToken()
        map["AWS_SECURITY_TOKEN"] = this.sessionToken()
    }

    return map
}
