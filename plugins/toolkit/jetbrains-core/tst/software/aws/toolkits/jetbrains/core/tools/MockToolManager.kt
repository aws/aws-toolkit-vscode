// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.tools

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.replaceService
import java.nio.file.Path

@Suppress("UNCHECKED_CAST")
internal class MockToolManager : ToolManager {

    internal val tools = mutableMapOf<ToolType<*>, Tool<ToolType<*>>>()

    override fun <V : Version> getTool(type: ToolType<V>): Tool<ToolType<V>>? = tools[type]?.let { it as Tool<ToolType<V>> }

    override fun <V : Version> getOrInstallTool(type: ManagedToolType<V>, project: Project?): Tool<ToolType<V>> =
        getTool(type) ?: error("Must register ManagedToolType via a MockToolManagerRule before using it in a test")

    override fun <V : Version> getToolForPath(type: ToolType<V>, toolExecutablePath: Path): Tool<ToolType<V>> {
        TODO("Not yet implemented")
    }

    override fun <V : Version> detectTool(type: ToolType<V>): Path? {
        TODO("Not yet implemented")
    }

    override fun <T : Version> validateCompatability(tool: Tool<ToolType<T>>?, stricterMinVersion: T?, project: Project?): Validity {
        TODO("Not yet implemented")
    }
}

// Scoped to this file only, users should be using MockClientManagerRule to enforce cleanup correctly
private fun getMockInstance(): MockToolManager = service<ToolManager>() as MockToolManager

class MockToolManagerRule : ApplicationRule() {
    fun <V : Version> registerTool(type: ToolType<V>, tool: Tool<ToolType<V>>) {
        getMockInstance().tools[type] = tool
    }

    override fun after() {
        getMockInstance().tools.clear()
    }

    companion object {
        fun useRealTools(disposable: Disposable) {
            val toolManager = DefaultToolManager()
            ApplicationManager.getApplication().replaceService(ToolManager::class.java, toolManager, disposable)
        }
    }
}
