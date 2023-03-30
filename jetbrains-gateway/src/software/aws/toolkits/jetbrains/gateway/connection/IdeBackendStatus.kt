// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.connection

import com.intellij.remoteDev.hostStatus.UnattendedHostStatus

sealed class IdeBackendStatus {
    class BackendRunning(val hostStatus: UnattendedHostStatus, private val projectIdx: Int) : IdeBackendStatus() {
        val projectStatus
            get() = hostStatus.projects?.get(projectIdx) ?: throw RuntimeException("Project status index is invalid")
    }
    class HostAlive(val status: UnattendedHostStatus?) : IdeBackendStatus()
    object HostNotAlive : IdeBackendStatus()
}
