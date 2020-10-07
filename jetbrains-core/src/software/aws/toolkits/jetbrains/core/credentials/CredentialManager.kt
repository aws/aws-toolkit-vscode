// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.util.SimpleModificationTracker
import com.intellij.util.messages.MessageBus
import com.intellij.util.messages.Topic
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.credentials.CredentialProviderFactory
import software.aws.toolkits.core.credentials.CredentialProviderNotFoundException
import software.aws.toolkits.core.credentials.ToolkitCredentialsChangeListener
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsSdkClient
import software.aws.toolkits.telemetry.AwsTelemetry
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

abstract class CredentialManager : SimpleModificationTracker() {
    private val providerIds = ConcurrentHashMap<String, CredentialIdentifier>()
    private val awsCredentialProviderCache = ConcurrentHashMap<String, ConcurrentHashMap<String, AwsCredentialsProvider>>()

    protected abstract fun factoryMapping(): Map<String, CredentialProviderFactory>

    @Throws(CredentialProviderNotFoundException::class)
    fun getAwsCredentialProvider(providerId: CredentialIdentifier, region: AwsRegion): ToolkitCredentialsProvider =
        ToolkitCredentialsProvider(providerId, AwsCredentialProviderProxy(providerId.id, region))

    fun getCredentialIdentifiers(): List<CredentialIdentifier> = providerIds.values
        .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.displayName })

    fun getCredentialIdentifierById(id: String): CredentialIdentifier? = providerIds[id]

    // TODO: Convert these to bulk listeners so we only send N messages where N is # of extensions vs # of providers
    protected fun addProvider(identifier: CredentialIdentifier) {
        providerIds[identifier.id] = identifier

        incModificationCount()
        ApplicationManager.getApplication().messageBus.syncPublisher(CREDENTIALS_CHANGED).providerAdded(identifier)
    }

    protected fun modifyProvider(identifier: CredentialIdentifier) {
        awsCredentialProviderCache.remove(identifier.id)
        providerIds[identifier.id] = identifier

        incModificationCount()
        ApplicationManager.getApplication().messageBus.syncPublisher(CREDENTIALS_CHANGED).providerModified(identifier)
    }

    protected fun removeProvider(identifier: CredentialIdentifier) {
        providerIds.remove(identifier.id)
        awsCredentialProviderCache.remove(identifier.id)

        incModificationCount()
        ApplicationManager.getApplication().messageBus.syncPublisher(CREDENTIALS_CHANGED).providerRemoved(identifier)
    }

    /**
     * Inner class that lazy-ily requests the true AwsCredentialsProvider from the factory when needed. This acts as a middle man that allows for existing
     * ToolkitCredentialsProvider (like ones passed to existing SDK clients), to keep operating even if the credentials they represent have been updated such
     * as loading from disk when new values.
     */
    private inner class AwsCredentialProviderProxy(private val providerId: String, private val region: AwsRegion) : AwsCredentialsProvider {
        override fun resolveCredentials(): AwsCredentials = getOrCreateAwsCredentialsProvider(providerId, region).resolveCredentials()

        private fun getOrCreateAwsCredentialsProvider(providerId: String, region: AwsRegion): AwsCredentialsProvider {
            // Validate that the provider ID is still valid and get the latest copy
            val identifier = providerIds[providerId]
                ?: throw CredentialProviderNotFoundException("Provider ID $providerId was removed, can't resolve credentials")

            val partitionCache = awsCredentialProviderCache.computeIfAbsent(providerId) { ConcurrentHashMap() }

            // If we already resolved creds for this partition and provider ID, just return it, else compute new one
            return partitionCache.computeIfAbsent(region.partitionId) {
                val providerFactory = factoryMapping()[identifier.factoryId]
                    ?: throw CredentialProviderNotFoundException("No provider factory found with ID ${identifier.factoryId}")

                try {
                    providerFactory.createAwsCredentialProvider(identifier, region) { AwsSdkClient.getInstance().sdkHttpClient }
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
    private val extensionMap: Map<String, CredentialProviderFactory> by lazy {
        EP_NAME.extensionList.associateBy {
            it.id
        }
    }

    init {
        extensionMap.values.forEach { providerFactory ->
            val count = AtomicInteger(0)
            LOG.tryOrNull("Failed to set up $providerFactory") {
                providerFactory.setUp { change ->
                    change.added.forEach {
                        addProvider(it)
                        count.incrementAndGet()
                    }

                    change.modified.forEach {
                        modifyProvider(it)
                    }

                    change.removed.forEach {
                        removeProvider(it)
                        count.decrementAndGet()
                    }
                    AwsTelemetry.loadCredentials(credentialSourceId = providerFactory.id, value = count.get().toDouble())
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
