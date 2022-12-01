// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import software.aws.toolkits.jetbrains.gateway.SourceRepository
import software.aws.toolkits.jetbrains.gateway.Workspace
import software.aws.toolkits.jetbrains.services.caws.CawsProject

interface WorkspaceList {
    fun workspaces(): Map<CawsProject, List<Workspace>>
    fun codeRepos(): Map<CawsProject, List<SourceRepository>>
    fun removeWorkspace(ws: Workspace)
    fun markWorkspaceAsDirty(ws: Workspace)

    fun addChangeListener(listener: Runnable)
}
