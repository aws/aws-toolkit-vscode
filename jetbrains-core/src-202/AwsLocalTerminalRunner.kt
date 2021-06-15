// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.terminal

import com.intellij.openapi.project.Project
import org.jetbrains.plugins.terminal.LocalTerminalDirectRunner

@Suppress("UnstableApiUsage") // TODO Remove after 2020.3 FIX_WHEN_MIN_IS_203
class AwsLocalTerminalRunner(project: Project, private val applyConnection: (MutableMap<String, String>) -> Unit) : LocalTerminalDirectRunner(project) {
    override fun getCommands(envs: MutableMap<String, String>): MutableList<String> = super.getCommands(envs.apply(applyConnection))
}
