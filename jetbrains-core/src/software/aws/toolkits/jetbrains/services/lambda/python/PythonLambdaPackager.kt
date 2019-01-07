// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.util.containers.isNullOrEmpty
import com.jetbrains.python.sdk.PythonSdkType
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackage
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.utils.filesystem.walkFiles
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import java.util.zip.ZipOutputStream

class PythonLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile): CompletionStage<LambdaPackage> {
        val future = CompletableFuture<LambdaPackage>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val excludedRoots = mutableSetOf(*module.rootManager.excludeRoots)

                // Keep the SDK out of the zip
                val moduleRootManager = ModuleRootManager.getInstance(module)
                for (entry in moduleRootManager.orderEntries) {
                    excludedRoots.addAll(entry.getFiles(OrderRootType.CLASSES))
                }

                // Keep the venv out too
                moduleRootManager.sdk?.homeDirectory?.let { home ->
                    PythonSdkType.getVirtualEnvRoot(home.path)?.let { root ->
                        LocalFileSystem.getInstance().findFileByIoFile(root)?.let {
                            excludedRoots.add(it)
                        }
                    }
                }

                val mappings = mutableMapOf<String, String>()
                val allSourceRoots = moduleRootManager.sourceRoots.toSet()
                val mainSourceRoots = moduleRootManager.getSourceRoots(false).toSet()
                val testSourceRoots = allSourceRoots - mainSourceRoots

                excludedRoots.addAll(testSourceRoots)

                val roots = if (mainSourceRoots.isNullOrEmpty()) {
                    moduleRootManager.contentRoots.toSet()
                } else {
                    mainSourceRoots
                }

                val packagedFile = createTemporaryZipFile { zip ->
                    roots.forEach { contentRoot ->
                        addFolder(contentRoot, excludedRoots, mappings, zip)
                    }

                    // Adds all the site-packages into the root of the zip and adds the mapping for debugging
                    moduleRootManager.sdk?.let { sdk ->
                        PythonSdkType.getSitePackagesDirectory(sdk)?.let { sitePackagesDirectory ->
                            addFolder(sitePackagesDirectory, emptySet(), mappings, zip)
                        }
                    }
                }
                future.complete(LambdaPackage(packagedFile, mappings))
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return future
    }

    private fun addFolder(folderRoot: VirtualFile, excludedRoots: Set<VirtualFile>, mappings: MutableMap<String, String>, zip: ZipOutputStream) {
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