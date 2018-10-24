// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.extensions.AbstractExtensionPointBean
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.util.LazyInstance
import com.intellij.util.xmlb.annotations.Attribute
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderFactory
import software.aws.toolkits.core.credentials.ToolkitCredentialsProviderRegistry

/**
 * Extension point for adding new credential providers to the internal registry
 */
interface CredentialProviderFactory {
    /**
     * Creates the [ToolkitCredentialsProviderFactory], this should return the same instance each time
     */
    fun createToolkitCredentialProviderFactory(): ToolkitCredentialsProviderFactory
}

class CredentialProviderFactoryEP : AbstractExtensionPointBean() {
    @Attribute("implementation")
    lateinit var implementation: String

    private val instance = object : LazyInstance<CredentialProviderFactory>() {
        override fun getInstanceClass(): Class<CredentialProviderFactory> = findClass(implementation)
    }

    fun getHandler(): CredentialProviderFactory = instance.value
}

class ExtensionPointCredentialsProviderRegistry : ToolkitCredentialsProviderRegistry {
    override fun listFactories(): Collection<ToolkitCredentialsProviderFactory> = EXTENSION_POINT.extensions
        .mapNotNull {
            try {
                it.getHandler()
            } catch (e: Exception) {
                LOG.error(e)
                null
            }
        }
        .map { it.createToolkitCredentialProviderFactory() }

    companion object {
        private val LOG = Logger.getInstance(ExtensionPointCredentialsProviderRegistry::class.java)
        private const val EP_NAME = "aws.toolkit.credentialProviderFactory"
        val EXTENSION_POINT = ExtensionPointName.create<CredentialProviderFactoryEP>(EP_NAME)
    }
}