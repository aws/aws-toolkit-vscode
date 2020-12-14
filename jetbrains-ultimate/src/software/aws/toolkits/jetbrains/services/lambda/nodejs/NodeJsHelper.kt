// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.nodejs

import com.intellij.lang.javascript.buildTools.npm.PackageJsonUtil
import com.intellij.openapi.vfs.VirtualFile

/**
 * WebStorm doesn't allow user to mark a folder as source root. This method infers a folder as source root based on
 * whether it has package.json file in it. If there is no package.json found in the path, content root will be returned.
 *
 * @param virtualFile The Node.js source code file.
 * @return The inferred source root that contains package.json file
 */
fun inferSourceRoot(virtualFile: VirtualFile): VirtualFile? = PackageJsonUtil.findUpPackageJson(virtualFile)?.parent
