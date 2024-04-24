// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.toolwindow

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppFactory

class AppSource {
    private val extensionPointName = ExtensionPointName.create<AmazonQAppFactory>("amazon.q.appFactory")
    fun getApps(project: Project) = buildList {
        extensionPointName.forEachExtensionSafe {
            add(it.createApp(project))
        }
    }
}
