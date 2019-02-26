// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.util.io.FileUtil
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiElement
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackage
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.services.lambda.execution.sam.SamTemplateUtils
import software.aws.toolkits.jetbrains.utils.filesystem.walkFiles
import java.util.concurrent.CompletionStage
import java.util.zip.ZipOutputStream

class PythonLambdaPackager : LambdaPackager() {
    override fun buildLambda(
        module: Module,
        handlerElement: PsiElement,
        handler: String,
        runtime: Runtime,
        envVars: Map<String, String>
    ): CompletionStage<LambdaPackage> {
        val handlerVirtualFile = handlerElement.containingFile?.virtualFile
            ?: throw IllegalArgumentException("Handler file must be backed by a VirtualFile")

        val baseDir = getBaseDirectory(module.project, handlerVirtualFile).path
        val customTemplate = FileUtil.createTempFile("template", ".yaml", true)
        SamTemplateUtils.writeDummySamTemplate(customTemplate, runtime, baseDir, handler, envVars)
        println(customTemplate.readText())

        return buildLambdaFromTemplate(module, customTemplate.toPath(), "Function", envVars)

//
//                val excludedRoots = mutableSetOf(*module.rootManager.excludeRoots)
//
//                // Keep the SDK out of the zip
//                val moduleRootManager = ModuleRootManager.getInstance(module)
//                for (entry in moduleRootManager.orderEntries) {
//                    excludedRoots.addAll(entry.getFiles(OrderRootType.CLASSES))
//                }
//
//                // Keep the venv out too
//                moduleRootManager.sdk?.homeDirectory?.let { home ->
//                    PythonSdkType.getVirtualEnvRoot(home.path)?.let { root ->
//                        LocalFileSystem.getInstance().findFileByIoFile(root)?.let {
//                            excludedRoots.add(it)
//                        }
//                    }
//                }
//
//                val mappings = mutableMapOf<String, String>()
//                val allSourceRoots = moduleRootManager.sourceRoots.toSet()
//                val mainSourceRoots = moduleRootManager.getSourceRoots(false).toSet()
//                val testSourceRoots = allSourceRoots - mainSourceRoots
//
//                excludedRoots.addAll(testSourceRoots)
//
//                val roots = if (mainSourceRoots.isNullOrEmpty()) {
//                    moduleRootManager.contentRoots.toSet()
//                } else {
//                    mainSourceRoots
//                }
//
//                val packagedFile = createTemporaryZipFile { zip ->
//                    roots.forEach { contentRoot ->
//                        addFolder(contentRoot, excludedRoots, mappings, zip)
//                    }
//
//                    // Adds all the site-packages into the root of the zip and adds the mapping for debugging
//                    moduleRootManager.sdk?.let { sdk ->
//                        PythonSdkType.getSitePackagesDirectory(sdk)?.let { sitePackagesDirectory ->
//                            addFolder(sitePackagesDirectory, emptySet(), mappings, zip)
//                        }
//                    }
//                }
//                future.complete(LambdaPackage(packagedFile, emptyMap()))
    }

    private fun getBaseDirectory(project: Project, virtualFile: VirtualFile): VirtualFile {
        val fileIndex = ProjectFileIndex.getInstance(project)
        return fileIndex.getSourceRootForFile(virtualFile)
            ?: fileIndex.getContentRootForFile(virtualFile)
            ?: throw IllegalStateException("Failed to locate the root of the handler")
    }

    private fun addFolder(
        folderRoot: VirtualFile,
        excludedRoots: Set<VirtualFile>,
        mappings: MutableMap<String, String>,
        zip: ZipOutputStream
    ) {
        folderRoot.walkFiles(excludedRoots) { file ->
            if (FILE_NAME_BLACKLIST.contains(file.name)) {
                return@walkFiles
            }

            VfsUtilCore.getRelativeLocation(file, folderRoot)?.let { relativeLocation ->
                mappings[file.path] = relativeLocation
                file.inputStream.use { fileContents ->
                    zip.putNextEntry(relativeLocation, fileContents)
                }
            }
        }
    }

    private companion object {
        val FILE_NAME_BLACKLIST = setOf(".DS_Store")
    }
}