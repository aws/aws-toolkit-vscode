package software.aws.toolkits.jetbrains.credentials

import com.amazonaws.auth.AWSCredentialsProvider
import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.util.KeyedExtensionCollector
import com.intellij.util.KeyedLazyInstance
import org.jdom.Element
import software.aws.toolkits.jetbrains.ui.credentials.ProfileNameEditor
import javax.swing.JComponent

/**
 * Component responsible for holding the current settings, constructing the UI for modifying the settings,
 * and creating the actual AWSCredentialsProvider for the SDK.
 */
abstract class CredentialProfile {
    /**
     * Construct the AWS Credential Provider from the stored settings
     */
    abstract val awsCredentials: AWSCredentialsProvider

    /**
     * Name of the profile assigned by the user
     */
    lateinit var name: String

    /**
     * Internal ID used to identify the of credential profile factory, must match [CredentialProfileFactory.getKey]
     */
    abstract val id: String

    /**
     * Called by the [AwsCredentialsProfileProvider] to save the credential metadata, secret data should NOT be
     * written to any part of the passed in Element.
     */
    open fun save(project: Project, element: Element) {}

    /**
     * Called by the AwsCredentialsProfileProvider when it is loading its settings from disk
     */
    open fun load(project: Project, element: Element) {}

    override fun toString(): String {
        return "${javaClass.simpleName}($name)"
    }
}

abstract class ProfileEditor<out T : CredentialProfile>(name: String = "") {
    val profileNameEditor = ProfileNameEditor(name)

    abstract val editorComponent: JComponent

    fun validateEditor(): ValidationInfo? {
        return null
    }

    abstract fun commit(): T
}

/**
 * Factory to create a new CredentialProfile whenever we need to construct a blank one. This is the factory that
 * should be implemented and registered when a plugin wishes to add a new credential provider option.
 */
abstract class CredentialProfileFactory<T : CredentialProfile> : KeyedLazyInstance<CredentialProfileFactory<T>> {
    abstract override fun getKey(): String

    override fun getInstance(): CredentialProfileFactory<T> {
        return this
    }

    abstract fun createProvider(): T

    abstract val description: String

    abstract fun configurationComponent(): ProfileEditor<T>

    abstract fun configurationComponent(source: CredentialProfile): ProfileEditor<T>

    companion object {
        val EP_NAME =
                ExtensionPointName.create<CredentialProfileFactory<out CredentialProfile>>("aws.toolkit.credentialProviderFactory")
        private val COLLECTOR =
                KeyedExtensionCollector<CredentialProfileFactory<out CredentialProfile>, String>(EP_NAME.name)

        @JvmStatic
        fun credentialProviderTypes(): Array<CredentialProfileFactory<out CredentialProfile>> {
            return EP_NAME.extensions
        }

        @JvmStatic
        fun factoryFor(id: String): CredentialProfileFactory<out CredentialProfile>? {
            return COLLECTOR.findSingle(id)
        }
    }
}