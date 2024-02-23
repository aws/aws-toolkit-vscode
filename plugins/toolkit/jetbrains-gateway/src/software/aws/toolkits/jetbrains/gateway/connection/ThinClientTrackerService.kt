// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.openapi.application.ApplicationManager
import com.jetbrains.gateway.api.GatewayConnectionHandle
import com.jetbrains.gateway.thinClientLink.ThinClientHandle
import java.lang.ref.WeakReference

class ThinClientTrackerService {
    private val handles = mutableMapOf<String, Pair<WeakReference<GatewayConnectionHandle>, WeakReference<ThinClientHandle>>>()

    fun associate(envId: String, connector: () -> Pair<GatewayConnectionHandle, ThinClientHandle>): ThinClientHandle =
        synchronized(handles) {
            connector().let { (gateway, thinClient) ->
                handles[envId] = WeakReference(gateway) to WeakReference(thinClient)
                return@let thinClient
            }
        }

    fun terminateIfRunning(envId: String) = synchronized(handles) {
        handles[envId]?.also {
            val (gateway, thinClient) = it
            gateway.get()?.terminate()
            thinClient.get()?.close()
        }
    }

    fun closeThinClient(envId: String) = synchronized(handles) {
        handles[envId]?.second?.get()?.close()
    }

    companion object {
        fun getInstance() = ApplicationManager.getApplication().getService(ThinClientTrackerService::class.java)
    }
}
