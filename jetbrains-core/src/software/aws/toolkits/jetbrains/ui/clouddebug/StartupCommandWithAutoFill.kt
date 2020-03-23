// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.clouddebug

import com.intellij.execution.configurations.RuntimeConfigurationError
import com.intellij.ide.DataManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.fields.ExpandableTextField
import com.intellij.ui.components.labels.LinkLabel
import com.intellij.util.ui.JBUI
import net.miginfocom.swing.MigLayout
import software.aws.toolkits.jetbrains.services.clouddebug.CloudDebuggingPlatform
import software.aws.toolkits.jetbrains.services.clouddebug.DebuggerSupport
import software.aws.toolkits.jetbrains.services.ecs.execution.ArtifactMapping
import software.aws.toolkits.resources.message
import javax.swing.JPanel

/**
 * Component to display startup command with ability to generate command automatically based on existing Artifacts mapping table.
 *
 * @param project - [com.intellij.openapi.project.Project] instance
 * @param containerName - AWS Docker container name
 */
class StartupCommandWithAutoFill(private val project: Project, private val containerName: String) :
    JPanel(MigLayout("novisualpadding, ins 0, gap 0, fillx, wrap 2, hidemode 3", "[][min!]")) {

    private val startupCommandField = ExpandableTextField()
    private val autoFillLink = LinkLabel(message("cloud_debug.run_configuration.auto_fill_link.text"), null, ::onAutoFillLinkClicked)

    var command: String
        get() = startupCommandField.text
        set(value) { startupCommandField.text = value }

    var autoFillPopupContent: () -> List<ArtifactMapping> = { emptyList() }

    var platform: CloudDebuggingPlatform? = null
        set(value) {
            field = value

            val commandHelper = DebuggerSupport.debugger(myPlatform).startupCommand()

            // Show/hide Auto-fill button
            autoFillLink.isVisible = commandHelper.isStartCommandAutoFillSupported

            // Update start command hints
            startupCommandField.emptyText.text = commandHelper.getStartupCommandTextFieldHintText()
        }

    private val myPlatform: CloudDebuggingPlatform
        get() = platform ?: throw RuntimeConfigurationError(message("cloud_debug.run_configuration.missing.platform", containerName))

    init {
        add(startupCommandField, "growx")
        add(autoFillLink, "gapbefore ${JBUI.scale(3)}")

        initStartupCommandField()
    }

    /**
     * Set "Auto-fill" button enabled state.
     * When the button is enabled we skip the tooltip. Otherwise, show a tooltip with text to clarify the behavior.
     */
    fun setAutoFillLinkEnabled(isEnabled: Boolean) {
        autoFillLink.isEnabled = isEnabled
        autoFillLink.toolTipText = if (isEnabled) "" else message("cloud_debug.run_configuration.auto_fill_link.tooltip_text")
    }

    private fun initStartupCommandField() {
        startupCommandField.toolTipText = message("cloud_debug.ecs.run_config.container.start_cmd.tooltip")
    }

    @Suppress("UNUSED_PARAMETER")
    private fun onAutoFillLinkClicked(label: LinkLabel<Any?>, ignored: Any?) {
        val artifactMappingItems = autoFillPopupContent().filter { artifact ->
            !artifact.localPath?.trim().isNullOrEmpty() && !artifact.remotePath?.trim().isNullOrEmpty()
        }

        val popup = ArtifactMappingPopup.createPopup(
            artifactMappingItems = artifactMappingItems,
            onSelected = { artifact ->
                artifact ?: return@createPopup

                val commandHelper = DebuggerSupport.debugger(myPlatform).startupCommand()
                commandHelper.updateStartupCommand(
                    project = project,
                    originalCommand = command,
                    artifact = artifact,
                    onCommandGet = { command = it }
                )
            }
        )
        val dataContext = DataManager.getInstance().getDataContext(autoFillLink)
        popup.showInBestPositionFor(dataContext)
    }
}
