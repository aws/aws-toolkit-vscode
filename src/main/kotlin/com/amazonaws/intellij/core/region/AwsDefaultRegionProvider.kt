package com.amazonaws.intellij.core.region

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project
import com.intellij.util.xmlb.XmlSerializerUtil

/**
 * Created by zhaoxiz on 7/21/17.
 */
@State(name = "AwsDefaultRegionProvider", storages = arrayOf(Storage("aws.xml")))
class AwsDefaultRegionProvider():
        PersistentStateComponent<AwsDefaultRegionProvider> {

    var currentRegion: String = DEFAULT_REGION
        get() = field ?: DEFAULT_REGION

    override fun loadState(state: AwsDefaultRegionProvider) {
        XmlSerializerUtil.copyBean(state, this)
    }

    override fun getState(): AwsDefaultRegionProvider {
        return this
    }

    companion object {

        private const val DEFAULT_REGION = "us-west-2"
        @JvmStatic
        fun getInstance(project: Project): AwsDefaultRegionProvider {
            return ServiceManager.getService(project, AwsDefaultRegionProvider::class.java)
        }
    }
}