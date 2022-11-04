// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.icons.AllIcons
import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Presentation
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ex.ComboBoxAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareToggleAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.ui.components.JBLabel
import com.intellij.util.EventDispatcher
import com.intellij.util.ui.components.BorderLayoutPanel
import software.aws.toolkits.core.credentials.CredentialIdentifier
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode.BOTH
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode.CREDENTIALS
import software.aws.toolkits.jetbrains.core.credentials.ChangeSettingsMode.REGIONS
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.Companion.connectionSettingsMenuBuilder
import software.aws.toolkits.resources.message
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.event.ChangeEvent
import javax.swing.event.ChangeListener

/**
 * Determine what settings the settings selector is capable of changing
 */
enum class ChangeSettingsMode(val showRegions: Boolean, val showCredentials: Boolean) {
    CREDENTIALS(false, true),
    REGIONS(true, false),
    BOTH(true, true)
}

/**
 * Base logic for different ways to present connection settings in a consistent manner across the IDE
 *
 * @see ProjectLevelSettingSelector
 * @see SettingsSelectorComboBoxAction
 */
abstract class SettingsSelectorLogicBase(private val menuMode: ChangeSettingsMode) {
    private val listeners by lazy {
        EventDispatcher.create(ChangeListener::class.java)
    }

    fun displayValue(): String = when (menuMode) {
        CREDENTIALS -> credentialsDisplay()
        REGIONS -> regionDisplay()
        BOTH -> "${credentialsDisplay()}@${regionDisplay()}"
    }

    fun tooltip(): String? = when (menuMode) {
        CREDENTIALS -> credentialsTooltip()
        REGIONS -> regionTooltip()
        BOTH -> null
    }

    private fun regionDisplay() = currentRegion()?.id ?: message("settings.regions.none_selected")
    private fun regionTooltip() = currentRegion()?.displayName

    protected abstract fun currentRegion(): AwsRegion?
    protected open fun onRegionChange(region: AwsRegion) {}

    private fun credentialsDisplay() = currentCredentials()?.shortName ?: message("settings.credentials.none_selected")
    private fun credentialsTooltip() = currentCredentials()?.displayName

    protected abstract fun currentCredentials(): CredentialIdentifier?
    protected open fun onCredentialChange(identifier: CredentialIdentifier) {}

    fun selectionMenuActions(): DefaultActionGroup = connectionSettingsMenuBuilder().apply {
        if (menuMode.showRegions) {
            withRegions(currentRegion()) {
                onRegionChange(it)

                listeners.multicaster.stateChanged(ChangeEvent(this))
            }
        }

        if (menuMode.showCredentials) {
            withCredentials(currentCredentials()) {
                onCredentialChange(it)

                listeners.multicaster.stateChanged(ChangeEvent(this))
            }
        }

        customizeSelectionMenu(this)
    }.build()

    fun createPopup(context: DataContext): ListPopup = JBPopupFactory.getInstance().createActionGroupPopup(
        message("settings.title"),
        selectionMenuActions(),
        context,
        JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
        true
    )

    protected open fun customizeSelectionMenu(builder: ConnectionSettingsMenuBuilder) {}

    fun addChangeListener(changeListener: ChangeListener) {
        listeners.addListener(changeListener)
    }
}

/**
 * Version of a [SettingsSelectorLogicBase] that stores the settings locally to the instance of the selector. Typically, this would be used if the settings
 * differ from the Project settings such as a UI panel.
 */
class LocalSettingsSelector(initialRegion: AwsRegion? = null, initialCredentialIdentifier: CredentialIdentifier? = null, settingsMode: ChangeSettingsMode) :
    SettingsSelectorLogicBase(settingsMode) {
    var currentRegion: AwsRegion? = initialRegion
        private set
    var currentCredentials: CredentialIdentifier? = initialCredentialIdentifier
        private set

    override fun currentRegion(): AwsRegion? = currentRegion

    override fun onRegionChange(region: AwsRegion) {
        currentRegion = region
    }

    override fun currentCredentials(): CredentialIdentifier? = currentCredentials

    override fun onCredentialChange(identifier: CredentialIdentifier) {
        currentCredentials = identifier
    }
}

/**
 * Version of a [SettingsSelectorLogicBase] that stores the settings at the project level.
 */
open class ProjectLevelSettingSelector(private val project: Project, settingsMode: ChangeSettingsMode) : SettingsSelectorLogicBase(settingsMode) {
    override fun currentRegion(): AwsRegion? = AwsConnectionManager.getInstance(project).selectedRegion

    override fun onRegionChange(region: AwsRegion) {
        AwsConnectionManager.getInstance(project).changeRegion(region)
    }

    override fun currentCredentials(): CredentialIdentifier? = AwsConnectionManager.getInstance(project).selectedCredentialIdentifier

