// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.rootManager
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.roots.OrderRootType
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.psi.PsiFile
import com.jetbrains.extensions.getSdk
import com.jetbrains.python.sdk.PythonSdkType
import software.amazon.awssdk.services.lambda.model.Runtime
import software.aws.toolkits.core.utils.createTemporaryZipFile
import software.aws.toolkits.core.utils.putNextEntry
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackage
import software.aws.toolkits.jetbrains.services.lambda.LambdaPackager
import software.aws.toolkits.jetbrains.utils.filesystem.walkFiles
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage

class PythonLambdaPackager : LambdaPackager {
    override fun createPackage(module: Module, file: PsiFile): CompletionStage<LambdaPackage> {
        val future = CompletableFuture<LambdaPackage>()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                val excludedRoots = mutableSetOf(*module.rootManager.excludeRoots)

                // Keep the SDK out of the zip
                val rootManager = ModuleRootManager.getInstance(module)
                for (entry in rootManager.orderEntries) {
                    excludedRoots.addAll(entry.getFiles(OrderRootType.CLASSES))
                }

                // Keep the venv out too
                rootManager.sdk?.homeDirectory?.let { home ->
                    PythonSdkType.getVirtualEnvRoot(home.path)?.let { root ->
                        LocalFileSystem.getInstance().findFileByIoFile(root)?.let {
                            excludedRoots.add(it)
                        }
                    }
                }

                val mappings = mutableMapOf<String, String>()
                val packagedFile = createTemporaryZipFile { zip ->
                    ModuleRootManager.getInstance(module).contentRoots.forEach { contentRoot ->
                        contentRoot.walkFiles(excludedRoots) { file ->
                            mappings[contentRoot.path] = "/"
                            VfsUtilCore.getRelativeLocation(file, contentRoot)?.let { relativeLocation ->
                                file.inputStream.use { fileContents ->
                                    zip.putNextEntry(relativeLocation, fileContents)
                                }
                            }
                        }
                    }

                    // Adds all the site-packages into the root of the zip and adds the mapping for debugging
                    ModuleRootManager.getInstance(module).sdk?.let { sdk ->
                        PythonSdkType.getSitePackagesDirectory(sdk)?.let { sitePackagesDirectory ->
                            sitePackagesDirectory.walkFiles { file ->
                                VfsUtilCore.getRelativeLocation(file, sitePackagesDirectory)?.let { relativeLocation ->
                                    mappings[file.path] = relativeLocation
                                    file.inputStream.use { fileContents ->
                                        zip.putNextEntry(relativeLocation, fileContents)
                                    }
                                }
                            }
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

    override fun determineRuntime(module: Module, file: PsiFile): Runtime =
        if (PythonSdkType.getLanguageLevelForSdk(module.getSdk()).isPy3K) {
            Runtime.PYTHON3_6
        } else {
            Runtime.PYTHON2_7
        }
}