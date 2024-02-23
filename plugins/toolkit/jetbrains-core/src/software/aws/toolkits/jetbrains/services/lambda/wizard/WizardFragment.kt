// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.wizard

import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.ui.TextFieldWithBrowseButton
import com.intellij.openapi.ui.ValidationInfo
import software.aws.toolkits.core.lambda.LambdaRuntime
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import javax.swing.JComponent

/**
 * Represents a standalone section of the wizard UI
 */
interface WizardFragment {
    /**
     * If not null, adds a title border to the [component]
     */
    fun title(): String?

    /**
     * Returns the component that will be added to the main UI
     */
    fun component(): JComponent

    /**
     * Returns a [ValidationInfo] if the settings are considered invalid to be reported back to the user
     */
    fun validateFragment(): ValidationInfo?

    /**
     * Return true if this fragment is applicable to the template and should be shown to the user
     */
    fun isApplicable(template: SamProjectTemplate?): Boolean

    /**
     * Updates the fragment's UI based on changes to the project location (not always available), runtime, or template
     */
    fun updateUi(projectLocation: TextFieldWithBrowseButton?, runtimeGroup: RuntimeGroup?, template: SamProjectTemplate?) {}

    /**
     * Runs after the initial template is executed to allow for post-generate activities such as code generation
     */
    fun postProjectGeneration(model: ModifiableRootModel, template: SamProjectTemplate, runtime: LambdaRuntime, progressIndicator: ProgressIndicator) {}
}
