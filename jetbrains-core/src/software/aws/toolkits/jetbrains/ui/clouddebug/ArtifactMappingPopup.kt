// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.clouddebug

import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.ui.popup.PopupStep
import com.intellij.openapi.ui.popup.util.BaseListPopupStep
import com.intellij.ui.CellRendererPanel
import com.intellij.ui.components.JBLabel
import com.intellij.ui.popup.list.ListPopupImpl
import com.intellij.util.ui.JBUI
import net.miginfocom.swing.MigLayout
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.trace
import software.aws.toolkits.jetbrains.services.ecs.execution.ArtifactMapping
import software.aws.toolkits.resources.message
import java.awt.Component
import javax.swing.Icon
import javax.swing.JList
import javax.swing.JPanel
import javax.swing.ListCellRenderer

/**
 * Popup represents values from Artifact Mapping table
 */
class ArtifactMappingPopup {

    companion object {
        private const val MAX_ROW_COUNT = 5

        fun createPopup(
            artifactMappingItems: List<ArtifactMapping>,
            onSelected: (ArtifactMapping?) -> Unit
        ): ListPopup {
            val step = ArtifactMappingPopupStep(artifactMappingItems, onSelected)
            val popup = JBPopupFactory.getInstance().createListPopup(step, MAX_ROW_COUNT)

            val popupToUpdate = popup as? ListPopupImpl
                ?: throw IllegalStateException("Unable to cast popup in type: '${popup.javaClass}' to ${ListPopupImpl::class.qualifiedName}")

            popupToUpdate.list.setCellRenderer(PathMappingPopupCellRenderer())
            return popupToUpdate
        }
    }
}

class ArtifactMappingPopupStep(paths: List<ArtifactMapping>, private val onSelected: (ArtifactMapping?) -> Unit) :
    BaseListPopupStep<ArtifactMapping>(message("cloud_debug.run_configuration.auto_fill_link.popup_title"), paths) {

    override fun isSpeedSearchEnabled(): Boolean = true

    override fun hasSubstep(selectedValue: ArtifactMapping?): Boolean = false

    override fun getIconFor(value: ArtifactMapping?): Icon? = null

    override fun onChosen(value: ArtifactMapping?, finalChoice: Boolean): PopupStep<*>? {
        val stepResult = super.onChosen(value, finalChoice)
        onSelected(value)
        return stepResult
    }

    override fun isAutoSelectionEnabled(): Boolean = false
}

/**
 * Renderer for a popup cell.
 * A popup contains a line presentation for mapping between local path and remote path in container.
 * A renderer present this information using the following layout: {{local_path} > {remote_path}}, where
 * {local_path} has min fixed width for every element in a popup to align all values.
 * Width for {local_path} component is set to a maximum width of existing components, but not more then a defined maximum.
 */
class PathMappingPopupCellRenderer : CellRendererPanel(), ListCellRenderer<ArtifactMapping> {

    companion object {
        private val logger = getLogger<PathMappingPopupCellRenderer>()

        const val LEFT_COMPONENT_MAX_WIDTH = 300
        const val LEFT_COMPONENT_MIN_WIDTH = 50
    }

    private var leftComponentWidth: Int = -1
    private val localPathLabel = JBLabel()
    private val separatorLabel = JBLabel(" > ")
    private val remotePathLabel = JBLabel()

    override fun getListCellRendererComponent(
        list: JList<out ArtifactMapping>?,
        value: ArtifactMapping?,
        index: Int,
        selected: Boolean,
        hasFocus: Boolean
    ): Component {

        if (leftComponentWidth == -1)
            leftComponentWidth = getMaxListComponentLocalPathSize(list)

        localPathLabel.text = value?.localPath.toString()
        remotePathLabel.text = value?.remotePath.toString()

        val rowPanel = JPanel(MigLayout("novisualpadding, ins 0, gap 0", "[${JBUI.scale(leftComponentWidth)}][min!][]")).apply {
            add(localPathLabel, "wmin 0, growx, gapbefore ${JBUI.scale(5)}")
            add(separatorLabel)
            add(remotePathLabel, "growx, gapafter ${JBUI.scale(5)}")
        }

        val valueBoundWidth = list?.font?.getStringBounds(value?.localPath, list.getFontMetrics(list.font).fontRenderContext)?.width
        if (valueBoundWidth != null && valueBoundWidth > LEFT_COMPONENT_MAX_WIDTH) {
            rowPanel.toolTipText = localPathLabel.text
        }

        if (selected) {
            rowPanel.background = list?.selectionBackground

            localPathLabel.foreground = list?.selectionForeground
            separatorLabel.foreground = list?.selectionForeground
            remotePathLabel.foreground = list?.selectionForeground
        } else {
            rowPanel.background = list?.background

            localPathLabel.foreground = list?.foreground
            separatorLabel.foreground = list?.foreground
            remotePathLabel.foreground = list?.foreground
        }

        return rowPanel
    }

    /**
     * Calculate the max width for a left component in a popup cell
     *
     * @param list - list of components containing all elements to be rendered in a popup.
     * @return [Int] value with width for a left most component in a popup cell.
     */
    private fun getMaxListComponentLocalPathSize(list: JList<out ArtifactMapping>?): Int {
        logger.trace { "Calculate width for a left-most component." }
        list ?: return LEFT_COMPONENT_MIN_WIDTH

        val size = list.model.size
        var maxStringSize = LEFT_COMPONENT_MIN_WIDTH

        for (componentIndex in 0 until size) {
            val value = list.model.getElementAt(componentIndex) ?: continue
            val bounds = list.font.getStringBounds(value.localPath, list.getFontMetrics(list.font).fontRenderContext)
            if (bounds.width >= LEFT_COMPONENT_MAX_WIDTH) {
                logger.trace { "Found a component with width size: '${bounds.width}'. Return max value: '$LEFT_COMPONENT_MAX_WIDTH'." }
                return LEFT_COMPONENT_MAX_WIDTH
            }

            if (bounds.width > maxStringSize)
                maxStringSize = bounds.width.toInt()
        }

        logger.trace { "Found component with max width: '$maxStringSize'." }
        return maxStringSize
    }
}
