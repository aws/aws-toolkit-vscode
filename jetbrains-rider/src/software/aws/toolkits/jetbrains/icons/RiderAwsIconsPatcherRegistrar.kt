// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.icons

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity

internal class RiderAwsIconsPatcherRegistrar : StartupActivity {

    override fun runActivity(project: Project) {
        RiderAwsIconsPatcher.install()
    }
}
