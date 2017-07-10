package com.amazonaws.intellij.options

import com.amazonaws.intellij.credentials.CredentialProvider
import com.amazonaws.intellij.credentials.CredentialProviderFactory
import com.amazonaws.intellij.credentials.DefaultChainCredentialProvider
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.text.StringUtil
import com.intellij.util.get
import org.jdom.Element

@State(name = "AWSOptionsProvider", storages = arrayOf(Storage("aws.xml")))
class AWSOptionsProvider : PersistentStateComponent<Element> {
    private val CREDENTIAL_OPTIONS = "credentialProvider"

    // Stored outside of state since it is serialized specially to handle the extensions correctly
    var credentialProvider: CredentialProvider = DefaultChainCredentialProvider()

    override fun getState(): Element {
        val credentialOptions = Element(CREDENTIAL_OPTIONS)
                .setAttribute("id", credentialProvider.id)
        credentialProvider.save(credentialOptions)

        val serializedState = Element("state");
        serializedState.addContent(credentialOptions);
        return serializedState
    }

    override fun loadState(serializedState: Element?) {
        credentialProvider = loadCredentialProvider(serializedState)
    }

    private fun loadCredentialProvider(serializedState: Element?): CredentialProvider {
        val credentialOptions = serializedState?.get(CREDENTIAL_OPTIONS)
        val credentialProviderId = credentialOptions?.getAttribute("id")?.value
        var provider: CredentialProvider?;
        if (StringUtil.isNotEmpty(credentialProviderId)) {
            provider = CredentialProviderFactory.credentialProvider(credentialProviderId!!)
            if (provider == null) {
                // The ID of the provider no longer is registered, reset to default
                provider = DefaultChainCredentialProvider()
            } else {
                provider.load(credentialOptions)
            }
        } else {
            provider = DefaultChainCredentialProvider();
        }

        return provider
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): AWSOptionsProvider {
            return ServiceManager.getService(project, AWSOptionsProvider::class.java)
        }
    }
}