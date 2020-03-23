// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.project.Project
import com.intellij.ui.components.breadcrumbs.Crumb
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion

// TODO add actions
class LocationCrumbs(project: Project, logGroup: String, logStream: String? = null) {
    val crumbs: List<Crumb> = listOfNotNull(
        Crumb.Impl(null, project.activeCredentialProvider().displayName, null, null),
        Crumb.Impl(null, project.activeRegion().displayName, null, null),
        Crumb.Impl(null, logGroup, null, null),
        logStream?.let { Crumb.Impl(null, it, null, null) }
    )
}
