// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.psi.PsiFile
import java.nio.file.Path
import java.util.concurrent.CompletionStage

interface LambdaPackager {
    /**
     * Creates a package for the given lambda including source files archived in the correct format.
     */
    fun createPackage(module: Module, file: PsiFile): CompletionStage<LambdaPackage>

    companion object : RuntimeGroupExtensionPointObject<LambdaPackager>(ExtensionPointName("aws.toolkit.lambda.packager"))
}

/**
 * Represents the result of the packager
 *
 * @param location The path to the output zip
 * @param mappings Source mappings from original location to the path inside of the archive
 */
data class LambdaPackage(val location: Path, val mappings: Map<String, String> = emptyMap())