package com.amazonaws.intellij.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.intellij.ui.credentials.ProfileNameEditor
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.util.KeyedLazyInstance
import org.jdom.Element
import javax.swing.JComponent

/**
 * Component responsible for holding the current settings, constructing the UI for modifying the settings,
 * and creating the actual AWSCredentialsProvider} for the SDK.
 */
abstract class CredentialProfile {
    /**
     * Construct the AWS Credential Provider from the stored settings
     */
    abstract val awsCredentials: AWSCredentialsProvider

    /**
     * Name of the profile assigned by the user
     */
    var name: String? = null

    /**
     * Description of the type of credential profile
     */
    abstract val description: String

    /**
     * Internal ID used to identify the of credential profile factory, must match [CredentialProfileFactory.getKey]
     */
    abstract val id: String

    /**
     * Called by the AWSCredentialsProfileProvider to save the credential metadata, secret data should NOT be
     * written to any part of the passed in Element. The PasswordSafe should be used instead
     */
    abstract fun save(project: Project, element: Element)

    /**
     * Called by the AWSCredentialsProfileProvider when it is loading its settings from disk
     */
    abstract fun load(project: Project, element: Element): Unit

    override fun toString(): String {
        return "${javaClass.simpleName}($name)"
    }
}

abstract class ProfileEditor<out T : CredentialProfile>(name: String = "") {
    val profileNameEditor = ProfileNameEditor(name)

    abstract val editorComponent: JComponent

    fun validateEditor(): ValidationInfo? {
        return null;
    }

    abstract fun commit(): T
}

/**
 * Factory to create a new CredentialProfile whenever we need to construct a blank one. This is the factory that
 * should be implemented and registered when a plugin wishes to add a new credential provider option.
 */
abstract class CredentialProfileFactory<T : CredentialProfile> : KeyedLazyInstance<CredentialProfileFactory<T>> {
    override fun getInstance(): CredentialProfileFactory<T> = this

    /**
     * Create a new blank Credential Provider
     */
    abstract fun createProvider(): T

    abstract val description: String

    abstract fun configurationComponent(): ProfileEditor<T>

    abstract fun configurationComponent(source: T): ProfileEditor<T>

    companion object {
        private val EP_NAME = ExtensionPointName.create<CredentialProfileFactory<CredentialProfile>>("com.amazonaws.intellij.credentialProviderFactory")
        private val COLLECTOR = KeyedExtensionCollector<CredentialProfileFactory<CredentialProfile>, String>(EP_NAME.name)

        @JvmStatic
        fun credentialProviderTypes(): Array<CredentialProfileFactory<CredentialProfile>> {
            return EP_NAME.extensions;
        }

        @JvmStatic
        fun factoryFor(id: String): CredentialProfileFactory<CredentialProfile>? {
            return COLLECTOR.findSingle(id);
        }

        @JvmStatic
        fun credentialProvider(id: String): CredentialProfile? {
            val findSingle = COLLECTOR.findSingle(id)
            return findSingle.createProvider()
        }
    }
}