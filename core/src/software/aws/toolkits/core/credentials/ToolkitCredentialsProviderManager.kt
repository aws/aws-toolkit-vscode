// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials

import org.slf4j.LoggerFactory
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.core.utils.warn
import java.util.concurrent.ConcurrentHashMap

interface ToolkitCredentialsChangeListener {
    fun providerAdded(provider: ToolkitCredentialsProvider) {}
    fun providerModified(provider: ToolkitCredentialsProvider) {}
    fun providerRemoved(providerId: String) {}
}

interface ToolkitCredentialsProviderManager : ToolkitCredentialsChangeListener {
    @Throws(CredentialProviderNotFound::class)
    fun getCredentialProvider(id: String): ToolkitCredentialsProvider

    /**
     * Returns a list of all the registered providers. This list should never change for the life of the toolkit
     */
    fun getCredentialProviders(): List<ToolkitCredentialsProvider>

    fun addChangeListener(listener: ToolkitCredentialsChangeListener)

    fun removeChangeListener(listener: ToolkitCredentialsChangeListener)

    /**
     * Shuts down the manager and all registered factories
     */
    fun shutDown()
}

class DefaultToolkitCredentialsProviderManager(registry: ToolkitCredentialsProviderRegistry) :
    ToolkitCredentialsProviderManager {
    private val listeners = ConcurrentHashMap.newKeySet<ToolkitCredentialsChangeListener>()
    private val factories = mutableListOf<ToolkitCredentialsProviderFactory<*>>()

    init {
        reloadFactories(registry)
    }

    @Throws(CredentialProviderNotFound::class)
    override fun getCredentialProvider(id: String): ToolkitCredentialsProvider = factories.asSequence().mapNotNull { it.get(id) }.firstOrNull()
        ?: throw CredentialProviderNotFound("No ToolkitCredentialsProvider found represented by $id")

    override fun getCredentialProviders(): List<ToolkitCredentialsProvider> = factories.flatMap { it.listCredentialProviders() }.toList()

    override fun addChangeListener(listener: ToolkitCredentialsChangeListener) {
        listeners.add(listener)
    }

    override fun removeChangeListener(listener: ToolkitCredentialsChangeListener) {
        listeners.remove(listener)
    }

    override fun providerAdded(provider: ToolkitCredentialsProvider) {
        listeners.forEach {
            LOG.tryOrNull("Failed to notify listener that provider was added") {
                it.providerAdded(provider)
            }
        }
    }

    override fun providerModified(provider: ToolkitCredentialsProvider) {
        listeners.forEach {
            LOG.tryOrNull("Failed to notify listener that provider was modified") {
                it.providerModified(provider)
            }
        }
    }

    override fun providerRemoved(providerId: String) {
        listeners.forEach {
            LOG.tryOrNull("Failed to notify listener that provider was removed") {
                it.providerRemoved(providerId)
            }
        }
    }

    fun reloadFactories(registry: ToolkitCredentialsProviderRegistry) {
        factories.clear()
        factories.addAll(registry.listFactories(this))
    }

    /**
     * Shuts down the manager and all registered factories
     */
    override fun shutDown() {
        factories.forEach {
            try {
                it.shutDown()
            } catch (e: Exception) {
                LOG.warn(e) { "ToolkitCredentialsProviderFactory '${it::class.qualifiedName}' threw exception when shutting down" }
            }
        }
    }

    companion object {
        private val LOG = LoggerFactory.getLogger(ToolkitCredentialsProviderManager::class.java)
    }
}

class CredentialProviderNotFound(msg: String) : RuntimeException(msg)
