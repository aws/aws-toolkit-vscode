// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.caws.projectstate

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.caws.CawsCodeRepository
import software.aws.toolkits.jetbrains.services.caws.CawsProject

class CawsProjectSettings(private val project: Project) {
    // TODO: state needs a message bus so we can clean up random reads everywhere
    val state = CawsProjectSettingsState()

    companion object {
        fun getInstance(project: Project) = project.service<CawsProjectSettings>()
    }
}

data class CawsProjectSettingsState(
    var cawsProject: CawsProject? = null,
    var codeRepo: CawsCodeRepository? = null
)
