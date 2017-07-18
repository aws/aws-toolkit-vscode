package com.amazonaws.intellij.credentials

import com.amazonaws.auth.profile.ProfilesConfigFile
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import com.intellij.util.xmlb.Accessor
import com.intellij.util.xmlb.SkipDefaultValuesSerializationFilters
import com.intellij.util.xmlb.XmlSerializer
import org.jdom.Element
import org.jetbrains.annotations.NotNull
import org.jetbrains.jps.model.serialization.PathMacroUtil
import java.io.File
import java.nio.file.Paths

@State(name = "credentialProfiles", storages = arrayOf(Storage("aws.xml")))
class AWSCredentialsProfileProvider(private val project: Project) : PersistentStateComponent<Element> {
    private val state = State()
    val credentialProfiles = loadFromCredentialProfile(File(state.credentialFileLocation));

    private data class State(
            var credentialFileLocation: String? = defaultCredentialLocation(),
            var selectedProfileName: String? = null
    )

    var credentialFileLocation: String?
        get() = state.credentialFileLocation
        set(value) { state.credentialFileLocation = value }

    var selectedProfile: CredentialProfile?
        get() = credentialProfiles[state.credentialFileLocation]
        set(value) { state.selectedProfileName = value?.name }

    override fun getState(): Element {
        val serializedState = Element("state")
        XmlSerializer.serializeInto(state, serializedState, object : SkipDefaultValuesSerializationFilters() {
            override fun accepts(accessor: Accessor, bean: Any): Boolean {
                return super.accepts(accessor, bean)
            }
        })

        val serializedProfiles = Element("profiles")
        serializedState.addContent(serializedProfiles)
        return serializedState
    }

    private fun serializeProfiles(credentialProvider: CredentialProfile): Element {
        val serializedCredentialProfile = Element("credentialProfile")
        serializedCredentialProfile.setAttribute("name", credentialProvider.name)
        serializedCredentialProfile.setAttribute("id", credentialProvider.id)

        credentialProvider.save(project, serializedCredentialProfile);

        return serializedCredentialProfile;
    }

    override fun loadState(serializedState: Element?) {
//        credentialProfiles = loadCredentialProvider(serializedState)
    }
//
//    private fun loadCredentialProvider(serializedState: Element?): CredentialProfile {
//        val credentialOptions = serializedState?.get(CREDENTIAL_OPTIONS)
//        val credentialProviderId = credentialOptions?.getAttribute("description")?.value
//        var provider: CredentialProfile?;
//        if (StringUtil.isNotEmpty(credentialProviderId)) {
//            provider = CredentialProfileFactory.credentialProvider(credentialProviderId!!)
//            if (provider == null) {
//                // The ID of the provider no longer is registered, reset to default
//                provider = DefaultChainCredentialProvider()
//            } else {
//                provider.load(credentialOptions)
//            }
//        } else {
//            provider = DefaultChainCredentialProvider();
//        }
//
//        return provider
//    }


    companion object {
        //TODO: The SDK has its credential locators as internal and returns null instead of the File so if it is a brand new
        // install we won't know where to put them.
        private fun defaultCredentialLocation(): String {
            return Paths.get(PathMacroUtil.getUserHomePath(), ".aws", "credentials").toString()
        }

        @JvmStatic
        fun getInstance(project: Project): AWSCredentialsProfileProvider {
            return ServiceManager.getService(project, AWSCredentialsProfileProvider::class.java)
        }

        @JvmStatic
        fun loadFromCredentialProfile(fileLocation: File): Map<String, CredentialProfile> {
            val profilesConfigFile = ProfilesConfigFile(fileLocation)
            profilesConfigFile.refresh()

            return profilesConfigFile.allBasicProfiles.mapValues { CredentialFileBasedProfile(it.value) }
        }
    }
}