// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.toolwindow

import com.intellij.idea.AppMode
import com.intellij.openapi.Disposable
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import com.intellij.ui.jcef.JBCefApp
import software.aws.toolkits.jetbrains.isDeveloperMode
import software.aws.toolkits.jetbrains.services.amazonq.webview.Browser
import java.awt.event.ActionListener
import javax.swing.JButton

class AmazonQPanel(
    parent: Disposable,
) {
    private val webviewContainer = Wrapper()
    var browser: Browser? = null
        private set

    val component = panel {
        row {
            cell(webviewContainer)
                .horizontalAlign(HorizontalAlign.FILL)
                .verticalAlign(VerticalAlign.FILL)
        }.resizableRow()

        // Button to show the web debugger for debugging the UI:
        if (isDeveloperMode()) {
            row {
                cell(
                    JButton("Show Web Debugger").apply {
                        addActionListener(
                            ActionListener {
                                // Code to be executed when the button is clicked
                                // Add your logic here

                                browser?.jcefBrowser?.openDevtools()
                            },
                        )
                    },
                )
                    .horizontalAlign(HorizontalAlign.CENTER)
                    .verticalAlign(VerticalAlign.BOTTOM)
            }
        }
    }

    init {
        if (!JBCefApp.isSupported()) {
            // Fallback to an alternative browser-less solution
            if (AppMode.isRemoteDevHost()) {
                webviewContainer.add(JBTextArea("Amazon Q chat is not supported in remote dev environment."))
            } else {
                webviewContainer.add(JBTextArea("JCEF not supported"))
            }
            browser = null
        } else {
            browser = Browser(parent).also {
                webviewContainer.add(it.component())
            }
        }
    }
}