    override fun onCredentialChange(identifier: CredentialIdentifier) {
        AwsConnectionManager.getInstance(project).changeCredentialProvider(identifier)
    }

    override fun customizeSelectionMenu(builder: ConnectionSettingsMenuBuilder) {
        builder.withRecentChoices(project)
    }
}

class ToolkitConnectionComboBoxAction(private val project: Project) : ComboBoxAction(), DumbAware {
    private val logic = object : ProjectLevelSettingSelector(project, CREDENTIALS) {
        override fun currentCredentials(): CredentialIdentifier? {
            val active = ToolkitConnectionManager.getInstance(project).activeConnection()
            if (active is AwsConnectionManagerConnection) {
                return super.currentCredentials()
            }

            return null
        }

        override fun onCredentialChange(identifier: CredentialIdentifier) {
            super.onCredentialChange(identifier)
            val connectionManager = ToolkitConnectionManager.getInstance(project)
            connectionManager.switchConnection(AwsConnectionManagerConnection(project))
        }
    }

    override fun createPopupActionGroup(button: JComponent?): DefaultActionGroup {
        val connectionManager = ToolkitConnectionManager.getInstance(project)
        val group = DefaultActionGroup()
        group.add(Separator.create(message("settings.credentials.individual_identity_sub_menu")))
        group.addAll(
            ToolkitAuthManager.getInstance().listConnections().map {
                object : DumbAwareToggleAction(it.label) {
                    val connection = it
                    override fun isSelected(e: AnActionEvent): Boolean {
                        return connectionManager.activeConnection() == connection
                    }

                    override fun setSelected(e: AnActionEvent, state: Boolean) {
                        if (state) {
                            connectionManager.switchConnection(connection)
                        }
                    }
                }
            }
        )

        group.addAll(
            logic.selectionMenuActions()
        )

        return group
    }

    override fun update(e: AnActionEvent) {
        val active = ToolkitConnectionManager.getInstance(project).activeConnection()
        if (active is AwsConnectionManagerConnection) {
            e.presentation.text = logic.displayValue()
            e.presentation.description = logic.tooltip()
        } else {
            e.presentation.text = active?.label ?: message("settings.credentials.none_selected")
            e.presentation.description = null
        }
    }
}

class SettingsSelectorComboBoxAction(private val selectorLogic: SettingsSelectorLogicBase) : ComboBoxAction(), DumbAware {
    override fun createPopupActionGroup(button: JComponent?) = selectorLogic.selectionMenuActions()

    override fun update(e: AnActionEvent) {
        updatePresentation(e.presentation)
    }

    override fun displayTextInToolbar(): Boolean = true

    private fun updatePresentation(presentation: Presentation) {
        presentation.text = selectorLogic.displayValue()
        presentation.description = selectorLogic.tooltip()
    }
}

class SettingsSelectorComboLabel(private val selectorLogic: SettingsSelectorLogicBase) : BorderLayoutPanel() {
    private val label = JBLabel()

    init {
        val arrowLabel = JBLabel(AllIcons.General.ArrowDown)
        addToCenter(label)
        addToRight(arrowLabel)

        val clickAdapter = object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                showPopup()
            }
        }
        label.addMouseListener(clickAdapter)
        arrowLabel.addMouseListener(clickAdapter)
        selectorLogic.addChangeListener {
            updateText()
        }

        updateText()
    }

    private fun showPopup() {
        selectorLogic.createPopup(DataManager.getInstance().getDataContext(this)).showUnderneathOf(this)
    }

    private fun updateText() {
        label.text = selectorLogic.displayValue()
        label.toolTipText = selectorLogic.tooltip()
    }
}

class CredsComboBoxActionGroup(private val project: Project) : DefaultActionGroup() {
    private val toolkitConnectionAction = ToolkitConnectionComboBoxAction(project)
    private val profileRegionSelectorGroup: Array<AnAction> by lazy {
        arrayOf(
            toolkitConnectionAction,
            SettingsSelectorComboBoxAction(ProjectLevelSettingSelector(project, ChangeSettingsMode.REGIONS))
        )
    }

    private val ssoSelectorGroup: Array<AnAction> by lazy {
        arrayOf(
            toolkitConnectionAction
        )
    }

    override fun getChildren(e: AnActionEvent?): Array<AnAction> {
        val activeConnection = ToolkitConnectionManager.getInstance(project).activeConnection()

        return if (activeConnection is AwsBearerTokenConnection) {
            ssoSelectorGroup
        }
        // TODO: uncomment to enable action
//        else if (activeConnection == null) {
//            arrayOf(
//                ActionManager.getInstance().getAction("aws.toolkit.toolwindow.explorer.newConnection")
//            )
//        }
        else {
            profileRegionSelectorGroup
        }
    }
}
