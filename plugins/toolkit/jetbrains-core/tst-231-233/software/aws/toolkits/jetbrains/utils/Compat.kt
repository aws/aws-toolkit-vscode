// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.runInEdtAndWait
import org.jetbrains.idea.maven.model.MavenExplicitProfiles
import org.jetbrains.idea.maven.project.MavenProjectsManager

@Suppress("UNUSED_PARAMETER", "RedundantSuspendModifier")
suspend fun MavenProjectsManager.addManagedFilesWithProfiles(
    poms: List<VirtualFile>,
    profiles: MavenExplicitProfiles,
    nothing: Nothing?,
    nothing1: Nothing?,
    nothing3: Boolean
) {
    resetManagedFilesAndProfilesInTests(poms, profiles)
    runInEdtAndWait {
        waitForReadingCompletion()
    }
}
