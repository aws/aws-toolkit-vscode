// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import org.jetbrains.idea.maven.project.MavenProjectsManager
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.SamNewProjectSettings
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.SamProjectWizard
import software.aws.toolkits.jetbrains.ui.wizard.IntelliJSdkSelectionPanel
import software.aws.toolkits.jetbrains.ui.wizard.SamProjectGenerator
import software.aws.toolkits.jetbrains.ui.wizard.SdkSelectionPanel
import software.aws.toolkits.resources.message

class JavaSamProjectWizard : SamProjectWizard {
    override fun createSdkSelectionPanel(generator: SamProjectGenerator): SdkSelectionPanel =
        IntelliJSdkSelectionPanel(generator.builder, RuntimeGroup.JAVA)

    override fun listTemplates(): Collection<SamProjectTemplate> = listOf(
        SamHelloWorldMaven(),
        SamHelloWorldGradle()
    )
}

abstract class JavaSamProjectTemplate : SamProjectTemplate() {
    override fun supportedRuntimes() = setOf(Runtime.JAVA8)
}

class SamHelloWorldMaven : JavaSamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_maven.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun dependencyManager(): String? = "maven"

    override fun postCreationAction(settings: SamNewProjectSettings, contentRoot: VirtualFile, rootModel: ModifiableRootModel) {
        super.postCreationAction(settings, contentRoot, rootModel)

        val contentRootFile = VfsUtil.virtualToIoFile(contentRoot)
        val baseSearchPath = contentRootFile.absolutePath
        val pomFile = FileUtil.fileTraverser(contentRootFile).bfsTraversal().first { it.name == "pom.xml" }
        if (pomFile != null) {
            val projectsManager = MavenProjectsManager.getInstance(rootModel.project)

            val pomVirtualFile = LocalFileSystem.getInstance().refreshAndFindFileByIoFile(pomFile)
            if (pomVirtualFile != null) {
                projectsManager.addManagedFilesOrUnignore(listOf(pomVirtualFile))
            } else {
                LOG.warn { "Failed to convert $pomFile to VirtualFile" }
            }
        } else {
            LOG.warn { "Failed to locate pom.xml under $baseSearchPath" }
        }
    }

    private companion object {
        val LOG = getLogger<SamHelloWorldMaven>()
    }
}

class SamHelloWorldGradle : JavaSamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_gradle.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun dependencyManager(): String? = "gradle"
}