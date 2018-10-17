// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.python

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.module.Module
import com.intellij.openapi.project.rootManager
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
        val future =
            CompletableFuture<LambdaPackage>()
        ApplicationManager.getApplication().executeOnPooledThread {
            val virtualFile = file.virtualFile
            val contentRoot = module.rootManager.contentRoots.find {
                VfsUtilCore.isAncestor(
                    it,
                    virtualFile,
                    true
                )
            }
            if (contentRoot == null) {
                future.completeExceptionally(RuntimeException("Unable to determine content root for $file"))
                return@executeOnPooledThread
            }

            val mappings = mutableMapOf<String, String>()
            mappings[contentRoot.path] = "/"

            try {
                val excludedRoots = module.rootManager.excludeRoots.toSet()
                val packagedFile = createTemporaryZipFile { zip ->
                    contentRoot.walkFiles(excludedRoots) { file ->
                        file.inputStream.use { fileContents ->
                            zip.putNextEntry(
                                VfsUtilCore.getRelativeLocation(
                                    file,
                                    contentRoot
                                )!!, fileContents
                            )
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