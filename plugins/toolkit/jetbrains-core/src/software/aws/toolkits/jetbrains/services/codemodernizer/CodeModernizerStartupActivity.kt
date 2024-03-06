// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity

class CodeModernizerStartupActivity : StartupActivity.DumbAware {

    /**
     * Will be run on startup of the IDE
     * Prompts users of jobs that finished while IDE was closed.
     */
    override fun runActivity(project: Project) {
        if (!isCodeModernizerAvailable(project)) return
        val codeModernizerInstance = CodeModernizerManager.getInstance(project)
        codeModernizerInstance.tryResumeJob(true)
    }
}
