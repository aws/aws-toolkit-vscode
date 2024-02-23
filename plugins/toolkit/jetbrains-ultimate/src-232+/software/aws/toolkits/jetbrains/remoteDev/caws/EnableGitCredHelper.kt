// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.remoteDev.caws

import com.intellij.ide.util.RunOnceUtil
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import git4idea.config.GitVcsApplicationSettings
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.utils.isCodeCatalystDevEnv

class EnableGitCredHelper : StartupActivity, DumbAware {
    override fun runActivity(project: Project) {
        RunOnceUtil.runOnceForApp(taskId) {
            if (!isCodeCatalystDevEnv()) {
                LOG.info { "No-op since we're not in a CodeCatalyst environment" }
                return@runOnceForApp
            }

            LOG.info { "Setting Git 'Use credential helper' option to true" }
            GitVcsApplicationSettings.getInstance().isUseCredentialHelper = true
        }
    }

    private companion object {
        const val taskId = "software.aws.toolkits.jetbrains.services.caws.EnableGitCredHelper"

        val LOG = getLogger<EnableGitCredHelper>()
    }
}
