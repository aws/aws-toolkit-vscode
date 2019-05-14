// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.wizard

import com.intellij.openapi.roots.ModifiableRootModel
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import org.jetbrains.idea.maven.project.MavenProjectsManager
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.lambda.sam.SamCommon
import software.aws.toolkits.resources.message

val SAM_TEMPLATES = listOf(
    SamHelloWorldPython(),
    SamHelloWorldMaven(),
    SamHelloWorldGradle(),
    SamDynamoDBCookieCutter()
)

class SamHelloWorldMaven : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_maven.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun supportedRuntimes() = setOf(Runtime.JAVA8)

    override fun dependencyManager(): String? = "maven"

    override fun postCreationAction(runtime: Runtime, contentRoot: VirtualFile, rootModel: ModifiableRootModel) {
        super.postCreationAction(runtime, contentRoot, rootModel)

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

class SamHelloWorldGradle : SamProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world_gradle.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")

    override fun supportedRuntimes() = setOf(Runtime.JAVA8)

    override fun dependencyManager(): String? = "gradle"
}

abstract class SamPythonProjectTemplate : SamProjectTemplate() {
    override fun supportedRuntimes() = setOf(Runtime.PYTHON2_7, Runtime.PYTHON3_6, Runtime.PYTHON3_7)

    override fun postCreationAction(runtime: Runtime, contentRoot: VirtualFile, rootModel: ModifiableRootModel) {
        super.postCreationAction(runtime, contentRoot, rootModel)
        SamCommon.setSourceRoots(contentRoot, rootModel.project, rootModel)
    }
}

class SamHelloWorldPython : SamPythonProjectTemplate() {
    override fun getName() = message("sam.init.template.hello_world.name")

    override fun getDescription() = message("sam.init.template.hello_world.description")
}

class SamDynamoDBCookieCutter : SamPythonProjectTemplate() {
    override fun getName() = message("sam.init.template.dynamodb_cookiecutter.name")

    override fun getDescription() = message("sam.init.template.dynamodb_cookiecutter.description")

    override fun location(): String? = "gh:aws-samples/cookiecutter-aws-sam-dynamodb-python"
}