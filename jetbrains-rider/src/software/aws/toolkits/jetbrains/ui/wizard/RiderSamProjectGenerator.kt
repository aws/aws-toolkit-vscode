// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.util.io.FileUtil
import com.intellij.ui.ColorUtil
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTabbedPane
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import com.intellij.xml.util.XmlUtil
import com.jetbrains.rdclient.util.idea.toVirtualFile
import com.jetbrains.rider.ideaInterop.fileTypes.msbuild.CsprojFileType
import com.jetbrains.rider.ideaInterop.fileTypes.sln.SolutionFileType
import com.jetbrains.rider.projectView.SolutionManager
import com.jetbrains.rider.projectView.actions.projectTemplating.backend.ReSharperTemplateGeneratorBase
import com.jetbrains.rider.projectView.actions.projectTemplating.backend.ReSharperTemplatesInteraction
import com.jetbrains.rider.projectView.actions.projectTemplating.impl.ProjectTemplateDialogContext
import com.jetbrains.rider.projectView.actions.projectTemplating.impl.ProjectTemplateTransferableModel
import com.jetbrains.rider.ui.themes.RiderTheme
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.jetbrains.services.lambda.validOrNull
import software.aws.toolkits.resources.message
import java.awt.Dimension
import java.io.File
import javax.swing.JScrollPane
import javax.swing.JTabbedPane
import javax.swing.JTextPane

