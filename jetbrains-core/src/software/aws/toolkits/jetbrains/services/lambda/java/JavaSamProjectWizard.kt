// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.java

import com.intellij.openapi.externalSystem.importing.ImportSpecBuilder
import com.intellij.openapi.externalSystem.service.execution.ProgressExecutionMode
import com.intellij.openapi.externalSystem.util.ExternalSystemApiUtil
import com.intellij.openapi.externalSystem.util.ExternalSystemUtil
import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import org.jetbrains.idea.maven.project.MavenProjectsManager
import org.jetbrains.plugins.gradle.settings.GradleProjectSettings
import org.jetbrains.plugins.gradle.util.GradleConstants
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.logWhenNull
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.lambda.SamNewProjectSettings
import software.aws.toolkits.jetbrains.services.lambda.SamProjectTemplate
import software.aws.toolkits.jetbrains.services.lambda.SamProjectWizard
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters
import software.aws.toolkits.jetbrains.services.lambda.TemplateParameters.AppBasedTemplate
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

    // Helper method to locate the build file, such as pom.xml in the project content root.
    protected fun locateBuildFile(contentRoot: VirtualFile, buildFileName: String): VirtualFile? {
        val contentRootFile = VfsUtil.virtualToIoFile(contentRoot)
        val baseSearchPath = contentRootFile.absolutePath

        val buildFile = LOG.logWhenNull("Failed to locate $buildFileName under $baseSearchPath") {
            FileUtil.fileTraverser(contentRootFile).bfsTraversal().first { it.name == buildFileName }
        }

        return buildFile?.let {
            LOG.logWhenNull("Failed to convert $it to VirtualFile") {
                LocalFileSystem.getInstance().refreshAndFindFileByIoFile(it)
            }
        }
    }

    private companion object {
        val LOG = getLogger<SamHelloWorldMaven>()
    }
}

class SamHelloWorldMaven : JavaSamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_maven.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun templateParameters(): TemplateParameters = AppBasedTemplate("hello-world", "maven")

    override fun postCreationAction(settings: SamNewProjectSettings, contentRoot: VirtualFile, rootModel: ModifiableRootModel) {
        super.postCreationAction(settings, contentRoot, rootModel)
        val pomFile = locateBuildFile(contentRoot, "pom.xml") ?: return
        val projectsManager = MavenProjectsManager.getInstance(rootModel.project)
        projectsManager.addManagedFilesOrUnignore(listOf(pomFile))
    }
}

class SamHelloWorldGradle : JavaSamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_gradle.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun templateParameters(): TemplateParameters = AppBasedTemplate("hello-world", "gradle")

    override fun postCreationAction(settings: SamNewProjectSettings, contentRoot: VirtualFile, rootModel: ModifiableRootModel) {
        super.postCreationAction(settings, contentRoot, rootModel)
        val buildFile = locateBuildFile(contentRoot, "build.gradle") ?: return

        val gradleProjectSettings = GradleProjectSettings().apply {
            withQualifiedModuleNames()
            externalProjectPath = buildFile.path
        }

        val externalSystemSettings = ExternalSystemApiUtil.getSettings(rootModel.project, GradleConstants.SYSTEM_ID)
        externalSystemSettings.setLinkedProjectsSettings(setOf(gradleProjectSettings))

        val importSpecBuilder = ImportSpecBuilder(rootModel.project, GradleConstants.SYSTEM_ID)
            .forceWhenUptodate()
            .useDefaultCallback()
            .use(ProgressExecutionMode.IN_BACKGROUND_ASYNC)

        ExternalSystemUtil.refreshProjects(importSpecBuilder)
    }
}
