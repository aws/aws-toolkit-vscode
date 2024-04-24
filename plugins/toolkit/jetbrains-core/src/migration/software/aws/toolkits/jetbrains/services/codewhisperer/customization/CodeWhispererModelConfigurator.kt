// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package migration.software.aws.toolkits.jetbrains.services.codewhisperer.customization

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CustomizationUiItem

// A component responsible managing client's codewhisperer model configuration (currently customization feature only support enterprise tier users)
interface CodeWhispererModelConfigurator {
    fun showConfigDialog(project: Project)

    fun listCustomizations(project: Project, passive: Boolean = false): List<CustomizationUiItem>?

    fun activeCustomization(project: Project): CodeWhispererCustomization?

    fun switchCustomization(project: Project, newCustomization: CodeWhispererCustomization?)

    /**
     * This method is only used for invalidate a stale customization which was previously active but was removed, it will remove all usage of this customization
     * but not limited to the specific connection.
     */
    fun invalidateCustomization(arn: String)

    /**
     * This method will be invoked on IDE instantiation, it will check if there is customization associated with given connection and
     * indicate if user is allowlisted or not
     */
    fun shouldDisplayCustomNode(project: Project, forceUpdate: Boolean = false): Boolean

    /**
     * Query if there is customization for given connection
     */
    fun getNewUpdate(connectionId: String): Collection<CustomizationUiItem>?

    companion object {
        fun getInstance(): CodeWhispererModelConfigurator = service()
    }
}
