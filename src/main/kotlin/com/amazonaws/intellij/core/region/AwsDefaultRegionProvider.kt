package com.amazonaws.intellij.core.region

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.project.Project

/**
 * Created by zhaoxiz on 7/21/17.
 */
@State(name = "AwsDefaultRegionProvider", storages = arrayOf(Storage("aws.xml")))
class AwsDefaultRegionProvider():
        PersistentStateComponent<AwsDefaultRegionProvider.RegionState> {

    data class RegionState(var currentRegion: String? = AwsRegionManager.defaultRegion.id)
    private var regionState: RegionState = RegionState()
    var currentRegion: AwsRegion
        get() = AwsRegionManager.lookupRegionById(regionState.currentRegion?: AwsRegionManager.defaultRegion.id)
        set(value) { regionState.currentRegion = value.id }

    override fun loadState(regionState: RegionState) {
        this.regionState.currentRegion = regionState.currentRegion
    }

    override fun getState(): RegionState {
        return regionState
    }

    companion object {
        @JvmStatic
        fun getInstance(project: Project): AwsDefaultRegionProvider {
            return ServiceManager.getService(project, AwsDefaultRegionProvider::class.java)
        }
    }
}