class RiderSamProjectGenerator(
    private val context: ProjectTemplateDialogContext,
    group: String,
    categoryName: String,
    model: ProjectTemplateTransferableModel
) : ReSharperTemplateGeneratorBase(
    model = model,
    createSolution = true,
    createProject = true,
    item = context.item) {

    companion object {
        private const val SAM_HELLO_WORLD_PROJECT_NAME = "HelloWorld"
        private val defaultNetCoreRuntime = Runtime.DOTNETCORE2_1
    }

    private val samSettings = SamNewProjectSettings()
    private val samPanel = SamInitSelectionPanel(samSettings)

    private val projectStructurePanel: JTabbedPane

    private val structurePane = JTextPane().apply {
        contentType = "text/html"
        isEditable = false
        background = RiderTheme.activeFieldBackground
        border = null
    }

    init {
        title.labels = arrayOf(group, categoryName)

        initProjectTextField()
        initSamPanel()

        projectStructurePanel = JBTabbedPane()
        val structureScroll = JBScrollPane(structurePane).apply {
            horizontalScrollBarPolicy = JScrollPane.HORIZONTAL_SCROLLBAR_NEVER
            verticalScrollBarPolicy = JBScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED
            border = JBUI.Borders.empty()
            background = UIUtil.getTextFieldBackground()
            preferredSize = Dimension(1, JBUI.scale(60))
        }

        projectStructurePanel.add("Resulting project structure", structureScroll)

        updateInfo()
        super.initialize()
        super.layout()

        addAdditionPane(samPanel.mainPanel)
        addAdditionPane(projectStructurePanel)
    }

    override fun updateInfo() {
        val sep = File.separator
        val builder = StringBuilder()
        val font = JBUI.Fonts.label()
        builder.appendln("<html><span style=\"font-family:${font.family};font-size:${font.size}\"")

        val solutionDirectory = getSolutionDirectory()
        val projectDirectory = getProjectDirectory()

        val parentName = solutionDirectory?.parentFile?.name
        val parentStr = if (parentName.isNullOrEmpty()) sep else "$sep$parentName$sep"

        val vcsMarker = vcsPanel?.getVcsMarker()
        if (solutionDirectory != null && vcsMarker != null) {
            builder.appendln(htmlText(
                    "$sep${solutionDirectory.parentFile.name}$sep",
                    "${solutionDirectory.name}$sep$vcsMarker"))
        }

        if (solutionDirectory != null) {
            val solutionName = getSolutionName() + SolutionFileType.solutionExtensionWithDot
            builder.appendln(htmlText(parentStr, "${solutionDirectory.name}$sep$solutionName"))
        }

        if (projectDirectory != null) {
            val projectsText = "project files"
            val projectFilesLabel = XmlUtil.escape("<$projectsText>")
            if (solutionDirectory != null && solutionDirectory != projectDirectory) {
                builder.appendln(htmlText(parentStr, "${solutionDirectory.name}${sep}src$sep${projectDirectory.name}$sep$projectFilesLabel"))
                builder.appendln(htmlText(parentStr, "${solutionDirectory.name}${sep}test$sep${projectDirectory.name}.Test$sep$projectFilesLabel"))
            } else {
                builder.appendln(htmlText(parentStr, "src$sep${projectDirectory.name}$sep$projectFilesLabel"))
                builder.appendln(htmlText(parentStr, "test$sep${projectDirectory.name}.Test$sep$projectFilesLabel"))
            }
        }

        builder.appendln("</span></html>")
        structurePane.text = builder.toString()
        super.updateInfo()
    }

    override fun expand() {
        val selectedRuntime = samSettings.runtime
        val solutionDirectory = getSolutionDirectory() ?: throw Exception(message("sam.init.error.no.virtual.file"))

        runInEdt {
            runWriteAction {
                if (!solutionDirectory.exists())
                    FileUtil.createDirectory(solutionDirectory)

                val outDirVf = solutionDirectory.toVirtualFile() ?: throw Exception(message("sam.init.error.no.virtual.file"))

                val samTemplate = samSettings.template
                samTemplate.build(context.project, selectedRuntime, outDirVf)

                // Create solution file
                val projectFiles =
                        File(solutionDirectory, "src").walk().filter { it.extension == CsprojFileType.defaultExtension } +
                                File(solutionDirectory, "test").walk().filter { it.extension == CsprojFileType.defaultExtension }

                // Get the rest of generated files and copy to "SolutionItems" default folder in project structure
                val solutionFiles = solutionDirectory.listFiles().filter { it.isFile }.toList()

                val solutionFile = ReSharperTemplatesInteraction.createSolution(
                        name = getSolutionName(),
                        directory = solutionDirectory,
                        projectFiles = projectFiles.toList(),
                        protocolHost = context.protocolHost,
                        solutionFiles = solutionFiles
                ) ?: throw Exception(message("sam.init.error.no.virtual.file"))

                val project = SolutionManager.openExistingSolution(context.project, false, solutionFile)

                vcsPanel?.initRepository(project)
            }
        }
    }

    override fun refreshUI() {
        super.refreshUI()
        validationError.set(null)
    }

    /**
     * The project name is generated inside SAM CLI generator and cannot be re-defined via parameters.
     * Hardcode the project name to the generated one - "HelloWorld".
     */
    private fun initProjectTextField() {
        projectNameField.text = SAM_HELLO_WORLD_PROJECT_NAME
        projectNameField.isEnabled = false

        solutionNameSetByUser = true
        projectNameSetByUser = true

        sameDirectoryCheckBox.isEnabled = false
    }

    private fun initSamPanel() {
        samPanel.runtime.selectedItem = getCurrentDotNetCoreRuntime()
    }

    private fun htmlText(baseDir: String, relativePath: String) =
        "<font color=#${ColorUtil.toHex(UIUtil.getLabelDisabledForeground())} >...$baseDir</font>$relativePath<br>"

    private fun getCurrentDotNetCoreRuntime(): Runtime {
        val runtimeList = java.lang.Runtime.getRuntime().exec("dotnet --list-runtimes").inputStream.bufferedReader().readLines()
        val versionRegex = Regex("(\\d+.\\d+.\\d+)")
        val versions = runtimeList
                .filter { it.startsWith("Microsoft.NETCore.App") }
                .map { runtimeString ->
                    val match = versionRegex.find(runtimeString) ?: return@map null
                    match.groups[1]?.value ?: return@map null
                }
                .filterNotNull()

        val version = versions.sortedBy { it }.lastOrNull() ?: return defaultNetCoreRuntime

        return Runtime.fromValue("dotnetcore${version.split('.').take(2).joinToString(".")}").validOrNull
                ?: defaultNetCoreRuntime
    }
}
