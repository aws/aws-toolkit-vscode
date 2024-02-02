// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.progress.EmptyProgressIndicator
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.rd.createNestedDisposable
import com.intellij.openapi.rd.util.launchIOBackground
import com.intellij.openapi.rd.util.launchOnUi
import com.intellij.openapi.rd.util.withUiAnyModalityContext
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.impl.welcomeScreen.WelcomeScreenUIManager
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBLoadingPanel
import com.intellij.ui.components.labels.LinkLabel
import com.intellij.ui.components.labels.LinkListener
import com.intellij.ui.components.panels.Wrapper
import com.intellij.util.ui.JBFont
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.components.BorderLayoutPanel
import com.jetbrains.rd.util.lifetime.Lifetime
import icons.AwsIcons
import software.aws.toolkits.core.ClientConnectionSettings
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.gateway.welcomescreen.BottomLineBorder
import software.aws.toolkits.jetbrains.gateway.welcomescreen.DEFAULT_WELCOME_BORDER
import software.aws.toolkits.jetbrains.gateway.welcomescreen.PANEL_SIDE_INSET
import software.aws.toolkits.jetbrains.gateway.welcomescreen.PANEL_TOP_INSET
import software.aws.toolkits.jetbrains.gateway.welcomescreen.recursivelySetBackground
import software.aws.toolkits.jetbrains.services.caws.CawsLetterBadge
import software.aws.toolkits.jetbrains.services.caws.CawsResources
import software.aws.toolkits.jetbrains.ui.CenteredInfoPanel
import software.aws.toolkits.jetbrains.ui.connection.CawsLoginOverlay
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.util.concurrent.atomic.AtomicReference
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.border.EmptyBorder

abstract class CawsLoadingPanel(protected val lifetime: Lifetime, private val setContentCallback: ((Component) -> Unit)? = null) : JPanel() {
    private val disposable = lifetime.createNestedDisposable()
    private val titleBar = Wrapper()
    private val content = Wrapper()
    private val loadingPanel by lazy {
        JBLoadingPanel(BorderLayout(), disposable).also {
            it.isOpaque = false
            it.add(content, BorderLayout.CENTER)
        }
    }
    private val loadingJob = AtomicReference<ProgressIndicator>()

    private val sonoOverlay by lazy {
        object : CawsLoginOverlay(null, lifetime.createNestedDisposable(), {
            border = null
            BorderLayoutPanel().apply {
                addToTop(titleBar)
                addToCenter(loadingPanel)

                recursivelySetBackground(this)

                doLoadContent(it)
            }
        }) {
            override fun initBorders() {
                background = WelcomeScreenUIManager.getMainAssociatedComponentBackground()
                border = DEFAULT_WELCOME_BORDER
                isOpaque = true
            }
        }
    }

    abstract val title: String

    open val showSpaceSelector: Boolean = false

    abstract fun getContent(connectionSettings: ClientConnectionSettings<*>): JComponent

    open fun getComponent(): JComponent = sonoOverlay

    protected fun startLoading() = sonoOverlay.drawContent()

    private fun doLoadContent(connectionSettings: ClientConnectionSettings<*>) {
        content.removeAll()

        loadingPanel.startLoading()

        val newJob = EmptyProgressIndicator()
        val oldJob = loadingJob.getAndSet(newJob)
        oldJob?.cancel()
        lifetime.launchIOBackground {
            val titleContent = createTitleBar(title, connectionSettings)
            titleBar.setContent(titleContent)

            val contentPanel = getContent(connectionSettings)
            withUiAnyModalityContext {
                if (!newJob.isCanceled) {
                    val oldContent = content.targetComponent
                    if (oldContent is Disposable) {
                        Disposer.dispose(oldContent)
                    }

                    content.setContent(contentPanel)
                    contentPanel.preferredSize = Dimension(contentPanel.width, contentPanel.height + titleContent.height)
                }
            }
        }.invokeOnCompletion { throwable ->
            runInEdt(ModalityState.any()) {
                loadingPanel.stopLoading()
                if (throwable != null) {
                    content.setContent(buildLoadError(throwable))
                }
            }
        }
    }

    protected fun buildLoadError(e: Throwable) =
        infoPanel()
            .addLine(message("caws.list_workspaces_failed"), isError = true)
            .addLine(e.message ?: message("general.unknown_error"), isError = true)
            .addAction(message("settings.retry")) { lifetime.launchOnUi { startLoading() } }
            .also {
                LOG.error(e) { "Error while loading content" }
            }

    protected fun noRepoWizard(callback: (Component) -> Unit) {
        callback(
            cawsWizard(
                lifetime,
                CawsSettings()
            )
        )
    }

    protected fun infoPanel() = CenteredInfoPanel().apply {
        add(
            JBLabel().apply {
                icon = AwsIcons.Logos.AWS_SMILE_LARGE
                horizontalAlignment = JBLabel.CENTER
            }
        )

        border = EmptyBorder(BORDER_INSET)
    }

    private fun createTitleBar(title: String, connectionSettings: ClientConnectionSettings<*>): JComponent {
        val rightPanel = BorderLayoutPanel().apply {
            isOpaque = false
            addToCenter(createConnectionSettingsPanel(connectionSettings))
        }

        return BorderLayoutPanel().apply {
            isOpaque = false
            border = BottomLineBorder(
                WelcomeScreenUIManager.getSeparatorColor(),
                BORDER_INSET
            )

            addToLeft(
                BorderLayoutPanel(10, 0).apply {
                    isOpaque = false

                    addToCenter(
                        JBLabel(title).apply {
                            font = JBFont.h3().asBold()
                        }
                    )

                    if (showSpaceSelector) {
                        addToRight(
                            CawsSpacePopupComboLabel(connectionSettings) { startLoading() }
                        )
                    }
                }
            )
            addToRight(rightPanel)
        }
    }

    private fun createConnectionSettingsPanel(connectionSettings: ClientConnectionSettings<*>): JComponent = BorderLayoutPanel(20, 0).apply {
        isOpaque = false

        setContentCallback?.let {
            addToLeft(
                LinkLabel<Void>(
                    message("caws.workspace.new"),
                    null,
                    LinkListener { _, _ ->
                        noRepoWizard(it)
                    }
                ).apply {
                    isVisible = false
                    // don't show until spaces have been loaded
                    AwsResourceCache.getInstance().getResource(CawsResources.ALL_SPACES, connectionSettings).thenAccept {
                        runInEdt(ModalityState.any()) {
                            isVisible = true
                        }
                    }
                }
            )
        }

        addToCenter(
            CawsLetterBadge(connectionSettings)
        )
    }

    companion object {
        private val LOG = getLogger<CawsLoadingPanel>()
        private val BORDER_INSET = JBUI.insets(PANEL_TOP_INSET, PANEL_SIDE_INSET, UIUtil.LARGE_VGAP, PANEL_SIDE_INSET)
    }
}
