// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.util.EventDispatcher
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.services.caws.CawsResources
import software.aws.toolkits.jetbrains.settings.CawsSpaceTracker
import software.aws.toolkits.jetbrains.ui.ActionPopupComboLabel
import software.aws.toolkits.jetbrains.ui.ActionPopupComboLogic
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletionStage
import javax.swing.JComponent
import javax.swing.event.ChangeEvent
import javax.swing.event.ChangeListener

private const val SPACE_MAX_LENGTH = 16

internal class CawsSpacePopupComboLabel(connectionSettings: ClientConnectionSettings<*>, refreshCallback: () -> Unit) : ActionPopupComboLabel(
    object : ActionPopupComboLogic {
        private val listeners by lazy {
            EventDispatcher.create(ChangeListener::class.java)
        }

        private var popupActions = loadActions()

        private fun loadActions(): CompletionStage<List<AnAction>> = AwsResourceCache.getInstance()
            .getResource(CawsResources.ALL_SPACES, connectionSettings)
            .handle { spaces, throwable ->
                val spaceTracker = CawsSpaceTracker.getInstance()

                if (throwable != null) {
                    spaceTracker.changeSpaceName(null)
                    val message = message("caws.spaces.error_loading")
                    getLogger<CawsSpacePopupComboLabel>().error(throwable) { message }
                    return@handle listOf(
                        object : DumbAwareAction(message) {
                            override fun update(e: AnActionEvent) {
                                e.presentation.isEnabled = false
                            }

                            override fun actionPerformed(p0: AnActionEvent) {}
                        }
                    )
                }

                val lastSpace = spaceTracker.lastSpaceName()
                // clear it out if selected space cannot be found
                if (spaces.isNullOrEmpty() || spaceTracker.lastSpaceName() !in spaces) {
                    spaceTracker.changeSpaceName(null)
                }

                // pick a space if nothing selected
                if (spaceTracker.lastSpaceName() == null) {
                    spaceTracker.changeSpaceName(spaces.firstOrNull())
                }

                // refresh and let next iteration handle actions
                if (lastSpace != spaceTracker.lastSpaceName()) {
                    refreshCallback()
                    return@handle listOf()
                }

                spaces.map {
                    object : ToggleAction(it), DumbAware {
                        override fun isSelected(e: AnActionEvent) = CawsSpaceTracker.getInstance().lastSpaceName() == it

                        override fun setSelected(e: AnActionEvent, selected: Boolean) {
                            if (selected) {
                                CawsSpaceTracker.getInstance().changeSpaceName(it)
                                listeners.multicaster.stateChanged(ChangeEvent(e))
                                refreshCallback()
                            }
                        }
                    }
                }
            }.thenApply {
                it + listOf<AnAction>(
                    Separator(),
                    object : DumbAwareAction(message("caws.spaces.refresh")) {
                        override fun actionPerformed(e: AnActionEvent) {
                            AwsResourceCache.getInstance().clear(CawsResources.ALL_SPACES, connectionSettings)
                            popupActions = loadActions()
                            refreshCallback()
                        }
                    }
                )
            }.also {
                it.thenRun {
                    listeners.multicaster.stateChanged(ChangeEvent(this))
                }
            }

        override fun addChangeListener(changeListener: ChangeListener) {
            listeners.addListener(changeListener)
        }

        override fun showPopup(sourceComponent: JComponent) {
            val actions = DefaultActionGroup(popupActions.toCompletableFuture().get())

            JBPopupFactory.getInstance().createActionGroupPopup(
                null,
                actions,
                DataManager.getInstance().getDataContext(sourceComponent),
                JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
                true
            ).showUnderneathOf(sourceComponent)
        }

        override fun displayValue(): String = if (!popupActions.toCompletableFuture().isDone) {
            message("loading_resource.loading")
        } else {
            CawsSpaceTracker.getInstance().lastSpaceName()?.let {
                if (it.length > SPACE_MAX_LENGTH) {
                    it.substring(0, SPACE_MAX_LENGTH) + "\u2026"
                } else {
                    it
                }
            } ?: message("caws.no_spaces")
        }

        override fun tooltip(): String? = if (popupActions.toCompletableFuture().isDone) {
            CawsSpaceTracker.getInstance().lastSpaceName()?.let {
                if (it.length > SPACE_MAX_LENGTH) {
                    it
                } else {
                    null
                }
            }
        } else {
            null
        }
    }
)
