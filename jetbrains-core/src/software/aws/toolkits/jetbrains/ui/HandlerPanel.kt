// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.project.Project
import com.intellij.ui.EditorTextField
import com.intellij.util.textCompletion.TextFieldWithCompletion
import net.miginfocom.swing.MigLayout
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.completion.HandlerCompletionProvider
import software.aws.toolkits.resources.message
import java.awt.event.ComponentAdapter
import java.awt.event.ComponentEvent
import javax.swing.JPanel

class HandlerPanel(private val project: Project) : JPanel(MigLayout("novisualpadding, ins 0, fillx, hidemode 3")) {

    private var handlerCompletionProvider = HandlerCompletionProvider(project, null)
    private val simpleHandler = EditorTextField()
    private val handlerWithCompletion = TextFieldWithCompletion(project, handlerCompletionProvider, "", true, true, true, true)

    val handler: EditorTextField
        get() = if (handlerCompletionProvider.isCompletionSupported) handlerWithCompletion
        else simpleHandler

    init {
        initSimpleHandler()
        initHandlerWithCompletion()

        apply {
            add(simpleHandler, "growx")
            add(handlerWithCompletion, "growx")
        }

        switchCompletion()
    }

    override fun setEnabled(enabled: Boolean) {
        super.setEnabled(enabled)
        simpleHandler.isEnabled = enabled
        handlerWithCompletion.isEnabled = enabled
    }

    override fun setVisible(isVisible: Boolean) {
        super.setVisible(isVisible)
        if (!isVisible) {
            simpleHandler.isVisible = false
            handlerWithCompletion.isVisible = false
            return
        }

        switchCompletion()
    }

    fun setRuntime(runtime: Runtime) {
        handlerCompletionProvider = HandlerCompletionProvider(project, runtime)
        switchCompletion()
    }

    private fun initSimpleHandler() {
        simpleHandler.toolTipText = message("lambda.function.handler.tooltip")
        simpleHandler.addComponentListener(object : ComponentAdapter() {
            override fun componentShown(e: ComponentEvent?) {
                super.componentShown(e)
                simpleHandler.text = handlerWithCompletion.text
            }
        })
    }

    private fun initHandlerWithCompletion() {
        handlerWithCompletion.toolTipText = message("lambda.function.handler.tooltip")
        handlerWithCompletion.addComponentListener(object : ComponentAdapter() {
            override fun componentShown(e: ComponentEvent?) {
                super.componentShown(e)
                handlerWithCompletion.text = simpleHandler.text
            }
        })
    }

    private fun switchCompletion() {
        val isCompletionSupported = handlerCompletionProvider.isCompletionSupported
        handlerWithCompletion.isVisible = isCompletionSupported
        simpleHandler.isVisible = !isCompletionSupported
    }
}
