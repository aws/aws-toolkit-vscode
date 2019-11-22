// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs.execution

import com.intellij.openapi.options.SettingsEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import software.aws.toolkits.core.region.AwsRegion
import javax.swing.JComponent

class EcsCloudDebugSettingsEditor(project: Project) : SettingsEditor<EcsCloudDebugRunConfiguration>() {
    private val view = EcsCloudDebugSettingsEditorPanel(project)

    override fun createEditor(): JComponent = view.component

    override fun resetEditorFrom(configuration: EcsCloudDebugRunConfiguration) {
        view.resetFrom(configuration)
    }

    override fun applyEditorTo(configuration: EcsCloudDebugRunConfiguration) {
        view.applyTo(configuration)
    }

    override fun disposeEditor() {
        Disposer.dispose(view)
    }

    fun awsConnectionUpdated(region: AwsRegion?, credentialProviderId: String?) {
        view.awsConnectionUpdated(region, credentialProviderId)
    }
}
