package com.amazonaws.intellij.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.options.UnnamedConfigurable
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.util.KeyedLazyInstance
import org.jdom.Element

/**
 * Component responsible for holding the current settings, constructing the UI for modifying the settings,
 * and creating the actual AWSCredentialsProvider} for the SDK.
 */
abstract class CredentialProvider {
    /**
     * Creates an internal unnamed configurable that will be injected into the credentials settings page
     */
    abstract val configurable: UnnamedConfigurable?

    /**
     * Construct the AWS Credential Provider from the stored settings
     */
    abstract val awsCredentials: AWSCredentialsProvider

    /**
     * Human red-able name that is used to select the provider
     */
    abstract val name: String

    /**
     * Internal ID used to identify what credential provider is in use
     */
    abstract val id: String

    /**
     * Called by the AWSOptionsProvider to save the credential metadata, secret data should NOT be
     * written to any part of the passed in Element. The PasswordSafe should be used instead
     */
    abstract fun save(element: Element): Unit

    /**
     * Called by the AWSOptionsProvider when it is loading its settings from disk
     */
    abstract fun load(element: Element): Unit

    override fun toString(): String {
        return name
    }
}

/**
 * Factory to create a new CredentialProvider whenever we need to construct a blank one. This is the factory that
 * should be implemented and registered when a plugin wishes to add a new credential provider option.
 */
abstract class CredentialProviderFactory<T : CredentialProvider> : KeyedLazyInstance<CredentialProviderFactory<T>> {
    /**
     * Create a new blank Credential Provider
     */
    abstract fun createProvider(): T

    companion object {
        private val EP_NAME = ExtensionPointName.create<CredentialProviderFactory<CredentialProvider>>("com.amazonaws.intellij.credentialProviderFactory")
        private val COLLECTOR = KeyedExtensionCollector<CredentialProviderFactory<CredentialProvider>, String>(EP_NAME.name)

        @JvmStatic
        fun credentialProviderTypes(): Array<CredentialProviderFactory<CredentialProvider>> {
            return EP_NAME.extensions;
        }

        @JvmStatic
        fun credentialProvider(id: String): CredentialProvider? {
            val findSingle = COLLECTOR.findSingle(id)
            return findSingle.createProvider()
        }
    }
}